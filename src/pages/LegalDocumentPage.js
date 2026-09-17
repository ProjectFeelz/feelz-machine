// src/pages/LegalDocumentPage.js
//
// Reading back what you agreed to, at /legal/:slug.
//
// An agreement you cannot re-read is not much of an agreement, and the
// approval notification links here. If you have accepted a version of this
// document, the page shows YOUR version and the date you accepted it — not
// whatever happens to be current today. That distinction is the whole reason
// legal_documents carries a version column.

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader, FileText, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import LegalMarkdown from '../components/legal/LegalMarkdown';

export default function LegalDocumentPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc]         = React.useState(null);
  const [mine, setMine]       = React.useState(null);   // my acceptance, if any
  const [loading, setLoading] = React.useState(true);
  const [error, setError]     = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      // What I accepted, most recent first. If there is one, it decides which
      // version to render.
      let accepted = null;
      if (user) {
        const { data } = await supabase
          .from('legal_acceptances')
          .select('accepted_at, document:legal_documents ( id, slug, version, title, summary, body )')
          .order('accepted_at', { ascending: false })
          .limit(50);
        accepted = (data || []).find(a => a.document?.slug === slug) || null;
      }

      if (accepted?.document) {
        if (cancelled) return;
        setDoc(accepted.document);
        setMine(accepted);
        setLoading(false);
        return;
      }

      const { data, error: err } = await supabase
        .from('legal_documents')
        .select('id, slug, version, title, summary, body')
        .eq('slug', slug)
        .eq('is_current', true)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);
      if (err || !data) { setError('That document is not published.'); return; }
      setDoc(data);
    })();
    return () => { cancelled = true; };
  }, [slug, user]);

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <Helmet>
        <title>{doc?.title || 'Terms'} · Feelz Machine</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="px-5 md:px-8 pt-8 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        {loading ? (
          <div className="flex justify-center py-20"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : error ? (
          <div className="py-20 text-center">
            <FileText className="w-9 h-9 text-white/10 mx-auto mb-3" />
            <p className="text-sm text-white/40">{error}</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-[0.2em] text-purple-400 font-bold mb-2">
              Feelz Retail
            </p>
            <h1 className="text-2xl font-black text-white leading-tight">{doc.title}</h1>
            <p className="text-xs text-white/30 mt-1.5">Version {doc.version}</p>

            {doc.summary && (
              <p className="text-sm text-white/45 mt-3 leading-relaxed">{doc.summary}</p>
            )}

            {mine ? (
              <div className="mt-4 flex items-start gap-2 px-3.5 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-400/20">
                <ShieldCheck className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-100/80 leading-relaxed">
                  You agreed to this version on {new Date(mine.accepted_at).toLocaleDateString()}. It stays
                  the version that applies to you, even if we publish a newer one.
                </p>
              </div>
            ) : (
              <div className="mt-4 px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <p className="text-xs text-white/45 leading-relaxed">
                  This is the current version. You have not agreed to it — you will be shown it, in full,
                  if you ever submit a track to Feelz Retail.
                </p>
              </div>
            )}

            <div className="mt-7">
              <LegalMarkdown body={doc.body} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}