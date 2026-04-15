import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { downloadTrack } from '../utils/downloadTrack';
import { ChevronDown, ChevronUp, Play, Download, Loader, Lock } from 'lucide-react';

const VERSION_TYPE_LABELS = {
    remix: 'Remix',
    instrumental: 'Instrumental',
    acoustic: 'Acoustic',
    extended: 'Extended',
    radio_edit: 'Radio Edit',
    live: 'Live',
    demo: 'Demo',
    sped_up: 'Sped Up',
    slowed: 'Slowed',
    nightcore: 'Nightcore',
    clean: 'Clean',
};

// Extract the storage path from a Supabase public or signed URL
function extractStoragePath(url) {
    if (!url) return null;
    const match = url.match(/feelz-samples\/(.+?)(?:\?|$)/);
    return match ? match[1] : null;
}

// Get a short-lived signed URL for playing (streaming only — no download gate)
async function getSignedUrlForPlay(rawUrl) {
    const path = extractStoragePath(rawUrl);
    if (!path) return rawUrl;
    const { data, error } = await supabase.storage
      .from('feelz-samples')
      .createSignedUrl(path, 300); // 5 min for playback
  if (error || !data?.signedUrl) return null;
    return data.signedUrl;
}

// Determine effective price: own price > 0, or album price passed from parent
function getEffectivePrice(track, albumPrice) {
    if (track.download_price > 0) return track.download_price;
    if (albumPrice > 0) return albumPrice;
    return 0;
}

// TrackVersions
// Props:
//   track          — the parent track object
//   albumPrice     — the album's price (pass from parent so we don't lose it)
//   onPlayVersion  — callback when user plays a version
//   onPurchaseRequired — callback when purchase is needed
export default function TrackVersions({ track, albumPrice = 0, onPlayVersion, onPurchaseRequired }) {
    const { user } = useAuth();
    const [versions, setVersions] = useState([]);
    const [expanded, setExpanded] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [hasPurchased, setHasPurchased] = useState(false);
    const [checkingPurchase, setCheckingPurchase] = useState(false);
    const [playingId, setPlayingId] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [downloadError, setDownloadError] = useState(null);

  const effectivePrice = getEffectivePrice(track, albumPrice);
    const isPaid = effectivePrice > 0;

  // When panel opens, fetch versions AND check purchase status if track is paid
  useEffect(() => {
        if (!expanded) return;
        if (!loaded) {
                supabase
                  .from('track_versions')
                  .select('id, version_name, version_type, file_url, duration')
                  .eq('track_id', track.id)
                  .order('created_at', { ascending: true })
                  .then(({ data }) => {
                              setVersions(data || []);
                              setLoaded(true);
                  });
        }
        if (isPaid && user && !hasPurchased) {
                setCheckingPurchase(true);
                supabase
                  .from('downloads')
                  .select('id')
                  .eq('track_id', track.id)
                  .eq('user_id', user.id)
                  .maybeSingle()
                  .then(({ data }) => {
                              setHasPurchased(!!data);
                              setCheckingPurchase(false);
                  });
        }
  }, [expanded, loaded, isPaid, user, track.id]);

  if (!track.has_versions) return null;

  // Can the user access version files?
  // - Free track: always yes
  // - Paid track: only if logged in AND has a download record
  const canAccess = !isPaid || (user && hasPurchased);

  const handlePlay = async (e, ver) => {
        e.stopPropagation();
        if (!canAccess) {
                onPurchaseRequired && onPurchaseRequired(track);
                return;
        }
        if (playingId === ver.id) return;
        setPlayingId(ver.id);
        const signedUrl = await getSignedUrlForPlay(ver.file_url);
        setPlayingId(null);
        if (!signedUrl) return;
        onPlayVersion && onPlayVersion({
                ...track,
                title: ver.version_name,
                file_url: signedUrl,
        });
  };

  // Version download goes through the same secure backend as main tracks.
  // The Netlify function verifies purchase before issuing a signed URL.
  // We pass the version's track_id (the parent track) — versions inherit parent's purchase.
  const handleDownload = async (e, ver) => {
        e.stopPropagation();
        e.preventDefault();
        setDownloadError(null);

        if (!user) {
                onPurchaseRequired && onPurchaseRequired(track);
                return;
        }
        if (!canAccess) {
                onPurchaseRequired && onPurchaseRequired(track);
                return;
        }
        if (downloadingId === ver.id) return;

        setDownloadingId(ver.id);
        try {
                const { data: { session } } = await supabase.auth.getSession();
                const authToken = session?.access_token;
                if (!authToken) throw new Error('Not authenticated');
                // Use the parent track's ID — the backend checks purchase on the parent track
          await downloadTrack(track.id, ver.version_name, authToken);
        } catch (err) {
                if (err.message === 'purchase_required') {
                          onPurchaseRequired && onPurchaseRequired(track);
                } else {
                          setDownloadError('Download failed. Please try again.');
                }
        } finally {
                setDownloadingId(null);
        }
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
{isPaid && <Lock className="w-2.5 h-2.5 ml-0.5 opacity-50" />}
</button>

 {/* Version rows */}
 {expanded && (
           <div className="ml-2 mt-1 space-y-1 border-l border-white/[0.06] pl-3">
 {/* Locked state — paid track, not purchased */}
  {isPaid && !canAccess && !checkingPurchase && (
                <div className="flex items-center space-x-2 py-2 px-1">
                  <Lock className="w-3 h-3 text-white/25 flex-shrink-0" />
                  <p className="text-[11px] text-white/30">
                    Purchase the track to access versions
    </p>
                 <button
                   onClick={(e) => { e.stopPropagation(); onPurchaseRequired && onPurchaseRequired(track); }}
                   className="text-[11px] px-2 py-0.5 rounded-md font-medium transition hover:opacity-80"
                   style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
                >
                 Buy ${effectivePrice.toFixed(2)}
  </button>
    </div>
            )}

 {checkingPurchase && (
               <div className="flex items-center space-x-2 py-2 px-1">
                 <Loader className="w-3 h-3 text-white/25 animate-spin" />
                 <p className="text-[11px] text-white/25">Checking access...</p>
   </div>
            )}

 {/* No login prompt */}
 {isPaid && !user && (
               <div className="flex items-center space-x-2 py-2 px-1">
                 <Lock className="w-3 h-3 text-white/25 flex-shrink-0" />
                 <p className="text-[11px] text-white/30">Log in to access versions</p>
   </div>
            )}

 {versions.length === 0 && loaded && canAccess && (
               <p className="text-[11px] text-white/25 py-1">No versions available.</p>
            )}

 {/* Show version rows only if accessible */}
 {canAccess && versions.map((ver) => (
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

{/* Download — only if track is downloadable, user is logged in, and has access */}
{track.is_downloadable && canAccess && user && (
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

{/* Per-version download error */}
{downloadError && (
              <p className="text-[10px] text-red-400 px-1 pb-1">{downloadError}</p>
           )}
</div>
      )}
</div>
  );
}
