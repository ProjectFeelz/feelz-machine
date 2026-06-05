import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { notifyCollabAccepted, notifyCollabDeclined } from './notificationTriggers';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, Check, X, Loader, Music, Clock, Inbox, Send, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';

const ROLE_LABELS = {
  featured: 'Featured Artist', producer: 'Producer', songwriter: 'Songwriter',
  vocalist: 'Vocalist', remix: 'Remix', engineer: 'Engineer',
  beatmaker: 'Beatmaker', co_producer: 'Co-Producer', composer: 'Composer',
};

const STATUS_PILL = {
  pending:  { label: 'Pending',  bg: 'rgba(251,191,36,.1)',   border: 'rgba(251,191,36,.25)',  color: '#fbbf24' },
  accepted: { label: 'Accepted', bg: 'rgba(52,211,153,.1)',   border: 'rgba(52,211,153,.25)',  color: '#34d399' },
  declined: { label: 'Declined', bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.3)' },
};

export default function CollabRequests() {
  const { artist } = useAuth();
  const [requests, setRequests]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [responding, setResponding] = useState(null);
  const [filter, setFilter]       = useState('all'); // all | received | sent

  const fetchRequests = useCallback(async () => {
    if (!artist) return;
    setLoading(true);
    try {
      const [{ data: incoming }, { data: outgoing }] = await Promise.all([
        supabase.from('collab_requests').select(`
          *, collaboration:collaborations(role, split_percent, album_id, albums(id, title, cover_artwork_url)),
          from_artist:artists!collab_requests_from_artist_id_fkey(id, artist_name, profile_image_url),
          track:tracks!collab_requests_track_id_fkey(id, title, cover_artwork_url)
        `).eq('to_artist_id', artist.id).order('created_at', { ascending: false }),
        supabase.from('collab_requests').select(`
          *, collaboration:collaborations(role, split_percent, album_id, albums(id, title, cover_artwork_url)),
          to_artist:artists!collab_requests_to_artist_id_fkey(id, artist_name, profile_image_url),
          track:tracks!collab_requests_track_id_fkey(id, title, cover_artwork_url)
        `).eq('from_artist_id', artist.id).order('created_at', { ascending: false }),
      ]);

      const data = [
        ...(incoming || []).map(r => ({ ...r, direction: 'received' })),
        ...(outgoing  || []).map(r => ({ ...r, direction: 'sent', from_artist: r.to_artist })),
      ];

      setRequests(data);

      // Mark incoming unread as read
      const unread = (incoming || []).filter(r => !r.read).map(r => r.id);
      if (unread.length > 0) {
        await supabase.from('collab_requests').update({ read: true }).in('id', unread);
      }
    } catch (err) {
      console.error('Fetch collab requests error:', err);
    }
    setLoading(false);
  }, [artist]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleRespond = async (request, action) => {
    setResponding(request.id);
    try {
      const newStatus = action === 'accept' ? 'accepted' : 'declined';

      // Update collab_requests first
      const { error: reqErr } = await supabase
        .from('collab_requests')
        .update({ status: newStatus, responded_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('to_artist_id', artist.id);
      if (reqErr) throw new Error('Request update failed: ' + reqErr.message);

      // Update collaborations if collaboration_id exists, otherwise create row
      if (request.collaboration_id) {
        const collabUpdate = { status: newStatus };
        if (action === 'accept') collabUpdate.accepted_at = new Date().toISOString();
        const { error: collabErr } = await supabase
          .from('collaborations')
          .update(collabUpdate)
          .eq('id', request.collaboration_id);
        if (collabErr) console.warn('Collab update error (non-fatal):', collabErr.message);
      } else if (action === 'accept' && request.track_id && request.from_artist_id) {
        // CollabRadar request — no collaborations row exists, create one
        const { data: newCollab } = await supabase.from('collaborations').insert({
          track_id:      request.track_id,
          artist_id:     request.from_artist_id,
          role:          request.role || 'featured',
          split_percent: 0,
          status:        'accepted',
          accepted_at:   new Date().toISOString(),
          invited_by:    artist.id,
        }).select('id').maybeSingle();
        if (newCollab?.id) {
          await supabase.from('collab_requests')
            .update({ collaboration_id: newCollab.id })
            .eq('id', request.id);
        }
      }

      // Notify — non-fatal
      try {
        if (action === 'accept') {
          await notifyCollabAccepted({ fromArtist: artist, toArtistId: request.from_artist_id, trackTitle: request.track?.title, trackId: request.track_id });
        } else {
          await notifyCollabDeclined({ fromArtist: artist, toArtistId: request.from_artist_id, trackTitle: request.track?.title, trackId: request.track_id });
        }
      } catch (notifyErr) { console.warn('Notify error (non-fatal):', notifyErr.message); }

      fetchRequests();
    } catch (err) {
      console.error('Respond error:', err);
      alert('Could not respond: ' + err.message);
    }
    setResponding(null);
  };

  const filtered = requests.filter(r => filter === 'all' || r.direction === filter);
  const pendingReceived = requests.filter(r => r.direction === 'received' && r.status === 'pending').length;
  const pendingSent     = requests.filter(r => r.direction === 'sent'     && r.status === 'pending').length;

  if (!artist) return null;

  const TABS = [
    { key: 'all',      label: 'All',      badge: null },
    { key: 'received', label: 'Received', badge: pendingReceived, icon: ArrowDownLeft },
    { key: 'sent',     label: 'Sent',     badge: pendingSent,     icon: ArrowUpRight  },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Inbox className="w-5 h-5 text-white/40" />
          <h3 className="text-base font-semibold text-white">Collaborations</h3>
          {pendingReceived > 0 && (
            <span className="px-2 py-0.5 bg-white text-black text-[10px] font-bold rounded-full">
              {pendingReceived}
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {TABS.map(({ key, label, badge, icon: Icon }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition"
            style={filter === key
              ? { background: 'rgba(255,255,255,0.08)', color: '#fff' }
              : { color: 'rgba(255,255,255,0.3)' }}>
            {Icon && <Icon className="w-3 h-3" />}
            {label}
            {badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black"
                style={{ background: 'rgba(251,191,36,.2)', color: '#fbbf24' }}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader className="w-5 h-5 animate-spin text-white/30" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-white/30 text-sm">
            {filter === 'sent' ? 'No sent requests yet' : filter === 'received' ? 'No received requests yet' : 'No collab requests yet'}
          </p>
          <p className="text-white/20 text-xs mt-1">
            {filter === 'sent' ? 'Tag collaborators when uploading a track.' : 'When someone tags you on a track, it\'ll show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => {
            const pill = STATUS_PILL[req.status] || STATUS_PILL.pending;
            const isSent = req.direction === 'sent';
            return (
              <div key={req.id}
                className="rounded-xl p-4 border transition"
                style={{ background: 'rgba(255,255,255,0.03)', borderColor: req.status === 'pending' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)' }}>
                <div className="flex items-start space-x-3">
                  {/* Avatar */}
                  {req.from_artist?.profile_image_url ? (
                    <img src={req.from_artist.profile_image_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-white/30">
                        {req.from_artist?.artist_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Name + status pill */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-white">
                        <span className="font-semibold">{req.from_artist?.artist_name || 'Unknown'}</span>
                        <span className="text-white/40"> {isSent ? 'invited as' : 'invited you as'} </span>
                        <span className="font-medium text-white/70">
                          {ROLE_LABELS[req.collaboration?.role] || 'Collaborator'}
                        </span>
                      </p>
                      {/* Direction badge */}
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2"
                        style={{ background: isSent ? 'rgba(167,139,250,.1)' : 'rgba(96,165,250,.1)', color: isSent ? '#a78bfa' : '#60a5fa' }}>
                        {isSent ? '↑ SENT' : '↓ RECEIVED'}
                      </span>
                    </div>

                    {/* Track */}
                    <div className="flex items-center space-x-2 mt-1.5 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {req.track?.cover_artwork_url ? (
                        <img src={req.track.cover_artwork_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <Music className="w-3.5 h-3.5 text-white/20" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">
                          {req.track?.title || req.collaboration?.albums?.title || (req.collaboration?.album_id ? 'Album Collab' : 'Untitled')}
                        </p>
                        <p className="text-[10px] text-white/30">{req.collaboration?.split_percent || 0}% royalty split</p>
                      </div>
                    </div>

                    {/* Message */}
                    {req.message && (
                      <p className="text-xs text-white/40 mt-2 italic">"{req.message}"</p>
                    )}

                    {/* Status / Actions */}
                    <div className="mt-3 flex items-center justify-between">
                      {/* Status pill always visible */}
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                        style={{ background: pill.bg, border: `1px solid ${pill.border}`, color: pill.color }}>
                        {pill.label}
                        {req.responded_at && ` · ${new Date(req.responded_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}`}
                      </span>

                      {/* Accept/Decline only for pending received */}
                      {req.status === 'pending' && !isSent && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleRespond(req, 'accept')} disabled={responding === req.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50"
                            style={{ background: 'rgba(52,211,153,.15)', border: '1px solid rgba(52,211,153,.3)', color: '#34d399' }}>
                            {responding === req.id ? <Loader className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Accept
                          </button>
                          <button onClick={() => handleRespond(req, 'decline')} disabled={responding === req.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition disabled:opacity-50"
                            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', color: 'rgba(255,255,255,.4)' }}>
                            <X className="w-3 h-3" />
                            Decline
                          </button>
                        </div>
                      )}

                      {/* Awaiting response label for pending sent */}
                      {req.status === 'pending' && isSent && (
                        <span className="text-[10px] text-white/25 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Awaiting response
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Standalone badge for nav
export function CollabBadge() {
  const { artist } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!artist) return;
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('collab_requests').select('*', { count: 'exact', head: true })
        .eq('to_artist_id', artist.id).eq('status', 'pending');
      setCount(c || 0);
    };
    fetchCount();
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