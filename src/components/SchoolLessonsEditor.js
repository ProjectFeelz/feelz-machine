// src/components/SchoolLessonsEditor.js
//
// Adding, ordering and removing the lessons in a School Sessions course.
//
// BUILT AROUND PASTING, BECAUSE THAT IS THE REAL JOB
//
// Fourteen shorts means fourteen trips between YouTube and this panel, and a
// form that takes one link at a time turns a ten minute job into an evening.
// So the box takes a whole list at once, one URL per line, and pulls a title
// off each line if there is one after the link. Paste fourteen lines, press
// add, done.
//
// It also accepts a line copied straight out of YouTube with nothing tidied
// up, because that is what actually ends up on the clipboard.
//
// ORDER IS RENUMBERED SERVER SIDE
//
// Moving lesson 5 above lesson 4 by writing position = 4 from here leaves two
// rows at 4 and the order then depends on what the database feels like
// returning. reorder_school_lessons renumbers the whole course in one
// statement instead. See migration 207.

import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { isYouTube } from '../utils/youtube';

const inputCls = 'w-full px-3 py-2.5 bg-white/[0.06] rounded-lg text-white text-sm outline-none focus:bg-white/[0.1] transition';

// One line in, one lesson out. The title is whatever follows the URL, after
// any dash or pipe somebody used to separate them; failing that the lesson is
// numbered and can be renamed in place.
function parseLine(line, index) {
  const text = String(line || '').trim();
  if (!text) return null;

  const m = text.match(/https?:\/\/\S+/);
  if (!m) return null;

  const url  = m[0];
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + url.length))
    // The dashes in these two character classes are separators somebody might
    // have typed between a link and its title. They are matched, not written
    // by us, so they stay.
    .replace(/^[\s\-–—|.)\]]+/, '')
    .replace(/[\s\-–—|]+$/, '')
    .trim();

  return { url, title: rest || `Lesson ${index + 1}` };
}

export default function SchoolLessonsEditor({ courseKey, label }) {
  const [rows, setRows]   = React.useState([]);
  const [bulk, setBulk]   = React.useState('');
  const [busy, setBusy]   = React.useState(false);
  const [note, setNote]   = React.useState('');
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    const { data, error } = await supabase
      .from('school_course_lessons')
      .select('id, position, title, url, duration_s, is_active')
      .eq('course_key', courseKey)
      .order('position');
    if (error) { setNote('Could not read lessons: ' + error.message); setLoaded(true); return; }
    setRows(data || []);
    setLoaded(true);
  }, [courseKey]);

  React.useEffect(() => { load(); }, [load]);

  const addBulk = async () => {
    const parsed = bulk.split('\n').map(parseLine).filter(Boolean);
    if (parsed.length === 0) { setNote('No links found. One URL per line.'); return; }

    setBusy(true); setNote('');
    const base = rows.length;
    const { error } = await supabase.from('school_course_lessons').insert(
      parsed.map((p, i) => ({
        course_key: courseKey,
        position:   base + i,
        title:      p.title.slice(0, 200),
        url:        p.url,
      }))
    );
    setBusy(false);
    if (error) { setNote('Could not add: ' + error.message); return; }
    setBulk('');
    setNote(`Added ${parsed.length} ${parsed.length === 1 ? 'lesson' : 'lessons'}.`);
    load();
  };

  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);                       // move on screen straight away
    const { error } = await supabase.rpc('reorder_school_lessons', {
      p_course_key: courseKey,
      p_ids: next.map(r => r.id),
    });
    if (error) { setNote('Could not save the order: ' + error.message); load(); }
  };

  const rename = async (row, title) => {
    const clean = title.trim().slice(0, 200);
    if (!clean || clean === row.title) return;
    const { error } = await supabase.from('school_course_lessons')
      .update({ title: clean }).eq('id', row.id);
    if (error) setNote('Could not rename: ' + error.message);
  };

  const remove = async (row) => {
    // A lesson is a link, not somebody's work, so this is a real delete rather
    // than a hidden flag. Confirmed because fourteen rows of small buttons on
    // a laptop trackpad is exactly where a misclick happens.
    if (!window.confirm(`Remove "${row.title}" from this course?`)) return;
    const { error } = await supabase.from('school_course_lessons').delete().eq('id', row.id);
    if (error) { setNote('Could not remove: ' + error.message); return; }
    load();
  };

  const notYouTube = rows.filter(r => !isYouTube(r.url)).length;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 mt-3">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-bold text-white/50 uppercase tracking-wide">{label}</p>
        <p className="text-xs text-white/30">
          {loaded ? `${rows.length} ${rows.length === 1 ? 'lesson' : 'lessons'}` : ''}
        </p>
      </div>
      <p className="text-xs text-white/30 mb-3">
        With lessons here, the page shows a numbered list instead of the playlist box above.
        Leave it empty and the playlist is used exactly as before.
      </p>

      {note && <p className="text-xs text-white/50 mb-3">{note}</p>}

      <textarea
        className={`${inputCls} h-28 font-mono text-xs`}
        placeholder={'One link per line. Anything after the link becomes its title:\nhttps://youtube.com/shorts/xxxx  Uploading your first song\nhttps://youtube.com/shorts/yyyy  Splitting royalties with a feature'}
        value={bulk}
        onChange={e => setBulk(e.target.value)}
      />
      <button onClick={addBulk} disabled={busy || !bulk.trim()}
        className="mt-2 px-3.5 py-2 rounded-lg bg-white/[0.08] text-white text-xs font-semibold hover:bg-white/[0.14] transition disabled:opacity-30 flex items-center gap-1.5">
        {busy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add these
      </button>

      {notYouTube > 0 && (
        <p className="text-[11px] text-amber-200/60 mt-2">
          {notYouTube} {notYouTube === 1 ? 'link is' : 'links are'} not YouTube, so {notYouTube === 1 ? 'it opens' : 'they open'} in a new tab instead of playing in place.
        </p>
      )}

      {rows.length > 0 && (
        <ol className="mt-4 space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <span className="w-5 text-[11px] text-white/30 font-mono tabular-nums flex-shrink-0">{i + 1}</span>
              <input
                className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none"
                defaultValue={r.title}
                onBlur={e => rename(r, e.target.value)}
              />
              <span className="text-[10px] text-white/20 truncate max-w-[140px] hidden lg:block">{r.url}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-white/[0.05] hover:bg-white/[0.12] transition disabled:opacity-20 flex-shrink-0">
                <ArrowUp className="w-3 h-3 text-white/60" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-white/[0.05] hover:bg-white/[0.12] transition disabled:opacity-20 flex-shrink-0">
                <ArrowDown className="w-3 h-3 text-white/60" />
              </button>
              <button onClick={() => remove(r)}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-white/[0.05] hover:bg-red-500/20 transition flex-shrink-0">
                <Trash2 className="w-3 h-3 text-white/40" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}