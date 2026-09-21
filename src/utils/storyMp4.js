// src/utils/storyMp4.js
//
// Builds the share video as a real MP4 (H.264 video + AAC audio), the format
// Instagram, TikTok and WhatsApp accept, inside the browser.
//
// Why: MediaRecorder in Chrome records WebM, which Instagram refuses. The old
// fix sent the WebM to a server function to convert, but a 30 second video at
// 8 Mbps is around 30 MB, far over what a Netlify function accepts, so it
// failed every time and the user got WebM anyway.
//
// How: WebCodecs encodes each frame and the audio directly, and mp4-muxer
// (MIT, served from our own /vendor folder so no outside service is involved)
// packs them into a normal MP4 with the index at the front, which is what
// social apps expect. Frames are drawn as fast as the device can, not in real
// time, so it is usually quicker than the 30 seconds the old recorder took.
//
// Returns null when this browser cannot encode H.264 + AAC (for example Firefox,
// or Chromium builds without the codecs). The caller then falls back.

const MUXER_URL = '/vendor/mp4-muxer-5.2.2.js';

const VIDEO_CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42002a'];

async function pickVideoConfig(width, height, fps) {
  if (!window.VideoEncoder) return null;
  for (const codec of VIDEO_CODECS) {
    const config = { codec, width, height, bitrate: 6_000_000, framerate: fps, avc: { format: 'avc' } };
    try {
      const { supported } = await window.VideoEncoder.isConfigSupported(config);
      if (supported) return config;
    } catch { /* try the next */ }
  }
  return null;
}

async function pickAudioConfig(sampleRate, numberOfChannels) {
  if (!window.AudioEncoder) return null;
  const config = { codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 128_000 };
  try {
    const { supported } = await window.AudioEncoder.isConfigSupported(config);
    return supported ? config : null;
  } catch { return null; }
}

// The slice of the track that plays under the video, resampled to 48 kHz stereo.
async function renderAudio(audioUrl, startTime, seconds) {
  const SR = 48000;
  const res = await fetch(audioUrl);
  const bytes = await res.arrayBuffer();
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const decodeCtx = new Offline(2, SR, SR);
  const decoded = await decodeCtx.decodeAudioData(bytes);
  const ctx = new Offline(2, Math.ceil(seconds * SR), SR);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start(0, Math.max(0, startTime || 0));
  return ctx.startRendering();
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas     drawn into by drawFrame
 * @param {(i:number) => Promise<void>} o.drawFrame   draw frame i onto the canvas
 * @param {number} o.fps
 * @param {number} o.seconds
 * @param {string?} o.audioUrl
 * @param {number} o.startTime             seconds into the track
 * @param {(pct:number) => void} o.onProgress
 * @returns {Promise<Blob|null>}  an MP4, or null if this browser cannot make one
 */
export async function buildStoryMp4({ canvas, drawFrame, fps, seconds, audioUrl, startTime, onProgress }) {
  const width = canvas.width, height = canvas.height;

  const videoConfig = await pickVideoConfig(width, height, fps);
  if (!videoConfig) return null;

  let audio = null;
  if (audioUrl) {
    const audioConfig = await pickAudioConfig(48000, 2);
    if (!audioConfig) return null; // a story without sound is not what anyone asked for
    audio = { config: audioConfig, buffer: await renderAudio(audioUrl, startTime, seconds) };
  }

  const { Muxer, ArrayBufferTarget } = await import(/* webpackIgnore: true */ MUXER_URL);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    ...(audio ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 } } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let failure = null;
  const videoEncoder = new window.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { failure = e; },
  });
  videoEncoder.configure(videoConfig);

  let audioEncoder = null;
  if (audio) {
    audioEncoder = new window.AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => { failure = e; },
    });
    audioEncoder.configure(audio.config);

    // Feed the whole slice in 1024-sample blocks (one AAC frame each).
    const buf = audio.buffer;
    const L = buf.getChannelData(0);
    const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    const BLOCK = 1024;
    for (let off = 0; off < buf.length; off += BLOCK) {
      const n = Math.min(BLOCK, buf.length - off);
      const planar = new Float32Array(n * 2);
      planar.set(L.subarray(off, off + n), 0);
      planar.set(R.subarray(off, off + n), n);
      const data = new window.AudioData({
        format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2,
        timestamp: Math.round((off / 48000) * 1e6), data: planar,
      });
      audioEncoder.encode(data);
      data.close();
    }
  }

  const total = Math.round(seconds * fps);
  const frameUs = 1e6 / fps;
  for (let i = 0; i < total; i++) {
    if (failure) throw failure;
    await drawFrame(i);
    const frame = new window.VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // Do not let the encoder queue run away on slow phones.
    while (videoEncoder.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 5));
    if (i % 5 === 0) onProgress?.(Math.round((i / total) * 95));
  }

  await videoEncoder.flush();
  if (audioEncoder) await audioEncoder.flush();
  if (failure) throw failure;
  videoEncoder.close();
  audioEncoder?.close();
  muxer.finalize();
  onProgress?.(100);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

// For MediaRecorder: MP4 types to try before WebM (Safari, newer Chrome).
export const MEDIARECORDER_MP4_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
];