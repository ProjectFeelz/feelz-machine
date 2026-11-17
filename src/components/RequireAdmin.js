// src/components/RequireAdmin.js
//
// ONE GUARD IN FRONT OF EVERY ADMIN ROUTE.
//
//
// WHAT THERE WAS BEFORE
//
// Nothing. AppRouter.js has no route-level admin check anywhere. Every admin
// page was responsible for guarding itself, 27 routes relying on 27 separate
// pieces of discipline, and AdminAffiliates had no reference to auth at all.
// One page forgetting is all it takes, and one page had forgotten.
//
//
// WHY IT CHECKS rawIsAdmin AND NOT isAdmin
//
// This is the part worth reading twice.
//
// The `isAdmin` that useAuth hands out is not the admin flag. It is:
//
//     viewAs === 'admin' || (!viewAs && isAdmin) || (isAdmin && viewAs === 'beatmaker')
//
// Look at the first clause. `viewAs === 'admin'` returns true on its own,
// without consulting the real flag at all. And `viewAs` is ordinary React
// state with a `setViewAs` handed out through the same context, so it is a
// value the client can set.
//
// That is fine for what it was built for, which is an admin previewing the app
// as somebody else. It is not fine as a security boundary, and every admin
// page in this codebase currently guards on it. So the pages are not really
// guarded: they are guarded against someone who does not know the flag exists.
//
// `rawIsAdmin` is the real thing, set from the admins table when the session
// loads and never derived from a view mode. That is what this checks.
//
// Nothing else changes. Each page keeps its own `isAdmin` check, so preview
// mode still behaves exactly as it did, and this sits in front as the layer
// that decides whether you may be on an admin URL at all.
//
//
// WHY IT WAITS
//
// `loading` matters more than it looks. Auth resolves asynchronously, so for
// the first moment of every page load rawIsAdmin is false for everyone,
// including you. Redirecting on that would bounce an admin to /hub every time
// they refreshed an admin page, which looks exactly like being logged out.
//
// So: render nothing until auth has an answer, then decide once.

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RequireAdmin({ children }) {
  const { rawIsAdmin, loading } = useAuth();

  // Still working it out. Not an answer, so not a decision.
  if (loading) return null;

  // replace, so a non-admin cannot press back and sit on the URL again.
  if (!rawIsAdmin) return <Navigate to="/hub" replace />;

  return children;
}
