const express  = require('express');
const ffmpeg   = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json({ limit: '500mb' }));

// CORS — only allow requests from feelzmachine.com
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || origin.includes('feelzmachine.com') || origin.includes('localhost')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/convert', async (req, res) => {
  const { video, mimeType } = req.body;
  if (!video) return res.status(400).json({ error: 'Missing video data' });

  const tmpDir     = os.tmpdir();
  const inputPath  = path.join(tmpDir, `fm-${Date.now()}.webm`);
  const outputPath = path.join(tmpDir, `fm-${Date.now()}.mp4`);

  try {
    fs.writeFileSync(inputPath, Buffer.from(video, 'base64'));

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

    const mp4Base64 = fs.readFileSync(outputPath).toString('base64');
    res.json({ mp4: mp4Base64 });
  } catch (err) {
    console.error('Conversion error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(inputPath);  } catch {}
    try { fs.unlinkSync(outputPath); } catch {}
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`FM Converter running on port ${PORT}`));
