import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

/**
 * useAudioConverter
 *
 * Client-side WAV → MP3 conversion using ffmpeg.wasm.
 * Converts at 320kbps, deletes the original WAV from memory after conversion.
 *
 * Usage:
 *   const { convert, converting, progress, error } = useAudioConverter();
 *   const mp3File = await convert(wavFile); // returns a File or null on error
 */

const FFMPEG_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

export function useAudioConverter() {
  const ffmpegRef  = useRef(null);
  const loadedRef  = useRef(false);

  const [converting, setConverting] = useState(false);
  const [progress, setProgress]     = useState(0);   // 0–100
  const [error, setError]           = useState('');

  const loadFFmpeg = async () => {
    if (loadedRef.current) return;
    const ffmpeg = new FFmpeg();
    ffmpeg.on('progress', ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });
    // Load core WASM from CDN — avoids adding large binaries to your repo
    await ffmpeg.load({
      coreURL:   await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:   await toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    loadedRef.current = true;
  };

  /**
   * convert(file) → File | null
   *
   * If the file is already MP3/FLAC/M4A/OGG it passes through unchanged.
   * Only WAV files are converted.
   */
  const convert = useCallback(async (file) => {
    if (!file) return null;

    const ext = file.name.split('.').pop().toLowerCase();

    // Pass non-WAV files straight through — no conversion needed
    if (ext !== 'wav') return file;

    setConverting(true);
    setProgress(0);
    setError('');

    try {
      await loadFFmpeg();
      const ffmpeg = ffmpegRef.current;

      const inputName  = 'input.wav';
      const outputName = 'output.mp3';

      // Write WAV bytes into ffmpeg virtual FS
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Convert: 320kbps MP3, stereo, 44.1kHz
      await ffmpeg.exec([
        '-i', inputName,
        '-b:a', '320k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'mp3',
        outputName,
      ]);

      // Read output
      const data = await ffmpeg.readFile(outputName);

      // Clean up virtual FS
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      // Build a proper File from the result
      const mp3Blob = new Blob([data.buffer], { type: 'audio/mpeg' });
      const mp3Name = file.name.replace(/\.wav$/i, '.mp3');
      const mp3File = new File([mp3Blob], mp3Name, { type: 'audio/mpeg' });

      setProgress(100);
      return mp3File;
    } catch (err) {
      console.error('ffmpeg conversion error:', err);
      setError('Conversion failed: ' + err.message);
      return null;
    } finally {
      setConverting(false);
    }
  }, []);

  return { convert, converting, progress, error };
}
