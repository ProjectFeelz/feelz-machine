/**
 * AdminPeople.js
 * Merges: AdminArtists + AdminDuplicates + AdminBugReports
 * Route: /admin/people
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Loader, Search, Music, Users, Check, AlertCircle,
  Trash2, AlertTriangle, Merge, Bug, CheckCircle, Send,
  MessageSquare, XCircle, ChevronDown, ChevronUp, Mic2,
} from 'lucide-react';

// ── Shared tab shell ──────────────────────────────────────────────────────────
function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
        active ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
      }`}>
      {children}
    </button>
  );
}

// ── LISTENERS TAB ─────────────────────────────────────────────────────────────
function ListenersTab() {
  const [listeners, setListeners] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchQuery, setSearch]  = useState('');
  const [sortBy, setSortBy]       = useState('newest');
  const [grantingId, setGranting] = useState(null);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const fetchListeners = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('listeners').select('*').order('created_at', { ascending: false });
    setListeners(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchListeners(); }, [fetchListeners]);

  const grantTier = async (listenerId, userId, tierSlug, displayName) => {
    setGranting(listenerId);
    try {
      const { data: tier } = await supabase.from('platform_tiers').select('id').eq('slug', tierSlug).single();
      if (!tier && tierSlug !== 'free') { showToast(`Tier "${tierSlug}" not found`, 'error'); setGranting(null); return; }

      await supabase.from('listener_tier_subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('user_id', userId).eq('status', 'active');

      if (tierSlug !== 'free') {
        await supabase.from('listener_tier_subscriptions').insert({
          user_id: userId, tier_id: tier.id, status: 'active', billing_cycle: 'annual',
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      await supabase.from('listeners')
        .update({
          tier: tierSlug,
          tier_started_at: new Date().toISOString(),
          tier_expires_at: tierSlug !== 'free' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null,
        })
        .eq('id', listenerId);

      await supabase.from('notifications').insert({
        user_id: userId, type: 'tier_granted',
        title: tierSlug === 'free' ? 'Plan updated' : 'Fan Pro granted',
        message: tierSlug === 'free' ? 'Your plan has been updated to Free.' : 'An admin granted you Fan Pro access. Enjoy your themes and badge!',
        metadata: { tier_slug: tierSlug },
      }).then(() => {});

      setListeners(prev => prev.map(l => l.id === listenerId ? { ...l, tier: tierSlug } : l));
      showToast(`${displayName || 'Listener'} → ${tierSlug.toUpperCase()} ✓`);
    } catch (err) { showToast(`Failed: ${err.message}`, 'error'); }
    setGranting(null);
  };

  const filtered = listeners
    .filter(l => (l.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'name')   return (a.display_name || '').localeCompare(b.display_name || '');
      return 0;
    });

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-white text-black' : 'bg-red-500/90 text-white'}`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.msg}</span>
        </div>
      )}
      <div className="flex space-x-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input type="text" value={searchQuery} onChange={e => setSearch(e.target.value)} placeholder="Search listeners…"
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/20 focus:outline-none transition" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] rounded-xl text-xs text-white/60 border border-white/[0.06] focus:outline-none">
          <option value="newest">Newest</option>
          <option value="name">A–Z</option>
        </select>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">{filtered.length} listeners</p>
          {filtered.map(l => (
            <div key={l.id} className="bg-white/[0.03] rounded-xl p-3.5 border border-white/[0.06] hover:bg-white/[0.05] transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {l.avatar_url ? <img src={l.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-white/30">{l.display_name?.charAt(0)?.toUpperCase() || '?'}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{l.display_name || 'Unnamed'}</p>
                    <span className="text-[10px] text-white/20">{new Date(l.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.tier === 'pro' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-white/30'}`}>{l.tier || 'free'}</span>
                  {grantingId === l.id ? <Loader className="w-4 h-4 animate-spin text-white/30" /> : (
                    <select value={l.tier || 'free'} onChange={e => grantTier(l.id, l.user_id, e.target.value, l.display_name)}
                      className="text-[10px] bg-white/[0.06] text-white/50 rounded-lg px-2 py-1.5 border border-white/[0.08] focus:outline-none cursor-pointer hover:bg-white/[0.10] transition">
                      <option value="free">Free</option><option value="pro">Fan Pro</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ── ARTISTS TAB ───────────────────────────────────────────────────────────────
function ArtistsTab() {
  const navigate = useNavigate();
  const [artists, setArtists]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchQuery, setSearch]  = useState('');
  const [sortBy, setSortBy]       = useState('newest');
  const [grantingId, setGranting] = useState(null);
  const [toast, setToast]         = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  };

  const fetchArtists = useCallback(async () => {
    setLoading(true);
    const { data: artistData } = await supabase.from('artists').select('*').order('created_at', { ascending: false });
    const { data: trackCounts } = await supabase.from('tracks').select('artist_id');
    const { data: followerCounts } = await supabase.from('follows').select('artist_id');
    const countMap = {}; (trackCounts || []).forEach(t => { countMap[t.artist_id] = (countMap[t.artist_id] || 0) + 1; });
    const followerMap = {}; (followerCounts || []).forEach(f => { followerMap[f.artist_id] = (followerMap[f.artist_id] || 0) + 1; });
    setArtists((artistData || []).map(a => ({ ...a, trackCount: countMap[a.id] || 0, followerCount: followerMap[a.id] || 0 })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchArtists(); }, [fetchArtists]);

  const grantTier = async (artistId, tierSlug, artistName) => {
    setGranting(artistId);
    try {
      const { data: tier } = await supabase.from('platform_tiers').select('id').eq('slug', tierSlug).single();
      if (!tier) { showToast(`Tier "${tierSlug}" not found`, 'error'); setGranting(null); return; }
      await supabase.from('artist_tier_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('artist_id', artistId).eq('status', 'active');
      if (tierSlug !== 'free') {
        await supabase.from('artist_tier_subscriptions').insert({
          artist_id: artistId, tier_id: tier.id, status: 'active',
          paypal_subscription_id: `admin_grant_${Date.now()}`,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
      await supabase.from('artists').update({ tier: tierSlug, current_tier_id: tierSlug !== 'free' ? tier.id : null }).eq('id', artistId);
      await supabase.from('notifications').insert({ artist_id: artistId, type: 'tier_granted', title: `${tierSlug.charAt(0).toUpperCase() + tierSlug.slice(1)} granted`, message: `An admin granted you ${tierSlug} tier access.`, metadata: { tier_slug: tierSlug } }).then(() => {});
      setArtists(prev => prev.map(a => a.id === artistId ? { ...a, tier: tierSlug } : a));
      showToast(`${artistName} → ${tierSlug.toUpperCase()} ✓`);
    } catch (err) { showToast(`Failed: ${err.message}`, 'error'); }
    setGranting(null);
  };

  const filtered = artists
    .filter(a => (a.artist_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'newest')    return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'tracks')    return b.trackCount - a.trackCount;
      if (sortBy === 'followers') return b.followerCount - a.followerCount;
      if (sortBy === 'name')      return (a.artist_name || '').localeCompare(b.artist_name || '');
      return 0;
    });

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-white text-black' : 'bg-red-500/90 text-white'}`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.msg}</span>
        </div>
      )}
      <div className="flex space-x-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input type="text" value={searchQuery} onChange={e => setSearch(e.target.value)} placeholder="Search artists…"
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/20 focus:outline-none transition" />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] rounded-xl text-xs text-white/60 border border-white/[0.06] focus:outline-none">
          <option value="newest">Newest</option>
          <option value="tracks">Most Tracks</option>
          <option value="followers">Most Followers</option>
          <option value="name">A–Z</option>
        </select>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">{filtered.length} artists</p>
          {filtered.map(a => (
            <div key={a.id} className="bg-white/[0.03] rounded-xl p-3.5 border border-white/[0.06] hover:bg-white/[0.05] transition">
              <div className="flex items-center justify-between">
                <button onClick={() => navigate(`/artist/${a.slug || a.id}`)} className="flex items-center space-x-3 min-w-0 flex-1 text-left">
                  <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {a.profile_image_url ? <img src={a.profile_image_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-white/30">{a.artist_name?.charAt(0)?.toUpperCase() || '?'}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-white truncate">{a.artist_name || 'Unnamed'}</p>
                      {a.is_master && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 text-[9px] font-bold rounded flex-shrink-0">MASTER</span>}
                    </div>
                    <div className="flex items-center space-x-3 mt-0.5">
                      <span className="flex items-center space-x-1 text-[10px] text-white/25"><Music className="w-3 h-3" /><span>{a.trackCount}</span></span>
                      <span className="flex items-center space-x-1 text-[10px] text-white/25"><Users className="w-3 h-3" /><span>{a.followerCount}</span></span>
                      <span className="text-[10px] text-white/20">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.tier === 'premium' || a.tier === 'master' ? 'bg-yellow-500/20 text-yellow-400' : a.tier === 'pro' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-white/30'}`}>{a.tier || 'free'}</span>
                  {grantingId === a.id ? <Loader className="w-4 h-4 animate-spin text-white/30" /> : (
                    <select value={a.tier === 'master' ? 'premium' : (a.tier || 'free')} onChange={e => grantTier(a.id, e.target.value, a.artist_name)}
                      className="text-[10px] bg-white/[0.06] text-white/50 rounded-lg px-2 py-1.5 border border-white/[0.08] focus:outline-none cursor-pointer hover:bg-white/[0.10] transition">
                      <option value="free">Free</option><option value="pro">Pro</option><option value="premium">Premium</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DUPLICATES TAB ────────────────────────────────────────────────────────────
function DuplicatesTab() {
  const [artists, setArtists]       = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [deleting, setDeleting]     = useState(null);
  const [moving, setMoving]         = useState(false);
  const [msg, setMsg]               = useState('');
  const [search, setSearch]         = useState('');

  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const fetchArtists = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('artists').select('id, artist_name, slug, profile_image_url, tier, follower_count, created_at, user_id').order('artist_name');
    const all = data || [];
    setArtists(all);
    const normalise = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const groups = {};
    all.forEach(a => { const k = normalise(a.artist_name); if (!groups[k]) groups[k] = []; groups[k].push(a); });
    setDuplicates(Object.values(groups).filter(g => g.length > 1));
    setLoading(false);
  }, []);

  useEffect(() => { fetchArtists(); }, [fetchArtists]);

  const handleMoveAndDelete = async (keepId, deleteId) => {
    if (!window.confirm('Move all tracks to kept profile then delete duplicate? Cannot be undone.')) return;
    setMoving(true);
    try {
      await supabase.from('tracks').update({ artist_id: keepId }).eq('artist_id', deleteId);
      await supabase.from('follows').update({ artist_id: keepId }).eq('artist_id', deleteId);

      // Carry over the duplicate's stream credit before it's gone for good —
      // otherwise total_streams silently loses whatever that artist had earned
      const { data: dupArtist } = await supabase
        .from('artists').select('total_streams').eq('id', deleteId).maybeSingle();
      if (dupArtist?.total_streams) {
        const { data: keepArtist } = await supabase
          .from('artists').select('total_streams').eq('id', keepId).maybeSingle();
        await supabase.from('artists')
          .update({ total_streams: (keepArtist?.total_streams || 0) + dupArtist.total_streams })
          .eq('id', keepId);
      }

      await supabase.from('artists').delete().eq('id', deleteId);
      flash('Tracks moved and duplicate deleted.');
      fetchArtists();
    } catch (e) { flash('Error: ' + e.message); }
    setMoving(false);
  };

  const handleDeleteOnly = async (id) => {
    if (!window.confirm('Delete this artist and ALL their tracks? Cannot be undone.')) return;
    setDeleting(id);
    try {
      await supabase.from('tracks').delete().eq('artist_id', id);
      await supabase.from('follows').delete().eq('artist_id', id);
      await supabase.from('notifications').delete().eq('artist_id', id);
      await supabase.from('artists').delete().eq('id', id);
      flash('Artist deleted.');
      fetchArtists();
    } catch (e) { flash('Error: ' + e.message); }
    setDeleting(null);
  };

  const filtered = search.trim() ? artists.filter(a => a.artist_name.toLowerCase().includes(search.toLowerCase())) : artists;

  if (loading) return <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>;

  return (
    <div>
      {msg && <div className="mb-4 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white/70">{msg}</div>}
      {duplicates.length > 0 ? (
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <p className="text-sm font-semibold text-yellow-400">{duplicates.length} duplicate group{duplicates.length > 1 ? 's' : ''} found</p>
          </div>
          {duplicates.map((group, gi) => (
            <div key={gi} className="mb-4 bg-yellow-500/[0.04] border border-yellow-500/20 rounded-2xl p-4">
              <p className="text-xs text-yellow-400/60 uppercase tracking-wider mb-3 font-semibold">"{group[0].artist_name}"</p>
              {group.map(a => (
                <div key={a.id} className="flex items-center space-x-3 py-2.5 border-b border-white/[0.04] last:border-0">
                  {a.profile_image_url ? <img src={a.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full bg-white/[0.06] flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{a.artist_name}</p>
                    <p className="text-[10px] text-white/30">{a.slug} · {a.tier} · {a.follower_count || 0} followers</p>
                  </div>
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {group.filter(o => o.id !== a.id).map(other => (
                      <button key={other.id} onClick={() => handleMoveAndDelete(a.id, other.id)} disabled={moving}
                        className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 transition disabled:opacity-40">
                        <Merge className="w-3 h-3" /><span>Keep</span>
                      </button>
                    ))}
                    <button onClick={() => handleDeleteOnly(a.id)} disabled={deleting === a.id}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-40">
                      {deleting === a.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-2xl bg-green-500/[0.05] border border-green-500/20 text-sm text-green-400/70 text-center">No duplicate artist names found ✓</div>
      )}
      <p className="text-[10px] text-white/25 uppercase tracking-wider font-semibold mb-3">All Artists ({artists.length})</p>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search artists…"
          className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/20 focus:outline-none transition" />
      </div>
      <div className="space-y-1">
        {filtered.map(a => (
          <div key={a.id} className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            {a.profile_image_url ? <img src={a.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 rounded-full bg-white/[0.06] flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{a.artist_name}</p>
              <p className="text-[10px] text-white/30">{a.tier} · {a.follower_count || 0} followers</p>
            </div>
            <button onClick={() => handleDeleteOnly(a.id)} disabled={deleting === a.id}
              className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 flex-shrink-0">
              {deleting === a.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BUG REPORTS TAB ───────────────────────────────────────────────────────────
const STATUS_STYLES = {
  open:        { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20',    label: 'OPEN'        },
  in_progress: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', label: 'IN PROGRESS' },
  resolved:    { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20',  label: 'RESOLVED'    },
};

function BugReportsTab() {
  const { artist } = useAuth();
  const [reports, setReports]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('open');
  const [expanded, setExpanded]     = useState(null);
  const [replyText, setReplyText]   = useState({});
  const [replying, setReplying]     = useState(null);
  const [updating, setUpdating]     = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data: reports } = await supabase.from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    // Enrich with artist data — join via user_id since bug_reports has no artist FK
    const userIds = [...new Set((reports || []).map(r => r.user_id).filter(Boolean))];
    let artistMap = {};
    if (userIds.length > 0) {
      const { data: artists } = await supabase.from('artists')
        .select('user_id, artist_name, profile_image_url, slug')
        .in('user_id', userIds);
      (artists || []).forEach(a => { artistMap[a.user_id] = a; });
    }

    setReports((reports || []).map(r => ({
      ...r,
      artists: artistMap[r.user_id] || null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleUpdateStatus = async (id, status) => {
    setUpdating(id);
    await supabase.from('bug_reports').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    setUpdating(null);
  };

  const handleReply = async (report) => {
    const text = (replyText[report.id] || '').trim();
    if (!text || !artist) return;
    setReplying(report.id);
    await supabase.from('notifications').insert({
      artist_id: report.artist_id, type: 'admin_message',
      title: 'Response to your bug report',
      message: text,
      metadata: { bug_report_id: report.id, admin_reply: true },
    });
    await supabase.from('bug_reports').update({ status: 'in_progress', admin_reply: text, updated_at: new Date().toISOString() }).eq('id', report.id);
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'in_progress', admin_reply: text } : r));
    setReplyText(prev => ({ ...prev, [report.id]: '' }));
    setReplying(null);
  };

  const filtered = reports.filter(r => {
    const matchSearch = !search.trim() || (r.title || '').toLowerCase().includes(search.toLowerCase()) || (r.description || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex justify-center py-16"><Loader className="w-5 h-5 animate-spin text-white/20" /></div>;

  return (
    <div>
      <div className="flex space-x-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/20 focus:outline-none transition" />
        </div>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2.5 bg-white/[0.04] rounded-xl text-xs text-white/60 border border-white/[0.06] focus:outline-none">
          <option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="all">All</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-16"><Bug className="w-10 h-10 mx-auto text-white/10 mb-3" /><p className="text-white/30 text-sm">No reports</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const s = STATUS_STYLES[r.status] || STATUS_STYLES.open;
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className={`rounded-xl border ${s.border} ${s.bg} overflow-hidden`}>
                <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full flex items-start space-x-3 p-3.5 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>
                      <p className="text-sm font-semibold text-white truncate">{r.title || 'Untitled'}</p>
                    </div>
                    <p className="text-xs text-white/40">{r.artists?.artist_name} · {new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />}
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/[0.06]">
                    <p className="text-sm text-white/70 leading-relaxed pt-3">{r.description}</p>
                    {r.admin_reply && (
                      <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Admin reply</p>
                        <p className="text-xs text-white/60">{r.admin_reply}</p>
                      </div>
                    )}
                    <div className="flex space-x-2">
                      {['open','in_progress','resolved'].map(s => (
                        <button key={s} onClick={() => handleUpdateStatus(r.id, s)} disabled={updating === r.id || r.status === s}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition disabled:opacity-40 ${r.status === s ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40 hover:bg-white/[0.1]'}`}>
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                    <div className="flex space-x-2">
                      <input value={replyText[r.id] || ''} onChange={e => setReplyText(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Reply to artist…"
                        className="flex-1 px-3 py-2 bg-white/[0.04] rounded-xl text-xs text-white placeholder:text-white/20 border border-white/[0.08] focus:border-white/20 focus:outline-none" />
                      <button onClick={() => handleReply(r)} disabled={replying === r.id || !replyText[r.id]?.trim()}
                        className="px-3 py-2 rounded-xl bg-purple-500/20 text-purple-400 text-xs font-semibold hover:bg-purple-500/30 transition disabled:opacity-40">
                        {replying === r.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminPeople() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('artists');

  useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl px-4 pt-14 md:pt-4 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center space-x-3 mb-3">
          <button onClick={() => navigate('/admin')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <Users className="w-5 h-5 text-green-400" />
          <h1 className="text-base font-bold text-white">People</h1>
        </div>
        <div className="flex space-x-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-x-auto">
          <Tab active={tab === 'artists'}    onClick={() => setTab('artists')}>Artists</Tab>
          <Tab active={tab === 'listeners'}  onClick={() => setTab('listeners')}>Listeners</Tab>
          <Tab active={tab === 'duplicates'} onClick={() => setTab('duplicates')}>Duplicates</Tab>
          <Tab active={tab === 'bugs'}       onClick={() => setTab('bugs')}>Bug Reports</Tab>
        </div>
      </div>
      <div className="px-4 pt-5">
        {tab === 'artists'    && <ArtistsTab />}
        {tab === 'listeners'  && <ListenersTab />}
        {tab === 'duplicates' && <DuplicatesTab />}
        {tab === 'bugs'       && <BugReportsTab />}
      </div>
    </div>
  );
}