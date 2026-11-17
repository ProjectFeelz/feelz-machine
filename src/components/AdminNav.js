// src/components/AdminNav.js
//
// ONE SHELL OVER TWENTY-SIX ADMIN PAGES.
//
//
// WHAT THIS SOLVES
//
// Admin is 26 separate pages with no shared anything. Every one re-implements
// its own header and back button, and moving between them means going back to
// a hub and picking again. It does not read as one product, it reads as 26
// tools that happen to share a login.
//
//
// WHY IT IS NOT A LAYOUT ROUTE, WHICH IS THE TEXTBOOK ANSWER
//
// The textbook fix is a pathless layout route: nest all 26 Routes inside one
// <Route element={<AdminShell/>}> and render an <Outlet/>. That is cleaner on
// paper and I am deliberately not doing it.
//
// Those 26 routes are not together. They sit in three separate blocks of
// AppRouter.js, inside different wrappers, and one of them (vip-card-print) is
// outside the authenticated area on purpose because it is a print view.
// Nesting them means cutting route lines out of three places and reassembling
// them under a new parent, which risks changing which guard a page sits behind
// without that showing up in any test.
//
// AppRouter.js has already silently lost seventy lines once this week. It is
// the wrong file to be clever in.
//
// So this renders ABOVE the routes, in normal flow, and shows itself only on
// an /admin path. No route moves, no guard changes, nothing can fall out of
// the authenticated area. If it is ever wrong, deleting one line removes it
// completely. The day somebody wants to restructure those routes properly,
// this becomes an AdminShell with an Outlet and almost nothing else changes.
//
//
// GROUPED, BECAUSE A FLAT LIST OF 26 IS A LIST YOU HAVE TO ALREADY KNOW
//
// Five groups, named for what you are trying to do rather than for how the
// code is organised. Money first because it is what gets opened under
// pressure.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Banknote, Users, LayoutGrid, Activity, Trophy, ChevronDown,
} from 'lucide-react';

// Every entry here is a route that exists in AppRouter today. A nav that
// offers a dead link is worse than a nav that is missing one, so nothing
// speculative goes in this list.
// WHY SOME OF THESE POINT AT A WRAPPER AND SOME DO NOT
//
// Three of these pages are not pages. AdminContent, AdminGrowth and
// AdminIntelligence query nothing at all: they are tab shells that render
// other admin pages with an `embedded` prop. Content holds Boost,
// Competitions, Sessions and Moderation. Growth holds Broadcasts and
// Affiliates. Intelligence holds Analytics.
//
// Every one of those children is ALSO routed on its own, so most of admin
// currently has two doors. The first version of this nav pointed at the
// children, which would have made that worse by advertising both.
//
// So where a wrapper exists, the nav sends you to the wrapper and names the
// tab. Content reads ?tab= already. Growth and Intelligence now do too, which
// is why those links carry one. One door each.
const GROUPS = [
  {
    name: 'Money',
    icon: Banknote,
    items: [
      ['Platform stats',   '/admin/intelligence'],          // wraps Analytics
      ['Affiliates',       '/admin/growth?tab=affiliates'],  // wraps Affiliates
      ['Deals',            '/admin/deals'],
      ['Retail',           '/admin/retail'],
    ],
  },
  {
    name: 'People',
    icon: Users,
    items: [
      ['Everyone',          '/admin/people'],
      ['Artists',           '/admin/artists'],
      ['Behaviour',         '/admin/behavior'],
      ['Duplicates',        '/admin/duplicates'],
      ['Personas',          '/admin/personas'],
      ['Guardian consents', '/admin/guardian-consents'],
      ['Moderation',        '/admin/content?tab=moderation'],
    ],
  },
  {
    name: 'Content',
    icon: LayoutGrid,
    items: [
      ['Boost',       '/admin/content?tab=boost'],
      ['Feed',        '/admin/feed'],
      ['News',        '/admin/news'],
      ['Home hero',   '/admin/home-hero'],
      ['Cold start',  '/admin/cold-start'],
      ['Broadcast',   '/admin/growth?tab=broadcast'],
    ],
  },
  {
    name: 'Platform',
    icon: Activity,
    items: [
      ['How it is used', '/admin/app-usage'],
      ['Engagement',     '/admin/engagement'],
    ],
  },
  {
    // Not "Competitions". Collab Roulette moved to Plugin Gallery and both of
    // its crons are commented out in netlify.toml, so the only competition
    // this platform still runs is Sessions. The wheel screens are still
    // routed and still reachable by URL, they are just not advertised here.
    name: 'Sessions',
    icon: Trophy,
    items: [
      ['Run the competition', '/admin/school-sessions'],
    ],
  },
];

export default function AdminNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [openGroup, setOpenGroup] = useState(null);
  // Where the open menu's button is on screen. The bar scrolls sideways, and a
  // scrolling box clips anything that hangs out of it, which is what cut the
  // menus off. So the open menu is drawn on document.body at the button's
  // position instead of inside the bar.
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    if (!openGroup) return undefined;
    const close = () => setOpenGroup(null);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [openGroup]);

  // The print view is deliberately chrome-free: it exists to come out of a
  // printer, and a nav bar across the top of a VIP card is not wanted.
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPrint = pathname.startsWith('/admin/vip-card-print');
  if (!isAdminPath || isPrint || !isAdmin) return null;

  const go = (to) => { setOpenGroup(null); navigate(to); };
  // Links now carry ?tab=, and pathname never does, so the comparison has to
  // drop the query before matching or nothing would ever highlight.
  const here = (to) => pathname === to.split('?')[0];

  // Which group holds the page you are on, so the bar can say where you are
  // without you having to work it out from the heading.
  const currentGroup = GROUPS.find(g => g.items.some(([, to]) => here(to)));

  // pt-14 md:pt-0, and sticky only from md up.
  //
  // On a phone this app has a fixed header strip at z-[60] holding the streak
  // badge, the bell and the avatar, and <main> starts underneath it at y=0.
  // Every page in here clears it with pt-14, and this bar was not, which is
  // why it rendered behind those icons.
  //
  // Pinned on desktop, where there is no floating header to collide with. On a
  // phone it scrolls away with the page, which costs nothing and removes any
  // question of what overlaps what on the way down.
  return (
    <div className="pt-14 md:pt-0 md:sticky md:top-0 z-40 bg-black/95 backdrop-blur border-b border-white/[0.08]">
      <div className="max-w-[1600px] mx-auto px-4">

        {/* The bar. Horizontal and scrollable so it behaves the same on a
            phone as on a desktop, with the scrollbar hidden per house rule. */}
        <div
          className="flex items-center gap-1 overflow-x-auto py-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`.admin-nav-bar::-webkit-scrollbar{display:none}`}</style>

          <button
            onClick={() => go('/admin')}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition
              ${here('/admin')
                ? 'bg-lime-400 text-black'
                : 'text-white/50 hover:text-white hover:bg-white/[0.06]'}`}>
            ADMIN
          </button>

          <div className="w-px h-5 bg-white/10 flex-shrink-0 mx-1" />

          {GROUPS.map(group => {
            const Icon = group.icon;
            const isOpen = openGroup === group.name;
            const isCurrent = currentGroup?.name === group.name;
            return (
              <div key={group.name} className="relative flex-shrink-0">
                <button
                  onClick={(e) => {
                    if (isOpen) { setOpenGroup(null); return; }
                    const r = e.currentTarget.getBoundingClientRect();
                    setAnchor({ left: r.left, top: r.bottom + 4 });
                    setOpenGroup(group.name);
                  }}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition
                    ${isCurrent
                      ? 'bg-white/[0.1] text-white'
                      : 'text-white/45 hover:text-white hover:bg-white/[0.06]'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{group.name}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && anchor && createPortal(
                  <>
                    {/* Catches the next click anywhere so the menu closes the
                        way every other menu does. */}
                    <div className="fixed inset-0 z-[690]" onClick={() => setOpenGroup(null)} />
                    <div className="fixed z-[700] min-w-[190px] rounded-xl border border-white/[0.1] bg-[#0b0b0f] shadow-2xl overflow-hidden"
                      style={{ left: Math.max(8, Math.min(anchor.left, window.innerWidth - 206)), top: anchor.top }}>
                      {group.items.map(([label, to]) => (
                        <button
                          key={to}
                          onClick={() => go(to)}
                          className={`w-full text-left px-3.5 py-2.5 text-xs transition
                            ${here(to)
                              ? 'bg-lime-400/10 text-lime-300 font-semibold'
                              : 'text-white/60 hover:bg-white/[0.06] hover:text-white'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
