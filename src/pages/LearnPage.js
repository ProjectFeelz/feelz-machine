// src/pages/LearnPage.js
//
// "How to Use Feelz Machine", for everybody rather than only for a School
// Sessions entrant.
//
// WHY IT READS THE SCHOOL SESSIONS TABLE
//
// The course is the same course. It explains recording, uploading, splits and
// getting paid, and none of that is specific to a high school competition; it
// only lived there because that is where somebody first needed it. Copying the
// fourteen links into a second table would mean two lists that drift, and the
// first time they drift is the first time an artist is taught something that
// is no longer true.
//
// So this reads course_key = 'platform' from school_course_lessons, the same
// rows the School Sessions page reads. One list, two doors. The table name is
// now narrower than what it holds, which is worth knowing when you read it,
// and is a much smaller problem than two sources of truth.
//
// WHAT IT DOES WITH NO LESSONS
//
// Falls back to the playlist URL from school_sessions_config, exactly as the
// School Sessions page does. So this page is useful the moment it ships,
// before anybody has broken the course into numbered lessons, and it gets
// better on its own when they do.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import useGoBack from '../hooks/useGoBack';
import { supabase } from '../supabaseClient';
import SchoolLessonList from '../components/SchoolLessonList';
import SchoolCourseCard from '../components/SchoolCourseCard';

export default function LearnPage() {
  const goBack = useGoBack();
  const [lessons, setLessons] = React.useState([]);
  const [playlistUrl, setPlaylistUrl] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    // Both reads in parallel and neither is allowed to break the page. A
    // course that fails to load should say so, not render a white screen on
    // a page somebody opened to be taught something.
    Promise.all([
      supabase.from('school_course_lessons')
        .select('id, title, url, duration_s')
        .eq('course_key', 'platform')
        .eq('is_active', true)
        .order('position'),
      supabase.from('school_sessions_config')
        .select('platform_course_url')
        .limit(1)
        .maybeSingle(),
    ]).then(([lessonRes, configRes]) => {
      if (cancelled) return;
      if (lessonRes.error) {
        console.warn('[learn] lessons unavailable:', lessonRes.error.code, lessonRes.error.message);
      }
      setLessons(lessonRes.data || []);
      setPlaylistUrl(configRes.data?.platform_course_url || null);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const hasSomething = lessons.length > 0 || !!playlistUrl;

  return (
    <div className="pt-4 pb-32 px-4 md:px-8 max-w-3xl mx-auto">
      <Helmet>
        <title>How to Use Feelz Machine</title>
        <meta name="description" content="A short course on recording, uploading, splitting royalties and getting paid on Feelz Machine." />
      </Helmet>

      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => goBack()} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">How to Use Feelz Machine</h1>
          <p className="text-xs text-white/30">
            Recording, uploading, splits and getting paid. Free, and you can stop anywhere.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] h-40 animate-pulse" />
      ) : lessons.length > 0 ? (
        <SchoolLessonList
          lessons={lessons}
          title="How to Use Feelz Machine"
          desc="Short lessons. Watch the one you need and skip the rest."
        />
      ) : playlistUrl ? (
        <SchoolCourseCard
          url={playlistUrl}
          vertical
          title="How to Use Feelz Machine"
          desc="Recording, uploading, splits and getting paid."
        />
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center">
          <GraduationCap className="w-10 h-10 mx-auto text-white/10 mb-3" />
          <p className="text-sm text-white/50">The course is not published yet.</p>
          <p className="text-xs text-white/25 mt-1">Check back shortly.</p>
        </div>
      )}

      {hasSomething && (
        <p className="text-xs text-white/25 mt-5 leading-relaxed">
          Nothing here is required. Upload whenever you are ready, and come back to this
          if something does not make sense.
        </p>
      )}
    </div>
  );
}