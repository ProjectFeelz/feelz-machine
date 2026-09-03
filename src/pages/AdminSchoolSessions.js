// src/pages/AdminSchoolSessions.js
// /admin/school-sessions — toggle the whole feature on/off, edit dates and
// prize copy, manage the shortlist of songs entrants can cover, manage the
// participating-school allow-list, mark finalists and the judges' winner,
// and see/export entries.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  GraduationCap, ArrowLeft, Loader, Plus, X, Download, Check, Trophy, Music,
} from 'lucide-react';

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

function Toggle({ value, onChange }) {
  return (
    <div
      className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 cursor-pointer flex-shrink-0 ${value ? 'bg-lime-400' : 'bg-white/10'}`}
      onClick={onChange}>
      <div className={`w-5 h-5 rounded-full transition-transform ${value ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white/30'}`} />
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs text-white/40 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-white/25 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition";

export default function AdminSchoolSessions({ embedded = false }) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [config, setConfig] = useState(null);
  const [competition, setCompetition] = useState(null);
  const [schools, setSchools] = useState([]);
  const [newSchool, setNewSchool] = useState('');
  const [songs, setSongs] = useState([]);
  const [newSong, setNewSong] = useState({ title: '', referenceUrl: '', referenceTrackId: '', referenceTrackTitle: '' });
  const [trackSearch, setTrackSearch] = useState('');
  const [trackResults, setTrackResults] = useState([]);
  const [trackSearching, setTrackSearching] = useState(false);
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [judges, setJudges] = useState([]);
  const [judgesLoading, setJudgesLoading] = useState(false);
  const [newJudgeEmail, setNewJudgeEmail] = useState('');
  const [newJudgeName, setNewJudgeName] = useState('');
  const [nominations, setNominations] = useState([]);
  const [vipCandidates, setVipCandidates] = useState([]);
  const [codeStats, setCodeStats] = useState({ total: 0, used: 0 });
  const [genCount, setGenCount] = useState('20');
  const [genSchoolId, setGenSchoolId] = useState('');
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState(null);
  const [newVip, setNewVip] = useState({ name: '', refCode: '' });
  const [issuingVip, setIssuingVip] = useState(false);
  const [nominationsLoading, setNominationsLoading] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const load = useCallback(async () => {
    setLoading(true);
    const { data: cfg } = await supabase
      .from('school_sessions_config').select('*').eq('id', CONFIG_ID).maybeSingle();
    setConfig(cfg);

    if (cfg?.competition_id) {
      const { data: comp } = await supabase
        .from('competitions').select('*').eq('id', cfg.competition_id).maybeSingle();
      setCompetition(comp);
    }

    const { data: sc } = await supabase
      .from('school_sessions_schools').select('*').order('name');
    setSchools(sc || []);

    if (cfg?.competition_id) {
      const { data: sg } = await supabase
        .from('school_sessions_shortlist_songs').select('*, reference_track:tracks(id, title, slug)')
        .eq('competition_id', cfg.competition_id).order('display_order');
      setSongs(sg || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadEntries = useCallback(async () => {
    if (!config?.competition_id) return;
    setEntriesLoading(true);
    const { data } = await supabase
      .from('school_sessions_entries')
      .select('id, entrant_full_name, entrant_email, entrant_tiktok_handle, tiktok_video_url, tiktok_tagged_confirmed, instagram_followed_confirmed, youtube_subscribed_confirmed, needs_school_verification, candidate_card_no, created_at, is_finalist, is_winner, is_group, school_name_freetext, song:school_sessions_shortlist_songs(title), school:school_sessions_schools(name), track:tracks(title), artist:artists(artist_name, slug), members:school_sessions_entry_members(id, member_name)')
      .eq('competition_id', config.competition_id)
      .order('created_at', { ascending: false });
    setEntries(data || []);
    setEntriesLoading(false);
  }, [config?.competition_id]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const loadJudges = useCallback(async () => {
    if (!config?.competition_id) return;
    setJudgesLoading(true);
    const { data } = await supabase
      .from('school_sessions_judges')
      .select('id, user_id, judge_name, created_at')
      .eq('competition_id', config.competition_id)
      .order('created_at', { ascending: false });
    setJudges(data || []);
    setJudgesLoading(false);
  }, [config?.competition_id]);

  useEffect(() => { loadJudges(); }, [loadJudges]);

  const addJudge = async () => {
    if (!newJudgeEmail.trim()) return;
    if (!config?.competition_id) {
      showToast('No active competition to add a judge to, check the School Sessions config is set up.');
      return;
    }
    const { data: foundUserId, error: lookupError } = await supabase
      .rpc('admin_find_user_by_email', { p_email: newJudgeEmail.trim() });
    if (lookupError || !foundUserId) {
      showToast('No account found with that email');
      return;
    }
    const { data, error } = await supabase
      .from('school_sessions_judges')
      .insert({
        competition_id: config.competition_id,
        user_id: foundUserId,
        judge_name: newJudgeName.trim() || null,
      })
      .select().single();
    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        showToast('That person is already a judge for this competition');
      } else {
        showToast('Error: ' + error.message);
      }
      return;
    }
    setJudges(prev => [data, ...prev]);
    setNewJudgeEmail('');
    setNewJudgeName('');
    showToast('Judge added');
  };

  const removeJudge = async (id) => {
    await supabase.from('school_sessions_judges').delete().eq('id', id);
    setJudges(prev => prev.filter(j => j.id !== id));
  };

  const loadNominations = useCallback(async () => {
    setNominationsLoading(true);
    const { data } = await supabase
      .from('school_sessions_district_nominations')
      .select('*')
      .order('created_at', { ascending: false });
    setNominations(data || []);
    setNominationsLoading(false);
  }, []);

  useEffect(() => { loadNominations(); }, [loadNominations]);

  const approveNomination = async (id) => {
    await supabase.from('school_sessions_district_nominations').update({ is_approved: true }).eq('id', id);
    setNominations(prev => prev.map(n => n.id === id ? { ...n, is_approved: true } : n));
  };

  const rejectNomination = async (id) => {
    await supabase.from('school_sessions_district_nominations').delete().eq('id', id);
    setNominations(prev => prev.filter(n => n.id !== id));
  };

  const loadVipCandidates = useCallback(async () => {
    const { data } = await supabase.from('school_sessions_vip_candidates')
      .select('*').order('candidate_number', { ascending: false });
    setVipCandidates(data || []);
  }, []);

  useEffect(() => { loadVipCandidates(); }, [loadVipCandidates]);

  const issueVipCandidate = async () => {
    if (!newVip.name.trim()) return;
    setIssuingVip(true);
    const { error } = await supabase.rpc('issue_vip_candidate', {
      p_name: newVip.name.trim(),
      p_ref_code: newVip.refCode.trim() || null,
    });
    setIssuingVip(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setNewVip({ name: '', refCode: '' });
    showToast('Candidate issued');
    loadVipCandidates();
  };

  const loadCodeStats = useCallback(async () => {
    const [{ count: total }, { count: used }] = await Promise.all([
      supabase.from('school_sessions_verification_codes').select('id', { count: 'exact', head: true }),
      supabase.from('school_sessions_verification_codes').select('id', { count: 'exact', head: true }).eq('is_used', true),
    ]);
    setCodeStats({ total: total || 0, used: used || 0 });
  }, []);

  useEffect(() => { loadCodeStats(); }, [loadCodeStats]);

  const generateCodes = async () => {
    const count = parseInt(genCount, 10);
    if (!count || count < 1) return;
    setGeneratingCodes(true);
    const { data, error } = await supabase.rpc('generate_verification_codes', {
      p_count: count,
      p_school_id: genSchoolId || null,
    });
    setGeneratingCodes(false);
    if (error) { showToast('Error: ' + error.message); return; }
    setGeneratedCodes(data || []);
    loadCodeStats();
  };

  const saveConfig = async (patch) => {
    setSaving(true);
    const next = { ...config, ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('school_sessions_config').update(patch).eq('id', CONFIG_ID);
    if (error) { showToast('Error: ' + error.message); }
    else { setConfig(next); showToast('Saved'); }
    setSaving(false);
  };

  const saveCompetition = async (patch) => {
    if (!competition?.id) return;
    setSaving(true);
    const next = { ...competition, ...patch };
    const { error } = await supabase.from('competitions').update(patch).eq('id', competition.id);
    if (error) { showToast('Error: ' + error.message); }
    else { setCompetition(next); showToast('Saved'); }
    setSaving(false);
  };

  const addSchool = async () => {
    if (!newSchool.trim()) return;
    const { data, error } = await supabase
      .from('school_sessions_schools')
      .insert({ name: newSchool.trim() })
      .select().single();
    if (error) { showToast('Error: ' + error.message); return; }
    setSchools(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewSchool('');
  };

  const toggleSchoolActive = async (school) => {
    await supabase.from('school_sessions_schools').update({ is_active: !school.is_active }).eq('id', school.id);
    setSchools(prev => prev.map(s => s.id === school.id ? { ...s, is_active: !s.is_active } : s));
  };

  const removeSchool = async (id) => {
    await supabase.from('school_sessions_schools').delete().eq('id', id);
    setSchools(prev => prev.filter(s => s.id !== id));
  };

  const toggleFinalist = async (entry) => {
    await supabase.from('school_sessions_entries').update({ is_finalist: !entry.is_finalist }).eq('id', entry.id);
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_finalist: !e.is_finalist } : e));
  };

  const toggleWinner = async (entry) => {
    await supabase.from('school_sessions_entries').update({ is_winner: !entry.is_winner }).eq('id', entry.id);
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_winner: !e.is_winner } : e));
  };

  const addSong = async () => {
    if (!newSong.title.trim() || !config?.competition_id) return;
    const { data, error } = await supabase
      .from('school_sessions_shortlist_songs')
      .insert({
        competition_id: config.competition_id,
        title: newSong.title.trim(),
        reference_url: newSong.referenceUrl.trim() || null,
        reference_track_id: newSong.referenceTrackId || null,
        display_order: songs.length,
      })
      .select('*, reference_track:tracks(id, title, slug)').single();
    if (error) { showToast('Error: ' + error.message); return; }
    setSongs(prev => [...prev, data]);
    setNewSong({ title: '', referenceUrl: '', referenceTrackId: '', referenceTrackTitle: '' });
    setTrackSearch(''); setTrackResults([]);
  };

  const searchTracks = async (q) => {
    setTrackSearch(q);
    if (!q.trim()) { setTrackResults([]); return; }
    setTrackSearching(true);
    const { data } = await supabase
      .from('tracks')
      .select('id, title, artist:artists(artist_name)')
      .ilike('title', `%${q.trim()}%`)
      .limit(8);
    setTrackResults(data || []);
    setTrackSearching(false);
  };

  const pickTrack = (track) => {
    setNewSong(prev => ({
      ...prev,
      referenceTrackId: track.id,
      referenceTrackTitle: track.title,
      title: prev.title.trim() || track.title,
    }));
    setTrackSearch(''); setTrackResults([]);
  };

  const unlinkNewSongTrack = () => {
    setNewSong(prev => ({ ...prev, referenceTrackId: '', referenceTrackTitle: '' }));
  };

  const unlinkSongTrack = async (song) => {
    await supabase.from('school_sessions_shortlist_songs').update({ reference_track_id: null }).eq('id', song.id);
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, reference_track_id: null, reference_track: null } : s));
  };

  const toggleSongActive = async (song) => {
    await supabase.from('school_sessions_shortlist_songs').update({ is_active: !song.is_active }).eq('id', song.id);
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, is_active: !s.is_active } : s));
  };

  const removeSong = async (id) => {
    await supabase.from('school_sessions_shortlist_songs').delete().eq('id', id);
    setSongs(prev => prev.filter(s => s.id !== id));
  };

  const exportCsv = () => {
    const rows = [
      ['Entrant', 'Email', 'TikTok', 'Song Covered', 'Group?', 'Group Members', 'School', 'Candidate Card #', 'Finalist', 'Winner', 'Track', 'Artist Profile', 'Submitted'],
      ...entries.map(e => [
        e.entrant_full_name,
        e.entrant_email || '',
        e.entrant_tiktok_handle ? `@${e.entrant_tiktok_handle}` : '',
        e.song?.title || '',
        e.is_group ? 'Yes' : 'No',
        (e.members || []).map(m => m.member_name).join('; '),
        e.school?.name || e.school_name_freetext || '',
        e.candidate_card_no || '',
        e.is_finalist ? 'Yes' : '',
        e.is_winner ? 'Yes' : '',
        e.track?.title || '',
        e.artist?.artist_name || '',
        new Date(e.created_at).toLocaleString(),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'school-sessions-entries.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) return null;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader className="w-5 h-5 text-white/30 animate-spin" /></div>;
  }

  const groupCount = entries.filter(e => e.is_group).length;

  return (
    <div className={embedded ? "pb-8" : "min-h-screen pb-24"}>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-sm text-white font-medium shadow-lg">
          {toast}
        </div>
      )}

      {!embedded && (
      <div className="flex items-center space-x-3 px-5 pt-14 md:pt-4 pb-4 sticky top-0 z-20 bg-black/90 backdrop-blur-sm border-b border-white/[0.04]">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <GraduationCap className="w-5 h-5 text-lime-400" />
        <h1 className="text-base font-bold text-white">School Sessions</h1>
      </div>
      )}

      <div className="px-5 py-5 max-w-4xl mx-auto space-y-6">

        {/* Master toggle */}
        <div className="flex items-center justify-between rounded-xl border border-lime-400/20 bg-lime-400/[0.04] p-4">
          <div>
            <p className="text-sm font-semibold text-white">
              {config?.is_enabled ? 'Live — visible in the app' : 'Off — hidden everywhere'}
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              Controls the upload-flow section, the /schoolsessions landing page, and the entry gate — all at once.
            </p>
          </div>
          <Toggle value={config?.is_enabled} onChange={() => saveConfig({ is_enabled: !config?.is_enabled })} />
        </div>

        {/* Region gate */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Region lock</p>
          <Field label="Allowed country code" hint="ISO 3166-1 alpha-2, e.g. ZA for South Africa. Visitors outside this country only get in via a listed school.">
            <input className={inputCls} value={config?.allowed_country_code || ''}
              onChange={e => setConfig({ ...config, allowed_country_code: e.target.value.toUpperCase() })}
              onBlur={e => saveConfig({ allowed_country_code: e.target.value.toUpperCase() })} />
          </Field>
          <label className="flex items-center space-x-2.5 cursor-pointer">
            <Toggle value={config?.require_school_allowlist}
              onChange={() => saveConfig({ require_school_allowlist: !config?.require_school_allowlist })} />
            <span className="text-xs text-white/50">Also allow visitors whose school is on the allow-list below, regardless of region</span>
          </label>
        </div>

        {/* Timeline: awareness → submissions → voting */}
        {competition && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Timeline — one month each</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Awareness starts" hint="Courses + promo go live">
                <input type="datetime-local" className={inputCls}
                  value={competition.entries_open_at ? competition.entries_open_at.substring(0, 16) : ''}
                  onChange={e => setCompetition({ ...competition, entries_open_at: e.target.value })}
                  onBlur={e => saveCompetition({ entries_open_at: e.target.value || null })} />
              </Field>
              <Field label="Submissions close" hint="Voting phase begins right after">
                <input type="datetime-local" className={inputCls}
                  value={competition.entries_close_at ? competition.entries_close_at.substring(0, 16) : ''}
                  onChange={e => setCompetition({ ...competition, entries_close_at: e.target.value })}
                  onBlur={e => saveCompetition({ entries_close_at: e.target.value || null })} />
              </Field>
              <Field label="Voting opens" hint="Leave blank to start right when submissions close">
                <input type="datetime-local" className={inputCls}
                  value={competition.voting_open_at ? competition.voting_open_at.substring(0, 16) : ''}
                  onChange={e => setCompetition({ ...competition, voting_open_at: e.target.value })}
                  onBlur={e => saveCompetition({ voting_open_at: e.target.value || null })} />
              </Field>
              <Field label="Voting closes / winner decided">
                <input type="datetime-local" className={inputCls}
                  value={competition.voting_close_at ? competition.voting_close_at.substring(0, 16) : ''}
                  onChange={e => setCompetition({ ...competition, voting_close_at: e.target.value })}
                  onBlur={e => saveCompetition({ voting_close_at: e.target.value || null })} />
              </Field>
            </div>
          </div>
        )}

        {/* Season + courses */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Season &amp; courses</p>
          <Field label="Season" hint="Bump this each time you re-run School Sessions (roughly every 6 months)">
            <input type="number" className={inputCls} value={config?.season || 1}
              onChange={e => setConfig({ ...config, season: e.target.value })}
              onBlur={e => saveConfig({ season: parseInt(config.season) || 1 })} />
          </Field>
          <Field label='"How to Use Feelz Machine" course URL' hint="Hosted on projectfeelz.com">
            <input className={inputCls} value={config?.platform_course_url || ''}
              onChange={e => setConfig({ ...config, platform_course_url: e.target.value })}
              onBlur={e => saveConfig({ platform_course_url: e.target.value || null })}
              placeholder="https://projectfeelz.com/courses/..." />
          </Field>
          <Field label='"How to Make Viral Content" course URL' hint="Hosted on projectfeelz.com">
            <input className={inputCls} value={config?.viral_course_url || ''}
              onChange={e => setConfig({ ...config, viral_course_url: e.target.value })}
              onBlur={e => saveConfig({ viral_course_url: e.target.value || null })}
              placeholder="https://projectfeelz.com/courses/..." />
          </Field>
          <Field label="YouTube playlist URL" hint="Shown as a clickable link on the School Sessions page — the shortlist songs or entry compilation, whichever you're linking">
            <input className={inputCls} value={config?.youtube_playlist_url || ''}
              onChange={e => setConfig({ ...config, youtube_playlist_url: e.target.value })}
              onBlur={e => saveConfig({ youtube_playlist_url: e.target.value || null })}
              placeholder="https://youtube.com/playlist?list=..." />
          </Field>
        </div>

        {/* Prize copy */}
        {competition && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Prize copy</p>
            <Field label="Prize summary (shown on landing page)">
              <input className={inputCls} value={competition.prize_description || ''}
                onChange={e => setCompetition({ ...competition, prize_description: e.target.value })}
                onBlur={e => saveCompetition({ prize_description: e.target.value })} />
            </Field>
            <Field label="Prize breakdown (subtext under the headline)" hint='e.g. "R5,000 to the winning school + R5,000 to the winning student"'>
              <textarea className={inputCls} rows={2} value={competition.prize_breakdown_text || ''}
                onChange={e => setCompetition({ ...competition, prize_breakdown_text: e.target.value })}
                onBlur={e => saveCompetition({ prize_breakdown_text: e.target.value })} />
            </Field>
            <Field label="Total cash prize amount (ZAR)">
              <input type="number" className={inputCls} value={competition.cash_prize_amount || 0}
                onChange={e => setCompetition({ ...competition, cash_prize_amount: e.target.value })}
                onBlur={e => saveCompetition({ cash_prize_amount: parseFloat(competition.cash_prize_amount) || 0 })} />
            </Field>
          </div>
        )}

        {/* Song shortlist */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Song shortlist ({songs.length})</p>
          <p className="text-[11px] text-white/30">The songs entrants can choose to cover. Link an uploaded track so students can listen right here in the app, or fall back to an external link.</p>
          <div className="space-y-2">
            <input className={inputCls} placeholder="Song title" value={newSong.title}
              onChange={e => setNewSong({ ...newSong, title: e.target.value })} />

            {newSong.referenceTrackId ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-lime-400/[0.08] border border-lime-400/20">
                <div className="flex items-center space-x-2 min-w-0">
                  <Music className="w-3.5 h-3.5 text-lime-400 flex-shrink-0" />
                  <span className="text-sm text-white truncate">Linked: {newSong.referenceTrackTitle}</span>
                </div>
                <button onClick={unlinkNewSongTrack} className="text-white/40 hover:text-red-400 flex-shrink-0 ml-2">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input className={inputCls} placeholder="Search your uploaded tracks to link one…" value={trackSearch}
                  onChange={e => searchTracks(e.target.value)} />
                {(trackSearching || trackResults.length > 0) && trackSearch && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg bg-[#161616] border border-white/10 max-h-48 overflow-y-auto shadow-lg">
                    {trackSearching && <p className="text-xs text-white/30 px-3 py-2">Searching…</p>}
                    {!trackSearching && trackResults.map(t => (
                      <button key={t.id} onClick={() => pickTrack(t)}
                        className="w-full text-left px-3 py-2 hover:bg-white/[0.06] flex items-center justify-between">
                        <span className="text-sm text-white truncate">{t.title}</span>
                        <span className="text-[11px] text-white/30 ml-2 flex-shrink-0">{t.artist?.artist_name}</span>
                      </button>
                    ))}
                    {!trackSearching && trackResults.length === 0 && (
                      <p className="text-xs text-white/30 px-3 py-2">No matching tracks — upload the original first, or use an external link below.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex space-x-2">
              <input className={inputCls} placeholder="External link (optional, used if no track is linked)" value={newSong.referenceUrl}
                onChange={e => setNewSong({ ...newSong, referenceUrl: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addSong()} />
              <button onClick={addSong} className="px-3.5 py-2.5 rounded-lg bg-lime-400 text-black flex-shrink-0">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {songs.map(s => (
              <div key={s.id} className="px-3 py-2 rounded-lg bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0">
                    <button onClick={() => toggleSongActive(s)}
                      className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${s.is_active ? 'bg-lime-400 border-lime-400' : 'border-white/20'}`}>
                      {s.is_active && <Check className="w-3 h-3 text-black" />}
                    </button>
                    <Music className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />
                    <span className={`text-sm truncate ${s.is_active ? 'text-white' : 'text-white/30 line-through'}`}>{s.title}</span>
                  </div>
                  <button onClick={() => removeSong(s.id)} className="text-white/20 hover:text-red-400 flex-shrink-0 ml-2">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1 pl-6">
                  {s.reference_track?.id ? (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] text-lime-400/70">Listenable in-app: {s.reference_track.title}</span>
                      <button onClick={() => unlinkSongTrack(s)} className="text-[11px] text-white/20 hover:text-red-400">Unlink</button>
                    </div>
                  ) : s.reference_url ? (
                    <a href={s.reference_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-white/30 hover:text-white/50 truncate">External link only</a>
                  ) : (
                    <span className="text-[11px] text-white/20">No listening link yet</span>
                  )}
                </div>
              </div>
            ))}
            {songs.length === 0 && <p className="text-xs text-white/30 py-2">No songs added yet — entrants won't see anything to choose from until you add some.</p>}
          </div>
        </div>

        {/* School allow-list */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Participating schools ({schools.length})</p>
          <div className="flex space-x-2">
            <input className={inputCls} placeholder="Add a school…" value={newSchool}
              onChange={e => setNewSchool(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSchool()} />
            <button onClick={addSchool} className="px-3.5 py-2.5 rounded-lg bg-lime-400 text-black flex-shrink-0">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {schools.map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]">
                <div className="flex items-center space-x-2">
                  <button onClick={() => toggleSchoolActive(s)}
                    className={`w-4 h-4 rounded flex items-center justify-center border ${s.is_active ? 'bg-lime-400 border-lime-400' : 'border-white/20'}`}>
                    {s.is_active && <Check className="w-3 h-3 text-black" />}
                  </button>
                  <span className={`text-sm ${s.is_active ? 'text-white' : 'text-white/30 line-through'}`}>{s.name}</span>
                </div>
                <button onClick={() => removeSchool(s.id)} className="text-white/20 hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {schools.length === 0 && <p className="text-xs text-white/30 py-2">No schools added yet.</p>}
          </div>
        </div>

        {/* Judges */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Judges ({judges.length})</p>
          <p className="text-[11px] text-white/30">
            Add someone by the email on their Feelz Machine account. They'll get access to a judge panel that only lets them mark finalists and pick the winner — nothing else on the platform.
          </p>
          <div className="flex space-x-2">
            <input className={inputCls} placeholder="Judge's email…" value={newJudgeEmail}
              onChange={e => setNewJudgeEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addJudge()} />
            <input className={inputCls} placeholder="Name (optional)" value={newJudgeName}
              onChange={e => setNewJudgeName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addJudge()} />
            <button onClick={addJudge} className="px-3.5 py-2.5 rounded-lg bg-lime-400 text-black flex-shrink-0">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            {judgesLoading ? (
              <div className="flex justify-center py-4"><Loader className="w-4 h-4 text-white/30 animate-spin" /></div>
            ) : judges.map(j => (
              <div key={j.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]">
                <span className="text-sm text-white">{j.judge_name || j.user_id}</span>
                <button onClick={() => removeJudge(j.id)} className="text-white/20 hover:text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!judgesLoading && judges.length === 0 && <p className="text-xs text-white/30 py-2">No judges added yet — you're the only one who can mark finalists and winners until you add some.</p>}
          </div>
        </div>

        {/* Verification codes */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">
            Verification codes ({codeStats.used} used / {codeStats.total} generated)
          </p>
          <p className="text-[11px] text-white/30">
            Hand these out in person — at the introduction event, or from school reception afterward. No email needed; having a real, unused code is the verification. Each one works exactly once.
          </p>
          <div className="flex space-x-2">
            <input type="number" min="1" max="500" className={inputCls} placeholder="How many?" value={genCount}
              onChange={e => setGenCount(e.target.value)} />
            <select className={inputCls} value={genSchoolId} onChange={e => setGenSchoolId(e.target.value)}>
              <option value="">No specific school</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={generateCodes} disabled={generatingCodes}
              className="px-3.5 py-2.5 rounded-lg bg-lime-400 text-black flex-shrink-0 disabled:opacity-40 text-sm font-bold whitespace-nowrap">
              {generatingCodes ? '…' : 'Generate'}
            </button>
          </div>
          {generatedCodes && (
            <div className="rounded-lg bg-white/[0.04] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-white/40">{generatedCodes.length} new codes — copy or write these down now, they aren't shown again here.</p>
                <button onClick={() => { navigator.clipboard.writeText(generatedCodes.join('\n')); showToast('Copied'); }}
                  className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/[0.08] text-white/60 hover:bg-white/[0.12] transition flex-shrink-0">Copy all</button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
                {generatedCodes.map(c => (
                  <div key={c} className="text-center text-xs font-mono py-1.5 rounded bg-black/40 text-lime-400">{c}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* VIP Candidate Cards */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">
            VIP candidate cards ({vipCandidates.length}{config?.vip_candidate_cap ? ` / ${config.vip_candidate_cap}` : ''})
          </p>
          <p className="text-[11px] text-white/30">
            For real, qualified entrants only — submitted an entry, signed up as an affiliate, and got at least one referral. Numbers are sequential and permanent once issued.
          </p>
          <div className="flex space-x-2">
            <input className={inputCls} placeholder="Full name" value={newVip.name}
              onChange={e => setNewVip({ ...newVip, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && issueVipCandidate()} />
            <input className={inputCls} placeholder="Their ref code (optional)" value={newVip.refCode}
              onChange={e => setNewVip({ ...newVip, refCode: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && issueVipCandidate()} />
            <button onClick={issueVipCandidate} disabled={issuingVip}
              className="px-3.5 py-2.5 rounded-lg bg-lime-400 text-black flex-shrink-0 disabled:opacity-40">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {vipCandidates.map(v => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-lime-400 mr-2">#{String(v.candidate_number).padStart(3, '0')}</span>
                  <span className="text-sm text-white">{v.name}</span>
                  {v.ref_code && <span className="text-[10px] text-white/30 ml-2">{v.ref_code}</span>}
                </div>
                <a href={`/admin/vip-card-print/${v.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.06] text-white/50 hover:bg-white/[0.1] transition flex-shrink-0">
                  Print
                </a>
              </div>
            ))}
            {vipCandidates.length === 0 && <p className="text-xs text-white/30 py-2">No candidates issued yet.</p>}
          </div>
        </div>

        {/* Entries */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wide">
              Entries ({entries.length})
              {entries.length > 0 && (
                <span className="text-white/30 font-normal normal-case ml-2">
                  {groupCount} group · {entries.length - groupCount} solo
                </span>
              )}
            </p>
            <div className="flex items-center space-x-2">
              <Link to="/schoolsessions/vote" target="_blank"
                className="text-xs text-lime-400/70 hover:text-lime-400 px-2">View voting page</Link>
              <button onClick={exportCsv} disabled={entries.length === 0}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] text-xs text-white/60 disabled:opacity-30">
                <Download className="w-3.5 h-3.5" /><span>Export CSV</span>
              </button>
            </div>
          </div>
          {entriesLoading ? (
            <Loader className="w-4 h-4 text-white/30 animate-spin" />
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {entries.map(e => (
                <div key={e.id} className={`px-3 py-2.5 rounded-lg text-xs border ${e.is_winner ? 'bg-lime-400/[0.08] border-lime-400/40' : e.is_finalist ? 'bg-lime-400/[0.04] border-lime-400/20' : 'bg-white/[0.03] border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">
                      {e.entrant_full_name}{e.is_group ? ' (Group)' : ''}
                    </span>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <button onClick={() => toggleFinalist(e)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.is_finalist ? 'bg-lime-400/20 text-lime-400' : 'bg-white/[0.06] text-white/40'}`}>
                        {e.is_finalist ? 'Finalist' : 'Mark finalist'}
                      </button>
                      <button onClick={() => toggleWinner(e)}
                        className={`flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${e.is_winner ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/40'}`}>
                        <Trophy className="w-2.5 h-2.5" /><span>{e.is_winner ? 'Winner' : 'Mark winner'}</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-white/40 mt-0.5">
                    Covering: {e.song?.title || 'No song selected'} · {e.school?.name || e.school_name_freetext || 'No school'}
                    {e.candidate_card_no ? ` · Card #${e.candidate_card_no}` : ''}
                  </p>
                  {e.is_group && e.members?.length > 0 && (
                    <p className="text-white/30 mt-0.5">
                      Members: {e.members.map(m => m.member_name).join(', ')}
                    </p>
                  )}
                  <p className="text-white/25 mt-0.5">
                    {e.entrant_email}{e.entrant_tiktok_handle ? ` · @${e.entrant_tiktok_handle} on TikTok` : ''}
                  </p>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    {e.tiktok_video_url && (
                      <a href={e.tiktok_video_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-white/50 rounded hover:text-white transition">Video link</a>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${e.tiktok_tagged_confirmed ? 'bg-lime-400/10 text-lime-400' : 'bg-red-500/10 text-red-400'}`}>
                      {e.tiktok_tagged_confirmed ? 'Tagged us' : 'Not tagged'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${e.instagram_followed_confirmed ? 'bg-lime-400/10 text-lime-400' : 'bg-red-500/10 text-red-400'}`}>
                      {e.instagram_followed_confirmed ? 'Follows IG' : 'Not following'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${e.youtube_subscribed_confirmed ? 'bg-lime-400/10 text-lime-400' : 'bg-red-500/10 text-red-400'}`}>
                      {e.youtube_subscribed_confirmed ? 'Subbed YT' : 'Not subbed'}
                    </span>
                    {e.needs_school_verification && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">School unverified</span>
                    )}
                  </div>
                </div>
              ))}
              {entries.length === 0 && <p className="text-xs text-white/30 py-2">No entries yet.</p>}
            </div>
          )}
        </div>

        {/* District nominations for next season */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold text-white/50 uppercase tracking-wide">
            Next-season district nominations ({nominations.filter(n => !n.is_approved).length} pending)
          </p>
          <p className="text-[11px] text-white/30">
            Submitted from the always-open section on the public landing page — approve to show them for voting.
          </p>
          {nominationsLoading ? (
            <Loader className="w-4 h-4 text-white/30 animate-spin" />
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {nominations.map(n => (
                <div key={n.id} className={`px-3 py-2.5 rounded-lg text-xs border ${n.is_approved ? 'bg-lime-400/[0.05] border-lime-400/20' : 'bg-white/[0.03] border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{n.district_name}</span>
                    <span className="text-white/30">Season {n.season_requested}</span>
                  </div>
                  <p className="text-white/40 mt-0.5">
                    {n.school_name || 'No school given'} · {n.submitted_by_name || 'Anonymous'}
                    {n.submitted_by_email ? ` · ${n.submitted_by_email}` : ''}
                  </p>
                  {!n.is_approved && (
                    <div className="flex space-x-2 mt-2">
                      <button onClick={() => approveNomination(n.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-lime-400 text-black text-[11px] font-bold">
                        <Check className="w-3 h-3" /><span>Approve</span>
                      </button>
                      <button onClick={() => rejectNomination(n.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.06] text-white/50 text-[11px] font-bold">
                        <X className="w-3 h-3" /><span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {nominations.length === 0 && <p className="text-xs text-white/30 py-2">No nominations yet.</p>}
            </div>
          )}
        </div>

        {saving && <p className="text-xs text-white/30 flex items-center space-x-1.5"><Loader className="w-3 h-3 animate-spin" /><span>Saving…</span></p>}
      </div>
    </div>
  );
}