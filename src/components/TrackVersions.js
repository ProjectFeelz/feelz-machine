import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ChevronDown, ChevronUp, Play, Download, Loader } from 'lucide-react';

const VERSION_TYPE_LABELS = {
  remix:        'Remix',
  instrumental: 'Instrumental',
  acoustic:     'Acoustic',
  extended:     'Extended',
  radio_edit:   'Radio Edit',
  live:         'Live',
  demo:         'Demo',
  sped_up:      'Sped Up',
  slowed:       'Slowed',
  nightcore:    'Nightcore',
  clean:        'Clean',
};

// Extract the storage path from a Supabase public or signed URL
// e.g. ".../storage/v1/object/public/feelz-samples/versions/foo.wav"
//   -> "versions/foo.wav"
function extractStoragePath(url) {
  if (!url) return null;
  // Match path after the bucket name "feelz-samples/"
  const match = url.match(/feelz-samples\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

// Get a short-lived signed URL for a private bucket file
async function getSignedUrl(rawUrl) {
  const path = extractStoragePath(rawUrl);
  if (!path) return rawUrl; // fallback
  const { data, error } = await supabase.storage
    .from('feelz-samples')
    .createSignedUrl(path, 300); // 5 minutes — enough for streaming + download
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// Compact toggle + list shown inline under a track row
export default function TrackVersions({ track, onPlayVersion }) {
  const [versions, setVersions] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Only fetch when user opens the panel
  useEffect(() => {
    if (!expanded || loaded) return;
    supabase
      .from('track_versions')
      .select('id, version_name, version_type, file_url, duration')
      .eq('track_id', track.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setVersions(data || []);
        setLoaded(true);
      });
  }, [expanded, loaded, track.id]);

  if (!track.has_versions) return null;

  const handlePlay = async (e, ver) => {
    e.stopPropagation();
    if (playingId === ver.id) return;
    setPlayingId(ver.id);
    const signedUrl = await getSignedUrl(ver.file_url);
    setPlayingId(null);
    if (!signedUrl) return;
    onPlayVersion && onPlayVersion({
      ...track,
      title: ver.version_name,
      file_url: signedUrl,
    });
  };

  const handleDownload = async (e, ver) => {
    e.stopPropagation();
    e.preventDefault();
    if (downloadingId === ver.id) return;
    setDownloadingId(ver.id);
    const signedUrl = await getSignedUrl(ver.file_url);
    setDownloadingId(null);
    if (!signedUrl) return;
    // Blob download with proper filename
    try {
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = ver.version_name + '.mp3';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(objUrl); a.remove(); }, 1000);
    } catch {}
  };

  return (
    <div className="mt-1">
      {/* Toggle button */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        className="flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] transition hover:bg-white/[0.06]"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>{expanded ? 'Hide versions' : 'Versions'}</span>
      </button>

      {/* Version rows */}
      {expanded && (
        <div className="ml-2 mt-1 space-y-1 border-l border-white/[0.06] pl-3">
          {versions.length === 0 && loaded && (
            <p className="text-[11px] text-white/25 py-1">No versions available.</p>
          )}
          {versions.map((ver) => (
            <div
              key={ver.id}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.04] transition group"
            >
              {/* Play button + name */}
              <button
                className="flex items-center space-x-2 flex-1 min-w-0 text-left"
                onClick={(e) => handlePlay(e, ver)}
                disabled={playingId === ver.id}
              >
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.06] group-hover:bg-white/[0.12] flex-shrink-0 transition">
                  {playingId === ver.id
                    ? <Loader className="w-2.5 h-2.5 text-white/40 animate-spin" />
                    : <Play className="w-2.5 h-2.5 text-white/60 fill-white/60" />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-white/70 truncate">{ver.version_name}</p>
                  {ver.version_type && (
                    <p className="text-[10px] text-white/30">
                      {VERSION_TYPE_LABELS[ver.version_type] || ver.version_type}
                    </p>
                  )}
                </div>
              </button>

              {/* Download version — only if parent track is downloadable and free */}
              {track.is_downloadable && !(track.download_price > 0) && (
                <button
                  onClick={(e) => handleDownload(e, ver)}
                  disabled={downloadingId === ver.id}
                  className="ml-2 flex-shrink-0 p-1.5 rounded-lg hover:bg-white/[0.08] transition opacity-0 group-hover:opacity-100 disabled:opacity-30"
                  title="Download this version"
                >
                  {downloadingId === ver.id
                    ? <Loader className="w-3 h-3 text-white/40 animate-spin" />
                    : <Download className="w-3 h-3 text-white/40" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
