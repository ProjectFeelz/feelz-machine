/**
 * AdminGrowth.js
 * Merges: AdminBroadcast + AdminAffiliates
 * Route: /admin/growth
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminBroadcast from './AdminBroadcast';
import AdminAffiliates from './AdminAffiliates';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Megaphone, TrendingUp } from 'lucide-react';

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

export default function AdminGrowth() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('broadcast');

  useEffect(() => { if (!isAdmin) navigate('/hub'); }, [isAdmin, navigate]);
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-xl px-4 pt-14 md:pt-4 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center space-x-3 mb-3">
          <button onClick={() => navigate('/admin')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06]">
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h1 className="text-base font-bold text-white">Growth</h1>
        </div>
        <div className="flex space-x-1 p-1 bg-white/[0.03] rounded-xl border border-white/[0.06]">
          <Tab active={tab === 'broadcast'}  onClick={() => setTab('broadcast')}>Broadcasts</Tab>
          <Tab active={tab === 'affiliates'} onClick={() => setTab('affiliates')}>Affiliates</Tab>
        </div>
      </div>

      {/* Each original page renders inside — their own headers are hidden via CSS */}
      <div className={tab === 'broadcast'  ? '' : 'hidden'}>
        <AdminBroadcast embedded />
      </div>
      <div className={tab === 'affiliates' ? '' : 'hidden'}>
        <AdminAffiliates embedded />
      </div>
    </div>
  );
}
