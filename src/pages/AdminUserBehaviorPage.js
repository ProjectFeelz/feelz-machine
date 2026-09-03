import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3, Download, Filter, Loader, ArrowLeft,
  Play, Heart, ListMusic, LogIn, RefreshCw, X, Users
} from 'lucide-react';

const ACTION_TYPES = [
  { key: 'streams', label: 'Streams', icon: Play, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { key: 'downloads', label: 'Downloads', icon: Download, color: 'text-green-400', bg: 'bg-green-500/10' },
  { key: 'likes', label: 'Likes', icon: Heart, color: 'text-red-400', bg: 'bg-red-500/10' },
  { key: 'playlists', label: 'Playlist Adds', icon: ListMusic, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { key: 'logins', label: 'Logins', icon: LogIn, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminUserBehaviorPage({ embedded = false }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [artists, setArtists] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState('');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [emailMap, setEmailMap] = useState({});
  const [activeTab, setActiveTab] = useState('streams');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isAdmin && !embedded) { navigate('/hub'); return; }
    fetchArtists();
  }, [isAdmin]);

  const fetchArtists = async () => {
    const { data } = await supabase.from('artists').select('id, artist_name').order('artist_name');
    setArtists(data || []);
  };

  const toggleType = (key) => {
    setSelectedTypes(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/admin-user-behavior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session?.user?.id,
          action_types: selectedTypes,
          from_date: fromDate ? `${fromDate}T00:00:00Z` : undefined,
          to_date: toDate ? `${toDate}T23:59:59Z` : undefined,
          artist_id: selectedArtist || undefined,
          format: 'json',
        }),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); setLoading(false); return; }
      setData(json.data);
      setCounts(json.counts);
      setEmailMap(json.email_map || {});
      // Set active tab to first available type
      const firstType = ACTION_TYPES.find(t => !selectedTypes.length || selectedTypes.includes(t.key));
      if (firstType) setActiveTab(firstType.key);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/.netlify/functions/admin-user-behavior', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: session?.user?.id,
          action_types: selectedTypes,
          from_date: fromDate ? `${fromDate}T00:00:00Z` : undefined,
          to_date: toDate ? `${toDate}T23:59:59Z` : undefined,
          artist_id: selectedArtist || undefined,
          format: 'csv',
        }),
      });
      const json = await res.json();
      if (json.error) { alert(json.error); setExporting(false); return; }
      const blob = new Blob([json.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user_behavior_${fromDate}_${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
    setExporting(false);
  };

  const visibleTabs = ACTION_TYPES.filter(t => !selectedTypes.length || selectedTypes.includes(t.key));

  const renderTable = () => {
    if (!data) return null;
    const rows = data[activeTab] || [];
    if (rows.length === 0) return <p className="text-center text-white/20 text-sm py-12">No data for this period</p>;

    if (activeTab === 'logins') {
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-3 text-white/30 font-medium">Email</th>
                <th className="text-left py-2 px-3 text-white/30 font-medium">Last Sign In</th>
                <th className="text-left py-2 px-3 text-white/30 font-medium">Joined</th>
                <th className="text-left py-2 px-3 text-white/30 font-medium">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2 px-3 text-white/70">{r.email}</td>
                  <td className="py-2 px-3 text-white/40">{formatDate(r.last_sign_in)}</td>
                  <td className="py-2 px-3 text-white/40">{formatDate(r.created_at)}</td>
                  <td className="py-2 px-3">{r.confirmed ? <span className="text-green-400">✓</span> : <span className="text-red-400">✗</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-3 text-white/30 font-medium">User</th>
              <th className="text-left py-2 px-3 text-white/30 font-medium">Track</th>
              <th className="text-left py-2 px-3 text-white/30 font-medium">Artist</th>
              <th className="text-left py-2 px-3 text-white/30 font-medium">Date</th>
              {activeTab === 'downloads' && <th className="text-left py-2 px-3 text-white/30 font-medium">Paid</th>}
              {activeTab === 'streams' && <th className="text-left py-2 px-3 text-white/30 font-medium">Platform</th>}
              {activeTab === 'playlists' && <th className="text-left py-2 px-3 text-white/30 font-medium">Playlist</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                <td className="py-2 px-3 text-white/50 max-w-[140px] truncate">{r.user_email || r.user_id?.slice(0, 8)}</td>
                <td className="py-2 px-3 text-white/70 max-w-[140px] truncate">{r.tracks?.title || '—'}</td>
                <td className="py-2 px-3 text-white/40 max-w-[120px] truncate">{r.tracks?.artists?.artist_name || '—'}</td>
                <td className="py-2 px-3 text-white/30 whitespace-nowrap">{formatDate(r.created_at)}</td>
                {activeTab === 'downloads' && <td className="py-2 px-3 text-green-400">${r.amount_paid || 0}</td>}
                {activeTab === 'streams' && <td className="py-2 px-3 text-white/30">{r.platform || '—'}</td>}
                {activeTab === 'playlists' && <td className="py-2 px-3 text-white/40 max-w-[120px] truncate">{r.playlists?.name || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="pt-4 pb-32 px-4 md:px-0">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button onClick={() => navigate('/hub')} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06]">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">User Behavior</h1>
          <p className="text-xs text-white/30">Platform activity analytics</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4 mb-4 space-y-4">
        <div className="flex items-center space-x-2 mb-2">
          <Filter className="w-4 h-4 text-white/30" />
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Filters</p>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-white/30 mb-1">From</p>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="w-full bg-white/[0.06] rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </div>
          <div>
            <p className="text-[10px] text-white/30 mb-1">To</p>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="w-full bg-white/[0.06] rounded-lg px-3 py-2 text-sm text-white outline-none" />
          </div>
        </div>

        {/* Artist filter */}
        <div>
          <p className="text-[10px] text-white/30 mb-1">Artist (optional)</p>
          <select value={selectedArtist} onChange={e => setSelectedArtist(e.target.value)}
            className="w-full bg-white/[0.06] rounded-lg px-3 py-2 text-sm text-white outline-none">
            <option value="">All Artists</option>
            {artists.map(a => <option key={a.id} value={a.id}>{a.artist_name}</option>)}
          </select>
        </div>

        {/* Action types */}
        <div>
          <p className="text-[10px] text-white/30 mb-2">Action Types (all if none selected)</p>
          <div className="flex flex-wrap gap-2">
            {ACTION_TYPES.map(t => {
              const Icon = t.icon;
              const active = selectedTypes.includes(t.key);
              return (
                <button key={t.key} onClick={() => toggleType(t.key)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${active ? `${t.bg} ${t.color}` : 'bg-white/[0.04] text-white/30'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={fetchData} disabled={loading}
          className="w-full py-2.5 bg-white text-black rounded-xl text-sm font-semibold disabled:opacity-50 transition flex items-center justify-center space-x-2">
          {loading ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>{loading ? 'Loading...' : 'Run Report'}</span>
        </button>
      </div>

      {/* Results */}
      {counts && (
        <>
          {/* Count cards */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4">
            {ACTION_TYPES.map(t => {
              const Icon = t.icon;
              const count = counts[t.key] || 0;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`p-3 rounded-xl border transition text-center ${activeTab === t.key ? 'border-white/20 bg-white/[0.06]' : 'border-white/[0.04] bg-white/[0.02]'}`}>
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${t.color}`} />
                  <p className="text-base font-bold text-white">{count.toLocaleString()}</p>
                  <p className="text-[9px] text-white/30">{t.label}</p>
                </button>
              );
            })}
          </div>

          {/* Export button */}
          <div className="flex justify-end mb-3">
            <button onClick={handleExportCSV} disabled={exporting}
              className="flex items-center space-x-2 px-4 py-2 bg-white/[0.06] rounded-lg text-xs text-white/60 hover:bg-white/[0.1] transition disabled:opacity-40">
              {exporting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex space-x-1 bg-white/[0.03] rounded-xl p-1 mb-4 overflow-x-auto">
            {visibleTabs.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${activeTab === t.key ? 'bg-white text-black' : 'text-white/40'}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${activeTab === t.key ? 'bg-black/10' : 'bg-white/[0.08]'}`}>
                    {counts[t.key] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="bg-white/[0.02] rounded-xl border border-white/[0.04] overflow-hidden">
            {renderTable()}
          </div>
        </>
      )}

      {!counts && !loading && (
        <div className="text-center py-16">
          <BarChart3 className="w-12 h-12 mx-auto text-white/10 mb-3" />
          <p className="text-sm text-white/30">Set filters and run a report</p>
        </div>
      )}
    </div>
  );
}