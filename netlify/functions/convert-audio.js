/**
 * netlify/functions/convert-audio.js
 *
 * Server-side WAV → MP3 (320kbps) conversion.
 * Used as fallback when ffmpeg.wasm fails client-side (Safari, low-memory devices).
 *
 * POST body: { audio: "<base64 wav>", filename: "track.wav" }
 * Response:  { mp3: "<base64 mp3>", filename: "track.mp3" }
 */

const ffmpeg     = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs         = require('fs');
const os         = require('os');
const path       = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { audio, filename } = body;
  if (!audio) return { statusCode: 400, body: 'Missing audio data' };

  const tmpDir     = os.tmpdir();
  const inputPath  = path.join(tmpDir, `fm-audio-${Date.now()}.wav`);
  const outputPath = path.join(tmpDir, `fm-audio-${Date.now()}.mp3`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(audio, 'base64'));

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioBitrate('320k')
        .audioFrequency(44100)
        .audioChannels(2)
        .format('mp3')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    const mp3Buffer = fs.readFileSync(outputPath);
    const mp3Base64 = mp3Buffer.toString('base64');
    const outName   = (filename || 'audio').replace(/\.wav$/i, '.mp3');

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mp3: mp3Base64, filename: outName }),
    };
  } catch (err) {
    console.error('[convert-audio] Error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
};
