// src/pages/RetailAdminPanel.js
//
// The tabbed retail admin panel. The original was lost from the repo (see
// the note in src/pages/AdminRetail.js), which left the Playlists, Venues,
// Pitches, Payouts, Analytics, Pricing and Auto-Compile buttons pointing at
// nothing: every one of them landed on the KPI page.
//
// This rebuilds the three that are needed to actually run retail day to
// day: create a playlist and fill it, invite a venue, and manage staff.
// The rest are listed as coming so the buttons stop lying about what they
// do.
//
// Everything here stays inside Feelz Retail. No links to the main app.
//
// Reads ?sub= so the existing links from the player's admin bar keep
// working.

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader, Plus, Trash2, Search, Music, Link2, Check, UserPlus, Store, ListMusic, Users, Pencil, ImagePlus,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";
const btnCls = "flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white transition disabled:opacity-40";

const TABS = [
  { key: 'playlists', label: 'Playlists', icon: ListMusic },
  { key: 'venues',    label: 'Venues',    icon: Store },
  { key: 'staff',     label: 'Staff',     icon: Users },
];

const NOT_BUILT = {
  ads: 'Ads', pitches: 'Pitches', payouts: 'Payouts',
  analytics: 'Analytics', pricing: 'Pricing', autocompile: 'Auto-Compile',
};

// ── Playlists ────────────────────────────────────────────────────────────────
function PlaylistsTab({ showToast }) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [title, setTitle] = React.useState('');
  const [mood, setMood] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [open, setOpen] = React.useState(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState({ title: '', mood: '', description: '' });
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [uploadingCover, setUploadingCover] = React.useState(false);
  const [tracks, setTracks] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState([]);
  const [searching, setSearching] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await supabase.from('retail_playlists')
      .select('id, title, mood, description, cover_image_url, is_active, created_at')
      .order('created_at', { ascending: false });
    setPlaylists(data || []);
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  // Editing and cover upload. retail_playlists.cover_image_url has always
  // existed and the player renders it, but nothing ever set it, so every
  // vibe showed the placeholder note icon. Same 'covers' bucket the
  // newsletter editor uses rather than a new one.
  const saveDetails = async () => {
    if (!draft.title.trim()) { showToast('A playlist needs a title'); return; }
    setSavingEdit(true);
    const { error } = await supabase.from('retail_playlists').update({
      title: draft.title.trim(),
      mood: draft.mood.trim() || null,
      description: draft.description.trim() || null,
    }).eq('id', open.id);
    setSavingEdit(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setOpen({ ...open, ...draft });
    setEditing(false);
    showToast('Playlist updated');
    load();
  };

  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    const path = `retail-playlists/${open.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const { error: upErr } = await supabase.storage.from('covers').upload(path, file, { cacheControl: '31536000' });
    e.target.value = '';
    if (upErr) { setUploadingCover(false); showToast('Upload failed: ' + upErr.message); return; }
    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(path);
    const { error } = await supabase.from('retail_playlists')
      .update({ cover_image_url: publicUrl }).eq('id', open.id);
    setUploadingCover(false);
    if (error) { showToast('Saved the image but could not attach it: ' + error.message); return; }
    setOpen({ ...open, cover_image_url: publicUrl });
    showToast('Cover updated');
    load();
  };

  const openPlaylist = async (pl) => {
    setOpen(pl);
    setEditing(false);
    setDraft({ title: pl.title || '', mood: pl.mood || '', description: pl.description || '' });
    setResults([]); setQuery('');
    const { data } = await supabase.from('retail_playlist_tracks')
      .select('id, position, track:tracks(id, title, cover_artwork_url, artist:artists(artist_name))')
      .eq('playlist_id', pl.id).order('position');
    setTracks(data || []);
  };

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.from('retail_playlists')
      .insert({ title: title.trim(), mood: mood.trim() || null, description: description.trim() || null, created_by: user?.id || null })
      .select().single();
    setCreating(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setTitle(''); setMood(''); setDescription('');
    showToast('Playlist created');
    load();
    openPlaylist(data);
  };

  const toggleActive = async (pl) => {
    await supabase.from('retail_playlists').update({ is_active: !pl.is_active }).eq('id', pl.id);
    load();
  };

  const removePlaylist = async (pl) => {
    if (!window.confirm(`Delete "${pl.title}"? Its tracks are unlinked, not deleted.`)) return;
    await supabase.from('retail_playlists').delete().eq('id', pl.id);
    if (open?.id === pl.id) setOpen(null);
    load();
  };

  // Live search, same shape as the cold start picker. Explicit tracks are
  // blocked by a database trigger on insert, not hidden here, so the error
  // surfaces rather than the track silently vanishing.
  React.useEffect(() => {
    const t = setTimeout(async () => {
      const q = query.trim();
      if (q.length < 2) { setResults([]); return; }
      setSearching(true);
      const cols = 'id, title, cover_artwork_url, artist:artists(id, artist_name)';
      const [byTitle, byArtist] = await Promise.all([
        supabase.from('tracks').select(cols).eq('is_published', true).ilike('title', `%${q}%`).limit(20),
        supabase.from('tracks').select('id, title, cover_artwork_url, artist:artists!inner(id, artist_name)')
          .eq('is_published', true).ilike('artists.artist_name', `%${q}%`).limit(20),
      ]);
      setSearching(false);
      const seen = new Set(); const merged = [];
      [...(byTitle.data || []), ...(byArtist.data || [])].forEach(t2 => {
        if (seen.has(t2.id)) return; seen.add(t2.id); merged.push(t2);
      });
      setResults(merged);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const addTrack = async (track) => {
    const nextPos = tracks.length > 0 ? Math.max(...tracks.map(t => t.position)) + 1 : 0;
    const { error } = await supabase.from('retail_playlist_tracks')
      .insert({ playlist_id: open.id, track_id: track.id, position: nextPos });
    if (error) {
      showToast(error.message.includes('explicit')
        ? 'That track is explicit, so it cannot go in a retail playlist'
        : (error.code === '23505' ? 'Already in this playlist' : 'Error: ' + error.message));
      return;
    }
    setQuery(''); setResults([]);
    openPlaylist(open);
  };

  const removeTrack = async (row) => {
    await supabase.from('retail_playlist_tracks').delete().eq('id', row.id);
    openPlaylist(open);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;

  if (open) {
    return (
      <div>
        <button onClick={() => setOpen(null)} className="text-xs text-white/40 hover:text-white/70 mb-4">&larr; All playlists</button>

        <div className="flex items-start gap-5 mb-6">
          <div className="relative flex-shrink-0">
            <div className="w-32 h-32 rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              {open.cover_image_url
                ? <img src={open.cover_image_url} alt="" className="w-full h-full object-cover" />
                : <Music className="w-8 h-8 text-white/15" />}
            </div>
            <label className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-purple-500 hover:bg-purple-400 flex items-center justify-center cursor-pointer transition shadow-lg"
              title="Change cover">
              {uploadingCover
                ? <Loader className="w-4 h-4 text-white animate-spin" />
                : <ImagePlus className="w-4 h-4 text-white" />}
              <input type="file" accept="image/*" onChange={uploadCover} className="hidden" disabled={uploadingCover} />
            </label>
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input className={inputCls} placeholder="Title" value={draft.title}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                  <input className={inputCls} placeholder="Mood" value={draft.mood}
                    onChange={e => setDraft(d => ({ ...d, mood: e.target.value }))} />
                </div>
                <input className={inputCls} placeholder="Description" value={draft.description}
                  onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
                <div className="flex items-center gap-2">
                  <button onClick={saveDetails} disabled={savingEdit} className={btnCls}>
                    {savingEdit ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                  <button onClick={() => { setEditing(false); setDraft({ title: open.title || '', mood: open.mood || '', description: open.description || '' }); }}
                    className="text-sm text-white/40 hover:text-white/70 px-2">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <h2 className="text-xl font-bold text-white">{open.title}</h2>
                  <button onClick={() => setEditing(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.06] hover:bg-white/[0.12] transition flex-shrink-0"
                    title="Edit details">
                    <Pencil className="w-3.5 h-3.5 text-white/50" />
                  </button>
                </div>
                <p className="text-xs text-white/35 mt-1">{open.mood || 'No mood set'} · {tracks.length} tracks</p>
                {open.description && <p className="text-sm text-white/45 mt-2 max-w-xl">{open.description}</p>}
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">Add tracks</p>
          <div className="relative">
            <Search className="w-4 h-4 text-white/25 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input className={`${inputCls} pl-9`} placeholder="Search a song or artist"
              value={query} onChange={e => setQuery(e.target.value)} />
            {searching && <Loader className="w-4 h-4 text-white/30 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />}
          </div>
          {results.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {results.map(t => (
                <button key={t.id} onClick={() => addTrack(t)}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] transition text-left">
                  <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                    {t.cover_artwork_url
                      ? <img src={t.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{t.title}</p>
                    <p className="text-xs text-white/40 truncate">{t.artist?.artist_name}</p>
                  </div>
                  <Plus className="w-4 h-4 text-white/30 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {tracks.length === 0 ? (
          <p className="text-sm text-white/30 py-8 text-center">No tracks yet. Search above to add some.</p>
        ) : (
          <div className="space-y-1.5">
            {tracks.map((row, i) => (
              <div key={row.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-xs text-white/25 font-mono w-6 flex-shrink-0">{i + 1}</span>
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0">
                  {row.track?.cover_artwork_url
                    ? <img src={row.track.cover_artwork_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-white/20" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{row.track?.title || 'Track removed'}</p>
                  <p className="text-xs text-white/40 truncate">{row.track?.artist?.artist_name}</p>
                </div>
                <button onClick={() => removeTrack(row)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-red-500/20 transition flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5 text-white/40" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">New playlist</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input className={inputCls} placeholder="Title, e.g. Coffee Mornings" value={title} onChange={e => setTitle(e.target.value)} />
          <input className={inputCls} placeholder="Mood, e.g. calm" value={mood} onChange={e => setMood(e.target.value)} />
        </div>
        <input className={`${inputCls} mb-3`} placeholder="Description, what this vibe is for (optional)"
          value={description} onChange={e => setDescription(e.target.value)} />
        <button onClick={create} disabled={!title.trim() || creating} className={btnCls}>
          {creating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Create playlist
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {playlists.map(pl => (
          <div key={pl.id} className={`p-4 rounded-2xl border transition ${
            pl.is_active ? 'bg-white/[0.03] border-white/[0.07]' : 'bg-white/[0.01] border-white/[0.04] opacity-60'}`}>
            <button onClick={() => openPlaylist(pl)} className="flex items-center gap-3 text-left w-full">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                {pl.cover_image_url
                  ? <img src={pl.cover_image_url} alt="" className="w-full h-full object-cover" />
                  : <Music className="w-4 h-4 text-white/15" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{pl.title}</p>
                <p className="text-xs text-white/40 truncate">{pl.mood || 'No mood'}</p>
              </div>
            </button>
            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => toggleActive(pl)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] transition">
                {pl.is_active ? 'Live' : 'Hidden'}
              </button>
              <button onClick={() => removePlaylist(pl)}
                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-red-500/20 transition ml-auto">
                <Trash2 className="w-3 h-3 text-white/40" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Venues ───────────────────────────────────────────────────────────────────
//
// BILLING NOTE, because this is the part that could strand a customer.
//
// Nothing anywhere in the codebase created a retail_subscriptions row or set
// monthly_fee. retail-paypal-subscription.js reads that row to build the
// PayPal plan, so a venue could accept an invite, sign up, reach the player
// and be told "Billing not set up yet, contact us" with no way forward. The
// fee is now set here, when the venue is added, and the subscription row is
// created with it.
//
// The row is created `paused`, not `active`, on purpose. calculate_retail_payout()
// sums monthly_fee across subscriptions where status = 'active' to size the
// artist pool, so an unpaid venue sitting at `active` would inflate what
// artists are owed against money nobody has paid. PayPal flips it to active
// when the subscription is approved.
function VenuesTab({ showToast }) {
  const { user } = useAuth();
  const [venues, setVenues] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [fee, setFee] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState(null);
  const [guide, setGuide] = React.useState([]);
  const [editingFee, setEditingFee] = React.useState(null);
  const [feeDraft, setFeeDraft] = React.useState('');

  const load = React.useCallback(async () => {
    // Venue and subscription together: "can this venue actually play music"
    // needs both, and showing status alone was ambiguous.
    const [{ data: vs }, { data: subs }] = await Promise.all([
      supabase.from('retail_venues')
        .select('id, business_name, contact_name, contact_email, status, user_id, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('retail_subscriptions')
        .select('venue_id, status, monthly_fee, paypal_subscription_id'),
    ]);
    const byVenue = Object.fromEntries((subs || []).map(s => [s.venue_id, s]));
    setVenues((vs || []).map(v => ({ ...v, sub: byVenue[v.id] || null })));
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    supabase.from('retail_price_guide')
      .select('venue_type, suggested_fee_min, suggested_fee_max')
      .order('sort_order')
      .then(({ data }) => setGuide(data || []));
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    const amount = parseFloat(fee);
    if (!fee.trim() || Number.isNaN(amount) || amount <= 0) {
      showToast('Set a monthly fee, or the venue cannot be billed and cannot play');
      return;
    }
    setCreating(true);

    const { data: venue, error } = await supabase.from('retail_venues').insert({
      business_name: name.trim(),
      contact_name: contact.trim() || null,
      contact_email: email.trim() || null,
      created_by: user?.id || null,
    }).select('id').single();

    if (error || !venue) {
      setCreating(false);
      showToast('Error: ' + (error?.message || 'could not add venue'));
      return;
    }

    const { error: subError } = await supabase.from('retail_subscriptions').insert({
      venue_id: venue.id,
      monthly_fee: amount,
      status: 'paused',
    });
    setCreating(false);

    if (subError) {
      // The venue exists but cannot be billed, which is exactly the dead end
      // this whole change is about. Say so rather than reporting success.
      showToast('Venue added but billing failed to set up: ' + subError.message);
    } else {
      showToast('Venue added. Copy its invite link below.');
    }
    setName(''); setContact(''); setEmail(''); setFee('');
    load();
  };

  const saveFee = async (venue) => {
    const amount = parseFloat(feeDraft);
    if (Number.isNaN(amount) || amount <= 0) { showToast('Enter a fee above zero'); return; }

    if (venue.sub) {
      const { error } = await supabase.from('retail_subscriptions')
        .update({ monthly_fee: amount }).eq('venue_id', venue.id);
      if (error) { showToast('Error: ' + error.message); return; }
      // A live PayPal plan is priced at creation, so changing the number here
      // does not change what an already-subscribed venue is charged.
      showToast(venue.sub.paypal_subscription_id
        ? 'Saved. This venue is already subscribed, so PayPal keeps charging the old amount until they resubscribe.'
        : 'Monthly fee saved');
    } else {
      const { error } = await supabase.from('retail_subscriptions')
        .insert({ venue_id: venue.id, monthly_fee: amount, status: 'paused' });
      if (error) { showToast('Error: ' + error.message); return; }
      showToast('Billing set up for this venue');
    }
    setEditingFee(null); setFeeDraft('');
    load();
  };

  const copyInvite = async (venue) => {
    const { data, error } = await supabase.rpc('generate_venue_signup_token', { p_venue_id: venue.id });
    if (error || !data) { showToast('Could not create an invite link'); return; }
    const url = `${window.location.origin}/retail/join/${data}`;
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
    setCopied(venue.id);
    setTimeout(() => setCopied(null), 2500);
    showToast('Invite link copied, valid for 14 days');
  };

  // One sentence answering "can this venue play music, and why not".
  const accessState = (v) => {
    if (!v.sub)                       return { label: 'No billing set up', tone: 'text-red-300',   hint: 'They will hit a dead end after signing up' };
    if (!v.user_id)                   return { label: 'Invite not accepted', tone: 'text-white/45', hint: 'Send them the invite link' };
    if (v.status === 'suspended')     return { label: 'Suspended', tone: 'text-amber-300', hint: 'Payment stopped or cancelled' };
    if (v.sub.status !== 'active')    return { label: 'Signed up, not paying', tone: 'text-amber-300', hint: 'Waiting on their PayPal subscription' };
    if (v.status === 'active')        return { label: 'Active and paying', tone: 'text-lime-300', hint: null };
    return { label: v.status, tone: 'text-white/45', hint: null };
  };

  if (loading) return <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;

  return (
    <div>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">Add a venue</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
          <input className={inputCls} placeholder="Business name" value={name} onChange={e => setName(e.target.value)} />
          <input className={inputCls} placeholder="Contact name (optional)" value={contact} onChange={e => setContact(e.target.value)} />
          <input className={inputCls} placeholder="Contact email (optional)" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={inputCls} placeholder="Monthly fee, USD" inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} />
        </div>
        {guide.length > 0 && (
          <p className="text-[11px] text-white/30 mb-3">
            Typical: {guide.slice(0, 4).map(g =>
              `${g.venue_type} $${g.suggested_fee_min}${g.suggested_fee_max ? ` to $${g.suggested_fee_max}` : ''}`
            ).join(' · ')}
          </p>
        )}
        <button onClick={create} disabled={!name.trim() || creating} className={btnCls}>
          {creating ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add venue
        </button>
        <p className="text-[11px] text-white/25 mt-2.5">
          The fee is what PayPal bills them monthly. Without it they can sign up but
          cannot subscribe, and the player stays locked.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {venues.map(v => {
          const state = accessState(v);
          return (
            <div key={v.id} className={`p-4 rounded-2xl border ${
              !v.sub ? 'border-red-500/25 bg-red-500/[0.05]' : 'border-white/[0.07] bg-white/[0.03]'}`}>
              <p className="text-sm font-bold text-white truncate">{v.business_name}</p>
              <p className="text-xs text-white/40 truncate">{v.contact_email || v.contact_name || 'No contact'}</p>

              <p className={`text-xs font-semibold mt-2 ${state.tone}`}>{state.label}</p>
              {state.hint && <p className="text-[11px] text-white/30">{state.hint}</p>}

              <div className="flex items-center gap-2 mt-3">
                {editingFee === v.id ? (
                  <>
                    <input autoFocus className="w-24 px-2 py-1 bg-white/[0.06] rounded-lg text-white text-xs outline-none"
                      placeholder="USD" inputMode="decimal"
                      value={feeDraft} onChange={e => setFeeDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveFee(v)} />
                    <button onClick={() => saveFee(v)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-500 text-white">Save</button>
                    <button onClick={() => { setEditingFee(null); setFeeDraft(''); }}
                      className="text-[11px] text-white/40">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => { setEditingFee(v.id); setFeeDraft(v.sub?.monthly_fee || ''); }}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] transition">
                    {v.sub ? `$${v.sub.monthly_fee} / month` : 'Set monthly fee'}
                  </button>
                )}
                <button onClick={() => copyInvite(v)}
                  className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60 hover:bg-white/[0.12] transition">
                  {copied === v.id ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {copied === v.id ? 'Copied' : 'Invite link'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Staff ────────────────────────────────────────────────────────────────────
function StaffTab({ showToast }) {
  const [staff, setStaff] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data } = await supabase.from('retail_admins')
      .select('id, user_id, admin_name, created_at').order('created_at', { ascending: false });
    const rows = data || [];
    if (rows.length > 0) {
      const { data: profiles } = await supabase.from('user_profiles')
        .select('user_id, name, email').in('user_id', rows.map(r => r.user_id));
      const byId = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
      setStaff(rows.map(r => ({ ...r, profile: byId[r.user_id] || null })));
    } else setStaff([]);
    setLoading(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setAdding(true);
    const { data: foundUserId, error: lookupError } =
      await supabase.rpc('admin_find_user_by_email', { p_email: email.trim() });
    if (lookupError || !foundUserId) {
      setAdding(false);
      showToast('No account with that email. They need to sign up first.');
      return;
    }
    const { error } = await supabase.from('retail_admins')
      .insert({ user_id: foundUserId, admin_name: name.trim() || null });
    setAdding(false);
    if (error) {
      showToast(error.code === '23505' ? 'They already have access' : 'Error: ' + error.message);
      return;
    }
    setEmail(''); setName('');
    showToast('Retail admin access granted');
    load();
  };

  const revoke = async (row) => {
    const who = row.profile?.name || row.admin_name || 'this person';
    if (!window.confirm(`Revoke retail admin access for ${who}?`)) return;
    await supabase.from('retail_admins').delete().eq('id', row.id);
    load();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;

  return (
    <div>
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 mb-5">
        <p className="text-xs text-white/40 leading-relaxed">
          Retail staff manage the catalogue, playlists, venues and ads. They never see
          revenue or payouts, and they cannot grant this access to anyone else. Only
          platform admins can do that.
        </p>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 mb-6">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide mb-3">Grant access</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <input className={inputCls} placeholder="Their account email" value={email} onChange={e => setEmail(e.target.value)} />
          <input className={inputCls} placeholder="Name for your reference (optional)" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <button onClick={add} disabled={!email.trim() || adding} className={btnCls}>
          {adding ? <Loader className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Grant retail admin
        </button>
      </div>

      {staff.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-white/40">Nobody has retail admin access yet.</p>
          <p className="text-xs text-white/25 mt-1">Platform admins already have it by default.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {staff.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-9 h-9 rounded-full bg-purple-500/15 border border-purple-400/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-purple-200/70 font-bold">
                  {(s.profile?.name || s.admin_name || '?')[0]?.toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{s.profile?.name || s.admin_name || 'Unknown account'}</p>
                <p className="text-xs text-white/35 truncate">{s.profile?.email || s.user_id}</p>
              </div>
              <button onClick={() => revoke(s)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-red-500/20 transition flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RetailAdminPanel() {
  const [params, setParams] = useSearchParams();
  const sub = params.get('sub') || 'playlists';
  const [toast, setToast] = React.useState('');
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const active = TABS.some(t => t.key === sub) ? sub : (NOT_BUILT[sub] ? sub : 'playlists');

  return (
    <div className="px-6 pb-16">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-6 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setParams({ sub: key })}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap transition ${
              active === key ? 'bg-purple-500 text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.06]'}`}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {NOT_BUILT[active] ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
          <p className="text-sm font-bold text-amber-200">{NOT_BUILT[active]} is not built yet</p>
          <p className="text-xs text-amber-100/60 mt-1.5 leading-relaxed">
            The original panel was lost from the repo. Playlists, Venues and Staff have
            been rebuilt. This one has not, so it is saying so rather than showing you
            an empty screen.
          </p>
        </div>
      ) : active === 'playlists' ? <PlaylistsTab showToast={showToast} />
        : active === 'venues'   ? <VenuesTab showToast={showToast} />
        : <StaffTab showToast={showToast} />}
    </div>
  );
}