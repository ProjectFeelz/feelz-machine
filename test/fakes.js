/**
 * test/fakes.js
 *
 * A fake Supabase client and a fake Paystack, good enough to run the real
 * artistPaystackSub.js against. Not a mock that agrees with whatever is asked:
 * the tables hold rows, the filters really filter, and a write really changes
 * what a later read returns. That is the only way a test of this proves
 * anything.
 */

// ── A tiny in-memory Postgres-ish store ──────────────────────────────────────
function makeDb(seed = {}) {
  const tables = JSON.parse(JSON.stringify(seed));
  const ensure = (t) => (tables[t] = tables[t] || []);

  let nextId = 1000;

  function matches(row, filters) {
    return filters.every(f => {
      const v = row[f.col];
      switch (f.op) {
        case 'eq':   return v === f.val;
        case 'neq':  return v !== f.val;
        case 'is':   return f.val === null ? (v === null || v === undefined) : v === f.val;
        case 'not_is': return f.val === null ? (v !== null && v !== undefined) : v !== f.val;
        default: throw new Error('unknown op ' + f.op);
      }
    });
  }

  function builder(table, kind, payload) {
    ensure(table);
    const filters = [];
    let orderCol = null, orderAsc = true, limitN = null, wantSelect = false;

    const run = () => {
      if (kind === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map(r => ({ id: `row_${nextId++}`, ...r }));
        tables[table].push(...rows);
        return { data: wantSelect ? rows : null, error: null, rows };
      }
      let hit = tables[table].filter(r => matches(r, filters));
      if (orderCol) {
        hit = hit.slice().sort((a, b) => {
          const av = a[orderCol] == null ? '' : String(a[orderCol]);
          const bv = b[orderCol] == null ? '' : String(b[orderCol]);
          return orderAsc ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
        });
      }
      if (limitN != null) hit = hit.slice(0, limitN);

      if (kind === 'update') {
        hit.forEach(r => Object.assign(r, payload));
        return { data: wantSelect ? hit : null, error: null, rows: hit };
      }
      return { data: hit, error: null, rows: hit };
    };

    const api = {
      select(_cols) { wantSelect = true; return api; },
      eq(col, val)  { filters.push({ col, op: 'eq', val }); return api; },
      neq(col, val) { filters.push({ col, op: 'neq', val }); return api; },
      is(col, val)  { filters.push({ col, op: 'is', val }); return api; },
      not(col, op, val) {
        if (op !== 'is') throw new Error('fake only supports .not(col,"is",...)');
        filters.push({ col, op: 'not_is', val });
        return api;
      },
      order(col, opts) { orderCol = col; orderAsc = !opts || opts.ascending !== false; return api; },
      limit(n) { limitN = n; return api; },
      maybeSingle() {
        const out = run();
        return Promise.resolve({ data: out.rows.length ? out.rows[0] : null, error: null });
      },
      single() { return api.maybeSingle(); },
      then(res, rej) {
        try {
          const out = run();
          return Promise.resolve({ data: out.data, error: out.error }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return api;
  }

  return {
    tables,
    from(table) {
      return {
        select: (cols) => builder(table, 'select').select(cols),
        insert: (payload) => builder(table, 'insert', payload),
        update: (payload) => builder(table, 'update', payload),
      };
    },
  };
}

// ── A fake Paystack over global fetch ────────────────────────────────────────
function installFetch(routes) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url).replace('https://api.paystack.co', '');
    calls.push({ url: u, method: opts.method || 'GET' });
    for (const [pattern, handler] of routes) {
      if (typeof pattern === 'string' ? u === pattern : pattern.test(u)) {
        const out = typeof handler === 'function' ? handler(u, opts) : handler;
        return {
          ok: out.ok !== false,
          status: out.status || 200,
          json: async () => out.body,
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({ status: false, message: 'no fake route for ' + u }) };
  };
  return calls;
}

// ── Assertions ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const results = [];

function check(name, cond, detail) {
  if (cond) { passed++; results.push(['PASS', name, '']); }
  else { failed++; results.push(['FAIL', name, detail || '']); }
}

function eq(name, got, want) {
  check(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

function report(title) {
  console.log('\n' + title);
  console.log('='.repeat(title.length));
  for (const [state, name, detail] of results) {
    console.log(`  ${state === 'PASS' ? '  ok' : 'FAIL'}  ${name}${detail ? '  <- ' + detail : ''}`);
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  return failed;
}

module.exports = { makeDb, installFetch, check, eq, report, counts: () => ({ passed, failed }) };
