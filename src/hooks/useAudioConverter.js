import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * useAudioConverter
 *
 * WAV → MP3 (320kbps) conversion.
 * Strategy:
 *   1. Try client-side ffmpeg.wasm (fast, no upload)
 *   2. If wasm fails/unsupported, fall back to /.netlify/functions/convert-audio (server-side)
 *   3. Non-WAV files pass through unchanged
 */

const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

export function useAudioConverter() {
  const ffmpegRef = useRef(null);
  const loadedRef = useRef(false);
  const wasmFailedRef = useRef(false);

  const [converting, setConverting] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [error, setError]           = useState('');

  const loadFFmpeg = async () => {
    if (loadedRef.current) return true;
    if (wasmFailedRef.current) return false;
    try {
      const ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress: p }) => setProgress(Math.round(p * 100)));
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`,   'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegRef.current = ffmpeg;
      loadedRef.current = true;
      return true;
    } catch (err) {
      console.warn('[useAudioConverter] WASM load failed, will use server fallback:', err.message);
      wasmFailedRef.current = true;
      return false;
    }
  };

  const convertViaServer = async (file) => {
    setProgress(10);
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    setProgress(30);

    const res = await fetch('/.netlify/functions/convert-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, filename: file.name }),
    });

    if (!res.ok) throw new Error(`Server conversion failed: ${res.status}`);
    setProgress(80);

    const { mp3, filename: outName } = await res.json();
    const mp3Bytes = Uint8Array.from(atob(mp3), c => c.charCodeAt(0));
    const mp3Blob  = new Blob([mp3Bytes], { type: 'audio/mpeg' });
    setProgress(100);
    return new File([mp3Blob], outName || file.name.replace(/\.wav$/i, '.mp3'), { type: 'audio/mpeg' });
  };

  const convert = useCallback(async (file) => {
    if (!file) return null;
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'wav') return file;

    setConverting(true);
    setProgress(0);
    setError('');

    try {
      // Try WASM first
      const wasmReady = await loadFFmpeg();

      if (wasmReady && ffmpegRef.current) {
        const ffmpeg = ffmpegRef.current;
        await ffmpeg.writeFile('input.wav', await fetchFile(file));
        await ffmpeg.exec(['-i','input.wav','-b:a','320k','-ar','44100','-ac','2','-f','mp3','output.mp3']);
        const data   = await ffmpeg.readFile('output.mp3');
        await ffmpeg.deleteFile('input.wav');
        await ffmpeg.deleteFile('output.mp3');
        const mp3Blob = new Blob([data.buffer], { type: 'audio/mpeg' });
        const mp3File = new File([mp3Blob], file.name.replace(/\.wav$/i, '.mp3'), { type: 'audio/mpeg' });
        setProgress(100);
        return mp3File;
      }

      // WASM unavailable — use server
      return await convertViaServer(file);

    } catch (err) {
      console.warn('[useAudioConverter] WASM conversion failed, trying server:', err.message);
      wasmFailedRef.current = true;
      try {
        return await convertViaServer(file);
      } catch (serverErr) {
        console.error('[useAudioConverter] Server conversion also failed:', serverErr.message);
        setError('Conversion failed. Please try uploading an MP3 instead.');
        return null;
      }
    } finally {
      setConverting(false);
    }
  }, []);

  return { convert, converting, progress, error };
}