import React from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTier } from '../contexts/useTier';
import useSchoolSessions from '../hooks/useSchoolSessions';
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
export default function ListenerCreateMenu({ onClose }) {
  const navigate = useNavigate();
  const { isListenerPro } = useTier();
  const sessionsGate = useSchoolSessions();
  const isPro = isListenerPro;

  // The id is passed so the two menus report in the same shape, which is the
  // only way to compare what a listener uses against what an artist uses.
  const go = (path, id) => () => { if (id) tap('menu_' + id); onClose(); navigate(path); };

  const groups = [
    {
      heading: 'Create',
      tint: MENU_TINTS.create,
      items: [
        { id: 'playlist', icon: '🎵', label: 'Create Playlist', sub: 'Start a new playlist', onClick: go('/library/playlists?create=1', 'playlist') },
      ],
    },
    {
      heading: 'Your people',
      tint: MENU_TINTS.fans,
      items: [
        { id: 'chats', icon: '💬', label: 'Chats', sub: 'Your rooms and artist chats', onClick: go('/community', 'chats') },
      ],
    },
    {
      heading: 'Your profile',
      tint: MENU_TINTS.profile,
      items: [
        { id: 'edit', icon: '✏️', label: 'Edit Profile', sub: 'Update your photo and details', onClick: go('/profile/edit', 'edit') },
      ],
    },
    {
      // SETTINGS, AND WHY IT IS NOT THE SAME ROW AS EDIT PROFILE
      //
      // /profile and /profile/edit are two different pages whose names do not
      // distinguish them. /profile/edit is the photo-and-details form in the
      // group above. /profile is the account: the theme picker, notifications
      // and the rest. Nothing in this menu pointed at it, so the only way in
      // was to already know the address — and "Edit Profile" is where people
      // looked first, which is the whole problem. Its own band, so the two
      // never read as the same thing again.
      heading: 'Account',
      tint: MENU_TINTS.account,
      items: [
        { id: 'settings', icon: '⚙️', label: 'Settings', sub: 'Theme, account and notifications', onClick: go('/profile', 'settings') },
        // EMAIL PREFERENCES, for the same reason as the artist menu.
        //
        // Somebody who wants fewer emails and cannot find the switch marks
        // the next one as spam instead, and that costs deliverability for
        // everybody. The cheapest way to keep an inbox is a visible way out
        // of it. Listeners are the bigger half of the mailing list, so this
        // matters more here than on the artist side, not less.
        { id: 'contactprefs', icon: '\u2709\uFE0F', label: 'Email preferences', sub: 'Choose what reaches your inbox', onClick: go('/contact-preferences', 'contactprefs') },
        isPro
          ? { id: 'fanpro', icon: '✨', label: 'Fan Pro Themes', sub: 'Change your app theme', onClick: go('/profile', 'fanpro') }
          : { id: 'fanpro', icon: '✨', label: 'Get Fan Pro', sub: 'Unlock themes and a supporter badge', onClick: go('/listener/upgrade', 'fanpro') },
      ],
    },
    {
      // Last, same reasoning as the artist menu: offers rather than actions.
      //
      // SESSIONS IS HERE FOR LISTENERS AS MUCH AS FOR ARTISTS.
      //
      // The Hub card is the main way in, but the Hub is not where a listener
      // spends their time and Home does not appear in the mobile nav at all.
      // The plus button does. So the one thing a listener can do in this
      // competition, vote, is reachable from the button they already use.
      //
      // Same gate as everywhere else and it fails closed, so between seasons
      // this row simply is not here — and CreateMenuSection drops a group
      // that ends up with nothing in it, so no stray heading is left behind.
      heading: 'More',
      tint: MENU_TINTS.more,
      items: [
        // YOUR LISTENING, which is the listener's version of the earnings
        // page: the screen that gives somebody a reason to come back. It was
        // only reachable by knowing the address.
        { id: 'stats', icon: '\u{1F4CA}', label: 'Your listening', sub: 'Your top songs, artists and hours', onClick: go('/listener/stats', 'stats') },
        { id: 'course', icon: '🎓', label: 'How to Use Feelz Machine', sub: 'A short course on how it all works', onClick: go('/learn', 'course') },
        ...(sessionsGate.enabled && sessionsGate.allowed && !sessionsGate.loading
          ? [{
              id: 'sessions', icon: '\u{1F3C6}', label: 'Sessions',
              sub: 'The cover competition. Listen, vote, or enter it yourself',
              onClick: go('/sessions'),
            }]
          : []),
        { id: 'affiliate', icon: '\u{1F517}', label: 'Affiliate Programme', sub: 'Share Feelz Machine and earn', onClick: go('/affiliates', 'affiliate') },
        { id: 'game', icon: '\u{1F3AE}', label: 'Feelz Games', sub: 'Feelz Run and more', onClick: go('/games', 'games') },
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
          {groups.map(({ heading, tint, items }) => (
            <CreateMenuSection key={heading} heading={heading} tint={tint} items={items} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
