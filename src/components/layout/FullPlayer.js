import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown,
  Shuffle, Repeat, Repeat1, Heart, Share2,
  ListMusic, Volume2, VolumeX, X, MoreHorizontal,
  Music2, Moon,
} from 'lucide-react';
import { usePlayer } from '../../contexts/PlayerContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../supabaseClient';
import TrackActionSheet from '../TrackActionSheet';
import { useHaptics } from '../../hooks/useHaptics';
import VinylRecord from '../VinylRecord';
import ShareCard from '../ShareCard';
import ReactPlayer from 'react-player';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
}

// ── LRC timestamp parser ──────────────────────────────────────────────────────
// Parses [mm:ss.xx] or [mm:ss] prefixed lines
// Returns array of { time: seconds, text: string } or null if not LRC format
function parseLRC(raw) {
  if (!raw) return null;
  const lines = raw.split('\n');
  const parsed = [];
  const LRC_RE = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;
  let matched = 0;
  for (const line of lines) {
    const m = line.match(LRC_RE);
    if (m) {
      matched++;
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms   = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      const text = m[4].trim();
      parsed.push({ time: mins * 60 + secs + ms / 1000, text });
    }
  }
  // Only treat as LRC if at least 2 timestamped lines found
  return matched >= 2 ? parsed.sort((a, b) => a.time - b.time) : null;
}

// ── Icon components ───────────────────────────────────────────────────────────
const IconImage = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IconVinyl = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const IconVideo = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
  </svg>
);
const IconLyrics = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>
);
const IconCassette = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
    <path d="M8 14h8"/><path d="M6 19v-2"/><path d="M18 19v-2"/>
  </svg>
);

const ALL_MODES = ['artwork', 'vinyl', 'cassette', 'video', 'lyrics'];


// ── Cassette Tape Visualizer ──────────────────────────────────────────────────
function CassetteVisualizer({ isPlaying, currentTime, duration, coverUrl }) {
  const canvasRef = React.useRef(null);
  const animRef   = React.useRef(null);
  const angleRef  = React.useRef(0);
  const tapeRef   = React.useRef(0);
  const frameRef  = React.useRef(0);
  const imgRef     = React.useRef(null);
  const imgOpacity = React.useRef(0);

  React.useEffect(() => {
    tapeRef.current = duration > 0 ? currentTime / duration : 0;
  }, [currentTime, duration]);

  React.useEffect(() => {
    if (!coverUrl) { imgRef.current = null; imgOpacity.current = 0; return; }
    imgOpacity.current = 0;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => {
      imgRef.current = img;
      // Snap to fully visible if it loaded instantly from cache
      imgOpacity.current = img.complete ? 1 : 0;
    };
    img.onerror = () => { imgRef.current = null; };
    img.src = coverUrl;
    // Already cached — complete fires before onload in some browsers
    if (img.complete && img.naturalWidth > 0) {
      imgRef.current = img;
      imgOpacity.current = 1;
    }
  }, [coverUrl]);

  React.useEffect(() => {
    const cv  = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = 320, H = 246;

    const BAR_N  = 28;
    const phases = Array.from({ length: BAR_N }, () => Math.random() * Math.PI * 2);
    const speeds = Array.from({ length: BAR_N }, () => 0.8 + Math.random() * 2);

    function screw(x, y, r) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#2a2a2a'; ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, y); ctx.lineTo(x + r * 0.55, y);
      ctx.moveTo(x, y - r * 0.55); ctx.lineTo(x, y + r * 0.55);
      ctx.strokeStyle = '#666'; ctx.lineWidth = 0.6; ctx.stroke();
    }

    function reel(cx, cy, outerR, fillRatio, ang) {
      // ── drop shadow beneath reel ──
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fillStyle = '#111'; ctx.fill();
      ctx.restore();

      // ── outer rim with radial gradient for dome effect ──
      const rimG = ctx.createRadialGradient(cx - outerR * 0.3, cy - outerR * 0.3, outerR * 0.1, cx, cy, outerR);
      rimG.addColorStop(0,   '#3a3a3a');
      rimG.addColorStop(0.6, '#1a1a1a');
      rimG.addColorStop(1,   '#0a0a0a');
      ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fillStyle = rimG; ctx.fill();

      // ── rim highlight ring ──
      ctx.beginPath(); ctx.arc(cx, cy, outerR - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();

      // ── tape spool with gradient depth + texture ──
      const inner = 10;
      const tapeR = inner + (outerR - inner) * Math.max(0.05, fillRatio);

      // base radial gradient
      const tapeG = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, tapeR);
      tapeG.addColorStop(0,   '#6b3f1f');
      tapeG.addColorStop(0.5, '#4a2e1a');
      tapeG.addColorStop(1,   '#2a1608');
      ctx.beginPath(); ctx.arc(cx, cy, tapeR, 0, Math.PI * 2);
      ctx.fillStyle = tapeG; ctx.fill();

      // concentric ring texture — real tape has layered wind lines
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, tapeR, 0, Math.PI * 2); ctx.clip();
      const ringCount = Math.floor((tapeR - inner) / 2.2);
      for (let r = 0; r < ringCount; r++) {
        const rr = inner + r * 2.2;
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        const alpha = 0.06 + (r % 3 === 0 ? 0.08 : 0);
        ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
        ctx.lineWidth = 0.7; ctx.stroke();
      }
      // subtle radial grain lines
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * tapeR,  cy + Math.sin(a) * tapeR);
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 0.5; ctx.stroke();
      }
      // edge wear highlight
      const edgeG = ctx.createRadialGradient(cx, cy, tapeR - 2, cx, cy, tapeR);
      edgeG.addColorStop(0, 'rgba(255,255,255,0)');
      edgeG.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.beginPath(); ctx.arc(cx, cy, tapeR, 0, Math.PI * 2);
      ctx.fillStyle = edgeG; ctx.fill();
      ctx.restore();

      ctx.beginPath(); ctx.arc(cx, cy, tapeR, 0, Math.PI * 2);
      ctx.strokeStyle = '#5a3820'; ctx.lineWidth = 0.8; ctx.stroke();

      // ── spokes with lit/shadow sides ──
      for (let i = 0; i < 5; i++) {
        const a = ang + (i * Math.PI * 2) / 5;
        const x1 = cx + Math.cos(a) * 3.5;
        const y1 = cy + Math.sin(a) * 3.5;
        const x2 = cx + Math.cos(a) * (inner - 1);
        const y2 = cy + Math.sin(a) * (inner - 1);
        // shadow side
        ctx.beginPath();
        ctx.moveTo(x1 + 0.8, y1 + 1); ctx.lineTo(x2 + 0.8, y2 + 1);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2.5; ctx.stroke();
        // lit side
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        const spokeG = ctx.createLinearGradient(x1, y1, x2, y2);
        spokeG.addColorStop(0, '#aaa');
        spokeG.addColorStop(1, '#555');
        ctx.strokeStyle = spokeG; ctx.lineWidth = 1.8; ctx.stroke();
      }

      // ── hub plate with radial gradient ──
      const hubG = ctx.createRadialGradient(cx - 2, cy - 2, 0.5, cx, cy, inner);
      hubG.addColorStop(0,   '#e8e8e8');
      hubG.addColorStop(0.4, '#c0c0c0');
      hubG.addColorStop(0.8, '#888');
      hubG.addColorStop(1,   '#555');
      ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fillStyle = hubG; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();

      // ── hub specular dot ──
      const specG = ctx.createRadialGradient(cx - 2.5, cy - 2.5, 0, cx - 2.5, cy - 2.5, 4);
      specG.addColorStop(0, 'rgba(255,255,255,0.9)');
      specG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fillStyle = specG; ctx.fill();

      // ── centre pin ──
      const pinG = ctx.createRadialGradient(cx - 1, cy - 1, 0, cx, cy, 3.5);
      pinG.addColorStop(0, '#555');
      pinG.addColorStop(1, '#111');
      ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pinG; ctx.fill();
    }

    function render() {
      ctx.clearRect(0, 0, W, H);

      const BX = 20, BY = 8, BW = 280, BH = 166, BR = 10;

      // ── outer drop shadow (from block 1) ──
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 10;
      ctx.beginPath(); ctx.roundRect(BX, BY, BW, BH, BR);
      ctx.fillStyle = '#1c1c1c'; ctx.fill();
      ctx.restore();

      // ── body gradient matched to vinyl's near-black cool tones ──
      const bodyG = ctx.createLinearGradient(BX, BY, BX, BY + BH);
      bodyG.addColorStop(0,    '#1c1c1c');
      bodyG.addColorStop(0.35, '#0e0e0e');
      bodyG.addColorStop(1,    '#060606');
      ctx.beginPath(); ctx.roundRect(BX, BY, BW, BH, BR);
      ctx.fillStyle = bodyG; ctx.fill();
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.2; ctx.stroke();

      // ── top edge specular line + gloss sweep (from block 1) ──
      ctx.save();
      ctx.beginPath(); ctx.roundRect(BX, BY, BW, BH, BR); ctx.clip();
      const topEdge = ctx.createLinearGradient(BX, BY, BX, BY + 5);
      topEdge.addColorStop(0, 'rgba(255,255,255,0.18)');
      topEdge.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = topEdge; ctx.fillRect(BX, BY, BW, 5);
      // gloss sweep across top half
      const gloss = ctx.createLinearGradient(BX, BY, BX, BY + BH * 0.45);
      gloss.addColorStop(0,   'rgba(255,255,255,0.07)');
      gloss.addColorStop(0.5, 'rgba(255,255,255,0.02)');
      gloss.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = gloss; ctx.fillRect(BX, BY, BW, BH);
      ctx.restore();

      // ── label — black base, art fades in (block 2 mechanic kept) ──
      const LX = 46, LY = 27, LW = 228, LH = 100, LR = 5;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(LX, LY, LW, LH, LR); ctx.clip();
      ctx.fillStyle = '#0a0a0a'; ctx.fillRect(LX, LY, LW, LH);
      if (imgRef.current) {
        if (imgOpacity.current < 1) imgOpacity.current = Math.min(1, imgOpacity.current + 0.04);
        const img = imgRef.current;
        const scale = Math.max(LW / img.width, LH / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.globalAlpha = imgOpacity.current;
        ctx.drawImage(img, LX + (LW - dw) / 2, LY + (LH - dh) / 2, dw, dh);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // ── label gloss shine + top edge highlight (from block 1) ──
      ctx.save();
      ctx.beginPath(); ctx.roundRect(LX, LY, LW, LH, LR); ctx.clip();
      const shineG = ctx.createLinearGradient(LX, LY, LX, LY + LH * 0.5);
      shineG.addColorStop(0,   'rgba(255,255,255,0.22)');
      shineG.addColorStop(0.5, 'rgba(255,255,255,0.04)');
      shineG.addColorStop(1,   'rgba(255,255,255,0)');
      ctx.fillStyle = shineG; ctx.fillRect(LX, LY, LW, LH);
      // top edge highlight
      const edgeG = ctx.createLinearGradient(LX, LY, LX, LY + 4);
      edgeG.addColorStop(0, 'rgba(255,255,255,0.45)');
      edgeG.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = edgeG; ctx.fillRect(LX, LY, LW, 5);
      ctx.restore();

      // ── label border ──
      ctx.beginPath(); ctx.roundRect(LX, LY, LW, LH, LR);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

      // ── tape window with drop shadow + recessed inner shade (from block 1) ──
      const WX = 93, WY = 52, WW = 134, WH = 58, WR = 6;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.beginPath(); ctx.roundRect(WX, WY, WW, WH, WR);
      ctx.fillStyle = '#0d0d0d'; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.roundRect(WX, WY, WW, WH, WR);
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.stroke();
      // inner top edge shadow for recessed look
      ctx.save(); ctx.beginPath(); ctx.roundRect(WX, WY, WW, WH, WR); ctx.clip();
      const winShade = ctx.createLinearGradient(WX, WY, WX, WY + 10);
      winShade.addColorStop(0, 'rgba(0,0,0,0.6)');
      winShade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = winShade; ctx.fillRect(WX, WY, WW, WH);
      ctx.restore();

      const LCX = 118, RCX = 202, reelCY = 81;
      const guideY = reelCY + 18;

      // ── Everything inside the tape window is clipped ──
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(WX, WY, WW, WH, WR);
      ctx.clip();

      // tape strand
      ctx.beginPath();
      ctx.moveTo(LCX + 14, guideY - 1.5); ctx.lineTo(RCX - 14, guideY - 1.5);
      ctx.strokeStyle = '#3d1f0a'; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(LCX + 14, guideY + 1.5); ctx.lineTo(RCX - 14, guideY + 1.5);
      ctx.strokeStyle = '#5a2e0f'; ctx.lineWidth = 0.8; ctx.stroke();

      // guide pins
      [LCX + 14, RCX - 14].forEach(px => {
        ctx.beginPath(); ctx.arc(px, guideY, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = '#555'; ctx.fill();
        ctx.strokeStyle = '#777'; ctx.lineWidth = 0.6; ctx.stroke();
      });

      // reels drawn larger so edges bleed past window bounds — only visible portion shows through
      if (isPlaying) angleRef.current += 0.038;
      reel(LCX, reelCY, 34, 1 - tapeRef.current, -angleRef.current);
      reel(RCX, reelCY, 34,     tapeRef.current,   angleRef.current);

      ctx.restore();

      // ── Window frame drawn ON TOP to sell the "glass panel" depth ──
      ctx.beginPath(); ctx.roundRect(WX, WY, WW, WH, WR);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke();

      // ── glass layer over reels ──
      ctx.save();
      ctx.beginPath(); ctx.roundRect(WX, WY, WW, WH, WR); ctx.clip();

      // recessed inner shadow — top and left edges feel sunken
      const recessTop = ctx.createLinearGradient(WX, WY, WX, WY + 18);
      recessTop.addColorStop(0, 'rgba(0,0,0,0.85)');
      recessTop.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = recessTop; ctx.fillRect(WX, WY, WW, WH);

      const recessLeft = ctx.createLinearGradient(WX, WY, WX + 14, WY);
      recessLeft.addColorStop(0, 'rgba(0,0,0,0.4)');
      recessLeft.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = recessLeft; ctx.fillRect(WX, WY, WW, WH);

      // broad glass body tint — slightly blue-tinted like real smoked plastic
      ctx.fillStyle = 'rgba(180,210,255,0.04)';
      ctx.fillRect(WX, WY, WW, WH);

      // primary gloss sweep — curved highlight across top half
      const glassSweep = ctx.createLinearGradient(WX, WY, WX, WY + WH * 0.55);
      glassSweep.addColorStop(0,    'rgba(255,255,255,0.32)');
      glassSweep.addColorStop(0.25, 'rgba(255,255,255,0.10)');
      glassSweep.addColorStop(0.6,  'rgba(255,255,255,0.02)');
      glassSweep.addColorStop(1,    'rgba(255,255,255,0)');
      ctx.fillStyle = glassSweep; ctx.fillRect(WX, WY, WW, WH);

      // sharp top-edge specular line — the brightest point of the glass
      const topSpec = ctx.createLinearGradient(WX, WY, WX, WY + 3);
      topSpec.addColorStop(0, 'rgba(255,255,255,0.75)');
      topSpec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = topSpec; ctx.fillRect(WX + WR, WY, WW - WR * 2, 3);

      // diagonal streak — off-centre so it looks like a curved surface catch
      ctx.save();
      ctx.translate(WX + WW * 0.15, WY);
      ctx.rotate(0.18);
      const streak = ctx.createLinearGradient(0, 0, WW * 0.45, WH * 1.1);
      streak.addColorStop(0,    'rgba(255,255,255,0.18)');
      streak.addColorStop(0.35, 'rgba(255,255,255,0.05)');
      streak.addColorStop(1,    'rgba(255,255,255,0)');
      ctx.fillStyle = streak;
      ctx.fillRect(0, 0, WW * 0.45, WH * 1.4);
      ctx.restore();

      // bottom inner glow — light bouncing back off the cassette body
      const bottomBounce = ctx.createLinearGradient(WX, WY + WH, WX, WY + WH - 10);
      bottomBounce.addColorStop(0, 'rgba(255,255,255,0.06)');
      bottomBounce.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bottomBounce; ctx.fillRect(WX, WY + WH - 10, WW, 10);

      ctx.restore();

      // ── outer window bezel — drawn last so it frames everything ──
      ctx.beginPath(); ctx.roundRect(WX, WY, WW, WH, WR);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(WX + 1, WY + 1, WW - 2, WH - 2, WR - 1);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke();

      // bottom mechanics strip
      ctx.beginPath(); ctx.roundRect(BX + 6, BY + BH - 36, BW - 12, 30, 4);
      ctx.fillStyle = '#141414'; ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8; ctx.stroke();

      // notch holes
      [BX + 26, BX + BW / 2 - 8, BX + BW - 26 - 16].forEach(hx => {
        ctx.beginPath(); ctx.roundRect(hx, BY + BH - 30, 16, 18, 2);
        ctx.fillStyle = '#0a0a0a'; ctx.fill();
        ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.7; ctx.stroke();
      });

      // corner screws
      [[BX+12,BY+12],[BX+BW-12,BY+12],[BX+12,BY+BH-12],[BX+BW-12,BY+BH-12]]
        .forEach(([sx,sy]) => screw(sx, sy, 5));

      // side edge indents
      [[BX,BY+40,6,40],[BX+BW-6,BY+40,6,40]].forEach(([rx,ry,rw,rh])=>{
        ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,2);
        ctx.fillStyle='#252525'; ctx.fill();
        ctx.strokeStyle='#3a3a3a'; ctx.lineWidth=0.7; ctx.stroke();
      });

      // frequency bars
      const barW = 4, gap = 2;
const totalBW = BAR_N * (barW + gap) - gap;
const bx0  = (W - totalBW) / 2;
const baseY = H - 14, maxBarH = 28;
      phases.forEach((ph, i) => {
        const h = isPlaying
          ? (0.08 + 0.92 * Math.abs(Math.sin(frameRef.current * speeds[i] * 0.042 + ph))) * maxBarH
          : 3;
        const r = Math.min(255, 160 + i * 3);
        const g = Math.min(255, 60  + i * 5);
        const b = Math.min(255, 230 - i * 4);
        ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.beginPath();
        ctx.roundRect(bx0 + i * (barW + gap), baseY - h, barW, h, 1);
        ctx.fill();
      });

      frameRef.current++;
      animRef.current = requestAnimationFrame(render);
    }

    render();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  return (
    <div className="flex flex-col items-center justify-center w-full px-4">
      <canvas
  ref={canvasRef}
  width={320}
  height={246}
  className="w-full max-w-[336px]"
/>
    </div>
  );
}


// ── Lyrics display component ──────────────────────────────────────────────────
function LyricsDisplay({ lyrics, currentTime, duration, isPlaying }) {
  const scrollRef      = useRef(null);
  const userScrollRef  = useRef(false);
  const resumeTimer    = useRef(null);
  const lineRefs       = useRef([]);

  const lrcLines = parseLRC(lyrics);
  const isLRC    = !!lrcLines;

  // Find active line index for LRC
  const activeLine = isLRC
    ? lrcLines.reduce((best, line, i) => {
        return line.time <= currentTime ? i : best;
      }, -1)
    : -1;

  // Auto-scroll to active line
  useEffect(() => {
    if (!isLRC || activeLine < 0 || userScrollRef.current) return;
    const el = lineRefs.current[activeLine];
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const elTop     = el.offsetTop;
      const elHeight  = el.offsetHeight;
      const target    = elTop - container.clientHeight / 2 + elHeight / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [activeLine, isLRC]);

  // Plain text position-based scroll
  useEffect(() => {
    if (isLRC || userScrollRef.current || !duration || !scrollRef.current) return;
    const container = scrollRef.current;
    const maxScroll  = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return;
    const target = (currentTime / duration) * maxScroll * 0.85;
    container.scrollTo({ top: target, behavior: 'smooth' });
  }, [Math.floor(currentTime / 3), isLRC, duration]); // only update every 3 seconds

  const handleScroll = () => {
    userScrollRef.current = true;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { userScrollRef.current = false; }, 3000);
  };

  // Reset on track change
  useEffect(() => {
    userScrollRef.current = false;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [lyrics]);

  if (!lyrics) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center">
          <Music2 className="w-6 h-6 text-white/20" />
        </div>
        <p className="text-sm text-white/30">No lyrics for this track</p>
        <p className="text-xs text-white/15">Artists can add lyrics when uploading</p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0">
      {/* Top fade */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black to-transparent z-10 pointer-events-none" />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-8 py-12 scrollbar-hide"
        style={{ scrollBehavior: 'smooth' }}
      >
        {isLRC ? (
          // LRC mode — line by line with highlight
          <div className="space-y-5 pb-32">
            {lrcLines.map((line, i) => {
              const isActive  = i === activeLine;
              const isPast    = i < activeLine;
              const isEmpty   = !line.text.trim();
              if (isEmpty) return <div key={i} className="h-4" />;
              return (
                <p
                  key={i}
                  ref={el => { lineRefs.current[i] = el; }}
                  className="text-left leading-snug transition-all duration-300"
                  style={{
                    fontSize: isActive ? '1.35rem' : '1.1rem',
                    fontWeight: isActive ? 700 : 400,
                    color: isActive
                      ? 'rgba(255,255,255,1)'
                      : isPast
                        ? 'rgba(255,255,255,0.25)'
                        : 'rgba(255,255,255,0.45)',
                    transform: isActive ? 'translateX(4px)' : 'translateX(0)',
                  }}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        ) : (
          // Plain text mode
          <div className="pb-32">
            {lyrics.split('\n').map((line, i) => (
              <p
                key={i}
                className="text-white/70 leading-relaxed mb-1"
                style={{ fontSize: '1.05rem', minHeight: line.trim() ? undefined : '1rem' }}
              >
                {line.trim() || '\u00A0'}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black to-transparent pointer-events-none" />

      {/* LRC badge */}
      {isLRC && (
        <div className="absolute top-3 right-4 z-20">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/[0.08]">
            Synced
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main FullPlayer ───────────────────────────────────────────────────────────
export default function FullPlayer() {
  const navigate = useNavigate();
  const {
    currentTrack, isPlaying, togglePlay,
    playNext, playPrev, seek, duration, currentTime,
    shuffle, repeat, toggleShuffle, toggleRepeat,
    isMinimized, setIsMinimized, queue, volume, setVolumeLevel,
    removeFromQueue, moveInQueue,
  } = usePlayer();
  const { user } = useAuth();
  const { tap, success, heavy } = useHaptics();

  const [liked, setLiked]                     = useState(false);
  const [draggingIdx, setDraggingIdx]         = useState(null);
  const [dragOverIdx, setDragOverIdx]         = useState(null);
  const [showShareCard, setShowShareCard]      = useState(false);
  const [showQueue, setShowQueue]             = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [displayMode, setDisplayMode]         = useState('artwork');
  const [lyrics, setLyrics]                   = useState(null);
  const [lyricsLoading, setLyricsLoading]     = useState(false);

  // Sleep timer
  const [sleepMinutes, setSleepMinutes]       = useState(null);   // null = off
  const [sleepRemaining, setSleepRemaining]   = useState(null);   // seconds remaining
  const [showSleepPicker, setShowSleepPicker] = useState(false);
  const sleepTimerRef                         = useRef(null);
  const sleepIntervalRef                      = useRef(null);

  const SLEEP_OPTIONS = [15, 30, 45, 60, 90];

  const startSleepTimer = (minutes) => {
    // Clear any existing timer
    clearTimeout(sleepTimerRef.current);
    clearInterval(sleepIntervalRef.current);
    tap();
    setSleepMinutes(minutes);
    setSleepRemaining(minutes * 60);
    setShowSleepPicker(false);

    // Countdown interval
    sleepIntervalRef.current = setInterval(() => {
      setSleepRemaining(prev => {
        if (prev <= 1) {
          clearInterval(sleepIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // The actual stop
    sleepTimerRef.current = setTimeout(() => {
      togglePlay && togglePlay(); // pause playback
      setSleepMinutes(null);
      setSleepRemaining(null);
      clearInterval(sleepIntervalRef.current);
    }, minutes * 60 * 1000);
  };

  const cancelSleepTimer = () => {
    clearTimeout(sleepTimerRef.current);
    clearInterval(sleepIntervalRef.current);
    setSleepMinutes(null);
    setSleepRemaining(null);
    tap();
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearTimeout(sleepTimerRef.current);
      clearInterval(sleepIntervalRef.current);
    };
  }, []);

  const formatSleepRemaining = (secs) => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  const y       = useMotionValue(window.innerHeight);
  const opacity = useTransform(y, [0, 300], [1, 0]);

  const hasVideo        = !!currentTrack?.youtube_url;
  const isYouTube       = hasVideo && (currentTrack.youtube_url.includes('youtube') || currentTrack.youtube_url.includes('youtu.be'));
  const isUploadedVideo = hasVideo && currentTrack.youtube_url.includes('supabase');
  const hasLyrics  = !!lyrics;

  // Reset video mode if track has no video
  useEffect(() => {
    if (!hasVideo && displayMode === 'video') setDisplayMode('artwork');
  }, [currentTrack?.id]);

  // Fetch lyrics when track changes or lyrics mode is entered
  useEffect(() => {
    if (!currentTrack?.id) { setLyrics(null); return; }
    // Fetch lyrics — only if the track object doesn't already have them
    if (currentTrack.lyrics !== undefined) {
      setLyrics(currentTrack.lyrics || null);
      return;
    }
    setLyricsLoading(true);
    supabase
      .from('tracks')
      .select('lyrics')
      .eq('id', currentTrack.id)
      .maybeSingle()
      .then(({ data }) => {
        setLyrics(data?.lyrics || null);
        setLyricsLoading(false);
      });
  }, [currentTrack?.id]);

  // Preload is handled in PlayerContext on playTrack/playNext

  useEffect(() => {
    if (!currentTrack || !user) { setLiked(false); return; }
    supabase.from('track_likes')
      .select('id').eq('track_id', currentTrack.id).eq('user_id', user.id)
      .maybeSingle().then(({ data }) => setLiked(!!data));
  }, [currentTrack?.id, user?.id]);

  useEffect(() => {
    if (!isMinimized) animate(y, 0, { type: 'spring', damping: 30, stiffness: 300 });
  }, [isMinimized]);

  if (!currentTrack || isMinimized) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const coverArt = currentTrack.cover_artwork_url;

  const handleSeek = (e) => {
    const rect    = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches
      ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX)
      : e.clientX;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(pct * duration);
    tap();
  };

  const handleLike = async () => {
    if (!user) return;
    success();
    setLiked(prev => !prev);
    if (liked) {
      await supabase.from('track_likes').delete().eq('track_id', currentTrack.id).eq('user_id', user.id);
    } else {
      await supabase.from('track_likes').insert({ track_id: currentTrack.id, user_id: user.id });
    }
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      animate(y, window.innerHeight, { duration: 0.25 }).then(() => {
        setIsMinimized(true);
        animate(y, 0, { duration: 0 });
      });
    } else {
      animate(y, 0, { type: 'spring', damping: 30, stiffness: 300 });
    }
  };

  const setMode = (m) => { tap(); setDisplayMode(m); };

  const isLyricsMode   = displayMode === 'lyrics';
  const isCassetteMode = displayMode === 'cassette';

  return (
    <>
      <motion.div
        style={{ y, opacity }}
        drag="y"
        dragConstraints={{ top: 0, bottom: window.innerHeight }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={handleDragEnd}
        initial={false}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-0 z-[100] bg-black flex flex-col"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <button onClick={() => { tap(); setIsMinimized(true); }}
            className="w-10 h-10 flex items-center justify-center">
            <ChevronDown className="w-6 h-6 text-white" />
          </button>
          <p className="text-xs text-white/50 uppercase tracking-widest font-medium">Now Playing</p>
          <button onClick={() => { tap(); setShowQueue(p => !p); }}
            className="w-10 h-10 flex items-center justify-center">
            <ListMusic className={`w-5 h-5 ${showQueue ? 'text-white' : 'text-white/50'}`} />
          </button>
        </div>

        {/* Queue view */}
        {showQueue ? (
          <div className="flex-1 overflow-y-auto px-5 pb-10">
            <p className="text-xs uppercase tracking-wider text-white/30 font-semibold mb-3">Up Next</p>
            {(queue || []).length === 0 ? (
              <p className="text-sm text-white/20 text-center py-12">No tracks in queue</p>
            ) : (queue || []).map((track, i) => {
              const isActive    = track.id === currentTrack?.id;
              const isDragging  = draggingIdx === i;
              const isDragOver  = dragOverIdx === i;
              return (
                <div key={`${track.id}-${i}`}
                  draggable={!isActive}
                  onDragStart={() => { if (!isActive) setDraggingIdx(i); }}
                  onDragOver={e => { e.preventDefault(); if (draggingIdx !== null && !isActive) setDragOverIdx(i); }}
                  onDrop={() => {
                    if (draggingIdx !== null && draggingIdx !== i) {
                      moveInQueue(draggingIdx, i);
                      tap();
                    }
                    setDraggingIdx(null);
                    setDragOverIdx(null);
                  }}
                  onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                  className={`flex items-center space-x-3 py-3 border-b border-white/[0.04] transition-all
                    ${isActive ? 'opacity-100' : 'opacity-50'}
                    ${isDragging ? 'opacity-30 scale-95' : ''}
                    ${isDragOver && !isActive ? 'border-t-2 border-t-purple-400' : ''}`}>
                  {/* Drag handle — hidden for current track */}
                  {!isActive && (
                    <div className="flex flex-col space-y-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing px-0.5">
                      {[0,1,2].map(j => (
                        <div key={j} className="w-3 h-0.5 rounded-full bg-white/20" />
                      ))}
                    </div>
                  )}
                  <div className={`w-10 h-10 rounded-lg overflow-hidden bg-white/[0.06] flex-shrink-0 ${isActive ? '' : ''}`}>
                    {track.cover_artwork_url
                      ? <img src={track.cover_artwork_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-white/20">♪</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/60'}`}>{track.title}</p>
                    <p className="text-xs text-white/30 truncate">{track.artist_name}</p>
                  </div>
                  {isActive ? (
                    <div className="flex items-end space-x-0.5 h-4 flex-shrink-0">
                      {[100, 60, 80].map((h, j) => (
                        <div key={j} className="w-0.5 bg-white rounded-full animate-pulse"
                          style={{ height: `${h}%`, animationDelay: `${j * 0.15}s` }} />
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => { tap(); removeFromQueue(i); }}
                      className="p-1.5 rounded-full hover:bg-white/10 flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-white/30" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        ) : (
          <>
            {/* ── Lyrics mode — full height scrollable ── */}
            {isLyricsMode ? (
              <LyricsDisplay
                lyrics={lyrics}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
              />
            ) : (
              /* ── Main display area (artwork / vinyl / video) ── */
              <div className="flex-1 relative flex flex-col items-center justify-center px-8 min-h-0 overflow-hidden">

                {/* Video layer */}
                {displayMode === 'video' && hasVideo && (
                  <div className="absolute inset-0">
                    {isUploadedVideo ? (
                      <video
                        key={currentTrack.youtube_url}
                        src={currentTrack.youtube_url}
                        autoPlay={isPlaying}
                        loop
                        muted
                        playsInline
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : isYouTube ? (
                      <ReactPlayer
                        key={currentTrack.youtube_url}
                        url={currentTrack.youtube_url}
                        playing={isPlaying}
                        muted
                        loop
                        width="100%"
                        height="100%"
                        style={{ position: 'absolute', top: 0, left: 0 }}
                        config={{
                          youtube: {
                            playerVars: {
                              controls: 0, modestbranding: 1, rel: 0,
                              showinfo: 0, iv_load_policy: 3, playsinline: 1,
                              autoplay: 1, mute: 1,
                            },
                          },
                        }}
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
                  </div>
                )}

                {/* Artwork mode */}
                {displayMode === 'artwork' && (
                  <div className="w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
                    {coverArt
                      ? <img src={coverArt} alt={currentTrack.title} className="w-full h-full object-cover" loading="eager" />
                      : <div className="w-full h-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center">
                          <span className="text-6xl text-white/20">♪</span>
                        </div>}
                  </div>
                )}

                {/* Vinyl mode */}
                {displayMode === 'vinyl' && (
                  <VinylRecord
                    coverUrl={coverArt}
                    isPlaying={isPlaying}
                    size={Math.min(300, window.innerWidth - 80)}
                  />
                )}

                {/* Cassette mode */}
                {displayMode === 'cassette' && (
                  <CassetteVisualizer
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    coverUrl={coverArt}
                  />
                )}

                {/* Video unavailable fallback */}
                {displayMode === 'video' && !hasVideo && (
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center mx-auto">
                      <IconVideo />
                    </div>
                    <p className="text-sm text-white/30">No video for this track</p>
                    <p className="text-xs text-white/15">Artists can add a YouTube URL when uploading</p>
                  </div>
                )}

                {/* Mode toggle — only shown in non-lyrics modes */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center bg-black/60 backdrop-blur-xl rounded-full border border-white/[0.08] overflow-hidden">
                  {[
                    { key: 'artwork',  Icon: IconImage,   label: 'Art'     },
                    { key: 'vinyl',    Icon: IconVinyl,   label: 'Vinyl'   },
                    { key: 'cassette', Icon: IconCassette, label: 'Tape'   },
                    { key: 'video',    Icon: IconVideo,   label: 'Video'   },
                    { key: 'lyrics',   Icon: IconLyrics,  label: 'Lyrics'  },
                  ].map(({ key, Icon, label }) => {
                    const disabled = key === 'video' && !hasVideo;
                    const active   = displayMode === key;
                    return (
                      <button key={key} onClick={() => !disabled && setMode(key)}
                        title={label}
                        className={`w-9 h-8 flex items-center justify-center transition-all ${
                          active
                            ? 'bg-white text-black'
                            : disabled
                              ? 'text-white/15 cursor-default'
                              : 'text-white/40 hover:text-white/70 active:bg-white/10'
                        }`}>
                        <Icon />
                      </button>
                    );
                  })}

                </div>
              </div>
            )}

            {/* ── Track info + controls (shared between all modes) ── */}
            <div className="flex-shrink-0" style={{ paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom) + 24px))' }}>

              {/* Mode toggle for lyrics mode — shown above track info */}
              {isLyricsMode && (
                <div className="flex justify-center mb-3 px-8">
                  <div className="flex items-center bg-black/60 backdrop-blur-xl rounded-full border border-white/[0.08] overflow-hidden">
                    {[
                      { key: 'artwork',  Icon: IconImage,    label: 'Art'   },
                      { key: 'vinyl',    Icon: IconVinyl,    label: 'Vinyl' },
                      { key: 'cassette', Icon: IconCassette, label: 'Tape'  },
                      { key: 'video',    Icon: IconVideo,    label: 'Video' },
                      { key: 'lyrics',   Icon: IconLyrics,   label: 'Lyrics'},
                    ].map(({ key, Icon, label }) => {
                      const disabled = key === 'video' && !hasVideo;
                      const active   = displayMode === key;
                      return (
                        <button key={key} onClick={() => !disabled && setMode(key)}
                          title={label}
                          className={`w-9 h-8 flex items-center justify-center transition-all ${
                            active
                              ? 'bg-white text-black'
                              : disabled
                                ? 'text-white/15 cursor-default'
                                : 'text-white/40 hover:text-white/70 active:bg-white/10'
                          }`}>
                          <Icon />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="px-8">
                {/* Title + Like */}
                <div className="flex items-center justify-between mb-5 mt-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-white truncate">{currentTrack.title}</h2>
                    <button
                      onClick={() => {
                        tap();
                        const slug = currentTrack.artist_slug || currentTrack.artists?.slug;
                        if (slug) navigate(`/artist/${slug}`);
                      }}
                      className="text-base text-white/50 truncate hover:text-white/80 transition text-left">
                      {currentTrack.artist_name || 'Unknown Artist'}
                    </button>
                  </div>
                  <button onClick={handleLike}
                    className="ml-4 w-12 h-12 flex items-center justify-center active:scale-90 transition-transform">
                    <Heart className="w-6 h-6 transition"
                      fill={liked ? '#ef4444' : 'none'}
                      color={liked ? '#ef4444' : 'rgba(255,255,255,0.5)'} />
                  </button>
                </div>

                {/* Seeker */}
                <div className="mb-2">
                  <div
                    className="h-10 flex items-center cursor-pointer group -mx-2 px-2"
                    onClick={handleSeek}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => { e.stopPropagation(); handleSeek(e); }}
                    onTouchEnd={(e) => { e.stopPropagation(); handleSeek(e); }}
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-full h-1.5 bg-white/10 rounded-full">
                      <div className="h-full bg-white rounded-full relative transition-none" style={{ width: `${progress}%` }}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg scale-0 group-active:scale-100 transition-transform" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between -mt-1">
                    <span className="text-[11px] text-white/40 tabular-nums">{formatTime(currentTime)}</span>
                    <span className="text-[11px] text-white/40 tabular-nums">{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Playback controls */}
                <div className="flex items-center justify-between mt-4">
                  <button onClick={() => { tap(); toggleShuffle(); }}
                    className={`w-12 h-12 flex items-center justify-center ${shuffle ? 'text-white' : 'text-white/30'}`}>
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <button onClick={() => { heavy(); playPrev(); }}
                    className="w-14 h-14 flex items-center justify-center active:scale-95 transition-transform">
                    <SkipBack className="w-7 h-7 text-white" fill="white" />
                  </button>
                  <button onClick={() => { heavy(); togglePlay(); }}
                    className="w-16 h-16 flex items-center justify-center rounded-full bg-white active:scale-95 transition-transform shadow-lg">
                    {isPlaying
                      ? <Pause className="w-8 h-8 text-black" fill="black" />
                      : <Play className="w-8 h-8 text-black ml-1" fill="black" />}
                  </button>
                  <button onClick={() => { heavy(); playNext(); }}
                    className="w-14 h-14 flex items-center justify-center active:scale-95 transition-transform">
                    <SkipForward className="w-7 h-7 text-white" fill="white" />
                  </button>
                  <button onClick={() => { tap(); toggleRepeat(); }}
                    className={`w-12 h-12 flex items-center justify-center ${repeat !== 'none' ? 'text-white' : 'text-white/30'}`}>
                    {repeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                  </button>
                </div>

                {/* Volume — desktop only */}
                <div className="hidden md:flex items-center space-x-3 mt-4 px-2">
                  <button onClick={() => setVolumeLevel(volume > 0 ? 0 : 1)} className="text-white/40">
                    {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input type="range" min="0" max="1" step="0.01" value={volume}
                    onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
                    className="flex-1 h-1 rounded-full appearance-none bg-white/10"
                    style={{ accentColor: 'white' }} />
                </div>

                {/* Share / More / Sleep Timer */}
                <div className="flex items-center justify-center mt-5 space-x-8">
                  <button
                    onClick={() => { tap(); setShowShareCard(true); }}
                    className="flex flex-col items-center space-y-1 text-white/40 hover:text-white/70 transition active:scale-95">
                    <Share2 className="w-5 h-5" />
                    <span className="text-[10px]">Share</span>
                  </button>

                  {/* Sleep timer button */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        tap();
                        if (sleepMinutes) { cancelSleepTimer(); }
                        else { setShowSleepPicker(p => !p); }
                      }}
                      className={`flex flex-col items-center space-y-1 transition active:scale-95 ${sleepMinutes ? 'text-purple-400' : 'text-white/40 hover:text-white/70'}`}>
                      <Moon className="w-5 h-5" />
                      <span className="text-[10px]">
                        {sleepRemaining ? formatSleepRemaining(sleepRemaining) : 'Sleep'}
                      </span>
                    </button>
                    {showSleepPicker && (
                      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-neutral-900 border border-white/[0.1] rounded-2xl p-3 shadow-2xl z-50 w-44">
                        <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold mb-2 text-center">Stop after</p>
                        <div className="space-y-1">
                          {SLEEP_OPTIONS.map(mins => (
                            <button key={mins} onClick={() => startSleepTimer(mins)}
                              className="w-full py-2 px-3 rounded-xl text-sm text-white/70 hover:bg-white/[0.08] hover:text-white transition text-center">
                              {mins} minutes
                            </button>
                          ))}
                        </div>
                        <button onClick={() => { setShowSleepPicker(false); tap(); }}
                          className="w-full mt-2 py-1.5 text-xs text-white/30 hover:text-white/50 transition text-center">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <button onClick={() => { tap(); setShowActionSheet(true); }}
                    className="flex flex-col items-center space-y-1 text-white/40 hover:text-white/70 transition active:scale-95">
                    <MoreHorizontal className="w-5 h-5" />
                    <span className="text-[10px]">More</span>
                  </button>
                </div>

                {showActionSheet && (
                  <TrackActionSheet
                    track={currentTrack}
                    artist={{ artist_name: currentTrack.artist_name, slug: currentTrack.artist_slug || currentTrack.artists?.slug }}
                    onClose={() => setShowActionSheet(false)}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </motion.div>

      {/* ShareCard — rendered outside the player motion div to avoid z-index conflicts */}
      {showShareCard && (
        <ShareCard
          track={currentTrack}
          shareUrl={currentTrack?.artist_slug && (currentTrack?.slug || currentTrack?.id)
            ? `https://www.feelzmachine.com/artist/${currentTrack.artist_slug}?track=${currentTrack.slug || currentTrack.id}`
            : null}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </>
  );
}