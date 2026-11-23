import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, Trophy, Radio, ListMusic, MessagesSquare, BarChart3, Link, Pencil, Settings, Sparkles, Inbox, GraduationCap, User,
} from 'lucide-react';
import { useTier } from '../contexts/useTier';
import useSchoolSessions from '../hooks/useSchoolSessions';
import useLiveStreams, { liveStreamsLine } from '../hooks/useLiveStreams';
import { tap } from '../utils/track';
import CreateMenuSection, { MENU_TINTS } from './CreateMenuSection';

// Listener equivalent of CreateMenuModal — same exact wrapper dimensions
// and portal approach, different (listener-relevant) options inside.
//
// GROUPED, AND IN THE SAME COLOURS AS THE ARTIST MENU
//
// Both menus were a single stack of identical rows, so finding anything meant
// reading all of them. They are now in the same five bands, with the same
// hues, stepping down the sheet as one gradient — so a listener who later
// starts uploading does not have to relearn where things live. The rows
// themselves come from CreateMenuSection, which is why a change to the look
// cannot land in one menu and miss the other.
// Groups that are always open: what's running right now, and making something.
const ALWAYS_OPEN = ['Happening now', 'Create'];

export default function ListenerCreateMenu({ onClose }) {
  const navigate = useNavigate();
  const { isListenerPro } = useTier();
  const sessionsGate = useSchoolSessions();
  const liveNow = useLiveStreams();
  const isPro = isListenerPro;
  // Which folded group is open (one at a time); Create and Happening now never fold.
  const [openGroup, setOpenGroup] = useState(null);

  // The id is passed so the two menus report in the same shape, which is the
  // only way to compare what a listener uses against what an artist uses.
  const go = (path, id) => () => { if (id) tap('menu_' + id); onClose(); navigate(path); };

  // ORDERED BY WHAT LISTENERS USE MOST (app_events, menu_* taps): whatever is
  // running right now first, then making playlists and your people, then your
  // listening and earning, profile and account, and help last.
  const groups = [
    // Watch live is always here, so the Live page can be found on a phone
    // when nobody is streaming.
    { heading: 'Happening now', icon: Trophy, tint: MENU_TINTS.now, items: [
        ...(sessionsGate.enabled && sessionsGate.allowed && !sessionsGate.loading
          ? [{
              id: 'sessions', icon: Trophy, label: 'Sessions',
              sub: 'The cover competition. Listen, vote, or enter it yourself',
              onClick: go('/sessions', 'sessions'),
            }]
          : []),
        { id: 'live_streams', icon: Radio, label: 'Watch live', sub: liveStreamsLine(liveNow) || 'Streams, replays and what is coming up', onClick: go('/live', 'live_streams') },
      ] },
    {
      heading: 'Create',
      icon: ListMusic,
      tint: MENU_TINTS.create,
      items: [
        { id: 'playlist', icon: ListMusic, label: 'Create Playlist', sub: 'Start a new playlist', onClick: go('/library/playlists?create=1', 'playlist') },
      ],
    },
    {
      heading: 'Your people',
      icon: MessagesSquare,
      tint: MENU_TINTS.fans,
      items: [
        { id: 'chats', icon: MessagesSquare, label: 'Chat Rooms', sub: 'Your rooms and artist chats', onClick: go('/community', 'chats') },
      ],
    },
    {
      heading: 'You and Feelz Machine',
      icon: BarChart3,
      tint: MENU_TINTS.money,
      items: [
        { id: 'stats', icon: BarChart3, label: 'Your listening', sub: 'Your top songs, artists and hours', onClick: go('/listener/stats', 'stats') },
        // The Earn tab gave its place in the bottom bar to Games, so this is the way in now.
        { id: 'affiliate', icon: Link, label: 'Affiliate Programme', sub: 'Share Feelz Machine and earn', onClick: go('/affiliates', 'affiliate') },
      ],
    },
    {
      heading: 'Your profile',
      icon: User,
      tint: MENU_TINTS.profile,
      items: [
        { id: 'edit', icon: Pencil, label: 'Edit Profile', sub: 'Update your photo and details', onClick: go('/profile/edit', 'edit') },
      ],
    },
    {
      heading: 'Account',
      icon: Settings,
      tint: MENU_TINTS.account,
      items: [
        { id: 'settings', icon: Settings, label: 'Settings', sub: 'Theme, account and notifications', onClick: go('/profile', 'settings') },
        isPro
          ? { id: 'fanpro', icon: Sparkles, label: 'Fan Pro Themes', sub: 'Change your app theme', onClick: go('/profile', 'fanpro') }
          : { id: 'fanpro', icon: Sparkles, label: 'Get Fan Pro', sub: 'Unlock themes and a supporter badge', onClick: go('/listener/upgrade', 'fanpro') },
        { id: 'contactprefs', icon: Inbox, label: 'Email preferences', sub: 'Choose what reaches your inbox', onClick: go('/contact-preferences', 'contactprefs') },
      ],
    },
    {
      heading: 'Help',
      icon: GraduationCap,
      tint: MENU_TINTS.more,
      items: [
        { id: 'course', icon: GraduationCap, label: 'How to Use Feelz Machine', sub: 'A short course on how it all works', onClick: go('/learn', 'course') },
      ],
    },
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
          {groups.map(({ heading, icon, tint, items }) => (
            <CreateMenuSection key={heading} heading={heading} icon={icon} tint={tint} items={items}
              collapsible={!ALWAYS_OPEN.includes(heading)}
              open={openGroup === heading}
              onToggle={() => setOpenGroup(g => (g === heading ? null : heading))} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
