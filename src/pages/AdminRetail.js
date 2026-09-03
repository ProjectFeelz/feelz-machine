// src/pages/AdminRetail.js
// /admin/retail, review artist pitches into Feelz Retail, build mood
// playlists from the approved catalog, and manage venue accounts. Nothing
// here makes a venue actually able to play anything publicly beyond what
// its own status controls, a venue only gets read access to playlists
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

export default function AdminRetail({ embedded = false }) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('pitches');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [pitches, setPitches] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [venues, setVenues] = useState([]);
  const [catalogTracks, setCatalogTracks] = useState([]);
  const [trendingScores, setTrendingScores] = useState(null);

  const [notifications, setNotifications] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [proposalTracksMap, setProposalTracksMap] = useState({});
  const [expandedProposalId, setExpandedProposalId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [notifReadCounts, setNotifReadCounts] = useState({});

  const [totalActiveVenues, setTotalActiveVenues] = useState(0);

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

  const [priceGuide, setPriceGuide] = useState([]);
  const [newPriceRow, setNewPriceRow] = useState({ venue_type: '', min: '', max: '', notes: '' });

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

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
    const list = data || [];
    if (list.length > 0) {
      const { data: subs } = await supabase.from('retail_subscriptions')
        .select('venue_id, monthly_fee, status, created_at')
        .in('venue_id', list.map(v => v.id))
        .order('created_at', { ascending: false });
      const latestByVenue = {};
      (subs || []).forEach(s => { if (!latestByVenue[s.venue_id]) latestByVenue[s.venue_id] = s; });
      setVenues(list.map(v => ({ ...v, subscription: latestByVenue[v.id] || null })));
    } else {
      setVenues([]);
    }
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

  const loadPriceGuide = useCallback(async () => {
    const { data } = await supabase.from('retail_price_guide').select('*').order('sort_order');
    setPriceGuide(data || []);
  }, []);

  const loadNotifications = async () => {
    const { count: activeCount } = await supabase.from('retail_venues')
      .select('id', { count: 'exact', head: true }).eq('status', 'active');
    setTotalActiveVenues(activeCount || 0);

    const { data } = await supabase.from('retail_notifications')
      .select('*').order('created_at', { ascending: false });
    setNotifications(data || []);

    if ((data || []).length > 0) {
      const { data: reads } = await supabase.from('retail_notification_reads')
        .select('notification_id')
        .in('notification_id', data.map(n => n.id));
      const counts = {};
      (reads || []).forEach(r => { counts[r.notification_id] = (counts[r.notification_id] || 0) + 1; });
      setNotifReadCounts(counts);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadPitches(), loadPlaylists(), loadVenues(), loadCatalog(), loadAds(), loadPayoutPeriods(), loadPriceGuide()]);
      setLoading(false);
    })();
  }, [loadPitches, loadPlaylists, loadVenues, loadCatalog, loadAds, loadPayoutPeriods, loadPriceGuide]);

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
    showToast('Approved, added to retail catalog');
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

  const loadTrendingScores = async () => {
    if (trendingScores) return; // computed once per session
    const [{ data: playRows }, { data: likeRows }] = await Promise.all([
      supabase.from('retail_play_logs').select('track_id').limit(3000),
      supabase.from('retail_venue_likes').select('track_id').limit(3000),
    ]);
    const scores = {};
    (playRows || []).forEach(r => { scores[r.track_id] = (scores[r.track_id] || 0) + 1; });
    (likeRows || []).forEach(r => { scores[r.track_id] = (scores[r.track_id] || 0) + 3; }); // a like counts for more than a single play
    setTrendingScores(scores);
  };

  const togglePlaylistExpand = (playlist) => {
    if (expandedPlaylistId === playlist.id) { setExpandedPlaylistId(null); return; }
    setExpandedPlaylistId(playlist.id);
    if (!playlistTracksMap[playlist.id]) loadPlaylistTracks(playlist.id);
    loadTrendingScores();
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

  const setVenueFee = async (venue) => {
    const current = venue.subscription?.monthly_fee ?? '';
    const input = window.prompt(`Monthly fee for "${venue.business_name}" (ZAR):`, current);
    if (input === null) return;
    const fee = parseFloat(input);
    if (isNaN(fee) || fee < 0) { showToast('Enter a valid amount'); return; }

    if (venue.subscription) {
      const { error } = await supabase.from('retail_subscriptions')
        .update({ monthly_fee: fee })
        .eq('venue_id', venue.id)
        .eq('created_at', venue.subscription.created_at);
      if (error) { showToast('Error: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('retail_subscriptions')
        .insert({ venue_id: venue.id, monthly_fee: fee, status: 'active' });
      if (error) { showToast('Error: ' + error.message); return; }
    }
    showToast('Fee saved');
    loadVenues();
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

  const addPriceRow = async () => {
    if (!newPriceRow.venue_type.trim()) return;
    const { data, error } = await supabase.from('retail_price_guide')
      .insert({
        venue_type: newPriceRow.venue_type.trim(),
        suggested_fee_min: newPriceRow.min ? parseFloat(newPriceRow.min) : null,
        suggested_fee_max: newPriceRow.max ? parseFloat(newPriceRow.max) : null,
        notes: newPriceRow.notes.trim() || null,
        sort_order: priceGuide.length,
      }).select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setPriceGuide(prev => [...prev, data]);
    setNewPriceRow({ venue_type: '', min: '', max: '', notes: '' });
  };

  const removePriceRow = async (id) => {
    await supabase.from('retail_price_guide').delete().eq('id', id);
    setPriceGuide(prev => prev.filter(p => p.id !== id));
  };

  const loadProposals = async () => {
    const { data } = await supabase.from('retail_playlist_proposals')
      .select('*').order('created_at', { ascending: false });
    setProposals(data || []);
  };

  const generateProposals = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_playlist_proposals');
    setGenerating(false);
    if (error) { showToast('Error: ' + error.message); return; }
    showToast(data > 0 ? `${data} new proposal${data === 1 ? '' : 's'} generated` : 'Nothing new to propose right now');
    loadProposals();
  };

  const toggleProposalExpand = async (proposal) => {
    if (expandedProposalId === proposal.id) { setExpandedProposalId(null); return; }
    setExpandedProposalId(proposal.id);
    if (!proposalTracksMap[proposal.id]) {
      const { data } = await supabase.from('tracks')
        .select('id, title, artist:artists(artist_name)')
        .in('id', proposal.track_ids);
      setProposalTracksMap(prev => ({ ...prev, [proposal.id]: data || [] }));
    }
  };

  const approveProposal = async (proposal) => {
    const { error } = await supabase.rpc('approve_playlist_proposal', { p_proposal_id: proposal.id });
    if (error) { showToast('Error: ' + error.message); return; }
    setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: 'approved' } : p));
    showToast('Playlist created and live');
    loadPlaylists();
  };

  const rejectProposal = async (proposal) => {
    await supabase.from('retail_playlist_proposals')
      .update({ status: 'rejected', reviewed_by: null, reviewed_at: new Date().toISOString() })
      .eq('id', proposal.id);
    setProposals(prev => prev.map(p => p.id === proposal.id ? { ...p, status: 'rejected' } : p));
  };

  const rankBy = (rows, keyFn, labelFn) => {
    const counts = {};
    (rows || []).forEach(r => {
      const key = keyFn(r);
      if (!key) return;
      if (!counts[key]) counts[key] = { label: labelFn(r), count: 0 };
      counts[key].count += 1;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const loadAnalytics = async () => {
    if (analytics) return; // already loaded this session
    setAnalyticsLoading(true);
    const [
      { count: totalPlays },
      { count: totalLikes },
      { count: activeVenueCount },
      { count: totalAdPlays },
      { data: playRows },
      { data: likeRows },
      { data: venuePlayRows },
      { data: adPlayRows },
    ] = await Promise.all([
      supabase.from('retail_play_logs').select('id', { count: 'exact', head: true }),
      supabase.from('retail_venue_likes').select('id', { count: 'exact', head: true }),
      supabase.from('retail_venues').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('retail_ad_plays').select('id', { count: 'exact', head: true }),
      supabase.from('retail_play_logs').select('track_id, tracks(title, artist:artists(artist_name))').limit(3000),
      supabase.from('retail_venue_likes').select('track_id, tracks(title, artist:artists(artist_name))').limit(3000),
      supabase.from('retail_play_logs').select('venue_id, retail_venues(business_name)').limit(3000),
      supabase.from('retail_ad_plays').select('ad_id, retail_ads(advertiser_name)').limit(3000),
    ]);

    setAnalytics({
      totalPlays: totalPlays || 0,
      totalLikes: totalLikes || 0,
      activeVenueCount: activeVenueCount || 0,
      totalAdPlays: totalAdPlays || 0,
      topTracks: rankBy(playRows, r => r.track_id, r => `${r.tracks?.title || 'Unknown'}, ${r.tracks?.artist?.artist_name || ''}`),
      topLiked: rankBy(likeRows, r => r.track_id, r => `${r.tracks?.title || 'Unknown'}, ${r.tracks?.artist?.artist_name || ''}`),
      topVenues: rankBy(venuePlayRows, r => r.venue_id, r => r.retail_venues?.business_name || 'Unknown venue'),
      topAds: rankBy(adPlayRows, r => r.ad_id, r => r.retail_ads?.advertiser_name || 'Unknown advertiser'),
    });
    setAnalyticsLoading(false);
  };

  if (!isAdmin) return null;

  const pendingPitches = pitches.filter(p => p.status === 'pending');
  const decidedPitches = pitches.filter(p => p.status !== 'pending');
  const filteredCatalog = trackSearch.trim()
    ? catalogTracks.filter(c => c.track?.title?.toLowerCase().includes(trackSearch.toLowerCase()))
    : catalogTracks;

  return (
    <div className={embedded ? "pb-8" : "min-h-screen bg-black text-white"}>
      {!embedded && (
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-xl border-b border-white/[0.05] px-4 py-4 flex items-center space-x-3">
        <button onClick={() => navigate('/admin')} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition">
          <ArrowLeft className="w-5 h-5 text-white/40" />
        </button>
        <Store className="w-4 h-4 text-purple-400" />
        <h1 className="text-base font-bold text-white">Feelz Retail</h1>
      </div>
      )}

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
          { key: 'pricing',   label: 'Pricing' },
          { key: 'analytics', label: 'Analytics' },
          { key: 'notifications', label: 'Notifications' },
          { key: 'autocompile', label: 'Auto-Compile' },
        ].map(t => <TabButton key={t.key} active={tab === t.key} onClick={() => { setTab(t.key); if (t.key === 'analytics') loadAnalytics(); if (t.key === 'notifications') loadNotifications(); if (t.key === 'autocompile') loadProposals(); }}>{t.label}</TabButton>)}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <div className="px-4 pt-5 pb-24 max-w-4xl mx-auto space-y-6">

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
                      <span className="text-white/60 truncate">{p.track?.title}, {p.artist?.artist_name}</span>
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
                              <span className="text-white/70 truncate">{pt.track?.title}, {pt.track?.artist?.artist_name}</span>
                              <button onClick={() => removeTrackFromPlaylist(pl.id, pt.id)}
                                className="text-white/20 hover:text-red-400 flex-shrink-0 ml-2"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                          {(playlistTracksMap[pl.id] || []).length === 0 && <p className="text-[11px] text-white/25">No tracks in this playlist yet.</p>}
                        </div>
                        {trendingScores && (() => {
                          const inPlaylist = new Set((playlistTracksMap[pl.id] || []).map(pt => pt.track?.id));
                          const suggestions = catalogTracks
                            .filter(c => !inPlaylist.has(c.track_id) && trendingScores[c.track_id])
                            .sort((a, b) => (trendingScores[b.track_id] || 0) - (trendingScores[a.track_id] || 0))
                            .slice(0, 5);
                          if (suggestions.length === 0) return null;
                          return (
                            <div>
                              <p className="text-[10px] font-bold text-purple-300 uppercase tracking-wide mb-1.5">Trending, not yet in this playlist</p>
                              <div className="space-y-1">
                                {suggestions.map(c => (
                                  <button key={c.track_id} onClick={() => addTrackToPlaylist(pl.id, c.track_id)}
                                    className="w-full flex items-center justify-between text-xs bg-purple-500/[0.06] hover:bg-purple-500/[0.12] rounded-lg px-2.5 py-1.5 transition text-left">
                                    <span className="text-white/70 truncate">{c.track?.title}, {c.track?.artist?.artist_name}</span>
                                    <Plus className="w-3.5 h-3.5 text-purple-300 flex-shrink-0 ml-2" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                        <div>
                          <input className={inputCls} placeholder="Search the approved catalog to add…" value={trackSearch}
                            onChange={e => setTrackSearch(e.target.value)} />
                          {trackSearch.trim() && (
                            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                              {filteredCatalog.map(c => (
                                <button key={c.track_id} onClick={() => addTrackToPlaylist(pl.id, c.track_id)}
                                  className="w-full flex items-center justify-between text-xs bg-white/[0.03] hover:bg-white/[0.06] rounded-lg px-2.5 py-1.5 transition text-left">
                                  <span className="text-white/70 truncate">{c.track?.title}, {c.track?.artist?.artist_name}</span>
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
                        <p className="text-xs text-white/30 mt-0.5">
                          {v.subscription?.monthly_fee
                            ? `R${v.subscription.monthly_fee}/mo${v.subscription.status === 'active' ? ' · billing active' : ''}`
                            : 'No fee set'}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                        v.status === 'active' ? 'bg-purple-500/20 text-purple-300' :
                        v.status === 'pending' ? 'bg-white/[0.06] text-white/40' :
                        'bg-red-500/15 text-red-400'
                      }`}>{v.status}</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      <button onClick={() => setVenueFee(v)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/40 hover:bg-white/[0.1] transition">
                        {v.subscription?.monthly_fee ? 'Edit fee' : 'Set fee'}
                      </button>
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
                            <span className="text-white/70 truncate">{p.artist?.artist_name}, {p.play_count} plays ({p.share_pct}%)</span>
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

          {tab === 'pricing' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Add a venue type</p>
                <input className={inputCls} placeholder="Venue type (e.g. Small cafe)" value={newPriceRow.venue_type}
                  onChange={e => setNewPriceRow({ ...newPriceRow, venue_type: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.01" className={inputCls} placeholder="Min (ZAR)" value={newPriceRow.min}
                    onChange={e => setNewPriceRow({ ...newPriceRow, min: e.target.value })} />
                  <input type="number" step="0.01" className={inputCls} placeholder="Max (ZAR)" value={newPriceRow.max}
                    onChange={e => setNewPriceRow({ ...newPriceRow, max: e.target.value })} />
                </div>
                <input className={inputCls} placeholder="Notes (optional)" value={newPriceRow.notes}
                  onChange={e => setNewPriceRow({ ...newPriceRow, notes: e.target.value })} />
                <button onClick={addPriceRow}
                  className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition">Add</button>
              </div>

              <div className="space-y-2">
                {priceGuide.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No price bands yet, add a few venue types to build your reference sheet.</p>
                ) : priceGuide.map(p => (
                  <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{p.venue_type}</p>
                      <p className="text-xs text-purple-300 font-semibold mt-0.5">
                        {p.suggested_fee_min && p.suggested_fee_max
                          ? `R${p.suggested_fee_min} – R${p.suggested_fee_max} / mo`
                          : p.suggested_fee_min ? `From R${p.suggested_fee_min} / mo`
                          : p.suggested_fee_max ? `Up to R${p.suggested_fee_max} / mo`
                          : 'No range set'}
                      </p>
                      {p.notes && <p className="text-xs text-white/40 mt-1">{p.notes}</p>}
                    </div>
                    <button onClick={() => removePriceRow(p.id)} className="text-white/20 hover:text-red-400 flex-shrink-0 ml-2"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-6">
              {analyticsLoading ? (
                <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>
              ) : !analytics ? null : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.03]">
                      <p className="text-2xl font-black text-white">{analytics.totalPlays}</p>
                      <p className="text-xs text-white/40 mt-0.5">Qualifying plays</p>
                    </div>
                    <div className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.03]">
                      <p className="text-2xl font-black text-white">{analytics.totalLikes}</p>
                      <p className="text-xs text-white/40 mt-0.5">Likes</p>
                    </div>
                    <div className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.03]">
                      <p className="text-2xl font-black text-white">{analytics.activeVenueCount}</p>
                      <p className="text-xs text-white/40 mt-0.5">Active venues</p>
                    </div>
                    <div className="rounded-xl p-3 border border-white/[0.06] bg-white/[0.03]">
                      <p className="text-2xl font-black text-white">{analytics.totalAdPlays}</p>
                      <p className="text-xs text-white/40 mt-0.5">Ad plays</p>
                    </div>
                  </div>

                  {[
                    { title: 'Most played', rows: analytics.topTracks },
                    { title: 'Most liked', rows: analytics.topLiked },
                    { title: 'Top venues by plays', rows: analytics.topVenues },
                    { title: 'Top ads by plays', rows: analytics.topAds },
                  ].map(section => (
                    <div key={section.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
                      <p className="text-xs font-bold text-white/50 uppercase tracking-wide">{section.title}</p>
                      {section.rows.length === 0 ? (
                        <p className="text-xs text-white/25 py-2">No data yet.</p>
                      ) : section.rows.map((row, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-white/70 truncate">{row.label}</span>
                          <span className="text-purple-300 font-semibold flex-shrink-0 ml-2">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/[0.06] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Compose has moved</p>
                  <p className="text-xs text-white/40 mt-0.5">Retail notifications now go through the unified Newsletter panel, one place for both audiences.</p>
                </div>
                <button onClick={() => navigate('/newsletter/compose')} className="text-xs font-bold px-3 py-2 rounded-lg bg-purple-500 text-white flex-shrink-0 ml-3">Open</button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Sent</p>
                {notifications.length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">Nothing sent yet.</p>
                ) : notifications.map(n => (
                  <div key={n.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{n.title}</p>
                      <span className="text-[10px] text-white/30 flex-shrink-0 ml-2">
                        {notifReadCounts[n.id] || 0}/{totalActiveVenues} read
                      </span>
                    </div>
                    <p className="text-xs text-white/50 mt-1">{n.body}</p>
                    <p className="text-[10px] text-white/25 mt-1.5">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'autocompile' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Generate proposals</p>
                <p className="text-[11px] text-white/30">
                  Groups the approved catalog by mood and proposes a playlist for any mood with 5+ tracks that doesn't already have one, ranked by plays and likes. Nothing goes live until you approve it below.
                </p>
                <button onClick={generateProposals} disabled={generating}
                  className="w-full py-2.5 rounded-lg bg-purple-500 text-white text-sm font-bold hover:bg-purple-400 transition disabled:opacity-40">
                  {generating ? 'Generating…' : 'Generate proposals'}
                </button>
              </div>

              <div className="space-y-2">
                {proposals.filter(p => p.status === 'pending').length === 0 ? (
                  <p className="text-xs text-white/30 py-4 text-center">No pending proposals.</p>
                ) : proposals.filter(p => p.status === 'pending').map(p => (
                  <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => toggleProposalExpand(p)}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{p.title}</p>
                        <p className="text-xs text-white/40">{p.track_ids.length} tracks</p>
                      </div>
                    </div>
                    {expandedProposalId === p.id && (
                      <div className="border-t border-white/[0.06] p-3 space-y-1.5">
                        {(proposalTracksMap[p.id] || []).map(t => (
                          <p key={t.id} className="text-xs text-white/60 truncate">{t.title}, {t.artist?.artist_name}</p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center space-x-2 px-3 pb-3">
                      <button onClick={() => approveProposal(p)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-400 transition">Approve &amp; publish</button>
                      <button onClick={() => rejectProposal(p)}
                        className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/50 hover:bg-white/[0.1] transition">Reject</button>
                    </div>
                  </div>
                ))}
              </div>

              {proposals.filter(p => p.status !== 'pending').length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Decided</p>
                  {proposals.filter(p => p.status !== 'pending').map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] text-sm">
                      <span className="text-white/60 truncate">{p.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${p.status === 'approved' ? 'bg-purple-500/15 text-purple-300' : 'bg-red-500/15 text-red-400'}`}>{p.status}</span>
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