import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Upload, Disc, Music, Youtube, Users, DollarSign, Zap, Check, FileAudio, Image, Tag, Clock } from 'lucide-react';

const SECTIONS = [
  {
    icon: Disc,
    color: '#8B5CF6',
    title: 'Release Type',
    subtitle: 'Start by choosing what you\'re releasing',
    steps: [
      { label: 'Single', desc: 'One track standing alone. Most common for new releases and testing audience response.' },
      { label: 'EP', desc: '3–6 tracks. Good for establishing your sound without the commitment of a full album.' },
      { label: 'Album / Mixtape', desc: '7+ tracks with a title, cover, and release date. All tracks get grouped together.' },
      { label: 'Live / Compilation', desc: 'For recorded live sets or collections of existing tracks under one release.' },
    ],
  },
  {
    icon: FileAudio,
    color: '#06B6D4',
    title: 'Audio File',
    subtitle: 'What formats work and how they\'re handled',
    steps: [
      { label: 'MP3 (.mp3)', desc: 'Upload directly. Recommended format — fast upload, great quality.' },
      { label: 'WAV (.wav)', desc: 'Automatically converted to MP3 at 320kbps before upload. Highest source quality.' },
      { label: 'FLAC / M4A', desc: 'Accepted as-is. Good for lossless sources.' },
      { label: 'Max file size', desc: '500MB per track. For WAV files this covers most full-length songs at studio quality.' },
    ],
  },
  {
    icon: Image,
    color: '#EC4899',
    title: 'Cover Artwork',
    subtitle: 'Your visual identity on the platform',
    steps: [
      { label: 'Format', desc: 'JPG, PNG or WebP. Square images only — non-square will be cropped to fit.' },
      { label: 'Recommended size', desc: '3000×3000px at 72dpi. Minimum 500×500px. Larger is always better.' },
      { label: 'Single vs Album', desc: 'For albums, set a cover on the album itself. Individual tracks can have their own artwork too.' },
      { label: 'Missing artwork', desc: 'Tracks without artwork show a music note placeholder. Always better to have art.' },
    ],
  },
  {
    icon: Tag,
    color: '#F59E0B',
    title: 'Genre & Mood',
    subtitle: 'How listeners discover your music',
    steps: [
      { label: 'Genre', desc: 'Pick the closest fit. This powers the Recommended For You section and Collab Radar matching.' },
      { label: 'Mood', desc: 'Describes the feeling of the track. Used alongside genre for recommendations.' },
      { label: 'Explicit', desc: 'Toggle this on if your track contains explicit lyrics. Displayed as an \'E\' badge.' },
      { label: 'Featured', desc: 'Admin-controlled. Marks tracks for the Featured section on the home page.' },
    ],
  },
  {
    icon: DollarSign,
    color: '#10B981',
    title: 'Pricing & Downloads',
    subtitle: 'How fans can support you',
    steps: [
      { label: 'Free download', desc: 'Set price to $0. Fans download instantly with no payment required.' },
      { label: 'Paid download', desc: 'Set any price in USD. PayPal handles the transaction, funds go straight to you.' },
      { label: 'Pay What You Want', desc: 'Let fans choose their own price above a minimum you set. Great for building loyalty.' },
      { label: 'Pre-order', desc: 'Fans pay now, download unlocks on the release date you set.' },
    ],
  },
  {
    icon: Youtube,
    color: '#EF4444',
    title: 'YouTube Video',
    subtitle: 'Visual backdrop in the full player',
    steps: [
      { label: 'What it does', desc: 'When a fan opens the full player, they can switch to Video mode and watch your YouTube video playing behind the audio.' },
      { label: 'Best format', desc: 'Vertical (9:16) videos work best since the player is portrait on mobile. YouTube Shorts work perfectly.' },
      { label: 'How to add', desc: 'Paste the full YouTube URL: https://youtube.com/watch?v=... The video plays muted by default, fans can unmute.' },
      { label: 'Optional', desc: 'Tracks without a YouTube URL simply won\'t show the Video toggle. No impact on playback.' },
    ],
  },
  {
    icon: Users,
    color: '#8B5CF6',
    title: 'Collaborators',
    subtitle: 'Credit the people who made the track',
    steps: [
      { label: 'Adding a collaborator', desc: 'Search for their artist name on the platform. They must have an account on Feelz Machine.' },
      { label: 'Roles', desc: 'Choose their role: Featured, Producer, Songwriter, Vocalist, Remix, Engineer.' },
      { label: 'Revenue split', desc: 'Set a percentage split for download sales. The platform handles payout distribution automatically.' },
      { label: 'Collab requests', desc: 'Adding a collaborator sends them a notification to accept. Credits appear on the track once accepted.' },
    ],
  },
  {
    icon: Clock,
    color: '#06B6D4',
    title: 'After Upload',
    subtitle: 'What happens when you hit publish',
    steps: [
      { label: 'Published instantly', desc: 'If Published is toggled on, your track goes live immediately and appears in New Releases and Browse.' },
      { label: 'Follower notifications', desc: 'Everyone who follows you gets a notification that you\'ve dropped new music.' },
      { label: 'Draft mode', desc: 'Toggle Published off to save without going live. Edit and publish whenever you\'re ready.' },
      { label: 'Manage tab', desc: 'Edit title, genre, pricing, artwork, audio, or YouTube URL any time from the Manage Tracks tab.' },
    ],
  },
];

export default function UploadHelpPanel({ onClose }) {
  const [activeSection, setActiveSection] = useState(0);
  const touchStartX = React.useRef(null);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) < 50) return;
    if (diff > 0) setActiveSection(i => Math.min(SECTIONS.length - 1, i + 1));
    else setActiveSection(i => Math.max(0, i - 1));
    touchStartX.current = null;
  };
  const section = SECTIONS[activeSection];
  const Icon = section.icon;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg md:rounded-2xl rounded-t-2xl overflow-hidden animate-slide-up md:animate-none"
        style={{
          backgroundColor: '#0f0f0f',
          border: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold mb-0.5">Upload Guide</p>
            <h2 className="text-base font-bold text-white">How to Upload</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.1] transition">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>

        {/* Section nav pills */}
        <div className="flex space-x-1.5 overflow-x-auto scrollbar-hide px-5 py-3 border-b border-white/[0.06]">
          {SECTIONS.map((s, i) => {
            const SIcon = s.icon;
            return (
              <button
                key={i}
                onClick={() => setActiveSection(i)}
                className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                  activeSection === i
                    ? 'text-black'
                    : 'bg-white/[0.04] text-white/35 hover:text-white/60'
                }`}
                style={activeSection === i ? { backgroundColor: s.color } : {}}
              >
                <SIcon className="w-3 h-3" />
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 200px)' }}
          onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {/* Section header */}
          <div className="px-5 pt-5 pb-4 flex items-center space-x-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${section.color}20` }}>
              <Icon className="w-5 h-5" style={{ color: section.color }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{section.title}</h3>
              <p className="text-xs text-white/35">{section.subtitle}</p>
            </div>
          </div>

          {/* Steps */}
          <div className="px-5 pb-6 space-y-3">
            {section.steps.map((step, i) => (
              <div
                key={i}
                className="flex items-start space-x-3 p-3.5 rounded-xl"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: `${section.color}25`, color: section.color }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white mb-0.5">{step.label}</p>
                  <p className="text-xs text-white/40 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={() => setActiveSection(i => Math.max(0, i - 1))}
            disabled={activeSection === 0}
            className="flex items-center space-x-1.5 text-xs text-white/30 hover:text-white/60 transition disabled:opacity-0">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <div className="flex items-center space-x-1">
            {SECTIONS.map((_, i) => (
              <div
                key={i}
                onClick={() => setActiveSection(i)}
                className="cursor-pointer rounded-full transition-all"
                style={{
                  width: activeSection === i ? 16 : 6,
                  height: 6,
                  backgroundColor: activeSection === i ? section.color : 'rgba(255,255,255,0.15)',
                }}
              />
            ))}
          </div>

          {activeSection < SECTIONS.length - 1 ? (
            <button
              onClick={() => setActiveSection(i => Math.min(SECTIONS.length - 1, i + 1))}
              className="flex items-center space-x-1.5 text-xs font-semibold transition"
              style={{ color: section.color }}>
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center space-x-1.5 text-xs font-semibold text-green-400 transition">
              <Check className="w-3.5 h-3.5" />
              <span>Got it</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
