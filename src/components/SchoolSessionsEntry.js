// src/components/SchoolSessionsEntry.js
// Toggle + form shown inside the main track upload flow. Renders nothing at
// all — not just hidden — unless School Sessions is switched on AND this
// visitor passes the region/school gate, so people not taking part never
// see it in the page source.
//
// Entrants submit a vocal performance/cover over one of a shortlisted set
// of songs, solo or as a group (the R5,000 student prize splits across
// group members if they win).

import React, { useState, useEffect } from 'react';
import { GraduationCap, Plus, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import useSchoolSessions from '../hooks/useSchoolSessions';

// All confirmed real. feelz.machineza is the main channel (required);
// sfmza is Steve's personal channel, mentioned as an optional extra for
// session-specific updates that won't necessarily post on the main one.
const OFFICIAL_TIKTOK_HANDLE = 'feelzmachine';
const OFFICIAL_YOUTUBE_HANDLE = 'feelz.machineza';
const PERSONAL_YOUTUBE_HANDLE = 'sfmza';

const BLANK_FORM = {
  schoolId: '',
  schoolFreeText: '',
  songId: '',
  isGroup: false,
  groupMembers: [''],
  candidateCardNo: '',
  verificationCode: '',
  entrantFullName: '',
  entrantEmail: '',
  tiktokHandle: '',
  tiktokVideoUrl: '',
  tiktokTaggedConfirmed: false,
  youtubeSubscribedConfirmed: false,
  isMinor: true,
  guardianName: '',
  guardianContact: '',
  guardianRelationship: '',
  guardianConsented: false,
};

function Toggle({ value, onChange }) {
  return (
    <div
      className={`w-8 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer ${value ? 'bg-lime-400' : 'bg-white/10'}`}
      onClick={onChange}>
      <div className={`w-4 h-4 rounded-full transition-transform ${value ? 'translate-x-3 bg-black' : 'translate-x-0 bg-white/30'}`} />
    </div>
  );
}

function Label({ children }) {
  return <label className="block text-xs text-white/40 mb-1.5">{children}</label>;
}

function Input(props) {
  return (
    <input {...props}
      className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition" />
  );
}

// exported so the upload panel can validate before submit and build the
// insert payload without re-deriving this logic
export function schoolSessionsFormValid(enabled, form) {
  if (!enabled) return true;
  if (!form.entrantFullName.trim()) return false;
  if (!form.verificationCode.trim()) return false;
  if (!/^\S+@\S+\.\S+$/.test(form.entrantEmail.trim())) return false;
  if (!form.tiktokHandle.trim()) return false;
  if (!form.tiktokVideoUrl.trim()) return false;
  if (!form.tiktokTaggedConfirmed) return false;
  if (!form.youtubeSubscribedConfirmed) return false;
  if (!form.schoolId && !form.schoolFreeText.trim()) return false;
  if (!form.songId) return false;
  if (form.isGroup && form.groupMembers.filter(m => m.trim()).length === 0) return false;
  if (form.isMinor) {
    if (!form.guardianName.trim() || !form.guardianContact.trim() || !form.guardianConsented) return false;
  }
  return true;
}

export { BLANK_FORM as SCHOOL_SESSIONS_BLANK_FORM };

export default function SchoolSessionsEntry({ enabled, setEnabled, form, setForm }) {
  const gate = useSchoolSessions();
  const [schools, setSchools] = useState([]);
  const [schoolNotListed, setSchoolNotListed] = useState(false);
  const [songs, setSongs] = useState([]);

  useEffect(() => {
    if (!gate.allowed) return;
    supabase.from('school_sessions_schools')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setSchools(data || []));

    const compId = gate.config?.competition?.id;
    if (compId) {
      supabase.from('school_sessions_shortlist_songs')
        .select('id, title, reference_url, reference_track:tracks(slug)')
        .eq('competition_id', compId)
        .eq('is_active', true)
        .order('display_order')
        .then(({ data }) => setSongs(data || []));
    }
  }, [gate.allowed, gate.config?.competition?.id]);

  const set = (key, value) => setForm({ ...form, [key]: value });

  const setMember = (i, value) => {
    const next = [...form.groupMembers];
    next[i] = value;
    set('groupMembers', next);
  };
  const addMember = () => set('groupMembers', [...form.groupMembers, '']);
  const removeMember = (i) => set('groupMembers', form.groupMembers.filter((_, idx) => idx !== i));

  // Nothing to see here — literally nothing rendered — if it's off or this
  // visitor doesn't pass the gate.
  if (gate.loading || !gate.enabled || !gate.allowed) return null;

  const comp = gate.config?.competition;

  return (
    <div className="rounded-lg border border-lime-400/20 bg-lime-400/[0.04] overflow-hidden">
      <label className="flex items-center justify-between p-4 cursor-pointer">
        <div className="flex items-center space-x-2.5">
          <GraduationCap className="w-4 h-4 text-lime-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Enter into {comp?.title || 'School Sessions'}</p>
            <p className="text-[11px] text-white/40 mt-0.5">
              {comp?.prize_description || 'R10,000 CASH'}
            </p>
          </div>
        </div>
        <Toggle value={enabled} onChange={() => setEnabled(!enabled)} />
      </label>

      {enabled && (
        <div className="p-4 pt-0 space-y-3.5 border-t border-lime-400/10">
          <div>
            <Label>Which song are you covering?</Label>
            <select value={form.songId}
              onChange={e => set('songId', e.target.value)}
              className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
              <option value="">Select a song from the shortlist…</option>
              {songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            {songs.length === 0 && (
              <p className="text-[11px] text-white/30 mt-1">Shortlist isn't loaded yet — check back shortly.</p>
            )}
            {(() => {
              const selected = songs.find(s => s.id === form.songId);
              if (!selected) return null;
              const href = selected.reference_track?.slug ? `/track/${selected.reference_track.slug}` : selected.reference_url;
              if (!href) return null;
              return (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-lime-400/70 mt-1 inline-block">Listen to the original (opens in a new tab)</a>
              );
            })()}
          </div>

          <div>
            <Label>Verification code</Label>
            <Input value={form.verificationCode}
              onChange={e => set('verificationCode', e.target.value.toUpperCase())}
              placeholder="From the introduction event or school reception" />
            <p className="text-[11px] text-white/30 mt-1">
              Handed out in person, not by email — ask at school reception if you missed the introduction.
            </p>
          </div>

          <div>
            <Label>Entrant's full name</Label>
            <Input value={form.entrantFullName}
              onChange={e => set('entrantFullName', e.target.value)}
              placeholder="As it should appear if they win" />
          </div>

          <div>
            <Label>Entrant's email</Label>
            <Input type="email" value={form.entrantEmail}
              onChange={e => set('entrantEmail', e.target.value)}
              placeholder="For prize/finalist notifications" />
          </div>

          <div>
            <Label>TikTok handle</Label>
            <Input value={form.tiktokHandle}
              onChange={e => set('tiktokHandle', e.target.value.replace(/^@/, ''))}
              placeholder="username (without the @)" />
            <p className="text-[11px] text-white/30 mt-1">
              Part of entering — post about your cover. Judges pick the winner; the public vote adds a People's Choice pick.
            </p>
          </div>

          <div>
            <Label>Link to your TikTok video</Label>
            <Input value={form.tiktokVideoUrl}
              onChange={e => set('tiktokVideoUrl', e.target.value)}
              placeholder="Paste the link to your posted video" />
            <p className="text-[11px] text-white/30 mt-1">
              Post a video of your cover to TikTok and paste the link here — this is how we track and verify real entries.
            </p>
          </div>

          <label className="flex items-start space-x-2.5 cursor-pointer">
            <input type="checkbox" checked={form.tiktokTaggedConfirmed}
              onChange={e => set('tiktokTaggedConfirmed', e.target.checked)}
              className="mt-0.5 rounded border-white/20" />
            <span className="text-xs text-white/60">
              I tagged <span className="text-lime-400 font-semibold">@{OFFICIAL_TIKTOK_HANDLE}</span> in my TikTok post.
            </span>
          </label>

          <label className="flex items-start space-x-2.5 cursor-pointer">
            <input type="checkbox" checked={form.youtubeSubscribedConfirmed}
              onChange={e => set('youtubeSubscribedConfirmed', e.target.checked)}
              className="mt-0.5 rounded border-white/20" />
            <span className="text-xs text-white/60">
              I'm subscribed to <span className="text-lime-400 font-semibold">youtube.com/@{OFFICIAL_YOUTUBE_HANDLE}</span> to follow the journey. For session-specific updates that don't always make the main channel, you can also subscribe to <span className="text-lime-400 font-semibold">youtube.com/@{PERSONAL_YOUTUBE_HANDLE}</span>.
            </span>
          </label>

          <div>
            <Label>School</Label>
            {!schoolNotListed ? (
              <div className="space-y-1.5">
                <select value={form.schoolId}
                  onChange={e => set('schoolId', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none">
                  <option value="">Select school…</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" onClick={() => { setSchoolNotListed(true); set('schoolId', ''); }}
                  className="text-[11px] text-lime-400/70 hover:text-lime-400">
                  My school isn't listed
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Input value={form.schoolFreeText}
                  onChange={e => set('schoolFreeText', e.target.value)}
                  placeholder="Type your school's name" />
                <button type="button" onClick={() => { setSchoolNotListed(false); set('schoolFreeText', ''); }}
                  className="text-[11px] text-white/30 hover:text-white/50">
                  Pick from list instead
                </button>
              </div>
            )}
          </div>

          <div>
            <Label>Entering solo or as a group?</Label>
            <div className="flex space-x-2">
              {[[false, 'Solo'], [true, 'Group']].map(([val, lbl]) => (
                <button key={lbl} type="button" onClick={() => set('isGroup', val)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition ${
                    form.isGroup === val ? 'bg-lime-400 text-black' : 'bg-white/[0.06] text-white/50'
                  }`}>{lbl}</button>
              ))}
            </div>
            <p className="text-[11px] text-white/30 mt-1">
              If your group wins, the R5,000 student prize splits evenly across everyone listed below.
            </p>
          </div>

          {form.isGroup && (
            <div className="space-y-2">
              <Label>Group members</Label>
              {form.groupMembers.map((m, i) => (
                <div key={i} className="flex space-x-2">
                  <Input value={m} onChange={e => setMember(i, e.target.value)}
                    placeholder={`Member ${i + 1} name`} />
                  {form.groupMembers.length > 1 && (
                    <button type="button" onClick={() => removeMember(i)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/[0.06] text-white/40 flex-shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addMember}
                className="flex items-center space-x-1 text-[11px] text-lime-400/70 hover:text-lime-400">
                <Plus className="w-3 h-3" /><span>Add member</span>
              </button>
            </div>
          )}

          <div>
            <Label>Candidate card number <span className="text-white/20">(optional)</span></Label>
            <Input value={form.candidateCardNo}
              onChange={e => set('candidateCardNo', e.target.value)}
              placeholder="No. from your entry card, if you have one" />
          </div>

          <div className="flex items-center space-x-2.5 pt-1">
            <Toggle value={form.isMinor} onChange={() => set('isMinor', !form.isMinor)} />
            <span className="text-xs text-white/50">Entrant is under 18</span>
          </div>

          {form.isMinor && (
            <div className="space-y-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              <p className="text-[11px] text-white/40">
                Required for entrants under 18 — this stays private and is never shown publicly.
              </p>
              <div>
                <Label>Parent/guardian name</Label>
                <Input value={form.guardianName} onChange={e => set('guardianName', e.target.value)} />
              </div>
              <div>
                <Label>Parent/guardian phone or email</Label>
                <Input value={form.guardianContact} onChange={e => set('guardianContact', e.target.value)} />
              </div>
              <div>
                <Label>Relationship <span className="text-white/20">(optional)</span></Label>
                <Input value={form.guardianRelationship} onChange={e => set('guardianRelationship', e.target.value)}
                  placeholder="e.g. Mother, Father, Legal guardian" />
              </div>
              <label className="flex items-start space-x-2.5 cursor-pointer pt-1">
                <input type="checkbox" checked={form.guardianConsented}
                  onChange={() => set('guardianConsented', !form.guardianConsented)}
                  className="mt-0.5 rounded border-white/20" />
                <span className="text-[11px] text-white/50">
                  I confirm I have my parent/guardian's permission to enter this competition and to be contacted about it.
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}