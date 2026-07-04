import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ListMusic, User, Sparkles } from 'lucide-react';
import { useTier } from '../contexts/useTier';

// Listener equivalent of CreateMenuModal — same exact wrapper dimensions
// and portal approach, different (listener-relevant) options inside.
export default function ListenerCreateMenu({ onClose }) {
  const navigate = useNavigate();
  const { isListenerPro } = useTier();
  const isPro = isListenerPro;

  const options = [
    { id: 'playlist', icon: '🎵', label: 'Create Playlist', sub: 'Start a new playlist', action: () => { onClose(); navigate('/library/playlists?create=1'); } },
    { id: 'edit',     icon: '✏️', label: 'Edit Profile',    sub: 'Update your photo and details', action: () => { onClose(); navigate('/profile/edit'); } },
    isPro
      ? { id: 'fanpro', icon: '✨', label: 'Fan Pro Themes', sub: 'Change your app theme',        action: () => { onClose(); navigate('/profile'); } }
      : { id: 'fanpro', icon: '✨', label: 'Get Fan Pro',    sub: 'Unlock themes and a supporter badge', action: () => { onClose(); navigate('/listener/upgrade'); } },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm md:pl-64"
      onClick={onClose}>
      <div className="w-full overflow-y-auto overflow-x-hidden rounded-3xl"
        style={{ maxWidth: 360, maxHeight: '85vh', backgroundColor: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <p className="text-sm font-bold text-white">Create</p>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] transition">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {options.map(({ id, icon, label, sub, action }) => (
            <button key={id} onClick={action}
              className="w-full flex items-center space-x-3 p-4 rounded-2xl border transition active:scale-[0.98] text-left"
              style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-white/30 mt-0.5">{sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}