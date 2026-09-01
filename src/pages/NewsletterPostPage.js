// src/pages/NewsletterPostPage.js
// Public, indexable page for a single newsletter post — where "Read more"
// links from either audience's notification actually land.

import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, Link } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';

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

  return (
    <div className="min-h-screen bg-black text-white">
      <Helmet>
        <title>{post.title} — Feelz Machine</title>
        <meta name="description" content={post.excerpt} />
      </Helmet>
      <div className="max-w-xl mx-auto px-5 pt-10 pb-24">
        <Link to="/" className="text-xs text-white/30 hover:text-white/60">&larr; Feelz Machine</Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-2">{post.title}</h1>
        <p className="text-xs text-white/30 mb-8">{new Date(post.created_at).toLocaleDateString()}</p>
        <div className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</div>
      </div>
    </div>
  );
}