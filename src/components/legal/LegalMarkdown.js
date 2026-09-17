// src/components/legal/LegalMarkdown.js
//
// A deliberately small renderer for the legal documents in legal_documents.body.
//
// Why not a markdown library: this text is a contract. Whatever renders it
// should do exactly one predictable thing with each line and nothing clever —
// no HTML passthrough, no link rewriting, no sanitiser to get wrong. The
// subset below is the whole of what the documents use, and anything outside it
// renders as plain text rather than disappearing.
//
// Supports: ## heading, ### heading, "1. " numbered clauses, "- " bullets,
// **bold** inline, and blank-line-separated paragraphs.

import React from 'react';

function inline(text, keyPrefix) {
  // **bold** only. Split keeps the delimiters' contents.
  return text.split(/\*\*(.+?)\*\*/g).map((chunk, i) =>
    i % 2 === 1
      ? <strong key={`${keyPrefix}-b${i}`} className="text-white font-semibold">{chunk}</strong>
      : <React.Fragment key={`${keyPrefix}-t${i}`}>{chunk}</React.Fragment>
  );
}

export default function LegalMarkdown({ body }) {
  const lines = (body || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let para = [];

  const flush = () => {
    if (!para.length) return;
    const text = para.join(' ');
    out.push(
      <p key={`p${out.length}`} className="text-sm text-white/65 leading-relaxed mb-3">
        {inline(text, `p${out.length}`)}
      </p>
    );
    para = [];
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();

    if (!line.trim()) { flush(); return; }

    if (line.startsWith('### ')) {
      flush();
      out.push(
        <h4 key={`h${out.length}`} className="text-sm font-bold text-white mt-5 mb-2">
          {line.slice(4)}
        </h4>
      );
      return;
    }

    if (line.startsWith('## ')) {
      flush();
      out.push(
        <h3 key={`h${out.length}`} className="text-base font-bold text-white mt-6 mb-2.5 pb-1.5 border-b border-white/[0.08]">
          {line.slice(3)}
        </h3>
      );
      return;
    }

    const num = line.match(/^(\d+)\.\s+(.*)$/);
    if (num) {
      flush();
      out.push(
        <div key={`n${out.length}`} className="flex gap-2.5 mb-2">
          <span className="text-xs text-white/30 font-mono pt-0.5 flex-shrink-0 w-5 text-right">{num[1]}.</span>
          <p className="text-sm text-white/65 leading-relaxed flex-1">{inline(num[2], `n${out.length}`)}</p>
        </div>
      );
      return;
    }

    if (line.startsWith('- ')) {
      flush();
      out.push(
        <div key={`u${out.length}`} className="flex gap-2.5 mb-2">
          <span className="text-white/25 pt-0.5 flex-shrink-0">&bull;</span>
          <p className="text-sm text-white/65 leading-relaxed flex-1">{inline(line.slice(2), `u${out.length}`)}</p>
        </div>
      );
      return;
    }

    para.push(line.trim());
  });

  flush();
  return <div>{out}</div>;
}