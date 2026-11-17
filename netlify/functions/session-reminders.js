// netlify/functions/session-reminders.js
//
// Runs every 5 minutes (netlify.toml). For every scheduled stream starting in
// the next 15 minutes, tells the people who would want to know (see
// netlify/lib/liveAlerts.js) that it is about to start.
//
// claim_session_reminders() marks each stream as reminded in the same step
// that picks it, so a stream is only ever reminded once, however often this
// runs.

const { createClient } = require('@supabase/supabase-js');
const { recordRun } = require('../lib/jobRun');
const { recipientsFor, notifyInApp, pushTo } = require('../lib/liveAlerts');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const JOB = 'session-reminders';

exports.handler = async () => {
  const started = Date.now();
  let streams = 0;
  let people = 0;
  try {
    const { data: due, error } = await supabase.rpc('claim_session_reminders');
    if (error) throw new Error(`claim: ${error.code} ${error.message}`);

    for (const s of due || []) {
      const { data: artist } = await supabase.from('artists')
        .select('id, user_id, artist_name, slug').eq('id', s.artist_id).maybeSingle();
      if (!artist) continue;
      streams++;

      const { userIds } = await recipientsFor(supabase, { id: s.session_id }, artist);
      if (!userIds.length) continue;

      const mins = Math.max(1, Math.round((new Date(s.scheduled_at).getTime() - Date.now()) / 60000));
      const title = `${artist.artist_name} goes live in ${mins} minute${mins === 1 ? '' : 's'}`;
      const url = `/session/${s.session_id}`;
      people += await notifyInApp(supabase, userIds, {
        type: 'session_live',
        title,
        message: s.title || 'Live stream',
        from_artist_id: artist.id,
        metadata: { session_id: s.session_id, artist_slug: artist.slug, url, kind: 'live_soon' },
      });
      await pushTo(supabase, userIds, { title, body: s.title || 'Live stream', url, tag: `session-${s.session_id}` });
    }

    await recordRun(JOB, { ok: true, items: people, detail: streams ? { streams } : null, startedAt: started });
    return { statusCode: 200, body: JSON.stringify({ ok: true, streams, people }) };
  } catch (e) {
    console.error('[session-reminders] failed:', e.message);
    await recordRun(JOB, { ok: false, error: e.message, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};
