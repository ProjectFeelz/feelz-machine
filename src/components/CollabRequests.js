import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { notifyCollabAccepted, notifyCollabDeclined } from './notificationTriggers';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, Check, X, Loader, Music, Clock, Inbox, Bell
} from 'lucide-react';

const ROLE_LABELS = {
  featured: 'Featured Artist',
  producer: 'Producer',
  songwriter: 'Songwriter',
  vocalist: 'Vocalist',
  remix: 'Remix',
  engineer: 'Engineer',
};

export default function CollabRequests() {
  const { artist } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(null); // request id being acted on

  const fetchRequests = useCallback(async () => {
    if (!artist) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collab_requests')
        .select(`
          *,
          collaboration:collaborations(role, split_percent),
          from_artist:artists!collab_requests_from_artist_id_fkey(id, artist_name, avatar_url),
          track:tracks!collab_requests_track_id_fkey(id, title, cover_artwork_url)
        `)
        .eq('to_artist_id', artist.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);

      // Mark unread as read
      const unread = (data || []).filter(r => !r.read).map(r => r.id);
      if (unread.length > 0) {
        await supabase
          .from('collab_requests')
          .update({ read: true })
          .in('id', unread);
      }
    } catch (err) {
      console.error('Fetch collab requests error:', err);
    }
    setLoading(false);
  }, [artist]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleRespond = async (request, action) => {
    setResponding(request.id);
    try {
      const newStatus = action === 'accept' ? 'accepted' : 'declined';

      // Update collaboration status
      const collabUpdate = { status: newStatus };
      if (action === 'accept') collabUpdate.accepted_at = new Date().toISOString();

      const { error: collabErr } = await supabase
        .from('collaborations')
        .update(collabUpdate)
        .eq('id', request.collaboration_id);
      if (collabErr) throw collabErr;

      // Update request status
      const { error: reqErr } = await supabase
        .from('collab_requests')
        .update({ status: newStatus, responded_at: new Date().toISOString() })
        .eq('id', request.id);
      if (reqErr) throw reqErr;

      // Send notification
      if (action === 'accept') {
        await notifyCollabAccepted({ fromArtist: artist, toArtistId: request.from_artist_id, trackTitle: request.track?.title, trackId: request.track_id });
      } else {
        await notifyCollabDeclined({ fromArtist: artist, toArtistId: request.from_artist_id, trackTitle: request.track?.title, trackId: request.track_id });
      }

      // Refresh list
      fetchRequests();
      
    } catch (err) {
      console.error('Respond error:', err);
    }
    setResponding(null);
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (!artist) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Inbox className="w-5 h-5 text-white/40" />
          <h3 className="text-base font-semibold text-white">Collab Requests</h3>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-bold rounded-full">
              {pendingCount}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-5 h-5 animate-spin text-white/30" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">No collab requests yet</p>
          <p className="text-white/20 text-xs mt-1">When someone tags you on a track, it'll show up here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className={`bg-white/[0.03] rounded-xl p-4 border transition ${
                req.status === 'pending' ? 'border-white/[0.1]' : 'border-white/[0.04]'
              }`}
            >
              <div className="flex items-start space-x-3">
                {/* From Artist Avatar */}
                {req.from_artist?.avatar_url ? (
                  <img src={req.from_artist.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white/30">
                      {req.from_artist?.artist_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {/* Request Info */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-white">
                        <span className="font-semibold">{req.from_artist?.artist_name || 'Unknown'}</span>
                        <span className="text-white/40"> invited you as </span>
                        <span className="font-medium text-white/70">
                          {ROLE_LABELS[req.collaboration?.role] || 'Collaborator'}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Track Info */}
                  <div className="flex items-center space-x-2 mt-2 p-2 bg-white/[0.03] rounded-lg">
                    {req.track?.cover_artwork_url ? (
                      <img src={req.track.cover_artwork_url} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-white/[0.06] flex items-center justify-center">
                        <Music className="w-3.5 h-3.5 text-white/20" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">{req.track?.title || 'Untitled'}</p>
                      <p className="text-[10px] text-white/30">
                        {req.collaboration?.split_percent || 0}% royalty split
                      </p>
                    </div>
                  </div>

                  {/* Message */}
                  {req.message && (
                    <p className="text-xs text-white/40 mt-2 italic">"{req.message}"</p>
                  )}

                  {/* Actions or Status */}
                  <div className="mt-3">
                    {req.status === 'pending' ? (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleRespond(req, 'accept')}
                          disabled={responding === req.id}
                          className="flex items-center space-x-1.5 px-4 py-2 bg-white text-black rounded-lg text-xs font-semibold hover:bg-white/90 disabled:opacity-50 transition"
                        >
                          {responding === req.id ? (
                            <Loader className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          <span>Accept</span>
                        </button>
                        <button
                          onClick={() => handleRespond(req, 'decline')}
                          disabled={responding === req.id}
                          className="flex items-center space-x-1.5 px-4 py-2 bg-white/[0.06] text-white/50 rounded-lg text-xs font-medium hover:bg-white/[0.1] disabled:opacity-50 transition"
                        >
                          <X className="w-3 h-3" />
                          <span>Decline</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-xs">
                        {req.status === 'accepted' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-green-400 font-medium">Accepted</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5 text-white/30" />
                            <span className="text-white/30">Declined</span>
                          </>
                        )}
                        {req.responded_at && (
                          <span className="text-white/20 ml-1">
                            · {new Date(req.responded_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Standalone badge for nav — shows pending count
export function CollabBadge() {
  const { artist } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!artist) return;
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('collab_requests')
        .select('*', { count: 'exact', head: true })
        .eq('to_artist_id', artist.id)
        .eq('status', 'pending');
      setCount(c || 0);
    };
    fetchCount();
    // Poll every 30s
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [artist]);

  if (count === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center">
      {count > 9 ? '9+' : count}
    </span>
  );
}
