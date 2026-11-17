// src/pages/AdminAppUsage.js
//
// What people DO in the app, as opposed to what they listen to.
//
// The existing analytics pages are very good at the catalogue: plays,
// streams, who is growing. They cannot answer the question that actually
// decides whether this platform works, which is: somebody opened the app,
// looked at three screens, found nothing, and left. Who was that and where
// did they give up.
//
// A SEPARATE PAGE, NOT A TAB ON THE OTHER ONE
//
// AdminAnalytics is 98KB and answers a different question well. Bolting this
// onto it would mean one page that answers two questions badly and takes a
// second to load either. This one reads three functions and nothing else.
//
// EVERY NUMBER HERE IS A COUNT
//
// The reports return totals, never rows. There is no screen in this app that
// shows one named person's path through it, deliberately. "Where do people
// stop" is worth knowing; "where did Thabo go" is not our business.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, Eye, MousePointerClick, TrendingDown, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import { screen } from '../utils/track';

const RANGES = [
  { days: 1,  label: 'Today' },
  { days: 7,  label: '7 days' },
  { days: 30, label: '30 days' },
];

// The flows worth watching, and the steps that make them up. Named here
// rather than in the database so adding a funnel is a line of code and not a
// migration, which is the same reason app_events is one table.
const FUNNELS = [
  {
    title: 'Signing up',
    blurb: 'From landing on the app to a finished profile.',
    steps: ['signup_started', 'signup_account_created', 'signup_role_chosen', 'signup_profile_done'],
  },
  {
    title: 'Putting out a song',
    blurb: 'From opening upload to the track being live.',
    steps: ['upload_opened', 'upload_file_chosen', 'upload_artwork_added', 'upload_published'],
  },
  {
    title: 'Entering Sessions',
    blurb: 'From reading the page to a submitted entry.',
    steps: ['sessions_viewed', 'sessions_entry_started', 'sessions_tiktok_added', 'sessions_entered'],
  },
  {
    title: 'Upgrading',
    blurb: 'From seeing the plans to paying.',
    steps: ['upgrade_viewed', 'upgrade_plan_chosen', 'upgrade_paid'],
  },
];

function Card({ title, icon: Icon, blurb, children }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-lime-400" />
        </span>
        <div>
          <p className="font-bold text-white">{title}</p>
          {blurb && <p className="text-xs text-white/40 mt-0.5">{blurb}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// A bar that reads without a legend. The number is on it, not under it.
function Bar({ label, value, max, right, dim }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={dim ? 'text-white/40' : 'text-white/80'}>{label}</span>
        <span className="text-white/50 tabular-nums">{right}</span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-lime-400/70" style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

export default function AdminAppUsage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [days, setDays] = React.useState(7);
  const [loading, setLoading] = React.useState(true);
  const [screens, setScreens] = React.useState([]);
  const [taps, setTaps] = React.useState([]);
  const [funnels, setFunnels] = React.useState({});

  React.useEffect(() => screen('admin_app_usage'), []);

  React.useEffect(() => {
    if (!isAdmin) return;
    let dead = false;
    setLoading(true);
    (async () => {
      const [s, t] = await Promise.all([
        supabase.rpc('admin_screen_report', { p_days: days }),
        supabase.rpc('admin_tap_report', { p_days: days }),
      ]);
      if (dead) return;
      setScreens(s.data || []);
      setTaps(t.data || []);

      const f = {};
      for (const fn of FUNNELS) {
        const { data } = await supabase.rpc('admin_funnel_report', { p_steps: fn.steps, p_days: Math.max(days, 30) });
        if (dead) return;
        f[fn.title] = data || [];
      }
      setFunnels(f);
      setLoading(false);
    })();
    return () => { dead = true; };
  }, [isAdmin, days]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">Admins only.</p>
      </div>
    );
  }

  const maxScreen = Math.max(1, ...screens.map(r => Number(r.views)));
  const maxTap    = Math.max(1, ...taps.map(r => Number(r.taps)));
  const nothingYet = !loading && screens.length === 0 && taps.length === 0;

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet><title>How the app is used · Admin</title><meta name="robots" content="noindex" /></Helmet>

      <div className="px-5 lg:px-8 pt-8 pb-24">
        <div className="flex items-start gap-3 mb-2">
          <button onClick={() => navigate('/admin')}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition flex-shrink-0 mt-1">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-lime-400 text-xs font-bold tracking-widest uppercase mb-1">Admin</p>
            <h1 className="text-2xl font-bold">How the app is used</h1>
          </div>
        </div>
        <p className="text-sm text-white/40 mb-5">
          Not what people played. Where they went, what they pressed, and where they gave up.
        </p>

        <div className="flex gap-2 mb-6">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                days === r.days ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'}`}>
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
        ) : nothingYet ? (
          // AN EMPTY PAGE THAT EXPLAINS ITSELF.
          //
          // Nothing here works until the app sends events, and the gap
          // between shipping the table and wiring the screens is exactly when
          // somebody opens this and decides it is broken.
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-center">
            <p className="text-sm text-white font-semibold mb-1">Nothing recorded yet</p>
            <p className="text-xs text-white/40 leading-relaxed max-w-md mx-auto">
              This fills up as people use the app. If it stays empty for a day, the pages are
              not calling the tracker yet, rather than nobody using them.
            </p>
          </div>
        ) : (
          <div className="space-y-5">

            <Card title="Where people go" icon={Eye}
              blurb="Opened how often, by how many people, and how long they stayed.">
              {screens.length === 0 ? <p className="text-xs text-white/30">No screens recorded yet.</p> : (
                <div className="space-y-3">
                  {screens.slice(0, 20).map(r => (
                    <div key={r.screen}>
                      <Bar
                        label={r.screen}
                        value={Number(r.views)}
                        max={maxScreen}
                        right={`${r.views} views · ${r.people} people`}
                      />
                      <div className="flex gap-4 text-[11px] text-white/35 -mt-1">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {r.median_seconds == null ? 'no timing' : `${r.median_seconds}s typical`}
                        </span>
                        {/* The number that matters most on this page. */}
                        {r.bounced_pct != null && (
                          <span className={Number(r.bounced_pct) >= 50 ? 'text-red-400' : ''}>
                            {r.bounced_pct}% left within 5 seconds
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="What people press" icon={MousePointerClick}
              blurb="Only the buttons that carry a decision, so this stays readable.">
              {taps.length === 0 ? <p className="text-xs text-white/30">No taps recorded yet.</p> : (
                taps.slice(0, 25).map(r => (
                  <Bar key={r.action} label={r.action} value={Number(r.taps)} max={maxTap}
                    right={`${r.taps} taps · ${r.people} people`} />
                ))
              )}
            </Card>

            <Card title="Where people give up" icon={TrendingDown}
              blurb="Each flow, step by step. The big drop is the thing to fix.">
              <div className="space-y-6">
                {FUNNELS.map(fn => {
                  const rows = funnels[fn.title] || [];
                  const top = Math.max(1, ...rows.map(r => Number(r.people)));
                  const worst = rows.reduce((w, r) =>
                    Number(r.lost_from_previous) > Number(w?.lost_from_previous || 0) ? r : w, null);
                  return (
                    <div key={fn.title}>
                      <p className="text-sm font-semibold text-white">{fn.title}</p>
                      <p className="text-[11px] text-white/35 mb-2.5">{fn.blurb}</p>
                      {rows.every(r => Number(r.people) === 0) ? (
                        <p className="text-xs text-white/25">Not recorded yet.</p>
                      ) : (
                        <>
                          {rows.map(r => (
                            <Bar key={r.step} label={`${r.step_no}. ${r.step}`}
                              value={Number(r.people)} max={top}
                              dim={Number(r.people) === 0}
                              right={`${r.people} people · ${r.kept_pct ?? 0}%`} />
                          ))}
                          {worst && Number(worst.lost_from_previous) > 0 && (
                            <p className="text-[11px] text-red-400 mt-1.5">
                              Biggest drop: {worst.lost_from_previous} people stopped at “{worst.step}”.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <p className="text-[11px] text-white/25 leading-relaxed">
              Rows older than 90 days are deleted automatically. Nobody who has turned tracking
              off in their settings appears here at all; their events are never written.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
