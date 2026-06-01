/**
 * AdminContent.js
 * Merges: AdminBoost + AdminCompetitions + AdminModeration
 * Route: /admin/content
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminBoost from './AdminBoost';
import AdminCompetitions from './AdminCompetitions';
import AdminModeration from './AdminModeration';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Layers } from 'lucide-react';

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

export default function AdminContent() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('boost');

  useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl px-4 pt-14 md:pt-4 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center space-x-3 mb-3">
          <button onClick={() => navigate('/admin')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <Layers className="w-5 h-5 text-amber-400" />
          <h1 className="text-base font-bold text-white">Content</h1>
        </div>
        <div className="flex space-x-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
          <Tab active={tab === 'boost'}        onClick={() => setTab('boost')}>Boost</Tab>
          <Tab active={tab === 'competitions'} onClick={() => setTab('competitions')}>Competitions</Tab>
          <Tab active={tab === 'moderation'}   onClick={() => setTab('moderation')}>Moderation</Tab>
        </div>
      </div>

      <div className={tab === 'boost'        ? '' : 'hidden'}><AdminBoost        embedded /></div>
      <div className={tab === 'competitions' ? '' : 'hidden'}><AdminCompetitions embedded /></div>
      <div className={tab === 'moderation'   ? '' : 'hidden'}><AdminModeration   embedded /></div>
    </div>
  );
}
