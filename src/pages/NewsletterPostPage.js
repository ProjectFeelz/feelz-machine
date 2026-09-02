// src/pages/NewsletterPostPage.js
// Public, indexable page for a single newsletter post, where "Read more"
// links from either audience's notification actually land.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, Link } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';

// Same pattern already used in ListeningSessionPage.js, copied rather than
// shared since it's a single small regex and this avoids touching a file
// that doesn't need touching.
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
function extractYouTubeId(url) {
  const m = url?.match(YOUTUBE_REGEX);
  return m ? m[1] : null;
}

export default function NewsletterPostPage() {
  const { slug } = useParams();
  const [post, setPost] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.from('newsletter_posts').select('*').eq('slug', slug).maybeSingle()
      .then(({ data }) => { setPost(data); setLoading(false); });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">
        <p className="text-sm text-white/50">This update doesn't exist or was removed.</p>
      </div>
    );
  }

  const ytId = extractYouTubeId(post.youtube_url);

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>{post.title}, Feelz Machine</title>
        <meta name="description" content={post.excerpt} />
      </Helmet>
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-24">
        <Link to="/" className="text-xs text-white/30 hover:text-white/60">&larr; Feelz Machine</Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-2">{post.title}</h1>
        <p className="text-xs text-white/30 mb-8">{new Date(post.created_at).toLocaleDateString()}</p>
        {ytId && (
          <div className="mb-6 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
            <iframe
              width="100%" height="100%"
              src={`https://www.youtube.com/embed/${ytId}`}
              title="YouTube video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        <div
          className="text-white/80 text-sm leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white [&_h3]:mt-4 [&_h3]:mb-1.5 [&_p]:mb-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_strong]:text-white [&_strong]:font-bold"
          dangerouslySetInnerHTML={{ __html: post.body }}
        />
      </div>
    </div>
  );
}