import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, Bug, Clock, CheckCircle, Loader, Search,
  Send, MessageSquare, AlertTriangle, XCircle, RefreshCw,
  ChevronDown, ChevronUp, User
} from 'lucide-react';

const STATUS_STYLES = {
  open:        { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20',    label: 'OPEN'        },
  in_progress: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', label: 'IN PROGRESS' },
  resolved:    { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20',  label: 'RESOLVED'    },
};

export default function AdminBugReports() {
  const navigate            = useNavigate();
  const { isAdmin, artist } = useAuth();

  const [reports, setReports]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [expanded, setExpanded]         = useState(null);
  const [replyText, setReplyText]       = useState({});
  const [replying, setReplying]         = useState(null);
  const [updating, setUpdating]         = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_feedback')
        .select('id, user_id, feedback, type, status, created_at, updated_at, admin_notes, admin_reply, replied_at')
        .eq('type', 'bug_report')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data, error } = await query;
      if (error) throw error;

      // Look up artist names for each report
      const enriched = await Promise.all((data || []).map(async (r) => {
        const { data: artistData } = await supabase
          .from('artists')
          .select('artist_name, slug, profile_image_url')
          .eq('user_id', r.user_id)
          .maybeSingle();
        return { ...r, artist: artistData || null };
      }));
      setReports(enriched);
    } catch (err) {
      console.error('Fetch bug reports error:', err);
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (!isAdmin) { navigate('/hub'); return; }
    fetchReports();
  }, [isAdmin, fetchReports]);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    try {
      await supabase.from('user_feedback')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (err) { console.error('Update status error:', err); }
    setUpdating(null);
  };

  const sendReply = async (report) => {
    const text = replyText[report.id]?.trim();
    if (!text || replying === report.id) return;
    setReplying(report.id);
    try {
      // Save reply to user_feedback
      await supabase.from('user_feedback').update({
        admin_reply: text,
        replied_at:  new Date().toISOString(),
        status:      'in_progress',
        updated_at:  new Date().toISOString(),
      }).eq('id', report.id);

      // Send in-app notification to the user
      const { data: userArtist } = await supabase
        .from('artists').select('id').eq('user_id', report.user_id).maybeSingle();

      await supabase.from('notifications').insert({
        user_id:        report.user_id,
        artist_id:      userArtist?.id || null,
        type:           'bug_reply',
        title:          'Response to your bug report',
        message:        text,
        from_artist_id: artist?.id || null,
        metadata:       { reply_to_feedback_id: report.id, original_message: report.feedback },
      });

      setReports(prev => prev.map(r =>
        r.id === report.id ? { ...r, admin_reply: text, replied_at: new Date().toISOString(), status: 'in_progress' } : r
      ));
      setReplyText(prev => ({ ...prev, [report.id]: '' }));
    } catch (err) { console.error('Reply error:', err); }
    setReplying(null);
  };

  const filtered = reports.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.feedback?.toLowerCase().includes(q) ||
      r.artist?.artist_name?.toLowerCase().includes(q) ||
      r.profile?.email?.toLowerCase().includes(q)
    );
  });

  const counts = {
    open:        reports.filter(r => r.status === 'open').length,
    in_progress: reports.filter(r => r.status === 'in_progress').length,
    resolved:    reports.filter(r => r.status === 'resolved').length,
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-black text-white pb-32 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center space-x-3 px-4 pt-6 pb-4">
        <button onClick={() => navigate('/admin')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/10 transition">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Bug Reports</h1>
          <p className="text-xs text-white/40">{counts.open} open · {counts.in_progress} in progress · {counts.resolved} resolved</p>
        </div>
        <button onClick={fetchReports} className="ml-auto w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/10 transition">
          <RefreshCw className={`w-4 h-4 text-white/50 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stat chips */}
      <div className="flex space-x-2 px-4 mb-4">
        {[
          { key: 'open',        label: 'Open',        count: counts.open,        color: 'text-red-400',    bg: 'bg-red-500/10'    },
          { key: 'in_progress', label: 'In Progress',  count: counts.in_progress, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { key: 'resolved',    label: 'Resolved',     count: counts.resolved,    color: 'text-green-400',  bg: 'bg-green-500/10'  },
          { key: 'all',         label: 'All',          count: reports.length,     color: 'text-white/60',   bg: 'bg-white/[0.06]'  },
        ].map(({ key, label, count, color, bg }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`flex-1 py-2 rounded-xl text-center transition border ${
              statusFilter === key ? `${bg} border-white/20` : 'bg-transparent border-white/[0.06]'
            }`}>
            <p className={`text-base font-bold ${color}`}>{count}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wide">{label}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 mb-4">
        <div className="flex items-center space-x-2 bg-white/[0.06] rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by message, artist or email..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none" />
          {search && <button onClick={() => setSearch('')}><XCircle className="w-4 h-4 text-white/20" /></button>}
        </div>
      </div>

      {/* Reports list */}
      <div className="px-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bug className="w-10 h-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No bug reports found</p>
          </div>
        ) : filtered.map(report => {
          const s      = STATUS_STYLES[report.status] || STATUS_STYLES.open;
          const isOpen = expanded === report.id;
          const name   = report.artist?.artist_name || 'Unknown User';
          const avatar = report.artist?.profile_image_url || null;
          const ago    = (() => {
            const diff = Date.now() - new Date(report.created_at);
            const h = Math.floor(diff / 3600000);
            if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
            if (h < 24) return `${h}h ago`;
            return `${Math.floor(h / 24)}d ago`;
          })();

          return (
            <div key={report.id} className={`rounded-xl border ${s.border} ${s.bg} overflow-hidden`}>
              {/* Report header */}
              <button onClick={() => setExpanded(isOpen ? null : report.id)}
                className="w-full flex items-start space-x-3 p-4 text-left">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center mt-0.5">
                  {avatar
                    ? <img src={avatar} alt="" className="w-full h-full object-cover" />
                    : <User className="w-4 h-4 text-white/30" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-white truncate">{name}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${s.bg} ${s.text} border ${s.border} flex-shrink-0 ml-2`}>
                      {s.label}
                    </span>
                  </div>
                  <p className="text-sm text-white/70 line-clamp-2">{report.feedback}</p>
                  <p className="text-[10px] text-white/30 mt-1">{ago}</p>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-white/30 flex-shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0 mt-1" />}
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-3">
                  {/* Full message */}
                  <div className="bg-black/30 rounded-xl p-3">
                    <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1.5">Report</p>
                    <p className="text-sm text-white/80 leading-relaxed">{report.feedback}</p>
                  </div>

                  {/* Previous reply if exists */}
                  {report.admin_reply && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                      <p className="text-[10px] text-purple-400 uppercase tracking-wide mb-1.5">Your Previous Reply</p>
                      <p className="text-sm text-white/70 leading-relaxed">{report.admin_reply}</p>
                    </div>
                  )}

                  {/* Reply box */}
                  <div className="space-y-2">
                    <p className="text-[10px] text-white/30 uppercase tracking-wide">
                      {report.admin_reply ? 'Send Another Reply' : 'Reply to User'}
                    </p>
                    <textarea
                      value={replyText[report.id] || ''}
                      onChange={e => setReplyText(prev => ({ ...prev, [report.id]: e.target.value }))}
                      placeholder="Type your response... it'll be sent as an in-app notification to the user"
                      rows={3}
                      className="w-full bg-black/30 border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20 resize-none"
                    />
                    <button onClick={() => sendReply(report)}
                      disabled={!replyText[report.id]?.trim() || replying === report.id}
                      className="w-full py-2.5 bg-purple-600 disabled:opacity-30 rounded-xl text-sm font-semibold text-white flex items-center justify-center space-x-2 transition active:scale-95">
                      {replying === report.id
                        ? <Loader className="w-4 h-4 animate-spin" />
                        : <><Send className="w-4 h-4" /><span>Send Reply</span></>}
                    </button>
                  </div>

                  {/* Status buttons */}
                  <div className="flex space-x-2">
                    {[
                      { key: 'open',        label: 'Open',        Icon: AlertTriangle, color: 'text-red-400    border-red-500/30    bg-red-500/10'    },
                      { key: 'in_progress', label: 'In Progress',  Icon: Clock,         color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
                      { key: 'resolved',    label: 'Resolved',     Icon: CheckCircle,   color: 'text-green-400  border-green-500/30  bg-green-500/10'  },
                    ].map(({ key, label, Icon, color }) => (
                      <button key={key}
                        onClick={() => updateStatus(report.id, key)}
                        disabled={report.status === key || updating === report.id}
                        className={`flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl border text-xs font-medium transition disabled:opacity-40 ${color}`}>
                        {updating === report.id
                          ? <Loader className="w-3 h-3 animate-spin" />
                          : <><Icon className="w-3 h-3" /><span>{label}</span></>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}