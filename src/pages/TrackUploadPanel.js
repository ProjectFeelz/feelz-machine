import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Upload, Trash2, Loader, Plus, Save, Music,
  Edit, Search, X, Zap, Disc, AlertCircle, Youtube, HelpCircle,
} from 'lucide-react';
import CollaboratorSearch from '../components/CollaboratorSearch';
import TierGate from '../components/TierGate';
import { useTier } from '../contexts/useTier';
import { useAudioConverter } from '../hooks/useAudioConverter';
import UploadHelpPanel from '../components/UploadHelpPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRES = [
  'Hip Hop','Trap','Drill','Boom Bap','Lo-Fi','R&B','Neo Soul','Pop',
  'Electronic','House','Deep House','Tech House','Techno','Dubstep',
  'Drum & Bass','Ambient','Downtempo','Future Bass','Jersey Club',
  'Jazz','Funk','Soul','Rock','Metal','Indie','Alternative',
  'Afrobeat','Amapiano','Reggae','Dancehall','Latin','Reggaeton',
  'Country','EDM','Trance','Hardstyle','UK Garage','Grime',
  'Experimental','Vaporwave','Synthwave','Other',
];

const MOODS = [
  'Dark','Happy','Sad','Aggressive','Chill','Energetic','Melancholic',
  'Uplifting','Mysterious','Peaceful','Intense','Dreamy','Romantic',
  'Angry','Hopeful','Nostalgic','Epic','Smooth','Bouncy','Atmospheric',
  'Moody','Vibey','Hard','Soft','Ethereal','Groovy','Other',
];

const VERSION_TYPES = [
  { value: 'original',     label: 'Original Mix' },
  { value: 'radio_edit',   label: 'Radio Edit' },
  { value: 'acoustic',     label: 'Acoustic' },
  { value: 'live',         label: 'Live Performance' },
  { value: 'remix',        label: 'Remix' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'acapella',     label: 'Acapella' },
  { value: 'extended',     label: 'Extended Version' },
  { value: 'clean',        label: 'Clean Version' },
];

const ALBUM_TYPES = ['ep', 'album', 'mixtape', 'live', 'compilation'];

const BEAT_KEYS = [
  'C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B',
];
const BEAT_SCALES = ['Major','Minor','Harmonic Minor','Melodic Minor'];

// Standard beat licences — beat makers only set the price, terms are fixed
const BEAT_LICENCES = [
  {
    id: 'free',
    label: 'Free Download',
    badge: 'FREE',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    price: 0,
    terms: [
      'Non-commercial use only',
      'Must credit producer in title (Prod. by [name])',
      'No monetisation on streaming platforms',
      'No broadcast or sync rights',
      '1 free download per user',
    ],
  },
  {
    id: 'basic',
    label: 'Basic Lease',
    badge: 'LEASE',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    terms: [
      'MP3 file only',
      'Up to 50,000 streams across all platforms',
      'Up to 2,500 paid sales / downloads',
      'Must credit producer (Prod. by [name])',
      'Non-exclusive — beat may be sold to others',
      'No broadcast or sync rights',
      'Licence period: 2 years',
    ],
  },
  {
    id: 'premium',
    label: 'Premium Lease',
    badge: 'PREMIUM',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    terms: [
      'MP3 + WAV files',
      'Unlimited streams',
      'Up to 25,000 paid sales / downloads',
      'Must credit producer (Prod. by [name])',
      'Non-exclusive — beat may be sold to others',
      'Radio & podcast broadcast rights included',
      'No sync / TV / film rights',
      'Licence period: 5 years',
    ],
  },
  {
    id: 'unlimited',
    label: 'Unlimited Lease',
    badge: 'UNLIMITED',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    terms: [
      'MP3 + WAV + Stems (if provided)',
      'Unlimited streams & sales',
      'Must credit producer (Prod. by [name])',
      'Non-exclusive — beat may be sold to others',
      'Radio, podcast & sync rights included',
      'Licence period: Lifetime',
    ],
  },
  {
    id: 'exclusive',
    label: 'Exclusive Rights',
    badge: 'EXCLUSIVE',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    terms: [
      'MP3 + WAV + Stems (if provided)',
      'Full ownership transfer of the recording',
      'Unlimited streams, sales & distribution',
      'Beat removed from sale after purchase',
      'No producer credit required (negotiable)',
      'All broadcast, sync & film rights included',
      'Licence period: Lifetime / Perpetual',
    ],
  },
];

const BLANK_TRACK = {
  title: '', genre: '', mood: '', lyrics: '',
  is_explicit: false, is_downloadable: true, is_published: true,
  is_premium: false, download_price: '0', featured: false,
  pay_what_you_want: false, minimum_price: '0',
  is_preorder: false, release_date: null,
  track_number: '1', audio_file: null, cover_file: null, has_versions: false,
  youtube_url: '',
  // Beat-specific fields
  is_beat: false, bpm: '', beat_key: '', beat_scale: 'Minor',
  beat_licence: 'basic',
};

const BLANK_RELEASE = {
  release_type: 'single',
  album_title: '',
  album_description: '',
  album_cover_file: null,
  album_release_date: '',
  album_price: '0',
  album_is_published: true,
};

function slugify(text) {
  const base = text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
  return `${base}-${Date.now().toString(36)}`;
}

function normaliseTitleCase(str) {
  if (!str) return str;
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return str;
  if (letters !== letters.toUpperCase()) return str;
  return str
    .toLowerCase()
    .replace(/(?:^|\s|\(|-)[a-z]/g, c => c.toUpperCase());
}

// ─── Small reusable components ────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <div
      className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${value ? 'bg-white' : 'bg-white/10'}`}
      onClick={onChange}>
      <div className={`w-4 h-4 rounded-full transition-transform ${value ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
    </div>
  );
}

function ConversionBanner({ progress }) {
  return (
    <div className="rounded-lg p-3 bg-purple-500/10 border border-purple-500/20 space-y-2">
      <div className="flex items-center space-x-2">
        <Zap className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
        <p className="text-xs text-purple-400 font-medium">Converting WAV to MP3 (320kbps)… {progress}%</p>
      </div>
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-purple-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <label className="block text-xs text-white/40 mb-1.5">{children}</label>;
}

function FInput({ className = '', ...props }) {
  return (
    <input {...props}
      className={`w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition ${className}`} />
  );
}

function FSelect({ children, className = '', ...props }) {
  return (
    <select {...props}
      className={`w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none ${className}`}>
      {children}
    </select>
  );
}

// ─── YouTube URL field ────────────────────────────────────────────────────────

function YoutubeField({ value, onChange }) {
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState('');
  const fileRef = React.useRef(null);
  const isUploaded = !!(value && value.includes('supabase') && !value.includes('youtube'));

  const handleVideoFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'video/mp4') { setUploadError('MP4 only. Convert your video first.'); return; }
    if (file.size > 500 * 1024 * 1024) { setUploadError('Max 500MB'); return; }
    setUploading(true); setUploadError('');
    try {
      const path = Date.now() + '-' + Math.random().toString(36).slice(2) + '.mp4';
      const { error: upErr } = await supabase.storage.from('track-videos').upload(path, file, { contentType: 'video/mp4' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('track-videos').getPublicUrl(path);
      onChange(publicUrl);
    } catch (err) { setUploadError(err.message || 'Upload failed'); }
    setUploading(false);
  };

  return (
    <div>
      <FieldLabel>
        <span className="flex items-center space-x-1.5">
          <Upload className="w-3 h-3 text-purple-400" />
          <span>Music Video <span className="text-white/20">(optional · MP4 · plays in For You feed)</span></span>
        </span>
      </FieldLabel>
      {isUploaded ? (
        <div className="flex items-center space-x-3 p-3 bg-white/[0.04] rounded-xl border border-white/[0.08]">
          <video src={value} className="w-16 h-10 object-cover rounded-lg bg-black" muted />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/70">Video uploaded ✓</p>
            <p className="text-[10px] text-white/30">Shows in For You feed</p>
          </div>
          <button type="button" onClick={() => onChange('')} className="text-white/30 hover:text-white/60 text-xs transition">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={() => !uploading && fileRef.current?.click()}
          className="w-full flex items-center space-x-3 px-3 py-3 bg-white/[0.04] rounded-xl border border-dashed border-white/[0.12] hover:bg-white/[0.07] transition text-left">
          {uploading
            ? <Loader className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
            : <Upload className="w-4 h-4 text-white/30 flex-shrink-0" />}
          <div>
            <p className="text-xs text-white/50">{uploading ? 'Uploading…' : 'Upload music video'}</p>
            <p className="text-[10px] text-white/20 mt-0.5">MP4 only · Max 500MB · Vertical recommended · Convert before uploading</p>
          </div>
        </button>
      )}
      <input ref={fileRef} type="file" accept="video/mp4" onChange={handleVideoFile} className="hidden" />
      {uploadError && <p className="text-[10px] text-red-400 mt-1">{uploadError}</p>}
    </div>
  );
}



// ─── Beat Licence Selector ────────────────────────────────────────────────────
function BeatLicenceSelector({ selectedId, price, onSelectLicence, onPriceChange }) {
  const [expanded, setExpanded] = React.useState(null);
  return (
    <div>
      <FieldLabel>
        <span className="flex items-center space-x-1.5">
          <Disc className="w-3 h-3 text-yellow-400" />
          <span>Beat Licence <span className="text-white/20">(set your price per tier)</span></span>
        </span>
      </FieldLabel>
      <div className="space-y-2">
        {BEAT_LICENCES.map(lic => {
          const isSelected = selectedId === lic.id;
          const isFree = lic.id === 'free';
          return (
            <div key={lic.id}
              className={`rounded-xl border transition overflow-hidden ${isSelected ? lic.border + ' ' + lic.bg : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="flex items-center space-x-3 p-3 cursor-pointer"
                onClick={() => onSelectLicence(lic.id)}>
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${isSelected ? 'border-white' : 'border-white/20'}`}>
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lic.bg} ${lic.color}`}>{lic.badge}</span>
                    <span className="text-sm font-semibold text-white">{lic.label}</span>
                  </div>
                </div>
                {!isFree && isSelected && (
                  <div className="flex items-center space-x-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-white/40">$</span>
                    <input type="number" min="0" step="1" value={price}
                      onChange={e => onPriceChange(e.target.value)}
                      className="w-20 px-2 py-1 bg-white/[0.08] rounded-lg text-white text-sm outline-none border border-white/[0.12] focus:border-white/30 text-right"
                      placeholder="0" />
                  </div>
                )}
                {isFree && <span className={`text-sm font-bold flex-shrink-0 ${lic.color}`}>Free</span>}
                <button type="button"
                  onClick={e => { e.stopPropagation(); setExpanded(expanded === lic.id ? null : lic.id); }}
                  className="text-[10px] text-white/25 hover:text-white/50 transition flex-shrink-0 ml-1">
                  {expanded === lic.id ? '▲' : '▼'}
                </button>
              </div>
              {expanded === lic.id && (
                <div className="px-3 pb-3 space-y-1 border-t border-white/[0.04] pt-2">
                  {lic.terms.map((t, i) => (
                    <p key={i} className="text-[11px] text-white/40 flex items-start space-x-1.5">
                      <span className={`${lic.color} mt-0.5 flex-shrink-0`}>·</span>
                      <span>{t}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BeatMetaFields({ trackForm, setTrackForm }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <FieldLabel>BPM *</FieldLabel>
        <FInput type="number" min="40" max="300" placeholder="e.g. 140"
          value={trackForm.bpm || ''}
          onChange={e => setTrackForm({ ...trackForm, bpm: e.target.value })} />
      </div>
      <div>
        <FieldLabel>Key</FieldLabel>
        <FSelect value={trackForm.beat_key || ''}
          onChange={e => setTrackForm({ ...trackForm, beat_key: e.target.value })}>
          <option value="">Key…</option>
          {BEAT_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
        </FSelect>
      </div>
      <div>
        <FieldLabel>Scale</FieldLabel>
        <FSelect value={trackForm.beat_scale || 'Minor'}
          onChange={e => setTrackForm({ ...trackForm, beat_scale: e.target.value })}>
          {BEAT_SCALES.map(s => <option key={s} value={s}>{s}</option>)}
        </FSelect>
      </div>
    </div>
  );
}


// ─── Stems / Beat Kits uploader ───────────────────────────────────────────────
function StemsUploader({ stems, setStems, uploadFile, showMessage }) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef(null);
  const ACCEPTED = '.zip,.rar,.wav,.mp3,.flac,.aiff,.stem.mp4';

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      if (file.size > 500 * 1024 * 1024) { showMessage('error', `${file.name} is over 500MB`); continue; }
      setUploading(true);
      try {
        const url = await uploadFile(file, 'stems/');
        setStems(prev => [...prev, { name: file.name, url, size: file.size }]);
      } catch (err) { showMessage('error', `Failed to upload ${file.name}: ${err.message}`); }
      setUploading(false);
    }
    e.target.value = '';
  };

  return (
    <div>
      <FieldLabel>
        <span className="flex items-center space-x-1.5">
          <Disc className="w-3 h-3 text-blue-400" />
          <span>Stems / Beat Kit <span className="text-white/20">(optional — zip, wav, flac, aiff)</span></span>
        </span>
      </FieldLabel>
      {stems.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {stems.map((s, i) => (
            <div key={i} className="flex items-center space-x-3 px-3 py-2 bg-white/[0.04] rounded-xl border border-white/[0.06]">
              <Disc className="w-3.5 h-3.5 text-blue-400/60 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/70 truncate">{s.name}</p>
                <p className="text-[10px] text-white/30">{(s.size / (1024 * 1024)).toFixed(1)}MB</p>
              </div>
              <button type="button" onClick={() => setStems(prev => prev.filter((_, idx) => idx !== i))}
                className="text-white/20 hover:text-red-400/60 text-xs transition flex-shrink-0">Remove</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => !uploading && fileRef.current?.click()}
        className="w-full flex items-center space-x-3 px-3 py-3 bg-white/[0.04] rounded-xl border border-dashed border-white/[0.08] hover:bg-white/[0.07] transition text-left">
        {uploading
          ? <Loader className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
          : <Plus className="w-4 h-4 text-white/30 flex-shrink-0" />}
        <div>
          <p className="text-xs text-white/50">{uploading ? 'Uploading…' : 'Upload stems or beat kit'}</p>
          <p className="text-[10px] text-white/20 mt-0.5">ZIP, WAV, FLAC, AIFF · Max 500MB · Listeners can download after purchase</p>
        </div>
      </button>
      <input ref={fileRef} type="file" accept={ACCEPTED} multiple onChange={handleFiles} className="hidden" />
    </div>
  );
}


// ─── LRC Lyrics Sync Editor ───────────────────────────────────────────────────
// Two modes:
//   "paste" — plain textarea, artist pastes raw lyrics
//   "sync"  — plays the audio file, artist taps a button at the start of each
//             line to stamp [mm:ss.xx] timestamps → outputs LRC format
//
// The result is saved to trackForm.lyrics as either plain text or LRC.

function LyricsEditor({ lyrics, onChange, audioFile, audioUrl }) {
  const [mode, setMode]           = React.useState('paste');
  const [rawText, setRawText]     = React.useState(lyrics || '');
  const [lines, setLines]         = React.useState([]);
  const [stamped, setStamped]     = React.useState([]);
  const [playing, setPlaying]     = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [ready, setReady]         = React.useState(false);
  const audioRef                  = React.useRef(null);
  const tapBtn                    = React.useRef(null);

  // When switching to sync mode, parse rawText into lines
  const enterSyncMode = () => {
    const parsed = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    if (parsed.length === 0) return;
    setLines(parsed);
    setStamped(parsed.map(() => null)); // null = not yet stamped
    setMode('sync');
    setCurrentTime(0);
    setPlaying(false);
  };

  const exitSyncMode = () => {
    setMode('paste');
    setPlaying(false);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
  };

  // Build audio src from file or existing url
  const audioSrc = React.useMemo(() => {
    if (audioFile) return URL.createObjectURL(audioFile);
    if (audioUrl) return audioUrl;
    return null;
  }, [audioFile, audioUrl]);

  // Sync time display
  React.useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onEnded = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnded);
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('ended', onEnded); };
  }, [mode]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  // Stamp current time for next unstamped line
  const stampNext = () => {
    const el = audioRef.current;
    if (!el) return;
    const t = el.currentTime;
    setStamped(prev => {
      const next = [...prev];
      const idx = next.findIndex(s => s === null);
      if (idx >= 0) next[idx] = t;
      return next;
    });
    // Focus back on the tap button immediately
    tapBtn.current?.focus();
  };

  // Keyboard shortcut: Space = stamp (when in sync mode)
  React.useEffect(() => {
    if (mode !== 'sync') return;
    const onKey = (e) => {
      if (e.code === 'Space' && e.target === tapBtn.current) {
        e.preventDefault();
        stampNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, stamped]);

  // Build LRC output and propagate to parent
  React.useEffect(() => {
    if (mode !== 'sync') return;
    const allStamped = stamped.every(s => s !== null);
    if (!allStamped) return;
    const lrc = lines.map((line, i) => {
      const t = stamped[i];
      const mm = String(Math.floor(t / 60)).padStart(2, '0');
      const ss = String((t % 60).toFixed(2)).padStart(5, '0');
      return `[${mm}:${ss}]${line}`;
    }).join('\n');
    onChange(lrc);
    setRawText(lrc);
  }, [stamped, lines, mode]);

  // Format seconds as mm:ss
  const fmt = (t) => {
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const nextUnstampedIdx = stamped.findIndex(s => s === null);
  const allDone = stamped.length > 0 && stamped.every(s => s !== null);

  // ── Paste mode ──────────────────────────────────────────────────────────────
  if (mode === 'paste') {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <FieldLabel>Lyrics (optional)</FieldLabel>
          {(audioFile || audioUrl) && rawText.trim() && (
            <button type="button" onClick={enterSyncMode}
              className="flex items-center space-x-1 text-[10px] text-purple-400 hover:text-purple-300 transition font-medium">
              <Zap className="w-3 h-3" />
              <span>Sync to audio →</span>
            </button>
          )}
        </div>
        <textarea rows={4} value={rawText}
          onChange={e => { setRawText(e.target.value); onChange(e.target.value); }}
          placeholder={"Paste lyrics here, one line per row…\n\nTip: Add audio file first, then tap 'Sync to audio' to time-stamp each line."}
          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none font-mono leading-relaxed" />
        {rawText.includes('[0') && (
          <p className="text-[10px] text-purple-400 mt-1 flex items-center space-x-1">
            <Zap className="w-2.5 h-2.5" /><span>LRC timestamps detected — lyrics will sync to audio</span>
          </p>
        )}
      </div>
    );
  }

  // ── Sync mode ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FieldLabel>Lyrics Sync Editor</FieldLabel>
        <button type="button" onClick={exitSyncMode}
          className="text-[10px] text-white/30 hover:text-white/60 transition">← Back to edit</button>
      </div>

      {/* Instructions */}
      <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 space-y-1">
        <p className="font-semibold">How to sync:</p>
        <p>1. Press Play, then tap <strong>Stamp line</strong> (or Space) at the exact moment each line starts.</p>
        <p>2. Work through all {lines.length} lines. You can redo from the start if you make a mistake.</p>
      </div>

      {/* Audio player */}
      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} onCanPlay={() => setReady(true)} preload="metadata" />
      )}

      <div className="flex items-center space-x-3">
        <button type="button" onClick={togglePlay} disabled={!audioSrc}
          className="flex items-center space-x-2 px-4 py-2 bg-white text-black rounded-xl text-sm font-bold disabled:opacity-40 transition hover:bg-white/90">
          {playing ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{playing ? 'Playing…' : 'Play'}</span>
        </button>
        <span className="text-sm font-mono text-white/50">{fmt(currentTime)}</span>
        {playing && nextUnstampedIdx >= 0 && (
          <button ref={tapBtn} type="button" onClick={stampNext}
            className="flex-1 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 active:scale-95 text-white text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-purple-400">
            ⏱ Stamp line {nextUnstampedIdx + 1} / {lines.length}
          </button>
        )}
        {allDone && (
          <div className="flex-1 py-2.5 rounded-xl bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-bold text-center">
            ✓ All {lines.length} lines synced!
          </div>
        )}
      </div>

      {/* Redo button */}
      {stamped.some(s => s !== null) && !allDone && (
        <button type="button" onClick={() => { setStamped(lines.map(() => null)); setCurrentTime(0); if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } setPlaying(false); }}
          className="text-[10px] text-white/20 hover:text-white/50 transition">
          ↺ Start over
        </button>
      )}

      {/* Lines list */}
      <div className="space-y-1 max-h-48 overflow-y-auto rounded-xl bg-white/[0.03] p-3 border border-white/[0.06]">
        {lines.map((line, i) => (
          <div key={i} className={`flex items-center space-x-2 px-2 py-1 rounded-lg text-xs transition ${
            i === nextUnstampedIdx ? 'bg-purple-500/20 text-white' :
            stamped[i] !== null ? 'text-green-400/70' : 'text-white/25'
          }`}>
            <span className="font-mono w-12 flex-shrink-0 text-[10px]">
              {stamped[i] !== null ? `[${String(Math.floor(stamped[i]/60)).padStart(2,'0')}:${String((stamped[i]%60).toFixed(2)).padStart(5,'0')}]` : '[ -- ]'}
            </span>
            <span className="truncate">{line}</span>
            {i === nextUnstampedIdx && playing && (
              <span className="ml-auto text-purple-400 animate-pulse flex-shrink-0">← next</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Versions editor ──────────────────────────────────────────────────────────

function VersionsEditor({ versions, setVersions }) {
  const add    = () => setVersions([...versions, { version_name: '', version_type: 'remix', file: null }]);
  const remove = (i) => setVersions(versions.filter((_, idx) => idx !== i));
  const update = (i, field, val) => { const n = [...versions]; n[i][field] = val; setVersions(n); };

  if (!versions.length) return (
    <button type="button" onClick={add}
      className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
      <Plus className="w-3 h-3" /><span>Add Version</span>
    </button>
  );
  return (
    <div className="space-y-2">
      {versions.map((ver, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-white/[0.03] rounded-lg">
          <input type="text" placeholder="Version name" value={ver.version_name}
            onChange={(e) => update(i, 'version_name', e.target.value)}
            className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none" />
          <select value={ver.version_type} onChange={(e) => update(i, 'version_type', e.target.value)}
            className="px-3 py-2 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
            {VERSION_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <div className="flex items-center space-x-2">
            <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg,.aac"
              onChange={(e) => update(i, 'file', e.target.files[0])}
              className="flex-1 text-xs text-white/40 file:mr-2 file:py-1.5 file:px-2 file:rounded file:border-0 file:bg-white/[0.06] file:text-white/50 file:text-xs" />
            <button type="button" onClick={() => remove(i)}
              className="p-1.5 bg-red-500/10 rounded hover:bg-red-500/20 transition">
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center space-x-1 px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition">
        <Plus className="w-3 h-3" /><span>Add Another Version</span>
      </button>
    </div>
  );
}

// ─── AddTrackToAlbum ──────────────────────────────────────────────────────────
// Full track upload form scoped to an existing album (used inside the Manage > Albums editor)

function AddTrackToAlbum({
  album,
  existingTrackCount,
  artist,
  isPremium,
  canAddDownloadSale,
  downloadSalesRemaining,
  downloadSalesLimit,
  uploadFile,
  convertAndUploadAudio,
  saveCollaborations,
  converting,
  convProgress,
  convError,
  onTrackAdded,   // callback: receives newly-added track row
  onCancel,
}) {
  const [trackForm, setTrackForm]       = useState({
    ...BLANK_TRACK,
    track_number: String(existingTrackCount + 1),
    is_published: true,
  });
  const [versionFiles, setVersionFiles] = useState([]);
  const [stemFiles, setStemFiles]       = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [uploading, setUploading]       = useState(false);
  const [message, setMessage]           = useState({ type: '', text: '' });

  const isWorking = uploading || converting;

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!trackForm.audio_file) { showMessage('error', 'Audio file is required'); return; }
    if (!trackForm.title.trim()) { showMessage('error', 'Track title is required'); return; }

    // Duplicate title check within this album
    const normTitle = trackForm.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const { data: existingTitles } = await supabase
      .from('tracks').select('title').eq('artist_id', artist.id);
    if (existingTitles?.some(t => t.title.toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle)) {
      showMessage('error', `You already have a track called "${trackForm.title.trim()}". Please use a unique title.`);
      return;
    }

    setUploading(true);
    try {
      const fileUrl = await convertAndUploadAudio(trackForm.audio_file, 'tracks/');
      let coverUrl = null;
      if (trackForm.cover_file) {
        showMessage('info', 'Uploading cover artwork…');
        coverUrl = await uploadFile(trackForm.cover_file, 'covers/');
      }

      showMessage('info', 'Saving track…');
      const { data, error } = await supabase.from('tracks').insert([{
        artist_id:         artist.id,
        album_id:          album.id,
        title:             trackForm.title.trim(),
        slug:              slugify(trackForm.title),
        genre:             trackForm.genre,
        mood:              trackForm.mood,
        lyrics:            trackForm.lyrics || null,
        file_url:          fileUrl,
        cover_artwork_url: coverUrl,
        track_number:      parseInt(trackForm.track_number) || (existingTrackCount + 1),
        is_explicit:       trackForm.is_explicit,
        is_downloadable:   trackForm.is_downloadable,
        is_published:      trackForm.is_published,
        is_premium:        trackForm.is_premium,
        download_price:    parseFloat(trackForm.download_price) || 0,
        featured:          trackForm.featured,
        has_versions:      trackForm.has_versions,
        pay_what_you_want: trackForm.pay_what_you_want || false,
        minimum_price:     parseFloat(trackForm.minimum_price) > 0 ? parseFloat(trackForm.minimum_price) : null,
        is_preorder:       trackForm.is_preorder || false,
        release_date:      trackForm.is_preorder && trackForm.release_date ? trackForm.release_date : null,
        youtube_url:       trackForm.youtube_url?.trim() || null,
        is_beat:           false,
        bpm:               null,
        beat_key:          null,
        beat_scale:        null,
        beat_licence:      null,
      }]).select();
      if (error) throw error;
      const trackId = data[0].id;

      if (stemFiles.length > 0) {
        showMessage('info', 'Saving stem files…');
        const stemInserts = stemFiles.map(s => ({
          track_id: trackId,
          file_name: s.name,
          file_url: s.url,
          file_size: s.size,
        }));
        await supabase.from('track_stems').insert(stemInserts).catch(() => {});
        setStemFiles([]);
      }

      if (trackForm.has_versions && versionFiles.length > 0) {
        for (const ver of versionFiles) {
          if (ver.file) {
            showMessage('info', `Uploading version: ${ver.version_name}…`);
            const verUrl = await convertAndUploadAudio(ver.file, 'versions/');
            await supabase.from('track_versions').insert([{
              track_id: trackId, version_name: ver.version_name,
              version_type: ver.version_type, file_url: verUrl,
            }]);
          }
        }
      }

      if (collaborators.length > 0) {
        showMessage('info', 'Sending collab requests…');
        await saveCollaborations(trackId, collaborators);
      }

      if (trackForm.is_published) {
        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          fetch('/.netlify/functions/notify-new-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id:    trackId,
              track_title: trackForm.title,
              artist_id:   artist.id,
              artist_slug: artist.slug,
              token:       authSession?.access_token,
            }),
          }).catch(() => {});
        } catch {}
      }

      showMessage('success', `"${trackForm.title}" added to album!`);
      onTrackAdded(data[0]);

    } catch (err) {
      showMessage('error', 'Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {/* Toast */}
      {message.text && (
        <div className={`p-3 rounded-lg text-sm flex items-start space-x-2 ${
          message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : message.type === 'info'  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {message.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}
      {converting && <ConversionBanner progress={convProgress} />}
      {convError && <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">{convError}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Track Title *</FieldLabel>
          <FInput type="text" required value={trackForm.title}
            onChange={(e) => setTrackForm({ ...trackForm, title: e.target.value })}
            onBlur={(e) => setTrackForm(prev => ({ ...prev, title: normaliseTitleCase(e.target.value) }))} />
        </div>
        <div>
          <FieldLabel>Track Number</FieldLabel>
          <FInput type="number" min="1" value={trackForm.track_number}
            onChange={(e) => setTrackForm({ ...trackForm, track_number: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Genre</FieldLabel>
          <FSelect value={trackForm.genre}
            onChange={(e) => setTrackForm({ ...trackForm, genre: e.target.value })}>
            <option value="">Select genre…</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </FSelect>
        </div>
        <div>
          <FieldLabel>Mood</FieldLabel>
          <FSelect value={trackForm.mood}
            onChange={(e) => setTrackForm({ ...trackForm, mood: e.target.value })}>
            <option value="">Select mood…</option>
            {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
          </FSelect>
        </div>
        <TierGate feature="download_sales" inline>
          <div>
            <FieldLabel>
              Download Price (USD)
              {!isPremium && downloadSalesLimit > 0 && (
                <span className="ml-2 text-[10px] text-white/30 font-normal">
                  {downloadSalesRemaining > 0
                    ? `${downloadSalesRemaining} of ${downloadSalesLimit} remaining this month`
                    : 'Monthly limit reached'}
                </span>
              )}
            </FieldLabel>
            {canAddDownloadSale || parseFloat(trackForm.download_price) > 0 ? (
              <FInput type="number" min="0" step="0.01" value={trackForm.download_price}
                onChange={(e) => setTrackForm({ ...trackForm, download_price: e.target.value })} />
            ) : (
              <div className="px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06] text-xs text-white/30">
                Monthly limit reached (2/month on Pro) — upgrade to Premium for unlimited
              </div>
            )}
          </div>
        </TierGate>
        {trackForm.is_downloadable && parseFloat(trackForm.download_price) > 0 && (
          <div className="md:col-span-2 space-y-2">
            <div className="flex items-center space-x-3">
              <Toggle value={trackForm.pay_what_you_want}
                onChange={() => setTrackForm({ ...trackForm, pay_what_you_want: !trackForm.pay_what_you_want })} />
              <span className="text-xs text-white/50">Pay What You Want</span>
            </div>
            {trackForm.pay_what_you_want && (
              <div>
                <FieldLabel>Minimum Price (0 = free)</FieldLabel>
                <FInput type="number" min="0" step="0.01" value={trackForm.minimum_price}
                  onChange={(e) => setTrackForm({ ...trackForm, minimum_price: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </div>

      <TierGate feature="lyrics" inline>
        <LyricsEditor
          lyrics={trackForm.lyrics}
          onChange={val => setTrackForm({ ...trackForm, lyrics: val })}
          audioFile={trackForm.audio_file}
          audioUrl={null}
        />
      </TierGate>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Audio File * (.mp3, .wav, .flac)</FieldLabel>
          <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg,.aac"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f && f.size > 500 * 1024 * 1024) { showMessage('error', 'File too large! Max 500MB'); return; }
              setTrackForm({ ...trackForm, audio_file: f });
            }}
            className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
          {trackForm.audio_file && (
            <div className="mt-1 space-y-0.5">
              <p className="text-xs text-white/30">{trackForm.audio_file.name} ({(trackForm.audio_file.size / (1024 * 1024)).toFixed(1)}MB)</p>
              {trackForm.audio_file.name.toLowerCase().endsWith('.wav') && (
                <p className="text-xs text-purple-400/70 flex items-center space-x-1">
                  <Zap className="w-3 h-3" /><span>Will be converted to MP3 at 320kbps</span>
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <FieldLabel>Cover Artwork (.jpg, .png)</FieldLabel>
          <input type="file" accept=".jpg,.jpeg,.png,.webp"
            onChange={(e) => setTrackForm({ ...trackForm, cover_file: e.target.files[0] })}
            className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
        </div>
      </div>

      <TierGate feature="download_sales" inline>
        <YoutubeField
          value={trackForm.youtube_url}
          onChange={(val) => setTrackForm({ ...trackForm, youtube_url: val })}
        />
      </TierGate>

      <StemsUploader
        stems={stemFiles}
        setStems={setStemFiles}
        uploadFile={uploadFile}
        showMessage={showMessage}
      />

      <div className="flex flex-wrap gap-4">
        {[
          { key: 'is_published',    label: 'Published' },
          { key: 'featured',        label: 'Featured', premiumOnly: true },
          { key: 'is_explicit',     label: 'Explicit' },
          { key: 'is_downloadable', label: 'Downloadable' },
          { key: 'has_versions',    label: 'Has Versions' },
        ].map(({ key, label, premiumOnly }) => (
          premiumOnly ? (
            <TierGate key={key} feature="download_sales" inline>
              <label className="flex items-center space-x-2 cursor-pointer">
                <Toggle value={trackForm[key]}
                  onChange={() => setTrackForm({ ...trackForm, [key]: !trackForm[key] })} />
                <span className="text-xs text-white/50">{label}</span>
              </label>
            </TierGate>
          ) : (
            <label key={key} className="flex items-center space-x-2 cursor-pointer">
              <Toggle value={trackForm[key]}
                onChange={() => setTrackForm({ ...trackForm, [key]: !trackForm[key] })} />
              <span className="text-xs text-white/50">{label}</span>
            </label>
          )
        ))}
        <TierGate feature="download_sales" inline>
          <label className="flex items-center space-x-2 cursor-pointer">
            <Toggle value={trackForm.is_premium}
              onChange={() => setTrackForm({ ...trackForm, is_premium: !trackForm.is_premium })} />
            <span className="text-xs text-white/50">Premium</span>
          </label>
        </TierGate>
        <TierGate feature="collaborations" inline>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox"
              checked={trackForm.is_preorder || false}
              disabled={!isPremium}
              title={!isPremium ? 'Pre-order releases require Premium' : ''}
              onChange={() => isPremium && setTrackForm({ ...trackForm, is_preorder: !trackForm.is_preorder })}
              className="rounded border-white/20" />
            <span className="text-xs text-white/50">Pre-order</span>
          </label>
        </TierGate>
      </div>

      {trackForm.is_preorder && (
        <div>
          <FieldLabel>Release Date</FieldLabel>
          <FInput type="datetime-local"
            value={trackForm.release_date ? trackForm.release_date.substring(0, 16) : ''}
            onChange={(e) => setTrackForm({ ...trackForm, release_date: e.target.value })} />
        </div>
      )}

      {trackForm.has_versions && (
        <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
          <h4 className="text-sm font-medium text-white">Alternate Versions</h4>
          <VersionsEditor versions={versionFiles} setVersions={setVersionFiles} />
        </div>
      )}

      <TierGate feature="collaborations" inline>
        <CollaboratorSearch collaborators={collaborators}
          setCollaborators={setCollaborators} currentArtistId={artist.id} />
      </TierGate>

      <div className="flex space-x-2 pt-1">
        <button type="submit" disabled={isWorking}
          className="flex-1 py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
          {isWorking ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>
            {converting ? `Converting… ${convProgress}%`
              : uploading ? 'Uploading…'
              : 'Add Track to Album'}
          </span>
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-3 bg-white/[0.06] text-white/60 rounded-lg text-sm transition hover:bg-white/[0.1]">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrackUploadPanel() {
  const { artist, user, refreshProfile } = useAuth();
  const { isPremium, canAddDownloadSale, downloadSalesRemaining, downloadSalesLimit } = useTier();

  useEffect(() => {
    if (user && !artist) {
      const t = setTimeout(() => refreshProfile(), 800);
      return () => clearTimeout(t);
    }
  }, [user, artist]); // eslint-disable-line react-hooks/exhaustive-deps

  const { convert, converting, progress: convProgress, error: convError } = useAudioConverter();

  const [activeTab, setActiveTab]               = useState('upload');
  const [showHelp, setShowHelp]                 = useState(false);
  const [albums, setAlbums]                     = useState([]);
  const [manageTab, setManageTab]               = useState('tracks');
  const [editingAlbumId, setEditingAlbumId]     = useState(null);
  const [editAlbumForm, setEditAlbumForm]       = useState({});
  const [tracks, setTracks]                     = useState([]);
  const [filteredTracks, setFilteredTracks]     = useState([]);
  const [searchTerm, setSearchTerm]             = useState('');
  const [loading, setLoading]                   = useState(false);
  const [uploading, setUploading]               = useState(false);
  const [message, setMessage]                   = useState({ type: '', text: '' });

  // Upload state
  const [release, setRelease]                   = useState(BLANK_RELEASE);
  const [trackForm, setTrackForm]               = useState(BLANK_TRACK);
  const [versionFiles, setVersionFiles]         = useState([]);
  const [stemFiles, setStemFiles]               = useState([]);
  const [beatLicence, setBeatLicence]           = useState('basic');
  const [beatPrice, setBeatPrice]               = useState('');
  const [collaborators, setCollaborators]       = useState([]);
  const [albumCollaborators, setAlbumCollaborators] = useState([]);
  const [albumTrackQueue, setAlbumTrackQueue]   = useState([]);
  const [sessionAlbumId, setSessionAlbumId]     = useState(null);
  const [addingAnother, setAddingAnother]       = useState(false);

  // Edit state
  const [editingId, setEditingId]               = useState(null);
  const [editForm, setEditForm]                 = useState({});
  const [editCollaborators, setEditCollaborators] = useState([]);
  const [editCoverFile, setEditCoverFile]       = useState(null);
  const [editAudioFile, setEditAudioFile]       = useState(null);
  const [editAlbumCoverFile, setEditAlbumCoverFile] = useState(null);
  const [albumTracks, setAlbumTracks]           = useState([]);
  const [albumTracksLoading, setAlbumTracksLoading] = useState(false);

  // ── NEW: Add track to album (in manage panel) ──────────────────────────────
  const [showAddTrackToAlbum, setShowAddTrackToAlbum] = useState(false);

  const isAlbumRelease = ALBUM_TYPES.includes(release.release_type);
  const isBeat          = release.release_type === 'beat';
  const isWorking      = uploading || converting;

  useEffect(() => { if (artist) fetchAlbums(); }, [artist]);
  useEffect(() => { if (activeTab === 'manage') fetchTracks(); }, [activeTab]);
  useEffect(() => {
    setFilteredTracks(searchTerm
      ? tracks.filter(t =>
          t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.genre?.toLowerCase().includes(searchTerm.toLowerCase()))
      : tracks);
  }, [searchTerm, tracks]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const fetchAlbums = async () => {
    const { data } = await supabase.from('albums').select('*')
      .eq('artist_id', artist.id).order('created_at', { ascending: false });
    setAlbums(data || []);
  };

  const fetchTracks = async () => {
    setLoading(true);
    const { data } = await supabase.from('tracks').select('*, albums(title)')
      .eq('artist_id', artist.id).order('created_at', { ascending: false });
    setTracks(data || []); setFilteredTracks(data || []);
    setLoading(false);
  };

  const uploadFile = async (file, folder = '', retries = 3) => {
    const fileExt  = file.name.split('.').pop();
    const fileName = `${folder}${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
      const { error } = await supabase.storage.from('feelz-samples').upload(fileName, file);
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('feelz-samples').getPublicUrl(fileName);
        return publicUrl;
      }
      const is503 = error?.statusCode === 503 || error?.message?.includes('503');
      if (attempt < retries && is503) { await new Promise(r => setTimeout(r, 1500 * attempt)); continue; }
      throw new Error(is503 ? 'Upload service temporarily unavailable.' : error.message);
    }
  };

  const convertAndUploadAudio = async (file, folder = 'tracks/') => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'wav') {
      showMessage('info', 'Converting WAV to MP3 (320kbps)…');
      const mp3 = await convert(file);
      if (!mp3) throw new Error('Audio conversion failed. Please try again.');
      showMessage('info', 'Uploading MP3…');
      return uploadFile(mp3, folder);
    }
    showMessage('info', 'Uploading audio…');
    return uploadFile(file, folder);
  };

  const saveCollaborations = async (trackId, collabArr) => {
    for (const collab of collabArr) {
      try {
        const { data: cd, error } = await supabase.from('collaborations').insert([{
          track_id: trackId, artist_id: collab.artist_id, role: collab.role,
          split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
        }]).select().single();
        if (error) continue;
        await supabase.from('collab_requests').insert([{
          collaboration_id: cd.id, from_artist_id: artist.id,
          to_artist_id: collab.artist_id, track_id: trackId,
          message: collab.message || null, status: 'pending',
        }]);
      } catch {}
    }
  };

  const ensureAlbum = async () => {
    if (sessionAlbumId) return sessionAlbumId;
    if (!release.album_title.trim()) throw new Error('Album title is required');
    showMessage('info', 'Creating album…');
    let coverUrl = null;
    if (release.album_cover_file) coverUrl = await uploadFile(release.album_cover_file, 'album-covers/');
    const { data, error } = await supabase.from('albums').insert([{
      artist_id:         artist.id,
      title:             release.album_title.trim(),
      slug:              slugify(release.album_title),
      description:       release.album_description || null,
      cover_artwork_url: coverUrl,
      release_date:      release.album_release_date || null,
      release_type:      release.release_type,
      is_published:      release.album_is_published,
      price:             parseFloat(release.album_price) || 0,
    }]).select().single();
    if (error) throw error;
    if (albumCollaborators.length > 0) {
      for (const collab of albumCollaborators) {
        try {
          const { data: cd } = await supabase.from('collaborations').insert([{
            album_id: data.id, artist_id: collab.artist_id, role: collab.role,
            split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
          }]).select().single();
          await supabase.from('collab_requests').insert([{
            collaboration_id: cd.id, from_artist_id: artist.id,
            to_artist_id: collab.artist_id, message: collab.message || null, status: 'pending',
          }]);
        } catch {}
      }
    }
    setSessionAlbumId(data.id);
    await fetchAlbums();
    return data.id;
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!trackForm.audio_file) { showMessage('error', 'Audio file is required'); return; }
    if (!trackForm.title.trim()) { showMessage('error', 'Track title is required'); return; }
    if (!artist) { showMessage('error', 'No artist profile found'); return; }

    const normTitle = trackForm.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const { data: existingTitles } = await supabase
      .from('tracks').select('title').eq('artist_id', artist.id);
    if (existingTitles?.some(t => t.title.toLowerCase().replace(/[^a-z0-9]/g, '') === normTitle)) {
      showMessage('error', `You already have a track called "${trackForm.title.trim()}". Please use a unique title.`);
      return;
    }

    if (!isAlbumRelease && trackForm.cover_file) {
      const { data: existingTracks } = await supabase
        .from('tracks').select('cover_artwork_url')
        .eq('artist_id', artist.id).is('album_id', null)
        .not('cover_artwork_url', 'is', null);
      if (existingTracks?.length >= 2) {
        const urls = existingTracks.map(t => t.cover_artwork_url);
        const uniqueUrls = new Set(urls);
        if (uniqueUrls.size === 1 && urls.length >= 2) {
          showMessage('error', 'All your singles appear to use the same artwork. Please upload unique cover art for each track.');
          return;
        }
        const newName = trackForm.cover_file.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const existingBasenames = urls.map(u => {
          try { return u.split('/').pop().split('?')[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12); } catch { return ''; }
        });
        const matchCount = existingBasenames.filter(b => b && newName.startsWith(b.slice(0, 8))).length;
        if (matchCount >= 2) {
          showMessage('error', "This artwork looks like one you've used before. Please use unique cover art for each single.");
          return;
        }
      }
    }

    if (isAlbumRelease && !sessionAlbumId) {
      if (!release.album_cover_file) {
        showMessage('error', `Cover artwork is required for a ${release.release_type}. The home page must always display artwork.`);
        return;
      }
    }
    if (isAlbumRelease && !trackForm.cover_file && albumTrackQueue.length === 0) {
      showMessage('error', 'Please add cover artwork for the first track.');
      return;
    }

    setUploading(true);
    try {
      let albumId = null;
      if (isAlbumRelease) albumId = await ensureAlbum();

      const fileUrl = await convertAndUploadAudio(trackForm.audio_file, 'tracks/');
      let coverUrl = null;
      if (trackForm.cover_file) {
        showMessage('info', 'Uploading cover artwork…');
        coverUrl = await uploadFile(trackForm.cover_file, 'covers/');
      }

      showMessage('info', 'Saving track…');
      const { data, error } = await supabase.from('tracks').insert([{
        artist_id:         artist.id,
        album_id:          albumId,
        title:             trackForm.title.trim(),
        slug:              slugify(trackForm.title),
        genre:             trackForm.genre,
        mood:              trackForm.mood,
        lyrics:            trackForm.lyrics || null,
        file_url:          fileUrl,
        cover_artwork_url: coverUrl,
        track_number:      parseInt(trackForm.track_number) || (albumTrackQueue.length + 1),
        is_explicit:       trackForm.is_explicit,
        is_downloadable:   trackForm.is_downloadable,
        is_published:      trackForm.is_published,
        is_premium:        trackForm.is_premium,
        download_price:    parseFloat(trackForm.download_price) || 0,
        featured:          trackForm.featured,
        has_versions:      trackForm.has_versions,
        pay_what_you_want: trackForm.pay_what_you_want || false,
        minimum_price:     parseFloat(trackForm.minimum_price) > 0 ? parseFloat(trackForm.minimum_price) : null,
        is_preorder:       trackForm.is_preorder || false,
        release_date:      trackForm.is_preorder && trackForm.release_date ? trackForm.release_date : null,
        youtube_url:       trackForm.youtube_url?.trim() || null,
      }]).select();
      if (error) throw error;
      const trackId = data[0].id;

      if (trackForm.has_versions && versionFiles.length > 0) {
        for (const ver of versionFiles) {
          if (ver.file) {
            showMessage('info', `Uploading version: ${ver.version_name}…`);
            const verUrl = await convertAndUploadAudio(ver.file, 'versions/');
            await supabase.from('track_versions').insert([{
              track_id: trackId, version_name: ver.version_name,
              version_type: ver.version_type, file_url: verUrl,
            }]);
          }
        }
      }

      if (collaborators.length > 0) {
        showMessage('info', 'Sending collab requests…');
        await saveCollaborations(trackId, collaborators);
      }

      if (trackForm.is_published) {
        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          fetch('/.netlify/functions/notify-new-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id:    trackId,
              track_title: trackForm.title,
              artist_id:   artist.id,
              artist_slug: artist.slug,
              token:       authSession?.access_token,
            }),
          }).catch(() => {});
        } catch {}
      }

      if (isAlbumRelease) {
        setAlbumTrackQueue(prev => [...prev, {
          id: trackId, title: trackForm.title,
          cover_artwork_url: coverUrl, _uploaded: true,
        }]);
        showMessage('success', `"${trackForm.title}" added!`);
        setTrackForm({ ...BLANK_TRACK, track_number: String(albumTrackQueue.length + 2) });
        setVersionFiles([]); setCollaborators([]);
        setAddingAnother(false);
      } else {
        showMessage('success', 'Track uploaded successfully!');
        resetAll();
      }
      fetchTracks();
    } catch (err) {
      showMessage('error', 'Upload failed: ' + err.message);
    }
    setUploading(false);
  };

  const resetAll = () => {
    setRelease(BLANK_RELEASE);
    setTrackForm(BLANK_TRACK);
    setVersionFiles([]); setCollaborators([]);
    setAlbumCollaborators([]); setAlbumTrackQueue([]);
    setSessionAlbumId(null); setAddingAnother(false);
  };

  const finishAlbum = () => {
    if (albumTrackQueue.length === 0) {
      showMessage('error', `Please add at least one track before publishing your ${release.release_type}.`);
      return;
    }
    showMessage('success', `${release.release_type.toUpperCase()} published with ${albumTrackQueue.length} track${albumTrackQueue.length !== 1 ? 's' : ''}!`);
    resetAll();
  };

  const startEdit = async (track) => {
    setEditingId(track.id);
    setEditCoverFile(null); setEditAudioFile(null);
    setEditForm({
      title: track.title, genre: track.genre || '', mood: track.mood || '',
      lyrics: track.lyrics || '', is_explicit: track.is_explicit,
      is_downloadable: track.is_downloadable, is_published: track.is_published,
      is_premium: track.is_premium, download_price: track.download_price || 0,
      featured: track.featured, pay_what_you_want: track.pay_what_you_want || false,
      minimum_price: track.minimum_price?.toString() || '0',
      album_id: track.album_id || '', track_number: track.track_number || 1,
      is_preorder: track.is_preorder || false, release_date: track.release_date || null,
      has_versions: track.has_versions || false, cover_artwork_url: track.cover_artwork_url || '',
      youtube_url: track.youtube_url || '',
    });
    const { data } = await supabase.from('collaborations')
      .select('*, artists(artist_name, profile_image_url)').eq('track_id', track.id);
    setEditCollaborators((data || []).map(c => ({
      artist_id: c.artist_id, artist_name: c.artists?.artist_name,
      role: c.role, split_percent: c.split_percent,
    })));
  };

  const saveEdit = async (id) => {
    if (!artist) {
      await refreshProfile();
      if (!artist) {
        showMessage('error', 'Artist profile not found. Please refresh and try again.');
        return;
      }
    }
    setUploading(true);
    let wasPublished = false;
    try {
      const { data: currentTrack } = await supabase.from('tracks').select('is_published').eq('id', id).maybeSingle();
      wasPublished = currentTrack?.is_published ?? false;
    } catch {}
    try {
      let coverUrl = editForm.cover_artwork_url || '';
      let audioUrl = null;
      if (editCoverFile) coverUrl = await uploadFile(editCoverFile, 'covers/');
      if (editAudioFile) audioUrl = await convertAndUploadAudio(editAudioFile, 'tracks/');
      if (editCollaborators.length > 0) {
        await supabase.from('collaborations').delete().eq('track_id', id);
        for (const collab of editCollaborators) {
          await supabase.from('collaborations').insert({
            track_id: id, artist_id: collab.artist_id, role: collab.role,
            split_percent: collab.split_percent, status: 'pending', invited_by: artist.id,
          });
        }
      }
      const { error } = await supabase.from('tracks').update({
        artist_id: artist.id,
        title: editForm.title, slug: slugify(editForm.title),
        genre: editForm.genre, mood: editForm.mood, lyrics: editForm.lyrics,
        is_explicit: editForm.is_explicit, is_downloadable: editForm.is_downloadable,
        is_published: editForm.is_published, is_premium: editForm.is_premium,
        download_price: parseFloat(editForm.download_price) || 0,
        featured: editForm.featured, pay_what_you_want: editForm.pay_what_you_want || false,
        minimum_price: parseFloat(editForm.minimum_price) > 0 ? parseFloat(editForm.minimum_price) : null,
        album_id: editForm.album_id || null, track_number: parseInt(editForm.track_number) || 1,
        cover_artwork_url: coverUrl, ...(audioUrl && { file_url: audioUrl }),
        is_preorder: editForm.is_preorder || false,
        release_date: editForm.is_preorder && editForm.release_date ? editForm.release_date : null,
        has_versions: editForm.has_versions || false,
        youtube_url: editForm.youtube_url?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      if (editForm.is_published && !wasPublished) {
        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          fetch('/.netlify/functions/notify-new-track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id:    id,
              track_title: editForm.title,
              artist_id:   artist.id,
              artist_slug: artist.slug,
              token:       authSession?.access_token,
            }),
          }).catch(() => {});
        } catch {}
      }
      showMessage('success', 'Track updated!');
      setEditingId(null); setEditCoverFile(null); setEditAudioFile(null);
      fetchTracks();
    } catch (err) {
      showMessage('error', 'Failed: ' + err.message);
    } finally { setUploading(false); }
  };

  const saveAlbum = async (albumId) => {
    try {
      let coverUrl = editAlbumForm.cover_artwork_url || null;
      if (editAlbumCoverFile) {
        coverUrl = await uploadFile(editAlbumCoverFile, 'album-covers/');
      }
      await supabase.from('albums').update({
        title:             editAlbumForm.title,
        description:       editAlbumForm.description || null,
        release_type:      editAlbumForm.release_type,
        release_date:      editAlbumForm.release_date || null,
        price:             parseFloat(editAlbumForm.price) || 0,
        is_published:      editAlbumForm.is_published,
        cover_artwork_url: coverUrl,
      }).eq('id', albumId);
      setEditingAlbumId(null);
      setEditAlbumCoverFile(null);
      fetchAlbums();
      showMessage('success', 'Album updated');
    } catch (err) {
      showMessage('error', 'Failed to update album');
    }
  };

  const deleteTrack = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('tracks').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Track deleted');
      fetchTracks();
    } catch (err) { showMessage('error', 'Failed: ' + err.message); }
  };

  // Helper: reload tracks for an open album
  const reloadAlbumTracks = async (albumId) => {
    setAlbumTracksLoading(true);
    const { data } = await supabase.from('tracks')
      .select('*, albums(title)')
      .eq('album_id', albumId)
      .eq('artist_id', artist.id)
      .order('track_number', { ascending: true });
    setAlbumTracks(data || []);
    setAlbumTracksLoading(false);
  };

  if (!artist) return (
    <div className="text-center py-20">
      <Music className="w-12 h-12 mx-auto text-white/20 mb-4" />
      <p className="text-white/40">No artist profile found.</p>
    </div>
  );

  return (
    <div className="space-y-5">

      {showHelp && <UploadHelpPanel onClose={() => setShowHelp(false)} />}

      {message.text && (
        <div className={`p-3 rounded-lg text-sm flex items-start space-x-2 ${
          message.type === 'success' ? 'bg-green-500/10 border border-green-500/20 text-green-400'
          : message.type === 'info'  ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
          : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {message.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}
      {converting && <ConversionBanner progress={convProgress} />}
      {convError   && <div className="p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400">{convError}</div>}

      {/* Tab bar */}
      <div className="flex items-center space-x-2">
        <div className="flex flex-1 space-x-1 bg-white/[0.03] rounded-lg p-1">
          {[
            { key: 'upload', label: 'Upload',       icon: Upload },
            { key: 'manage', label: 'Manage Tracks', icon: Edit },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-md text-sm font-medium transition ${
                activeTab === key ? 'bg-white text-black' : 'text-white/50 hover:text-white/70'
              }`}>
              <Icon className="w-4 h-4" /><span>{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="flex items-center space-x-1.5 px-3 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition text-white/40 hover:text-white/70 text-xs font-medium flex-shrink-0"
          title="Upload guide"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">How to upload</span>
        </button>
      </div>

      {/* ══════════════════ UPLOAD TAB ══════════════════ */}
      {activeTab === 'upload' && (
        <form onSubmit={handleUpload} className="space-y-5">

          {/* Step 1: Release type */}
          <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-3">
            <h3 className="text-sm font-semibold text-white">What are you releasing?</h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {['single', 'beat', 'ep', 'album', 'mixtape', 'live', 'compilation'].map(type => (
                <button key={type} type="button"
                  onClick={() => {
                    setRelease({ ...release, release_type: type });
                    if (sessionAlbumId && type !== release.release_type) {
                      setSessionAlbumId(null); setAlbumTrackQueue([]);
                    }
                  }}
                  className={`py-2 rounded-lg text-xs font-medium transition capitalize ${
                    release.release_type === type ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50 hover:bg-white/[0.1]'
                  }`}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Album details */}
          {isAlbumRelease && !sessionAlbumId && (
            <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
              <div className="flex items-center space-x-2">
                <Disc className="w-4 h-4 text-white/40" />
                <h3 className="text-sm font-semibold text-white capitalize">{release.release_type} Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>{release.release_type.charAt(0).toUpperCase() + release.release_type.slice(1)} Title *</FieldLabel>
                  <FInput type="text" required value={release.album_title}
                    placeholder={`Enter ${release.release_type} title…`}
                    onChange={(e) => setRelease({ ...release, album_title: e.target.value })}
                    onBlur={(e) => setRelease(prev => ({ ...prev, album_title: normaliseTitleCase(e.target.value) }))} />
                </div>
                <div>
                  <FieldLabel>Release Date</FieldLabel>
                  <FInput type="date" value={release.album_release_date}
                    onChange={(e) => setRelease({ ...release, album_release_date: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Price (USD, 0 = free)</FieldLabel>
                  <FInput type="number" min="0" step="0.01" value={release.album_price}
                    onChange={(e) => setRelease({ ...release, album_price: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>
                    Cover Artwork <span className="text-red-400">*</span>
                    <span className="text-white/20 font-normal ml-1">(required — shown on home page)</span>
                  </FieldLabel>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setRelease({ ...release, album_cover_file: e.target.files[0] })}
                    className={`w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1] rounded-lg transition ${
                      !release.album_cover_file ? 'ring-1 ring-red-500/40' : 'ring-1 ring-green-500/30'
                    }`} />
                  {!release.album_cover_file && (
                    <p className="text-[10px] text-red-400/70 mt-1.5 flex items-center space-x-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span>Albums without artwork are hidden from the home page.</span>
                    </p>
                  )}
                </div>
              </div>
              <div>
                <FieldLabel>Description (optional)</FieldLabel>
                <textarea rows={2} value={release.album_description}
                  onChange={(e) => setRelease({ ...release, album_description: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
              </div>
              <label className="flex items-center space-x-2 cursor-pointer">
                <Toggle value={release.album_is_published}
                  onChange={() => setRelease({ ...release, album_is_published: !release.album_is_published })} />
                <span className="text-xs text-white/50">Published</span>
              </label>
              <TierGate feature="collaborations" inline>
                <div>
                  <FieldLabel>Album Collaborators</FieldLabel>
                  <CollaboratorSearch collaborators={albumCollaborators}
                    setCollaborators={setAlbumCollaborators} currentArtistId={artist.id} />
                </div>
              </TierGate>
            </div>
          )}

          {/* Album session summary */}
          {isAlbumRelease && sessionAlbumId && (
            <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Disc className="w-4 h-4 text-white/40" />
                  <p className="text-sm font-medium text-white">{release.album_title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded capitalize">{release.release_type}</span>
                </div>
                <span className="text-xs text-white/30">{albumTrackQueue.length} track{albumTrackQueue.length !== 1 ? 's' : ''}</span>
              </div>
              {albumTrackQueue.map((t, i) => (
                <div key={t.id} className="flex items-center space-x-3 p-2 bg-white/[0.03] rounded-lg">
                  <span className="text-xs text-white/20 w-4 text-center">{i + 1}</span>
                  <div className="w-7 h-7 rounded-md overflow-hidden bg-white/10 flex-shrink-0">
                    {t.cover_artwork_url
                      ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-3 h-3 text-white/20" /></div>}
                  </div>
                  <p className="text-sm text-white flex-1 truncate">{t.title}</p>
                  <span className="text-[10px] text-green-400">✓</span>
                </div>
              ))}
            </div>
          )}

          {/* Add another / Done controls */}
          {isAlbumRelease && albumTrackQueue.length > 0 && !addingAnother ? (
            <div className="space-y-2">
              <button type="button" onClick={() => {
                setAddingAnother(true);
                setTrackForm({ ...BLANK_TRACK, track_number: String(albumTrackQueue.length + 1) });
              }}
                className="w-full py-3 bg-white/[0.06] text-white/70 font-medium rounded-lg hover:bg-white/[0.1] transition flex items-center justify-center space-x-2">
                <Plus className="w-4 h-4" /><span>Add Another Track</span>
              </button>
              <button type="button" onClick={finishAlbum}
                className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 transition">
                Done — Publish {release.release_type.toUpperCase()}
              </button>
            </div>
          ) : (
            <div className="bg-white/[0.03] rounded-xl p-5 border border-white/[0.06] space-y-4">
              <h3 className="text-sm font-semibold text-white">
                {isAlbumRelease
                  ? albumTrackQueue.length === 0 ? 'First Track' : `Track ${albumTrackQueue.length + 1}`
                  : 'Track Details'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Track Title *</FieldLabel>
                  <FInput type="text" required value={trackForm.title}
                    onChange={(e) => setTrackForm({ ...trackForm, title: e.target.value })}
                    onBlur={(e) => setTrackForm(prev => ({ ...prev, title: normaliseTitleCase(e.target.value) }))} />
                </div>
                {!isAlbumRelease && (
                  <div>
                    <FieldLabel>Add to Existing Album (optional)</FieldLabel>
                    <FSelect value={trackForm.album_id || ''}
                      onChange={(e) => setTrackForm({ ...trackForm, album_id: e.target.value })}>
                      <option value="">No Album (Single)</option>
                      {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </FSelect>
                  </div>
                )}
                <div>
                  <FieldLabel>Genre</FieldLabel>
                  <FSelect value={trackForm.genre}
                    onChange={(e) => setTrackForm({ ...trackForm, genre: e.target.value })}>
                    <option value="">Select genre…</option>
                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                  </FSelect>
                </div>
                <div>
                  <FieldLabel>Mood</FieldLabel>
                  <FSelect value={trackForm.mood}
                    onChange={(e) => setTrackForm({ ...trackForm, mood: e.target.value })}>
                    <option value="">Select mood…</option>
                    {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </FSelect>
                </div>
                {isAlbumRelease && (
                  <div>
                    <FieldLabel>Track Number</FieldLabel>
                    <FInput type="number" min="1" value={trackForm.track_number}
                      onChange={(e) => setTrackForm({ ...trackForm, track_number: e.target.value })} />
                  </div>
                )}
                <TierGate feature="download_sales" inline>
                  <div>
                    <FieldLabel>
                      Download Price (USD)
                      {!isPremium && downloadSalesLimit > 0 && (
                        <span className="ml-2 text-[10px] text-white/30 font-normal">
                          {downloadSalesRemaining > 0
                            ? `${downloadSalesRemaining} of ${downloadSalesLimit} remaining this month`
                            : 'Monthly limit reached'}
                        </span>
                      )}
                    </FieldLabel>
                    {canAddDownloadSale || parseFloat(trackForm.download_price) > 0 ? (
                      <FInput type="number" min="0" step="0.01" value={trackForm.download_price}
                        onChange={(e) => setTrackForm({ ...trackForm, download_price: e.target.value })} />
                    ) : (
                      <div className="px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06] text-xs text-white/30">
                        Monthly limit reached (2/month on Pro) — upgrade to Premium for unlimited
                      </div>
                    )}
                  </div>
                </TierGate>
                {trackForm.is_downloadable && parseFloat(trackForm.download_price) > 0 && (
                  <div className="md:col-span-2 space-y-2">
                    <div className="flex items-center space-x-3">
                      <Toggle value={trackForm.pay_what_you_want}
                        onChange={() => setTrackForm({ ...trackForm, pay_what_you_want: !trackForm.pay_what_you_want })} />
                      <span className="text-xs text-white/50">Pay What You Want</span>
                    </div>
                    {trackForm.pay_what_you_want && (
                      <div>
                        <FieldLabel>Minimum Price (0 = free)</FieldLabel>
                        <FInput type="number" min="0" step="0.01" value={trackForm.minimum_price}
                          onChange={(e) => setTrackForm({ ...trackForm, minimum_price: e.target.value })} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <TierGate feature="lyrics" inline>
                <div>
                  <FieldLabel>Lyrics (optional)</FieldLabel>
                  <textarea rows={3} value={trackForm.lyrics}
                    onChange={(e) => setTrackForm({ ...trackForm, lyrics: e.target.value })}
                    placeholder="Paste lyrics here…"
                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                </div>
              </TierGate>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel>Audio File * (.mp3, .wav, .flac)</FieldLabel>
                  <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg,.aac"
                    onChange={(e) => {
                      const f = e.target.files[0];
                      if (f && f.size > 500 * 1024 * 1024) { showMessage('error', 'File too large! Max 500MB'); return; }
                      setTrackForm({ ...trackForm, audio_file: f });
                    }}
                    className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                  {trackForm.audio_file && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs text-white/30">{trackForm.audio_file.name} ({(trackForm.audio_file.size / (1024 * 1024)).toFixed(1)}MB)</p>
                      {trackForm.audio_file.name.toLowerCase().endsWith('.wav') && (
                        <p className="text-xs text-purple-400/70 flex items-center space-x-1">
                          <Zap className="w-3 h-3" /><span>Will be converted to MP3 at 320kbps</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel>Cover Artwork (.jpg, .png)</FieldLabel>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setTrackForm({ ...trackForm, cover_file: e.target.files[0] })}
                    className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/[0.06] file:text-white/60 file:text-sm hover:file:bg-white/[0.1]" />
                </div>
              </div>

              {isBeat ? (
                /* ── Beat-specific fields ── */
                <div className="space-y-4">
                  <BeatMetaFields trackForm={trackForm} setTrackForm={setTrackForm} />
                  <BeatLicenceSelector
                    selectedId={beatLicence}
                    price={beatPrice}
                    onSelectLicence={id => {
                      setBeatLicence(id);
                      setTrackForm({ ...trackForm, beat_licence: id,
                        is_downloadable: true,
                        download_price: id === 'free' ? '0' : beatPrice,
                      });
                    }}
                    onPriceChange={val => {
                      setBeatPrice(val);
                      setTrackForm({ ...trackForm, download_price: val });
                    }}
                  />
                </div>
              ) : (
                !isAlbumRelease && (
                  <TierGate feature="download_sales" inline>
                    <YoutubeField
                      value={trackForm.youtube_url}
                      onChange={(val) => setTrackForm({ ...trackForm, youtube_url: val })}
                    />
                  </TierGate>
                )
              )}

              <div className="flex flex-wrap gap-4">
                {[
                  { key: 'is_published',    label: 'Published' },
                  { key: 'featured',        label: 'Featured', premiumOnly: true },
                  { key: 'is_explicit',     label: 'Explicit' },
                  { key: 'is_downloadable', label: 'Downloadable' },
                  { key: 'has_versions',    label: 'Has Versions' },
                ].map(({ key, label, premiumOnly }) => (
                  premiumOnly ? (
                    <TierGate key={key} feature="download_sales" inline>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <Toggle value={trackForm[key]}
                          onChange={() => setTrackForm({ ...trackForm, [key]: !trackForm[key] })} />
                        <span className="text-xs text-white/50">{label}</span>
                      </label>
                    </TierGate>
                  ) : (
                    <label key={key} className="flex items-center space-x-2 cursor-pointer">
                      <Toggle value={trackForm[key]}
                        onChange={() => setTrackForm({ ...trackForm, [key]: !trackForm[key] })} />
                      <span className="text-xs text-white/50">{label}</span>
                    </label>
                  )
                ))}
                <TierGate feature="download_sales" inline>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <Toggle value={trackForm.is_premium}
                      onChange={() => setTrackForm({ ...trackForm, is_premium: !trackForm.is_premium })} />
                    <span className="text-xs text-white/50">Premium</span>
                  </label>
                </TierGate>
                <TierGate feature="collaborations" inline>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox"
                      checked={trackForm.is_preorder || false}
                      disabled={!isPremium}
                      title={!isPremium ? 'Pre-order releases require Premium' : ''}
                      onChange={() => isPremium && setTrackForm({ ...trackForm, is_preorder: !trackForm.is_preorder })}
                      className="rounded border-white/20" />
                    <span className="text-xs text-white/50">Pre-order</span>
                  </label>
                </TierGate>
              </div>

              {trackForm.is_preorder && (
                <div>
                  <FieldLabel>Release Date</FieldLabel>
                  <FInput type="datetime-local"
                    value={trackForm.release_date ? trackForm.release_date.substring(0, 16) : ''}
                    onChange={(e) => setTrackForm({ ...trackForm, release_date: e.target.value })} />
                </div>
              )}

              {trackForm.has_versions && (
                <div className="bg-white/[0.02] rounded-lg p-4 border border-white/[0.06] space-y-3">
                  <h4 className="text-sm font-medium text-white">Alternate Versions</h4>
                  <VersionsEditor versions={versionFiles} setVersions={setVersionFiles} />
                </div>
              )}

              <TierGate feature="collaborations" inline>
                <CollaboratorSearch collaborators={collaborators}
                  setCollaborators={setCollaborators} currentArtistId={artist.id} />
              </TierGate>

              <button type="submit" disabled={isWorking}
                className="w-full py-3 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition flex items-center justify-center space-x-2">
                {isWorking ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>
                  {converting ? `Converting… ${convProgress}%`
                    : uploading ? 'Uploading…'
                    : isBeat ? 'Upload Beat'
                      : isAlbumRelease
                      ? albumTrackQueue.length === 0
                        ? `Create ${release.release_type.toUpperCase()} & Add Track`
                        : 'Add Track'
                      : 'Upload Track'}
                </span>
              </button>

              {addingAnother && (
                <button type="button" onClick={() => setAddingAnother(false)}
                  className="w-full py-2 text-xs text-white/30 hover:text-white/50 transition">
                  Cancel — I'm done adding tracks
                </button>
              )}
            </div>
          )}

          {isAlbumRelease && albumTrackQueue.length > 0 && (
            <button type="button"
              onClick={() => { if (window.confirm('Discard this session and start over?')) resetAll(); }}
              className="w-full py-2 text-xs text-white/20 hover:text-red-400/60 transition">
              Discard & start over
            </button>
          )}
        </form>
      )}

      {/* ══════════════════ MANAGE TAB ══════════════════ */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          {/* Manage sub-tabs */}
          <div className="flex space-x-1 bg-white/[0.03] rounded-lg p-1">
            {['tracks', 'albums'].map(t => (
              <button key={t} type="button" onClick={() => setManageTab(t)}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition capitalize ${
                  manageTab === t ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
                }`}>{t}</button>
            ))}
          </div>

          {/* ── Albums sub-tab ── */}
          {manageTab === 'albums' ? (
            <div className="space-y-2">
              {albums.length === 0 ? (
                <div className="text-center py-12">
                  <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No albums yet</p>
                </div>
              ) : albums.map(album => (
                <div key={album.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
                  {editingAlbumId !== album.id ? (
                    <div className="flex items-center space-x-3 p-3">
                      {album.cover_artwork_url
                        ? <img src={album.cover_artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-white/20" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{album.title}</p>
                        <p className="text-xs text-white/40 capitalize">{album.release_type || 'album'}</p>
                        <div className="flex gap-1.5 mt-1">
                          {album.is_published
                            ? <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Live</span>
                            : <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">Draft</span>}
                          {album.price > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">${album.price}</span>}
                        </div>
                      </div>
                      <button type="button" onClick={async () => {
                        setEditingAlbumId(album.id);
                        setShowAddTrackToAlbum(false);
                        setEditAlbumCoverFile(null);
                        setEditAlbumForm({
                          title: album.title, description: album.description || '',
                          release_type: album.release_type || 'album',
                          release_date: album.release_date || '', price: album.price || 0,
                          is_published: album.is_published ?? true,
                          cover_artwork_url: album.cover_artwork_url || '',
                        });
                        setEditingId(null);
                        await reloadAlbumTracks(album.id);
                      }}
                        className="p-2 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition">
                        <Edit className="w-4 h-4 text-white/40" />
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {/* Album edit header */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Editing: {album.title}</p>
                        <button type="button" onClick={() => { setEditingAlbumId(null); setAlbumTracks([]); setEditingId(null); setShowAddTrackToAlbum(false); }}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                          <X className="w-4 h-4 text-white/30" />
                        </button>
                      </div>

                      {/* Cover artwork */}
                      <div>
                        <FieldLabel>Cover Artwork</FieldLabel>
                        <div className="flex items-center space-x-3">
                          {(editAlbumCoverFile ? URL.createObjectURL(editAlbumCoverFile) : editAlbumForm.cover_artwork_url) ? (
                            <img
                              src={editAlbumCoverFile ? URL.createObjectURL(editAlbumCoverFile) : editAlbumForm.cover_artwork_url}
                              alt=""
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-white/[0.08]"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0 border border-white/[0.08]">
                              <Music className="w-6 h-6 text-white/20" />
                            </div>
                          )}
                          <label className="flex-1 cursor-pointer">
                            <div className="px-3 py-2 bg-white/[0.06] rounded-lg text-xs text-white/40 hover:bg-white/[0.1] transition text-center">
                              {editAlbumCoverFile ? editAlbumCoverFile.name : 'Change cover…'}
                            </div>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={(e) => setEditAlbumCoverFile(e.target.files[0] || null)} />
                          </label>
                          {editAlbumCoverFile && (
                            <button type="button" onClick={() => setEditAlbumCoverFile(null)}
                              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition flex-shrink-0">
                              <X className="w-3.5 h-3.5 text-white/30" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Album fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Title</FieldLabel>
                          <FInput type="text" value={editAlbumForm.title}
                            onChange={(e) => setEditAlbumForm({ ...editAlbumForm, title: e.target.value })} />
                        </div>
                        <div>
                          <FieldLabel>Release Type</FieldLabel>
                          <FSelect value={editAlbumForm.release_type}
                            onChange={(e) => setEditAlbumForm({ ...editAlbumForm, release_type: e.target.value })}>
                            {['single','ep','album','mixtape','live','compilation'].map(t => (
                              <option key={t} value={t} className="capitalize">{t}</option>
                            ))}
                          </FSelect>
                        </div>
                        <div>
                          <FieldLabel>Release Date</FieldLabel>
                          <FInput type="date" value={editAlbumForm.release_date}
                            onChange={(e) => setEditAlbumForm({ ...editAlbumForm, release_date: e.target.value })} />
                        </div>
                        <div>
                          <FieldLabel>Price (USD)</FieldLabel>
                          <FInput type="number" min="0" step="0.01" value={editAlbumForm.price}
                            onChange={(e) => setEditAlbumForm({ ...editAlbumForm, price: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Description</FieldLabel>
                        <textarea rows={2} value={editAlbumForm.description}
                          onChange={(e) => setEditAlbumForm({ ...editAlbumForm, description: e.target.value })}
                          className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                      </div>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={editAlbumForm.is_published}
                          onChange={(e) => setEditAlbumForm({ ...editAlbumForm, is_published: e.target.checked })}
                          className="rounded border-white/20" />
                        <span className="text-xs text-white/50">Published</span>
                      </label>
                      <div className="flex space-x-2 pt-1">
                        <button type="button" onClick={() => saveAlbum(album.id)}
                          className="flex-1 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition">
                          Save Album
                        </button>
                        <button type="button" onClick={() => { setEditingAlbumId(null); setAlbumTracks([]); setEditingId(null); setShowAddTrackToAlbum(false); }}
                          className="px-4 py-2.5 rounded-xl bg-white/[0.06] text-white/50 text-sm hover:bg-white/[0.1] transition">
                          Cancel
                        </button>
                      </div>

                      {/* ── Tracks in this album ───────────────────────────────── */}
                      <div className="border-t border-white/[0.06] pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">
                            Tracks in this album
                          </p>
                          {/* Add track button */}
                          {!showAddTrackToAlbum && (
                            <button
                              type="button"
                              onClick={() => { setShowAddTrackToAlbum(true); setEditingId(null); }}
                              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-xs text-white/60 hover:text-white/80 transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Track</span>
                            </button>
                          )}
                        </div>

                        {/* ── Add Track to Album form ────────────────────────── */}
                        {showAddTrackToAlbum && (
                          <div className="bg-white/[0.02] rounded-xl border border-white/[0.08] p-4 space-y-1">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide flex items-center space-x-1.5">
                                <Upload className="w-3.5 h-3.5" />
                                <span>New Track — Track {albumTracks.length + 1}</span>
                              </p>
                              <button type="button" onClick={() => setShowAddTrackToAlbum(false)}
                                className="p-1 rounded hover:bg-white/[0.06] transition">
                                <X className="w-3.5 h-3.5 text-white/30" />
                              </button>
                            </div>
                            <AddTrackToAlbum
                              album={album}
                              existingTrackCount={albumTracks.length}
                              artist={artist}
                              isPremium={isPremium}
                              canAddDownloadSale={canAddDownloadSale}
                              downloadSalesRemaining={downloadSalesRemaining}
                              downloadSalesLimit={downloadSalesLimit}
                              uploadFile={uploadFile}
                              convertAndUploadAudio={convertAndUploadAudio}
                              saveCollaborations={saveCollaborations}
                              converting={converting}
                              convProgress={convProgress}
                              convError={convError}
                              onTrackAdded={async (newTrack) => {
                                setShowAddTrackToAlbum(false);
                                await reloadAlbumTracks(album.id);
                                fetchTracks();
                              }}
                              onCancel={() => setShowAddTrackToAlbum(false)}
                            />
                          </div>
                        )}

                        {/* Existing tracks list */}
                        {albumTracksLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader className="w-5 h-5 animate-spin text-white/20" />
                          </div>
                        ) : albumTracks.length === 0 ? (
                          <p className="text-xs text-white/20 text-center py-4">No tracks in this album yet</p>
                        ) : albumTracks.map(track => (
                          <div key={track.id} className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
                            {editingId !== track.id ? (
                              <div className="flex items-center space-x-3 p-3">
                                {track.cover_artwork_url
                                  ? <img src={track.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                  : <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-4 h-4 text-white/20" /></div>}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="text-[10px] text-white/25">#{track.track_number || '—'}</span>
                                    <p className="text-sm font-medium text-white truncate">{track.title}</p>
                                  </div>
                                  <div className="flex gap-1.5 mt-0.5">
                                    {track.is_published
                                      ? <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Live</span>
                                      : <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">Draft</span>}
                                    {track.genre && <span className="text-[10px] text-white/20">{track.genre}</span>}
                                    <span className="text-[10px] text-white/20">{track.stream_count || 0} streams</span>
                                  </div>
                                </div>
                                <button type="button" onClick={() => { startEdit(track); setShowAddTrackToAlbum(false); }}
                                  className="p-1.5 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition flex-shrink-0">
                                  <Edit className="w-3.5 h-3.5 text-white/40" />
                                </button>
                              </div>
                            ) : (
                              <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold text-white">Editing: {track.title}</p>
                                  <button type="button" onClick={() => setEditingId(null)}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                                    <X className="w-4 h-4 text-white/30" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div>
                                    <FieldLabel>Title</FieldLabel>
                                    <FInput type="text" value={editForm.title}
                                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                                  </div>
                                  <div>
                                    <FieldLabel>Track Number</FieldLabel>
                                    <FInput type="number" min="1" value={editForm.track_number}
                                      onChange={(e) => setEditForm({ ...editForm, track_number: e.target.value })} />
                                  </div>
                                  <div>
                                    <FieldLabel>Genre</FieldLabel>
                                    <FSelect value={editForm.genre}
                                      onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}>
                                      <option value="">None</option>
                                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                    </FSelect>
                                  </div>
                                  <div>
                                    <FieldLabel>Mood</FieldLabel>
                                    <FSelect value={editForm.mood}
                                      onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}>
                                      <option value="">None</option>
                                      {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </FSelect>
                                  </div>
                                  <div>
                                    <FieldLabel>Download Price (USD)</FieldLabel>
                                    <FInput type="number" min="0" step="0.01" value={editForm.download_price}
                                      onChange={(e) => setEditForm({ ...editForm, download_price: e.target.value })} />
                                  </div>
                                </div>

                                <div>
                                  <FieldLabel>Lyrics</FieldLabel>
                                  <textarea rows={3} value={editForm.lyrics}
                                    onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none resize-none" />
                                </div>

                                <div className="flex flex-wrap gap-3">
                                  {[
                                    { key: 'is_published',    label: 'Published' },
                                    { key: 'featured',        label: 'Featured' },
                                    { key: 'is_explicit',     label: 'Explicit' },
                                    { key: 'is_downloadable', label: 'Downloadable' },
                                    { key: 'is_premium',      label: 'Premium' },
                                  ].map(({ key, label }) => (
                                    <label key={key} className="flex items-center space-x-1.5 text-xs text-white/40 cursor-pointer">
                                      <input type="checkbox" checked={editForm[key] || false}
                                        onChange={(e) => setEditForm({ ...editForm, [key]: e.target.checked })}
                                        className="rounded border-white/20" />
                                      <span>{label}</span>
                                    </label>
                                  ))}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <FieldLabel>Cover Artwork</FieldLabel>
                                    <div className="flex items-center gap-3">
                                      {(editCoverFile ? URL.createObjectURL(editCoverFile) : editForm.cover_artwork_url) && (
                                        <img src={editCoverFile ? URL.createObjectURL(editCoverFile) : editForm.cover_artwork_url}
                                          alt="cover" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                                      )}
                                      <label className="cursor-pointer text-xs px-3 py-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] text-white/60 transition">
                                        Replace
                                        <input type="file" accept="image/*" className="hidden"
                                          onChange={(e) => setEditCoverFile(e.target.files[0])} />
                                      </label>
                                    </div>
                                  </div>
                                  <div>
                                    <FieldLabel>Audio File</FieldLabel>
                                    <label className="cursor-pointer text-xs px-3 py-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] text-white/60 transition inline-block">
                                      {editAudioFile ? editAudioFile.name : 'Replace audio…'}
                                      <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg,.aac" className="hidden"
                                        onChange={(e) => setEditAudioFile(e.target.files[0])} />
                                    </label>
                                  </div>
                                </div>

                                <div className="flex space-x-2 pt-1">
                                  <button type="button" onClick={async () => {
                                    await saveEdit(track.id);
                                    await reloadAlbumTracks(album.id);
                                    setEditingId(null);
                                  }} disabled={isWorking}
                                    className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold flex items-center space-x-1.5 disabled:opacity-50 transition">
                                    {isWorking ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    <span>{converting ? `Converting… ${convProgress}%` : 'Save Track'}</span>
                                  </button>
                                  <button type="button" onClick={() => setEditingId(null)}
                                    className="px-4 py-2.5 bg-white/[0.06] text-white/60 rounded-lg text-sm transition hover:bg-white/[0.1]">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

          ) : (
            /* ── Tracks sub-tab ── */
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title or genre…"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] rounded-lg text-sm text-white placeholder-white/30 outline-none" />
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><Loader className="w-6 h-6 animate-spin text-white/30" /></div>
              ) : filteredTracks.length === 0 ? (
                <div className="text-center py-12">
                  <Music className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No tracks found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTracks.map(track => (
                    <div key={track.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
                      {editingId !== track.id ? (
                        <div className="flex items-center space-x-3 p-3">
                          {track.cover_artwork_url
                            ? <img src={track.cover_artwork_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                            : <div className="w-12 h-12 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-5 h-5 text-white/20" /></div>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{track.title}</p>
                            <p className="text-xs text-white/40 truncate">
                              {track.genre || 'No genre'} · {track.albums?.title || 'Single'}
                            </p>
                            <div className="flex items-center flex-wrap gap-1.5 mt-1">
                              {track.is_published
                                ? <span className="text-[10px] px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded">Live</span>
                                : <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">Draft</span>}
                              {track.featured   && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">Featured</span>}
                              {track.is_explicit && <span className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/30 rounded">E</span>}
                              {track.youtube_url && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded flex items-center space-x-0.5"><Youtube className="w-2.5 h-2.5" /><span>Video</span></span>}
                              <span className="text-[10px] text-white/20">{track.stream_count || 0} streams</span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-1 flex-shrink-0">
                            <div className="flex items-center space-x-1">
                              <button type="button" onClick={() => startEdit(track)}
                                className="p-2 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition">
                                <Edit className="w-4 h-4 text-white/40" />
                              </button>
                              <button type="button" onClick={() => deleteTrack(track.id, track.title)}
                                className="p-2 bg-red-500/[0.06] rounded-lg hover:bg-red-500/[0.12] transition">
                                <Trash2 className="w-4 h-4 text-red-400/60" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">Editing: {track.title}</p>
                            <button type="button" onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition">
                              <X className="w-4 h-4 text-white/30" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <FieldLabel>Title</FieldLabel>
                              <FInput type="text" value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                onBlur={(e) => setEditForm(prev => ({ ...prev, title: normaliseTitleCase(e.target.value) }))} />
                            </div>
                            <div>
                              <FieldLabel>Album</FieldLabel>
                              <FSelect value={editForm.album_id}
                                onChange={(e) => setEditForm({ ...editForm, album_id: e.target.value })}>
                                <option value="">No Album (Single)</option>
                                {albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                              </FSelect>
                            </div>
                            <div>
                              <FieldLabel>Genre</FieldLabel>
                              <FSelect value={editForm.genre}
                                onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}>
                                <option value="">None</option>
                                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                              </FSelect>
                            </div>
                            <div>
                              <FieldLabel>Mood</FieldLabel>
                              <FSelect value={editForm.mood}
                                onChange={(e) => setEditForm({ ...editForm, mood: e.target.value })}>
                                <option value="">None</option>
                                {MOODS.map(m => <option key={m} value={m}>{m}</option>)}
                              </FSelect>
                            </div>
                            <div>
                              <FieldLabel>Track Number</FieldLabel>
                              <FInput type="number" min="1" value={editForm.track_number}
                                onChange={(e) => setEditForm({ ...editForm, track_number: e.target.value })} />
                            </div>
                            <div>
                              <FieldLabel>
                                Download Price (USD)
                                {!isPremium && downloadSalesLimit > 0 && (
                                  <span className="ml-2 text-[10px] text-white/30 font-normal">
                                    {downloadSalesRemaining > 0
                                      ? `${downloadSalesRemaining}/${downloadSalesLimit} left`
                                      : 'Limit reached'}
                                  </span>
                                )}
                              </FieldLabel>
                              {canAddDownloadSale || parseFloat(editForm.download_price) > 0 ? (
                                <FInput type="number" min="0" step="0.01" value={editForm.download_price}
                                  onChange={(e) => setEditForm({ ...editForm, download_price: e.target.value })} />
                              ) : (
                                <div className="px-3 py-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06] text-xs text-white/30">
                                  Monthly limit reached — upgrade to Premium for unlimited
                                </div>
                              )}
                            </div>
                            {parseFloat(editForm.download_price) > 0 && (
                              <div className="md:col-span-2 space-y-2">
                                <div className="flex items-center space-x-3">
                                  <Toggle value={editForm.pay_what_you_want}
                                    onChange={() => setEditForm({ ...editForm, pay_what_you_want: !editForm.pay_what_you_want })} />
                                  <span className="text-xs text-white/50">Pay What You Want</span>
                                </div>
                                {editForm.pay_what_you_want && (
                                  <div>
                                    <FieldLabel>Minimum Price</FieldLabel>
                                    <FInput type="number" min="0" step="0.01" value={editForm.minimum_price || '0'}
                                      onChange={(e) => setEditForm({ ...editForm, minimum_price: e.target.value })} />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            <LyricsEditor
                              lyrics={editForm.lyrics}
                              onChange={val => setEditForm({ ...editForm, lyrics: val })}
                              audioFile={editAudioFile}
                              audioUrl={editForm.file_url || null}
                            />
                          </div>

                          <TierGate feature="download_sales" inline>
                            <YoutubeField
                              value={editForm.youtube_url}
                              onChange={(val) => setEditForm({ ...editForm, youtube_url: val })}
                            />
                          </TierGate>

                          <div className="flex flex-wrap gap-3">
                            {[
                              { key: 'is_published',    label: 'Published' },
                              { key: 'featured',        label: 'Featured' },
                              { key: 'is_explicit',     label: 'Explicit' },
                              { key: 'is_downloadable', label: 'Downloadable' },
                              { key: 'is_premium',      label: 'Premium' },
                              { key: 'has_versions',    label: 'Has Versions' },
                              { key: 'is_preorder',     label: 'Pre-order', premiumOnly: true },
                            ].map(({ key, label, premiumOnly, disabled }) => (
                              <label key={key} className={`flex items-center space-x-1.5 text-xs cursor-pointer ${(premiumOnly && !isPremium) || disabled ? 'text-white/20 cursor-not-allowed' : 'text-white/40'}`}>
                                <input type="checkbox" checked={editForm[key] || false}
                                  disabled={(premiumOnly && !isPremium) || disabled}
                                  onChange={(e) => { if ((premiumOnly && !isPremium) || disabled) return; setEditForm({ ...editForm, [key]: e.target.checked }); }}
                                  className="rounded disabled:opacity-30 border-white/20" />
                                <span>{label}</span>
                              </label>
                            ))}
                          </div>

                          {editForm.is_preorder && (
                            <div>
                              <FieldLabel>Release Date</FieldLabel>
                              <FInput type="datetime-local"
                                value={editForm.release_date ? editForm.release_date.substring(0, 16) : ''}
                                onChange={(e) => setEditForm({ ...editForm, release_date: e.target.value })} />
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <FieldLabel>Cover Artwork</FieldLabel>
                              <div className="flex items-center gap-3">
                                {(editCoverFile ? URL.createObjectURL(editCoverFile) : editForm.cover_artwork_url) && (
                                  <img
                                    src={editCoverFile ? URL.createObjectURL(editCoverFile) : editForm.cover_artwork_url}
                                    alt="cover" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                                )}
                                <label className="cursor-pointer text-xs px-3 py-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] text-white/60 transition">
                                  Replace
                                  <input type="file" accept="image/*" className="hidden"
                                    onChange={(e) => setEditCoverFile(e.target.files[0])} />
                                </label>
                              </div>
                            </div>
                            <div>
                              <FieldLabel>Audio File</FieldLabel>
                              <label className="cursor-pointer text-xs px-3 py-1.5 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] text-white/60 transition inline-block">
                                {editAudioFile ? editAudioFile.name : 'Replace audio…'}
                                <input type="file" accept=".wav,.mp3,.flac,.m4a,.ogg,.aac" className="hidden"
                                  onChange={(e) => setEditAudioFile(e.target.files[0])} />
                              </label>
                              {editAudioFile?.name?.toLowerCase().endsWith('.wav') && (
                                <p className="text-xs text-purple-400/70 mt-1 flex items-center space-x-1">
                                  <Zap className="w-3 h-3" /><span>Will convert to MP3 at 320kbps</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div>
                            <FieldLabel>Collaborators</FieldLabel>
                            <CollaboratorSearch collaborators={editCollaborators}
                              setCollaborators={setEditCollaborators} currentArtistId={artist.id} />
                          </div>

                          <div className="flex space-x-2 pt-1">
                            <button type="button" onClick={() => saveEdit(track.id)} disabled={isWorking}
                              className="px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold flex items-center space-x-1.5 disabled:opacity-50 transition">
                              {isWorking ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              <span>{converting ? `Converting… ${convProgress}%` : 'Save Changes'}</span>
                            </button>
                            <button type="button" onClick={() => setEditingId(null)}
                              className="px-4 py-2.5 bg-white/[0.06] text-white/60 rounded-lg text-sm transition hover:bg-white/[0.1]">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}