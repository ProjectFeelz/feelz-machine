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

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Banknote, Users, LayoutGrid, Activity, Trophy, ChevronDown,
} from 'lucide-react';

// Every entry here is a route that exists in AppRouter today. A nav that
// offers a dead link is worse than a nav that is missing one, so nothing
// speculative goes in this list.
const GROUPS = [
  {
    name: 'Money',
    icon: Banknote,
    items: [
      ['Analytics',        '/admin/analytics'],
      ['Affiliates',       '/admin/affiliates'],
      ['Deals',            '/admin/deals'],
      ['Retail',           '/admin/retail'],
      ['Retail staff',     '/admin/retail-staff'],
    ],
  },
  {
    name: 'People',
    icon: Users,
    items: [
      ['Everyone',          '/admin/people'],
      ['Artists',           '/admin/artists'],
      ['Behaviour',         '/admin/behavior'],
      ['Personas',          '/admin/personas'],
      ['Guardian consents', '/admin/guardian-consents'],
      ['Moderation',        '/admin/moderation'],
    ],
  },
  {
    name: 'Content',
    icon: LayoutGrid,
    items: [
      ['Content',     '/admin/content'],
      ['Feed',        '/admin/feed'],
      ['News',        '/admin/news'],
      ['Home hero',   '/admin/home-hero'],
      ['Cold start',  '/admin/cold-start'],
      ['Duplicates',  '/admin/duplicates'],
      ['Boost',       '/admin/boost'],
      ['Broadcast',   '/admin/broadcast'],
    ],
  },
  {
    name: 'Platform',
    icon: Activity,
    items: [
      ['Intelligence', '/admin/intelligence'],
      ['Growth',       '/admin/growth'],
      ['How it is used', '/admin/app-usage'],
      ['Engagement',   '/admin/engagement'],
    ],
  },
  {
    name: 'Competitions',
    icon: Trophy,
    items: [
      ['Competitions', '/admin/competitions'],
      ['Sessions',     '/admin/school-sessions'],
    ],
  },
];

export default function AdminNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [openGroup, setOpenGroup] = useState(null);

  // The print view is deliberately chrome-free: it exists to come out of a
  // printer, and a nav bar across the top of a VIP card is not wanted.
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPrint = pathname.startsWith('/admin/vip-card-print');
  if (!isAdminPath || isPrint || !isAdmin) return null;

  const go = (to) => { setOpenGroup(null); navigate(to); };
  const here = (to) => pathname === to;

  // Which group holds the page you are on, so the bar can say where you are
  // without you having to work it out from the heading.
  const currentGroup = GROUPS.find(g => g.items.some(([, to]) => here(to)));

  return (
    <div className="sticky top-0 z-40 bg-black/95 backdrop-blur border-b border-white/[0.08]">
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
                  onClick={() => setOpenGroup(isOpen ? null : group.name)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition
                    ${isCurrent
                      ? 'bg-white/[0.1] text-white'
                      : 'text-white/45 hover:text-white hover:bg-white/[0.06]'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{group.name}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <>
                    {/* Catches the next click anywhere so the menu closes the
                        way every other menu does. */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpenGroup(null)} />
                    <div className="absolute left-0 top-full mt-1 z-50 min-w-[190px] rounded-xl border border-white/[0.1] bg-[#0b0b0f] shadow-2xl overflow-hidden">
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
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
