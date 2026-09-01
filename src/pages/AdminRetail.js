// src/pages/AdminRetail.js
// /admin/retail — review artist pitches into Feelz Retail, build mood
// playlists from the approved catalog, and manage venue accounts. Nothing
// here makes a venue actually able to play anything publicly beyond what
// its own status controls — a venue only gets read access to playlists
// once you set its status to 'active' (see the RLS policies in the
// foundation migration).

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Store, ArrowLeft, Loader, Plus, X, Music, Megaphone, DollarSign } from 'lucide-react';

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
        active ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
      }`}>
      {children}
    </button>
  );
}

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function AdminRetail() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('pitches');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [pitches, setPitches] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [venues, setVenues] = useState([]);
  const [catalogTracks, setCatalogTracks] = useState([]);

  const [newPlaylist, setNewPlaylist] = useState({ title: '', mood: '', description: '' });
  const [expandedPlaylistId, setExpandedPlaylistId] = useState(null);
  const [playlistTracksMap, setPlaylistTracksMap] = useState({});
  const [trackSearch, setTrackSearch] = useState('');

  const [newVenue, setNewVenue] = useState({ business_name: '', contact_name: '', contact_email: '', contact_phone: '' });

  const [ads, setAds] = useState([]);
  const [newAd, setNewAd] = useState({ advertiser_name: '', audio_url: '', venue_id: '' });

  const [payoutPeriods, setPayoutPeriods] = useState([]);
  const [expandedPeriodId, setExpandedPeriodId] = useState(null);
  const [periodPayoutsMap, setPeriodPayoutsMap] = useState({});
  const [newPeriod, setNewPeriod] = useState({ start: '', end: '' });
  const [newAdRevenue, setNewAdRevenue] = useState({ start: '', end: '', amount: '', note: '' });
  const [calculating, setCalculating] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const loadPitches = useCallback(async () => {
    const { data } = await supabase.from('retail_pitches')
      .select('id, pitch_note, status, created_at, track:tracks(id, title, cover_artwork_url, is_explicit), artist:artists(artist_name, slug)')
      .order('created_at', { ascending: false });
    setPitches(data || []);
  }, []);

  const loadPlaylists = useCallback(async () => {
    const { data } = await supabase.from('retail_playlists').select('*').order('created_at', { ascending: false });
    setPlaylists(data || []);
  }, []);

  const loadVenues = useCallback(async () => {
    const { data } = await supabase.from('retail_venues').select('*').order('created_at', { ascending: false });
    setVenues(data || []);
  }, []);

  const loadCatalog = useCallback(async () => {
    const { data } = await supabase.from('retail_catalog')
      .select('track_id, track:tracks(id, title, cover_artwork_url, artist:artists(artist_name))')
      .eq('is_active', true);
    setCatalogTracks(data || []);
  }, []);

  const loadAds = useCallback(async () => {
    const { data } = await supabase.from('retail_ads')
      .select('*, venue:retail_venues(business_name)')
      .order('created_at', { ascending: false });
    setAds(data || []);
  }, []);

  const loadPayoutPeriods = useCallback(async () => {
    const { data } = await supabase.from('retail_payout_periods')
      .select('*').order('period_start', { ascending: false });
    setPayoutPeriods(data || []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadPitches(), loadPlaylists(), loadVenues(), loadCatalog(), loadAds(), loadPayoutPeriods()]);
      setLoading(false);
    })();
  }, [loadPitches, loadPlaylists, loadVenues, loadCatalog, loadAds, loadPayoutPeriods]);

  const approvePitch = async (pitch) => {
    const { error: pErr } = await supabase.from('retail_pitches')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', pitch.id);
    if (pErr) { showToast('Error: ' + pErr.message); return; }
    const { error: cErr } = await supabase.from('retail_catalog')
      .insert({ track_id: pitch.track.id, pitch_id: pitch.id });
    if (cErr) { showToast('Error: ' + cErr.message); return; }
    setPitches(prev => prev.map(p => p.id === pitch.id ? { ...p, status: 'approved' } : p));
    loadCatalog();
    showToast('Approved — added to retail catalog');
  };

  const rejectPitch = async (pitch) => {
    const reason = window.prompt('Reason for rejecting (optional):', '');
    const { error } = await supabase.from('retail_pitches')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), rejection_reason: reason || null })
      .eq('id', pitch.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setPitches(prev => prev.map(p => p.id === pitch.id ? { ...p, status: 'rejected' } : p));
    showToast('Rejected');
  };

  const createPlaylist = async () => {
    if (!newPlaylist.title.trim()) return;
    const { data, error } = await supabase.from('retail_playlists')
      .insert({ title: newPlaylist.title.trim(), mood: newPlaylist.mood.trim() || null, description: newPlaylist.description.trim() || null })
      .select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setPlaylists(prev => [data, ...prev]);
    setNewPlaylist({ title: '', mood: '', description: '' });
    showToast('Playlist created');
  };

  const togglePlaylistActive = async (playlist) => {
    await supabase.from('retail_playlists').update({ is_active: !playlist.is_active }).eq('id', playlist.id);
    setPlaylists(prev => prev.map(p => p.id === playlist.id ? { ...p, is_active: !p.is_active } : p));
  };

  const loadPlaylistTracks = async (playlistId) => {
    const { data } = await supabase.from('retail_playlist_tracks')
      .select('id, position, track:tracks(id, title, artist:artists(artist_name))')
      .eq('playlist_id', playlistId)
      .order('position');
    setPlaylistTracksMap(prev => ({ ...prev, [playlistId]: data || [] }));
  };

  const togglePlaylistExpand = (playlist) => {
    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }
    setExpandedPlaylistId(playlist.id);
    if (!playlistTracksMap[playlist.id]) loadPlaylistTracks(playlist.id);
  };

  const addTrackToPlaylist = async (playlistId, trackId) => {
    const { error } = await supabase.from('retail_playlist_tracks').insert({ playlist_id: playlistId, track_id: trackId });
    if (error) { showToast('Error: ' + error.message); return; }
    loadPlaylistTracks(playlistId);
  };

  const removeTrackFromPlaylist = async (playlistId, playlistTrackId) => {
    await supabase.from('retail_playlist_tracks').delete().eq('id', playlistTrackId);
    loadPlaylistTracks(playlistId);
  };

  const createVenue = async () => {
    if (!newVenue.business_name.trim()) return;
    const { data, error } = await supabase.from('retail_venues')
      .insert({
        business_name: newVenue.business_name.trim(),
        contact_name: newVenue.contact_name.trim() || null,
        contact_email: newVenue.contact_email.trim() || null,
        contact_phone: newVenue.contact_phone.trim() || null,
      }).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setVenues(prev => [data, ...prev]);
    setNewVenue({ business_name: '', contact_name: '', contact_email: '', contact_phone: '' });
    showToast('Venue added');
  };

  const setVenueStatus = async (venue, status) => {
    await supabase.from('retail_venues').update({ status }).eq('id', venue.id);
    setVenues(prev => prev.map(v => v.id === venue.id ? { ...v, status } : v));
  };

  const linkVenueUser = async (venue) => {
    const email = window.prompt(`Email of the account that should log in as "${venue.business_name}":`, '');
    if (!email) return;
    const { data: foundUserId, error: lookupError } = await supabase.rpc('admin_find_user_by_email', { p_email: email.trim() });
    if (lookupError || !foundUserId) { showToast('No account found with that email'); return; }
    const { error } = await supabase.from('retail_venues').update({ user_id: foundUserId }).eq('id', venue.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setVenues(prev => prev.map(v => v.id === venue.id ? { ...v, user_id: foundUserId } : v));
    showToast('Login linked');
  };

  const toggleVenueAds = async (venue) => {
    const { error } = await supabase.from('retail_venues').update({ ads_enabled: !venue.ads_enabled }).eq('id', venue.id);
    if (error) { showToast('Error: ' + error.message); return; }
    setVenues(prev => prev.map(v => v.id === venue.id ? { ...v, ads_enabled: !v.ads_enabled } : v));
  };

  const createAd = async () => {
    if (!newAd.advertiser_name.trim() || !newAd.audio_url.trim()) return;
    const { data, error } = await supabase.from('retail_ads')
      .insert({
        advertiser_name: newAd.advertiser_name.trim(),
        audio_url: newAd.audio_url.trim(),
        venue_id: newAd.venue_id || null,
      })
      .select('*, venue:retail_venues(business_name)').single();
    if (error) { showToast('Error: ' + error.message); return; }
    setAds(prev => [data, ...prev]);
    setNewAd({ advertiser_name: '', audio_url: '', venue_id: '' });
    showToast('Ad added');
  };

  const toggleAdActive = async (ad) => {
    await supabase.from('retail_ads').update({ is_active: !ad.is_active }).eq('id', ad.id);
    setAds(prev => prev.map(a => a.id === ad.id ? { ...a, is_active: !a.is_active } : a));
  };

  const removeAd = async (id) => {
    await supabase.from('retail_ads').delete().eq('id', id);
    setAds(prev => prev.filter(a => a.id !== id));
  };

  const recordAdRevenue = async () => {
    if (!newAdRevenue.start || !newAdRevenue.end || !newAdRevenue.amount) return;
    const { error } = await supabase.from('retail_ad_revenue').insert({
      period_start: newAdRevenue.start,
      period_end: newAdRevenue.end,
      amount: parseFloat(newAdRevenue.amount) || 0,
      note: newAdRevenue.note.trim() || null,
    });
    if (error) { showToast('Error: ' + error.message); return; }
    setNewAdRevenue({ start: '', end: '', amount: '', note: '' });
    showToast('Ad revenue recorded');
  };

  const calculatePayout = async () => {
    if (!newPeriod.start || !newPeriod.end) return;
    setCalculating(true);
    const { data, error } = await supabase.rpc('calculate_retail_payout', {
      p_period_start: newPeriod.start,
      p_period_end: newPeriod.end,
    });
    setCalculating(false);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast('Payout calculated');
    setNewPeriod({ start: '', end: '' });
    loadPayoutPeriods();
    if (data) { setExpandedPeriodId(data); loadPeriodPayouts(data); }
  };

  const loadPeriodPayouts = async (periodId) => {
    const { data } = await supabase.from('retail_artist_payouts')
      .select('id, play_count, share_pct, amount, artist:artists(artist_name, slug)')
      .eq('period_id', periodId)
      .order('amount', { ascending: false });
    setPeriodPayoutsMap(prev => ({ ...prev, [periodId]: data || [] }));
  };

  const togglePeriodExpand = (period) => {
    if (expandedPeriodId === period.id) { setExpandedPeriodId(null); return; }
    setExpandedPeriodId(period.id);
    if (!periodPayoutsMap[period.id]) loadPeriodPayouts(period.id);
  };

  if (!isAdmin) return null;

  const pendingPitches = pitches.filter(p => p.status === 'pending');
  const decidedPitches = pitches.filter(p => p.status !== 'pending');
  const filteredCatalog = trackSearch.trim()
    ? catalogTracks.filter(c => c.track?.title?.toLowerCase().includes(trackSearch.toLowerCase()))
    : catalogTracks;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate('/admin')} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <Store className="w-4 h-4 text-purple-400" />
        <h1 className="text-base font-bold text-white">Feelz Retail</h1>
      </div>

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-white text-black text-xs font-semibold rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex space-x-1 px-4 py-3 overflow-x-auto border-b border-white/[0.04]">
        {[
          { key: 'pitches',   label: `Pitches${pendingPitches.length ? ` (${pendingPitches.length})` : ''}` },
          { key: 'playlists', label: 'Playlists' },
          { key: 'venues',    label: 'Venues' },
          { key: 'ads',       label: 'Ads' },
          { key: 'payouts',   label: 'Payouts' },
        ].map(t => <TabButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</TabButton>)}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <div className="px-4 pt-5 pb-24 max-w-2xl mx-auto space-y-6">

          {tab === 'pitches' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Pending ({pendingPitches.length})</p>
                {pendingPitches.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No pitches waiting on you.</p>
                ) : pendingPitches.map(p => (
                  <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                    <div className="flex items-center space-x-3">
                      {p.track?.cover_artwork_url
                        ? <img src={p.track.cover_artwork_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Music className="w-4 h-4 text-white/20" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {p.track?.title}
                          {p.track?.is_explicit && <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-white/10 text-white/40 rounded">E</span>}
                        </p>
                        <p className="text-xs text-white/40 truncate">{p.artist?.artist_name}</p>
                      </div>
                    </div>
                    {p.pitch_note && <p className="text-xs text-white/50 italic">"{p.pitch_note}"</p>}
                    <div className="flex items-center space-x-2">
                      <button onClick={() => approvePitch(p)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-400 transition">Approve</button>
                      <button onClick={() => rejectPitch(p)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.1] transition">Reject</button>
                    </div>
                  </div>
                ))}
              </div>

              {decidedPitches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Decided ({decidedPitches.length})</p>
                  {decidedPitches.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] text-sm">
                      <span className="text-white/60 truncate">{p.track?.title} — {p.artist?.artist_name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${p.status === 'approved' ? 'bg-purple-500/15 text-purple-300' : 'bg-red-500/15 text-red-400'}`}>{p.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'playlists' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">New playlist</p>
                <input className={inputCls} placeholder="Title (e.g. Coffee Mornings)" value={newPlaylist.title}
                  onChange={e => setNewPlaylist({ ...newPlaylist, title: e.target.value })} />
                <input className={inputCls} placeholder="Mood / situation (e.g. calm, upbeat)" value={newPlaylist.mood}
                  onChange={e => setNewPlaylist({ ...newPlaylist, mood: e.target.value })} />
                <input className={inputCls} placeholder="Description (optional)" value={newPlaylist.description}
                  onChange={e => setNewPlaylist({ ...newPlaylist, description: e.target.value })} />
                <button onClick={createPlaylist}
                  className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition">Create playlist</button>
              </div>

              <div className="space-y-2">
                {playlists.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No playlists yet.</p>
                ) : playlists.map(pl => (
                  <div key={pl.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => togglePlaylistExpand(pl)}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{pl.title}</p>
                        <p className="text-xs text-white/40">{pl.mood || 'No mood set'}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); togglePlaylistActive(pl); }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${pl.is_active ? 'bg-purple-500/20 text-purple-300' : 'bg-white/[0.06] text-white/30'}`}>
                        {pl.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                    {expandedPlaylistId === pl.id && (
                      <div className="border-t border-white/[0.06] p-3 space-y-3">
                        <div className="space-y-1.5">
                          {(playlistTracksMap[pl.id] || []).map(pt => (
                            <div key={pt.id} className="flex items-center justify-between text-xs bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                              <span className="text-white/70 truncate">{pt.track?.title} — {pt.track?.artist?.artist_name}</span>
                              <button onClick={() => removeTrackFromPlaylist(pl.id, pt.id)}
                                className="text-white/20 hover:text-red-400 flex-shrink-0 ml-2"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                          {(playlistTracksMap[pl.id] || []).length === 0 && <p className="text-[11px] text-white/25">No tracks in this playlist yet.</p>}
                        </div>
                        <div>
                          <input className={inputCls} placeholder="Search the approved catalog to add…" value={trackSearch}
                            onChange={e => setTrackSearch(e.target.value)} />
                          {trackSearch.trim() && (
                            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                              {filteredCatalog.map(c => (
                                <button key={c.track_id} onClick={() => addTrackToPlaylist(pl.id, c.track_id)}
                                  className="w-full flex items-center justify-between text-xs bg-white/[0.03] hover:bg-white/[0.06] rounded-lg px-2.5 py-1.5 transition text-left">
                                  <span className="text-white/70 truncate">{c.track?.title} — {c.track?.artist?.artist_name}</span>
                                  <Plus className="w-3.5 h-3.5 text-purple-300 flex-shrink-0 ml-2" />
                                </button>
                              ))}
                              {filteredCatalog.length === 0 && <p className="text-[11px] text-white/25 px-1">No matches in the approved catalog.</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'venues' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">New venue</p>
                <input className={inputCls} placeholder="Business name" value={newVenue.business_name}
                  onChange={e => setNewVenue({ ...newVenue, business_name: e.target.value })} />
                <input className={inputCls} placeholder="Contact name" value={newVenue.contact_name}
                  onChange={e => setNewVenue({ ...newVenue, contact_name: e.target.value })} />
                <input className={inputCls} placeholder="Contact email" value={newVenue.contact_email}
                  onChange={e => setNewVenue({ ...newVenue, contact_email: e.target.value })} />
                <input className={inputCls} placeholder="Contact phone" value={newVenue.contact_phone}
                  onChange={e => setNewVenue({ ...newVenue, contact_phone: e.target.value })} />
                <button onClick={createVenue}
                  className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition">Add venue</button>
              </div>

              <div className="space-y-2">
                {venues.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No venues yet.</p>
                ) : venues.map(v => (
                  <div key={v.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{v.business_name}</p>
                        <p className="text-xs text-white/40 truncate">{v.contact_email || 'No contact email'}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                        v.status === 'active' ? 'bg-purple-500/20 text-purple-300' :
                        v.status === 'pending' ? 'bg-white/[0.06] text-white/40' :
                        'bg-red-500/15 text-red-400'
                      }`}>{v.status}</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      {v.status !== 'active' && (
                        <button onClick={() => setVenueStatus(v, 'active')}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition">Activate</button>
                      )}
                      {v.status === 'active' && (
                        <button onClick={() => setVenueStatus(v, 'suspended')}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/40 hover:bg-white/[0.1] transition">Suspend</button>
                      )}
                      <button onClick={() => linkVenueUser(v)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/40 hover:bg-white/[0.1] transition">
                        {v.user_id ? 'Re-link login' : 'Link login'}
                      </button>
                      <button onClick={() => toggleVenueAds(v)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${v.ads_enabled ? 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]' : 'bg-purple-500/10 text-purple-300 hover:bg-purple-500/20'}`}>
                        {v.ads_enabled ? 'Ads on' : 'Ad-free'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'ads' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">New ad</p>
                <input className={inputCls} placeholder="Advertiser name" value={newAd.advertiser_name}
                  onChange={e => setNewAd({ ...newAd, advertiser_name: e.target.value })} />
                <input className={inputCls} placeholder="Audio file URL" value={newAd.audio_url}
                  onChange={e => setNewAd({ ...newAd, audio_url: e.target.value })} />
                <select className={inputCls} value={newAd.venue_id}
                  onChange={e => setNewAd({ ...newAd, venue_id: e.target.value })}>
                  <option value="">Platform-wide (fallback for venues with no ads of their own)</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.business_name} only</option>)}
                </select>
                <button onClick={createAd}
                  className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition">Add ad</button>
              </div>

              <div className="space-y-2">
                {ads.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No ads yet.</p>
                ) : ads.map(ad => (
                  <div key={ad.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between">
                    <div className="min-w-0 flex items-center space-x-2">
                      <Megaphone className="w-4 h-4 text-purple-300 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{ad.advertiser_name}</p>
                        <p className="text-xs text-white/40 truncate">{ad.venue?.business_name || 'Platform-wide'}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button onClick={() => toggleAdActive(ad)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full ${ad.is_active ? 'bg-purple-500/20 text-purple-300' : 'bg-white/[0.06] text-white/30'}`}>
                        {ad.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button onClick={() => removeAd(ad.id)} className="text-white/20 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'payouts' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Record ad revenue for a period</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className={inputCls} value={newAdRevenue.start}
                    onChange={e => setNewAdRevenue({ ...newAdRevenue, start: e.target.value })} />
                  <input type="date" className={inputCls} value={newAdRevenue.end}
                    onChange={e => setNewAdRevenue({ ...newAdRevenue, end: e.target.value })} />
                </div>
                <input type="number" step="0.01" className={inputCls} placeholder="Amount (ZAR)" value={newAdRevenue.amount}
                  onChange={e => setNewAdRevenue({ ...newAdRevenue, amount: e.target.value })} />
                <input className={inputCls} placeholder="Note (optional)" value={newAdRevenue.note}
                  onChange={e => setNewAdRevenue({ ...newAdRevenue, note: e.target.value })} />
                <button onClick={recordAdRevenue}
                  className="w-full py-2.5 rounded-lg bg-white/[0.08] text-white text-sm font-bold hover:bg-white/[0.12] transition">Record revenue</button>
              </div>

              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Calculate a payout</p>
                <p className="text-[11px] text-white/30">Pools 50% of active subscription fees with 30% of any ad revenue recorded for this exact date range, split across artists by their share of qualifying plays (30+ seconds).</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className={inputCls} value={newPeriod.start}
                    onChange={e => setNewPeriod({ ...newPeriod, start: e.target.value })} />
                  <input type="date" className={inputCls} value={newPeriod.end}
                    onChange={e => setNewPeriod({ ...newPeriod, end: e.target.value })} />
                </div>
                <button onClick={calculatePayout} disabled={calculating}
                  className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition disabled:opacity-40">
                  {calculating ? 'Calculating…' : 'Calculate payout'}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Past periods</p>
                {payoutPeriods.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No payouts calculated yet.</p>
                ) : payoutPeriods.map(period => (
                  <div key={period.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => togglePeriodExpand(period)}>
                      <div className="flex items-center space-x-2 min-w-0">
                        <DollarSign className="w-4 h-4 text-purple-300 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{period.period_start} to {period.period_end}</p>
                          <p className="text-xs text-white/40">Pool: R{period.artist_pool} · {period.total_qualifying_plays} plays</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40 flex-shrink-0">{period.status}</span>
                    </div>
                    {expandedPeriodId === period.id && (
                      <div className="border-t border-white/[0.06] p-3 space-y-1.5">
                        {(periodPayoutsMap[period.id] || []).map(p => (
                          <div key={p.id} className="flex items-center justify-between text-xs bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                            <span className="text-white/70 truncate">{p.artist?.artist_name} — {p.play_count} plays ({p.share_pct}%)</span>
                            <span className="text-purple-300 font-semibold flex-shrink-0 ml-2">R{p.amount}</span>
                          </div>
                        ))}
                        {(periodPayoutsMap[period.id] || []).length === 0 && <p className="text-[11px] text-white/25">No plays in this period.</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}