/**
 * engagement-drip-cron.js
 *
 * Scheduled: Mon & Thu 08:00 UTC via netlify.toml [[scheduled_functions]]
 * Also accepts manual POST from admin panel (AdminEngagement.js)
 *
 * Acts as a gateway to engagement-drip-background (which is a background
 * function — direct browser calls to background functions return 503).
 * This regular function has 10s to trigger the background function, which
 * then runs for up to 860s.
 *
 *
 * WHY THIS FILE ONLY RECORDS ITS FAILURES
 *
 * This is a gateway. It hands off in a few milliseconds and returns long
 * before any message is written, so a success here means the handoff worked
 * and nothing about whether the drip produced anything. Recording that as a
 * successful run would be the exact lie the run record exists to prevent: for
 * three months this function returned 200 to itself twice a week while the
 * background function it called was answering 401.
 *
 * So the real run, with the real message count, is recorded at the end of
 * engagement-drip-background.js under this same job name. What is recorded
 * here is a handoff that failed, because that is the half the background
 * function cannot report on: if it never started, it cannot say so.
 */

const { recordRun } = require('../lib/jobRun');

// The name in netlify.toml and in job_expectations. The background function
// uses the same one on purpose, so both halves report as one job.
const JOB = 'engagement-drip-cron';

exports.handler = async (event) => {
  const started = Date.now();
  // Accept both scheduled (GET) and manual admin trigger (POST)
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const siteUrl = process.env.URL || 'https://www.feelzmachine.com';
    const res = await fetch(`${siteUrl}/.netlify/functions/engagement-drip-background`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-internal-secret': process.env.INTERNAL_FUNCTION_SECRET || '',
      },
    });

    // Background functions return 202 immediately then run async
    // Status 202 = accepted and running, 200 = completed synchronously
    const isSuccess = res.status === 200 || res.status === 202;

    let data = {};
    try {
      const text = await res.text();
      if (text) data = JSON.parse(text);
    } catch {}

    console.log(`Drip ${event.httpMethod === 'POST' ? 'manual' : 'scheduled'} trigger — status: ${res.status}`);

    if (!isSuccess) {
      console.error('Background function rejected:', res.status, data);
      // The failure that went unseen for three months. Recorded here because
      // a background function that was never allowed to start cannot record
      // anything itself.
      await recordRun(JOB, {
        ok: false,
        error: `handoff refused: background function returned ${res.status}`,
        detail: { status: res.status },
        startedAt: started,
      });
      return { statusCode: 500, body: JSON.stringify({ error: `Background function returned ${res.status}`, detail: data }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        triggered: true,
        status:    res.status,
        async:     res.status === 202,
        ...data,
      }),
    };
  } catch (err) {
    console.error('Drip cron error:', err.message);
    await recordRun(JOB, { ok: false, error: `handoff threw: ${err.message}`, startedAt: started });
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};