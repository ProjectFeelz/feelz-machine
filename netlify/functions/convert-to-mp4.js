/**
 * netlify/functions/convert-to-mp4.js
 *
 * Receives a WebM video as base64, converts it to H.264/AAC MP4 using FFmpeg,
 * returns the MP4 as base64. Regular function — synchronous request/response.
 *
 * POST body: { video: "<base64 webm>", mimeType: "video/webm" }
 * Response:  { mp4: "<base64 mp4>" }
 *
 * Requires in package.json:
 *   "ffmpeg-static": "^5.2.0",
 *   "fluent-ffmpeg": "^2.1.3"
 */

const ffmpeg      = require('fluent-ffmpeg');
const ffmpegPath  = require('ffmpeg-static');
const fs          = require('fs');
const os          = require('os');
const path        = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { video, mimeType } = body;
  if (!video) return { statusCode: 400, body: 'Missing video data' };

  // Write WebM to temp file
  const tmpDir   = os.tmpdir();
  const inputPath  = path.join(tmpDir, `fm-input-${Date.now()}.webm`);
  const outputPath = path.join(tmpDir, `fm-output-${Date.now()}.mp4`);

  try {
    const videoBuffer = Buffer.from(video, 'base64');
    fs.writeFileSync(inputPath, videoBuffer);

    // Convert WebM (VP9+Opus) → MP4 (H.264+AAC)
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',       // H.264 video
          '-preset fast',       // Fast encoding
          '-crf 23',            // Good quality
          '-c:a aac',           // AAC audio
          '-b:a 128k',          // Audio bitrate
          '-movflags +faststart', // Optimise for streaming/stories
          '-pix_fmt yuv420p',   // Ensure Instagram compatibility
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const mp4Buffer = fs.readFileSync(outputPath);
    const mp4Base64 = mp4Buffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ mp4: mp4Base64 }),
    };
  } catch (err) {
    console.error('FFmpeg error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(inputPath);  } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
};
