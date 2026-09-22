// netlify/functions/send-scheduled-newsletters.js
//
// Runs every 5 minutes (netlify.toml). Publishes every newsletter draft whose
// scheduled time has passed, through send_due_newsletters() (migration 157),
// which does exactly what the Send button does: in-app only, no email.
//
// Takes no input and returns nothing sensitive. Running it early or twice is
// harmless: it only ever sends drafts that are due and not yet sent, and each
// draft is locked while it is being sent so two runs cannot both send it.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async () => {
  try {
    const { data, error } = await supabase.rpc('send_due_newsletters');
    if (error) {
      // 42883 / PGRST202: migration 157 has not been run yet.
      console.error('[scheduled-newsletters] failed:', error.code, error.message);
      return { statusCode: 500, body: JSON.stringify({ ok: false }) };
    }
    const rows = data || [];
    rows.forEach(r => console.log('[scheduled-newsletters]', r.draft_id, r.outcome));
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, sent: rows.filter(r => r.outcome === 'sent').length, problems: rows.filter(r => r.outcome !== 'sent').length }),
    };
  } catch (e) {
    console.error('[scheduled-newsletters] threw:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false }) };
  }
};