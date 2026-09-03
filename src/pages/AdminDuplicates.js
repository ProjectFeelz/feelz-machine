import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, Trash2, Loader, AlertTriangle, Users, Search, Merge } from 'lucide-react';

export default function AdminDuplicates() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [artists, setArtists]         = useState([]);
  const [duplicates, setDuplicates]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [deleting, setDeleting]       = useState(null);
  const [moving, setMoving]           = useState(false);
  const [msg, setMsg]                 = useState('');
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState({}); // artistId → 'keep' | 'delete'

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchArtists();
  }, [isAdmin]);

  const fetchArtists = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('artists')
      .select('id, artist_name, slug, profile_image_url, tier, follower_count, created_at, user_id')
      .order('artist_name');
    const all = data || [];
    setArtists(all);

    // Group by normalised name (lowercase, no spaces/punctuation)
    const normalise = n => n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const groups = {};
    all.forEach(a => {
      const key = normalise(a.artist_name);
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    // Only groups with more than one artist
    const dups = Object.values(groups).filter(g => g.length > 1);
    setDuplicates(dups);
    setLoading(false);
  }, []);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const handleMoveAndDelete = async (keepId, deleteId) => {
    if (!window.confirm('Move all tracks from the duplicate to the kept profile, then delete the duplicate? This cannot be undone.')) return;
    setMoving(true);
    try {
      // Move tracks
      const { error: moveErr } = await supabase
        .from('tracks')
        .update({ artist_id: keepId })
        .eq('artist_id', deleteId);
      if (moveErr) throw moveErr;

      // Move follows
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

      // Delete duplicate artist
      const { error: delErr } = await supabase.from('artists').delete().eq('id', deleteId);
      if (delErr) throw delErr;

      flash('Tracks moved and duplicate deleted.');
      fetchArtists();
    } catch (e) {
      flash('Error: ' + e.message);
    }
    setMoving(false);
  };

  const handleDeleteOnly = async (artistId) => {
    if (!window.confirm('Delete this artist and ALL their tracks? This cannot be undone.')) return;
    setDeleting(artistId);
    try {
      await supabase.from('tracks').delete().eq('artist_id', artistId);
      await supabase.from('follows').delete().eq('artist_id', artistId);
      await supabase.from('notifications').delete().eq('artist_id', artistId);
      const { error } = await supabase.from('artists').delete().eq('id', artistId);
      if (error) throw error;
      flash('Artist and all their data deleted.');
      fetchArtists();
    } catch (e) {
      flash('Error: ' + e.message);
    }
    setDeleting(null);
  };

  const filtered = search.trim()
    ? artists.filter(a => a.artist_name.toLowerCase().includes(search.toLowerCase()))
    : artists;

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader className="w-5 h-5 animate-spin text-white/30" />
    </div>
  );

  return (
    <div className="min-h-screen pb-32 px-4 md:px-0 pt-4">

      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/admin')} className="p-2 -ml-2 hover:bg-white/[0.05] rounded-lg transition">
          <ChevronLeft className="w-5 h-5 text-white/40" />
        </button>
        <Users className="w-5 h-5 text-purple-400" />
        <h1 className="text-xl font-bold text-white">Duplicate Artists</h1>
      </div>

      {msg && (
        <div className="mb-4 p-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white/70">
          {msg}
        </div>
      )}

      {/* Duplicates section */}
      {duplicates.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center space-x-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <p className="text-sm font-semibold text-yellow-400">{duplicates.length} duplicate group{duplicates.length > 1 ? 's' : ''} found</p>
          </div>

          {duplicates.map((group, gi) => (
            <div key={gi} className="mb-4 bg-yellow-500/[0.04] border border-yellow-500/20 rounded-2xl p-4">
              <p className="text-xs text-yellow-400/60 uppercase tracking-wider mb-3 font-semibold">
                Duplicate group — "{group[0].artist_name}"
              </p>
              {group.map(a => (
                <div key={a.id} className="flex items-center space-x-3 py-2.5 border-b border-white/[0.04] last:border-0">
                  {a.profile_image_url
                    ? <img src={a.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-full bg-white/[0.06] flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{a.artist_name}</p>
                    <p className="text-[10px] text-white/30">{a.slug} · {a.tier} · {a.follower_count || 0} followers</p>
                    <p className="text-[10px] text-white/20">{a.id}</p>
                  </div>
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {/* Move other group members' tracks to this one */}
                    {group.filter(o => o.id !== a.id).map(other => (
                      <button key={other.id}
                        onClick={() => handleMoveAndDelete(a.id, other.id)}
                        disabled={moving}
                        className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-medium hover:bg-blue-500/20 transition disabled:opacity-40">
                        <Merge className="w-3 h-3" />
                        <span>Keep this</span>
                      </button>
                    ))}
                    <button onClick={() => handleDeleteOnly(a.id)}
                      disabled={deleting === a.id}
                      className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-40">
                      {deleting === a.id
                        ? <Loader className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {duplicates.length === 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-green-500/[0.05] border border-green-500/20 text-sm text-green-400/70 text-center">
          No duplicate artist names found
        </div>
      )}

      {/* All artists search + delete */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wider text-white/30 font-semibold mb-3">All Artists ({artists.length})</p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search artists..."
            className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] rounded-xl text-sm text-white placeholder:text-white/20 border border-white/[0.06] focus:border-white/20 focus:outline-none transition" />
        </div>

        <div className="space-y-1">
          {filtered.map(a => (
            <div key={a.id} className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              {a.profile_image_url
                ? <img src={a.profile_image_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full bg-white/[0.06] flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{a.artist_name}</p>
                <p className="text-[10px] text-white/30">{a.tier} · {a.follower_count || 0} followers</p>
              </div>
              <button onClick={() => handleDeleteOnly(a.id)}
                disabled={deleting === a.id}
                className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition disabled:opacity-40 flex-shrink-0">
                {deleting === a.id
                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}