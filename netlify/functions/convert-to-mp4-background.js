/**
 * netlify/functions/convert-to-mp4-background.js
 *
 * FIXED VERSION — this was previously written as a Netlify background
 * function (immediate 202, no result in the response) while the client
 * code awaited res.json() expecting the MP4 directly. That mismatch is
 * exactly why MP4 conversion has never actually worked — the client was
 * always getting an empty 202 and silently falling back to WebM.
 *
 * Background functions genuinely are the right choice here though, not
 * the wrong one — converting a real 30-second story video takes ~30+
 * seconds with FFmpeg, which exceeds even Netlify's paid-tier regular
 * function limit (26s). Background functions get up to 15 minutes.
 *
 * The correct pattern: this function does the conversion, then uploads
 * the result to Supabase Storage (the existing 'stories' bucket, same
 * one platform-daily-story.js already uses) instead of trying to return
 * it directly. The client polls check-mp4-status.js separately until
 * the file shows up, then downloads it from its public URL.
 *
 * POST body: { video: "<base64 webm>", jobId: "<uuid>" }
 * No meaningful response body — Netlify background functions always
 * return 202 immediately regardless of what's returned here.
 */

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
  if (typeof ffmpegPath !== 'string') ffmpegPath = ffmpegPath.path || String(ffmpegPath);
} catch {
  ffmpegPath = '/usr/bin/ffmpeg';
}
ffmpeg.setFfmpegPath(ffmpegPath);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    console.error('convert-to-mp4-background: invalid JSON body');
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { video, jobId } = body;
  if (!video || !jobId) {
    console.error('convert-to-mp4-background: missing video or jobId');
    return { statusCode: 400, body: 'Missing video or jobId' };
  }

  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `mp4-input-${jobId}.webm`);
  const outputPath = path.join(tmpDir, `mp4-output-${jobId}.mp4`);

  try {
    const videoBuffer = Buffer.from(video, 'base64');
    fs.writeFileSync(inputPath, videoBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset fast',
          '-crf 23',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const mp4Buffer = fs.readFileSync(outputPath);
    const storagePath = `mp4-conversions/${jobId}.mp4`;

    const { error: upErr } = await supabase.storage
      .from('stories')
      .upload(storagePath, mp4Buffer, { contentType: 'video/mp4', upsert: true });

    if (upErr) throw upErr;

    console.log(`MP4 conversion complete for job ${jobId}`);
  } catch (err) {
    console.error(`MP4 conversion failed for job ${jobId}:`, err.message);
    // Write a small marker so the status check can distinguish "still
    // converting" from "failed" instead of polling forever
    try {
      await supabase.storage
        .from('stories')
        .upload(`mp4-conversions/${jobId}.failed`, Buffer.from(err.message), { contentType: 'text/plain', upsert: true });
    } catch {}
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }

  // This return value is never actually sent to the client — Netlify
  // already responded with 202 the moment this function was invoked.
  return { statusCode: 200, body: 'done' };
};