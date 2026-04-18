import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Mic, Play, Pause, Trash2, Upload, Loader, X } from 'lucide-react';

// ── Waveform visual (static bars that animate while playing) ──────────────────
function WaveformBars({ isPlaying, progress = 0 }) {
  const bars = Array.from({ length: 28 }, (_, i) => {
    const heights = [3,5,8,6,9,7,4,10,6,8,5,7,9,4,6,8,5,7,3,9,6,4,8,7,5,9,6,4];
    return heights[i % heights.length];
  });
  return (
    <div className="flex items-center space-x-0.5 h-8">
      {bars.map((h, i) => {
        const filled = progress > 0 && (i / bars.length) < progress;
        return (
          <div
            key={i}
            className="rounded-full flex-shrink-0 transition-all"
            style={{
              width: 2,
              height: `${h * 3}px`,
              background: filled ? 'rgba(236,72,153,0.8)' : 'rgba(255,255,255,0.15)',
              transform: isPlaying ? `scaleY(${0.6 + Math.sin(Date.now() / 200 + i) * 0.4})` : 'scaleY(1)',
            }}
          />
        );
      })}
    </div>
  );
}

// ── Single voice memo player card ─────────────────────────────────────────────
export function VoiceMemoCard({ memo, canDelete = false, onDelete }) {
  const audioRef = useRef(new Audio(memo.audio_url));
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(memo.duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); audio.currentTime = 0; };
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener('timeupdate',     onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate',     onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
    };
  }, [memo.audio_url]);

  const toggle = () => {
    const audio = audioRef.current;
    if (playing) { audio.pause(); } else { audio.play().catch(console.error); }
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const relativeDate = (dateStr) => {
    const d = new Date(dateStr);
    const diff = Math.floor((Date.now() - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex items-center space-x-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.05] group">
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition"
        style={{ background: playing ? 'rgba(236,72,153,0.25)' : 'rgba(255,255,255,0.06)' }}
      >
        {playing
          ? <Pause className="w-4 h-4 text-pink-400" />
          : <Play className="w-4 h-4 text-white/60 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        {memo.title && (
          <p className="text-xs font-medium text-white/70 truncate mb-1">{memo.title}</p>
        )}
        <WaveformBars isPlaying={playing} progress={progress} />
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-white/25">{relativeDate(memo.created_at)}</span>
          <span className="text-[10px] text-white/25">
            {playing ? fmt(currentTime) : fmt(duration)} {duration > 0 && !playing ? `/ ${fmt(duration)}` : ''}
          </span>
        </div>
      </div>

      {canDelete && (
        <button
          onClick={() => onDelete(memo.id)}
          className="w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500/15"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400/70" />
        </button>
      )}
    </div>
  );
}

// ── Upload panel (shown in artist dashboard) ──────────────────────────────────
export function VoiceMemoUpload({ artistId, onUploaded }) {
  const [recording, setRecording]   = useState(false);
  const [audioBlob, setAudioBlob]   = useState(null);
  const [title, setTitle]           = useState('');
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const discard = () => {
    setAudioBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setTitle('');
  };

  const upload = async () => {
    if (!audioBlob || !artistId) return;
    setUploading(true);
    setError(null);
    try {
      const filename = `${artistId}/${Date.now()}.webm`;
      const { error: uploadErr } = await supabase.storage
        .from('artist-voice-memos')
        .upload(filename, audioBlob, { contentType: 'audio/webm', upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from('artist-voice-memos')
        .getPublicUrl(filename);

      // Get duration from audio element
      let duration = 0;
      try {
        const tmpAudio = new Audio(previewUrl);
        await new Promise(res => { tmpAudio.onloadedmetadata = () => { duration = Math.round(tmpAudio.duration); res(); }; });
      } catch {}

      const { error: dbErr } = await supabase.from('artist_voice_memos').insert({
        artist_id: artistId,
        title: title.trim() || null,
        audio_url: urlData.publicUrl,
        duration,
      });
      if (dbErr) throw dbErr;

      discard();
      onUploaded?.();
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    }
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      {!audioBlob ? (
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`w-full flex items-center justify-center space-x-2 py-3 rounded-xl border transition font-medium text-sm ${
            recording
              ? 'bg-red-500/15 border-red-500/30 text-red-400 animate-pulse'
              : 'bg-white/[0.04] border-white/[0.08] text-white/60 hover:bg-white/[0.07]'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>{recording ? 'Stop Recording' : 'Record Voice Memo'}</span>
          {recording && <span className="w-2 h-2 rounded-full bg-red-400" />}
        </button>
      ) : (
        <div className="space-y-3">
          <audio src={previewUrl} controls className="w-full h-8" style={{ filter: 'invert(0.8)' }} />
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Add a title (optional)"
            maxLength={80}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20"
          />
          <div className="flex space-x-2">
            <button
              onClick={discard}
              disabled={uploading}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/40 text-sm hover:bg-white/[0.07] transition disabled:opacity-40"
            >
              <X className="w-3.5 h-3.5" />
              <span>Discard</span>
            </button>
            <button
              onClick={upload}
              disabled={uploading}
              className="flex-1 flex items-center justify-center space-x-2 py-2 rounded-xl text-sm font-medium transition disabled:opacity-40"
              style={{ background: 'rgba(236,72,153,0.2)', color: 'rgb(236,72,153)', border: '1px solid rgba(236,72,153,0.3)' }}
            >
              {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{uploading ? 'Uploading...' : 'Post Memo'}</span>
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}