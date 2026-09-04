/**
 * AdminIntelligence.js
 * Merges: AdminAnalytics + AdminUserBehaviorPage + AdminEngagement
 * Route: /admin/intelligence
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminAnalytics from './AdminAnalytics';
import AdminEngagement from './AdminEngagement';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Brain } from 'lucide-react';

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
        active ? 'bg-white text-black' : 'text-white/40 hover:text-white/60'
      }`}>
      {children}
    </button>
  );
}

// Only one tab is live, so the bar is hidden rather than showing a single
// pointless tab. Set this true when a second tab comes back.
const SHOW_TAB_BAR = false;

export default function AdminIntelligence() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('analytics');
  const [mounted, setMounted] = useState({ analytics: true });

  const switchTab = (t) => {
    setTab(t);
    setMounted(prev => ({ ...prev, [t]: true }));
  };

  useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl px-4 pt-14 md:pt-4 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center space-x-3 mb-3">
          <button onClick={() => navigate('/admin')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <Brain className="w-5 h-5 text-purple-400" />
          <h1 className="text-base font-bold text-white">Intelligence</h1>
        </div>
        {/* Tab bar hidden while only one tab is live. User Behavior was
            removed from here because Analytics already has a Behaviour
            sub-tab covering the same ground, and the standalone page is
            still routed at /admin/behavior. AI Drip is not in use. Restore
            either Tab line and this bar shows itself again. */}
        {SHOW_TAB_BAR && (
          <div className="flex space-x-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-x-auto">
            <Tab active={tab === 'analytics'} onClick={() => switchTab('analytics')}>Platform Stats</Tab>
          </div>
        )}
      </div>

      <div className={tab === 'analytics' ? '' : 'hidden'}>{mounted.analytics && <AdminAnalytics        embedded />}</div>
      <div className={tab === 'drip'      ? '' : 'hidden'}>{mounted.drip      && <AdminEngagement       embedded />}</div>
    </div>
  );
}