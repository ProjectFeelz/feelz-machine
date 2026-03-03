import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function AlbumCard({ album }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/album/${album.slug || album.id}`)}
      className="cursor-pointer group"
    >
      <div className="aspect-square rounded-lg overflow-hidden bg-white/[0.06] mb-2.5">
        {album.cover_artwork_url ? (
          <img
            src={album.cover_artwork_url}
            alt={album.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5">
            <span className="text-3xl text-white/20">&#9835;</span>
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-white truncate">{album.title}</p>
      <p className="text-xs text-white/40 truncate mt-0.5">
        {album.artist_name || 'Unknown Artist'}
      </p>
    </div>
  );
}
