#!/usr/bin/env node
/**
 * check-supabase-errors.js
 *
 * Finds Supabase calls whose `error` is never read.
 *
 * WHY
 *
 * supabase-js does not throw. It resolves to `{ data, error }`. So this:
 *
 *   const { data } = await supabase.from('tracks').select('...')
 *
 * turns a hard failure — a 400, a 403, a broken RLS policy — into `data: null`,
 * which every caller then treats as "no rows". The request failed, the page
 * rendered empty, and the console stayed clean.
 *
 * That pattern has caused seven separate production faults on this codebase:
 *
 *   1. Retail playlist recommendations returned 400 for weeks (migration 74)
 *   2. Album upload hit a check constraint and "did nothing" (migration 78 era)
 *   3. For You showed no music at all (the PGRST201 embed outage)
 *   4. useTier's count queries 503'd, so tier limits stopped being enforced
 *   5. Browse rendered empty genre tiles with a clean console
 *   6. Five download call sites showed nothing on a deliberate 403
 *   7. listener_feedback wrote `created_at`, a column that does not exist, so
 *      Hide never persisted and the recommender got no skip signals
 *
 * Every one was invisible until someone went looking. This makes them visible
 * at the point they are written instead.
 *
 * WHY A SCRIPT AND NOT A CRA ESLINT RULE
 *
 * Create React App runs ESLint inside the webpack build via
 * eslint-webpack-plugin, and it resolves plugins from its own config. Adding a
 * custom plugin to package.json's `eslintConfig` risks failing the Netlify
 * build if resolution differs there — and a lint rule that can break deploys
 * is a bad trade for a codebase already shipping under pressure.
 *
 * This runs standalone, cannot affect the build, and gives the same answer.
 *
 * USAGE
 *
 *   node scripts/check-supabase-errors.js            # report, exit 1 on writes
 *   node scripts/check-supabase-errors.js --all      # include reads
 *   node scripts/check-supabase-errors.js --json     # machine-readable
 *   node scripts/check-supabase-errors.js --quiet    # counts only
 *
 * In CI, add to package.json:
 *   "check:supabase": "node scripts/check-supabase-errors.js"
 */

const fs = require('fs');
const path = require('path');

let parser;
try {
  parser = require('@babel/parser');
} catch {
  console.error(
    'This needs @babel/parser, which react-scripts already depends on.\n' +
    'If it is not resolvable, run:  npm i -D @babel/parser'
  );
  process.exit(2);
}

const ROOTS = ['src', 'netlify'];
const SKIP_DIRS = new Set(['node_modules', 'build', '.git', 'dist', 'coverage']);

// The client is called different things in the app and in the functions.
const CLIENT_NAMES = new Set([
  'supabase', 'supabaseAdmin', 'adminClient', 'admin', 'db', 'sb', 'client',
]);

// Writes are errors. A failed read usually shows as an empty list, which is
// bad; a failed write means the thing the user asked for did not happen at all.
const WRITE_METHODS = new Set(['insert', 'upsert', 'update', 'delete', 'rpc']);

const PARSE_PLUGINS = [
  'jsx', 'optionalChaining', 'nullishCoalescingOperator', 'classProperties',
  'objectRestSpread', 'dynamicImport', 'optionalCatchBinding',
];

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walkFiles(full, out);
    } else if (/\.(js|jsx|ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every node, with its parent, so a chain can be climbed. */
function walkWithParents(node, parent, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'leadingComments' ||
        key === 'trailingComments' || key === 'innerComments') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c.type === 'string') walkWithParents(c, node, visit);
      }
    } else if (child && typeof child.type === 'string') {
      walkWithParents(child, node, visit);
    }
  }
}

/** Is this `<client>.from(...)` or `<client>.rpc(...)`? */
function isChainStart(node) {
  if (node.type !== 'CallExpression') return false;
  const c = node.callee;
  if (!c || c.type !== 'MemberExpression' || c.computed) return false;
  if (!c.property || c.property.type !== 'Identifier') return false;
  if (c.property.name !== 'from' && c.property.name !== 'rpc') return false;

  // The object may be an identifier (`supabase`) or a member expression
  // (`this.supabase`, `ctx.db`). Take the last identifier either way.
  let obj = c.object;
  while (obj && obj.type === 'MemberExpression') obj = obj.property;
  return !!(obj && obj.type === 'Identifier' && CLIENT_NAMES.has(obj.name));
}

// Promise methods are the CONSUMER of the chain, not part of it. Climbing
// through them made the maximal node the `.then(...)` call itself, whose parent
// is an ExpressionStatement — so every correctly-handled
// `.then(({ data, error }) => ...)` was reported as fire-and-forget. Stopping
// here is what lets classifyConsumer see the callback and read its parameter.
const PROMISE_METHODS = new Set(['then', 'catch', 'finally']);

/** Climb to the outermost node still part of the same fluent QUERY chain. */
function maximalChain(node, parents) {
  let cur = node;
  for (;;) {
    const p = parents.get(cur);
    if (!p) return cur;
    if (p.type === 'MemberExpression' && p.object === cur && !p.computed) {
      if (p.property && p.property.type === 'Identifier' &&
          PROMISE_METHODS.has(p.property.name)) {
        return cur;   // hand it to the consumer classifier
      }
      cur = p; continue;
    }
    if (p.type === 'CallExpression' && p.callee === cur) { cur = p; continue; }
    if (p.type === 'TSNonNullExpression' && p.expression === cur) { cur = p; continue; }
    return cur;
  }
}

/** Method names appearing in the chain, e.g. ['from','select','eq']. */
function chainMethods(node) {
  const names = [];
  (function rec(n) {
    if (!n) return;
    if (n.type === 'CallExpression') {
      if (n.callee && n.callee.type === 'MemberExpression' &&
          n.callee.property && n.callee.property.type === 'Identifier') {
        names.push(n.callee.property.name);
      }
      rec(n.callee);
    } else if (n.type === 'MemberExpression') {
      rec(n.object);
    }
  })(node);
  return names.reverse();
}

/** Does this destructuring pattern bind `error` (under any alias)? */
function bindsError(pattern) {
  if (!pattern) return false;
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.some(p => {
      if (p.type === 'RestElement') return true;         // { data, ...rest } — can reach it
      const k = p.key;
      return k && ((k.type === 'Identifier' && k.name === 'error') ||
                   (k.type === 'StringLiteral' && k.value === 'error'));
    });
  }
  // `const res = await ...` — res.error is reachable; not a finding.
  if (pattern.type === 'Identifier') return true;
  return false;
}

/**
 * How is the chain's result consumed?
 * Returns { checked, how }.
 */
function classifyConsumer(chain, parents) {
  const p = parents.get(chain);
  if (!p) return { checked: false, how: 'result discarded' };

  // .then(...) / .catch(...) — inspect the callback's parameter.
  if (p.type === 'MemberExpression' && p.object === chain &&
      p.property && ['then', 'catch', 'finally'].includes(p.property.name)) {
    const call = parents.get(p);
    if (!call || call.type !== 'CallExpression') return { checked: false, how: '.then not called' };
    if (p.property.name === 'catch') return { checked: true, how: '.catch()' };
    if (p.property.name === 'finally') return classifyConsumer(call, parents);
    const cb = call.arguments && call.arguments[0];
    if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) {
      return { checked: true, how: '.then(fn) — cannot inspect' };
    }
    const param = cb.params && cb.params[0];
    if (bindsError(param)) return { checked: true, how: '.then({ error })' };
    // A .then whose result is itself then-chained may check later.
    const outer = parents.get(call);
    if (outer && outer.type === 'MemberExpression' && outer.property &&
        ['then', 'catch'].includes(outer.property.name)) {
      return { checked: true, how: 'chained .then/.catch' };
    }
    return { checked: false, how: '.then({ data }) — error not bound' };
  }

  if (p.type === 'AwaitExpression') {
    const q = parents.get(p);
    if (!q) return { checked: false, how: 'awaited, result discarded' };
    if (q.type === 'VariableDeclarator' && q.init === p) {
      return bindsError(q.id)
        ? { checked: true, how: 'const { error } = await' }
        : { checked: false, how: 'const { data } = await — error not bound' };
    }
    if (q.type === 'AssignmentExpression' && q.right === p) {
      return bindsError(q.left) ? { checked: true, how: 'assigned' }
                                : { checked: false, how: 'assigned without error' };
    }
    if (q.type === 'ExpressionStatement') {
      return { checked: false, how: 'await, result discarded' };
    }
    // Passed somewhere, returned, spread, destructured in a param, etc.
    return { checked: true, how: 'awaited value used (' + q.type + ')' };
  }

  // Bare statement: fire and forget.
  if (p.type === 'ExpressionStatement') {
    return { checked: false, how: 'fire and forget — no await, no .then' };
  }

  // Assigned to a variable without await (a builder held for later) — the
  // holder may await and check it elsewhere. Not a finding.
  if (p.type === 'VariableDeclarator' || p.type === 'AssignmentExpression') {
    return { checked: true, how: 'held in a variable' };
  }
  if (p.type === 'ReturnStatement' || p.type === 'ArrowFunctionExpression') {
    return { checked: true, how: 'returned to the caller' };
  }
  if (p.type === 'ArrayExpression' || p.type === 'CallExpression') {
    // e.g. Promise.all([...]) — the destructuring at the await site decides.
    return { checked: true, how: 'passed to ' + p.type };
  }

  return { checked: true, how: 'used (' + p.type + ')' };
}

// ── run ─────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
const showAll = args.has('--all');
const asJson  = args.has('--json');
const quiet   = args.has('--quiet');

const files = ROOTS.flatMap(r => walkFiles(r));
const findings = [];
let parsed = 0, failed = 0, chains = 0;

for (const file of files) {
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: file.endsWith('.ts') || file.endsWith('.tsx')
        ? [...PARSE_PLUGINS, 'typescript']
        : PARSE_PLUGINS,
      errorRecovery: true,
    });
  } catch (e) {
    failed++;
    if (!asJson) console.error(`  ! could not parse ${file}: ${e.message.slice(0, 90)}`);
    continue;
  }
  parsed++;

  const parents = new Map();
  walkWithParents(ast, null, (n, p) => parents.set(n, p));

  const seen = new Set();
  walkWithParents(ast, null, (node) => {
    if (!isChainStart(node)) return;
    const chain = maximalChain(node, parents);
    if (seen.has(chain)) return;
    seen.add(chain);
    chains++;

    const methods = chainMethods(chain);
    const isWrite = methods.some(m => WRITE_METHODS.has(m));
    const { checked, how } = classifyConsumer(chain, parents);
    if (checked) return;

    const table = (node.arguments && node.arguments[0] &&
      (node.arguments[0].value || (node.arguments[0].type === 'TemplateLiteral' ? '<template>' : '?'))) || '?';

    findings.push({
      file,
      line: (chain.loc && chain.loc.start.line) || (node.loc && node.loc.start.line) || 0,
      severity: isWrite ? 'error' : 'warning',
      target: `${node.callee.property.name}('${table}')`,
      methods: methods.join('.'),
      reason: how,
    });
  });
}

findings.sort((a, b) =>
  (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
  a.file.localeCompare(b.file) || a.line - b.line);

const errors   = findings.filter(f => f.severity === 'error');
const warnings = findings.filter(f => f.severity === 'warning');
const shown    = showAll ? findings : errors;

if (asJson) {
  console.log(JSON.stringify({
    scanned: parsed, unparsed: failed, chains,
    errors: errors.length, warnings: warnings.length,
    findings: shown,
  }, null, 2));
} else {
  if (!quiet) {
    let lastFile = null;
    for (const f of shown) {
      if (f.file !== lastFile) { console.log(`\n${f.file}`); lastFile = f.file; }
      const tag = f.severity === 'error' ? 'WRITE' : 'read ';
      console.log(`  ${String(f.line).padStart(5)}  ${tag}  ${f.target.padEnd(30)} ${f.reason}`);
    }
    if (shown.length) console.log('');
  }
  console.log(
    `${parsed} files scanned, ${chains} supabase chains found\n` +
    `  ${errors.length} unchecked WRITES  (insert / upsert / update / delete / rpc)\n` +
    `  ${warnings.length} unchecked reads` +
    (showAll ? '' : '   — run with --all to list them')
  );
  if (failed) console.log(`  ${failed} files could not be parsed`);
}

// Unchecked writes fail the check. Reads are reported but do not, so this can
// go into CI today without a large backlog blocking every commit.
process.exit(errors.length > 0 ? 1 : 0);