// src/pages/VipCardPrintPage.js
// /admin/vip-card-print/:candidateId, a dedicated, print-only view of one
// issued VIP candidate card. Kept as its own page rather than trying to
// print out of the middle of the admin panel's DOM, since getting a
// physical-size printout right needs its own @page rule with nothing else
// on the page competing for it.

import React from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

export default function VipCardPrintPage() {
  const { candidateId } = useParams();
  const { isAdmin } = useAuth();
  const [candidate, setCandidate] = React.useState(null);

  React.useEffect(() => {
    supabase.from('school_sessions_vip_candidates').select('*').eq('id', candidateId).maybeSingle()
      .then(({ data }) => setCandidate(data));
  }, [candidateId]);

  if (!isAdmin) return null;
  if (!candidate) return null;

  const targetUrl = candidate.ref_code
    ? `https://feelzmachine.com?ref=${candidate.ref_code}`
    : 'https://feelzmachine.com/schoolsessions';
  // No new dependency for this, a plain image URL from a QR generation
  // service renders exactly like any other <img>, no library needed.
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&data=${encodeURIComponent(targetUrl)}`;

  const nameLines = candidate.name.trim().split(/\s+/);
  const firstName = nameLines[0] || '';
  const lastName = nameLines.slice(1).join(' ');

  return (
    <div>
      <Helmet>
        <title>Card #{String(candidate.candidate_number).padStart(3, '0')}, {candidate.name}</title>
        <meta name="robots" content="noindex, nofollow" />
        <style>{`
          @page { size: 89mm 61mm; margin: 0; }
          @media print {
            body { margin: 0; }
            .no-print { display: none !important; }
          }
        `}</style>
      </Helmet>

      <button className="no-print" onClick={() => window.print()}
        style={{ position: 'fixed', top: 16, right: 16, zIndex: 10, padding: '10px 18px', background: '#a78bfa', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        Print this card
      </button>

      {/* ── Front ── */}
      <div style={{
        width: '89mm', height: '61mm', background: '#0A0A0A', color: '#fff',
        fontFamily: 'Arial, Helvetica, sans-serif', padding: '4.5mm 5mm', position: 'relative',
        boxSizing: 'border-box', overflow: 'hidden',
        backgroundImage: 'radial-gradient(circle at 100% 0%, rgba(198,255,61,0.08), transparent 32%), radial-gradient(circle at 0% 100%, rgba(139,92,246,0.10), transparent 35%)',
        pageBreakAfter: 'always',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
            <div style={{ width: '6mm', height: '6mm', border: '1px solid #C6FF3D', borderRadius: '1.3mm', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C6FF3D', fontWeight: 'bold', fontSize: '6pt' }}>FM</div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '6.5pt', letterSpacing: '0.3px' }}>FEELZ MACHINE</div>
              <div style={{ fontSize: '4pt', color: '#9A9A9A', letterSpacing: '1px' }}>MUSIC PLATFORM</div>
            </div>
          </div>
          <div style={{ background: '#C6FF3D', color: '#0A0A0A', fontWeight: 'bold', fontSize: '4.3pt', letterSpacing: '0.5px', padding: '1mm 2.5mm', borderRadius: '5mm', whiteSpace: 'nowrap' }}>FOUNDING CANDIDATE</div>
        </div>

        <div style={{ color: '#C6FF3D', fontWeight: 'bold', fontSize: '7pt', letterSpacing: '2px', marginTop: '5.5mm' }}>HIGH SCHOOL COMPETITION</div>
        <div style={{ fontWeight: 900, fontSize: '11pt', textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '1.2mm' }}>School Sessions</div>
        <div style={{ fontSize: '16pt', fontWeight: 900, lineHeight: 1.08, textTransform: 'uppercase', marginTop: '5.5mm' }}>{firstName}{lastName && <><br />{lastName}</>}</div>
        <div style={{ color: '#C6FF3D', fontWeight: 'bold', fontSize: '8pt', letterSpacing: '1px', textTransform: 'uppercase', marginTop: '4mm' }}>Official Candidate</div>

        <div style={{ position: 'absolute', bottom: '4mm', left: '5mm', right: '5mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#9A9A9A', fontSize: '5.3pt', letterSpacing: '0.5px' }}>Candidate No. <b style={{ color: '#fff', fontSize: '6pt' }}>{String(candidate.candidate_number).padStart(3, '0')}</b></div>
          <div style={{ color: '#666', fontSize: '4.5pt', letterSpacing: '0.5px' }}>feelzmachine.com/schoolsessions</div>
        </div>
      </div>

      {/* ── Back ── */}
      <div style={{
        width: '89mm', height: '61mm', background: '#0A0A0A', color: '#fff',
        fontFamily: 'Arial, Helvetica, sans-serif', padding: '4.5mm 5mm', position: 'relative',
        boxSizing: 'border-box', overflow: 'hidden',
        backgroundImage: 'radial-gradient(circle at 100% 100%, rgba(198,255,61,0.06), transparent 32%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        <div style={{ fontWeight: 900, fontSize: '8.5pt', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2mm' }}>
          Scan to <span style={{ color: '#C6FF3D' }}>share your entry</span>
        </div>
        <div style={{ width: '22mm', height: '22mm', background: '#fff', padding: '1.3mm', borderRadius: '1.5mm', margin: '1mm 0 2mm' }}>
          {qrImgUrl && <img src={qrImgUrl} alt="" style={{ width: '100%', height: '100%' }} />}
        </div>
        <div style={{ fontSize: '5.3pt', color: '#C7C7C7', lineHeight: 1.5, maxWidth: '65mm' }}>
          This is <b style={{ color: '#C6FF3D' }}>your</b> code. Every friend who joins through it counts toward your affiliate rewards. Post it, share it, get people voting for you.
        </div>
        <div style={{ position: 'absolute', bottom: '3mm', left: 0, right: 0, textAlign: 'center', fontSize: '4pt', color: '#555', letterSpacing: '0.5px' }}>
          FEELZ MACHINE · SCHOOL SESSIONS
        </div>
      </div>
    </div>
  );
}