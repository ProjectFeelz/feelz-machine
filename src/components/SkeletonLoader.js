import React from 'react';

/**
 * Skeleton components — native-feel loading states.
 * Replace spinners on initial page load.
 */

function Shimmer({ className = '' }) {
  return (
    <div
      className={`rounded-lg bg-white/[0.06] relative overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
          animation: 'skeleton-shimmer 1.4s infinite',
        }}
      />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="flex-shrink-0 w-40 md:w-52">
      <Shimmer className="aspect-square rounded-xl mb-2" />
      <Shimmer className="h-3.5 w-3/4 mb-1.5" />
      <Shimmer className="h-3 w-1/2" />
    </div>
  );
}

export function SkeletonTrackRow() {
  return (
    <div className="flex items-center space-x-3 px-6 py-2.5">
      <Shimmer className="w-11 h-11 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3.5 w-2/3" />
        <Shimmer className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function SkeletonArtistCircle() {
  return (
    <div className="flex-shrink-0 w-40 text-center">
      <Shimmer className="w-40 h-40 rounded-full mx-auto mb-2" />
      <Shimmer className="h-3.5 w-2/3 mx-auto mb-1.5" />
      <Shimmer className="h-3 w-1/2 mx-auto" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="pt-12 pb-4">
      {/* Greeting */}
      <div className="px-6 mb-6 pt-2 space-y-2">
        <Shimmer className="h-7 w-40" />
        <Shimmer className="h-4 w-56" />
      </div>

      {/* Section 1 */}
      <div className="mb-8">
        <div className="flex items-center justify-between px-6 mb-3">
          <Shimmer className="h-4 w-32" />
        </div>
        <div className="flex space-x-3 overflow-hidden px-6">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>

      {/* Section 2 */}
      <div className="mb-8">
        <div className="flex items-center justify-between px-6 mb-3">
          <Shimmer className="h-4 w-28" />
        </div>
        <div className="flex space-x-3 overflow-hidden px-6">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>

      {/* Track rows */}
      <div className="mb-4">
        {[1,2,3,4,5].map(i => <SkeletonTrackRow key={i} />)}
      </div>

      <style>{`
        @keyframes skeleton-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export function BrowseSkeleton() {
  return (
    <div className="pt-12 pb-4 px-6 space-y-4">
      <Shimmer className="h-10 w-full rounded-xl" />
      <div className="flex space-x-1">
        {[1,2,3,4,5].map(i => <Shimmer key={i} className="h-9 flex-1 rounded-lg" />)}
      </div>
      {[1,2,3,4,5,6].map(i => <SkeletonTrackRow key={i} />)}
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export function ArtistProfileSkeleton() {
  return (
    <div className="min-h-screen bg-black pb-32">
      {/* Banner */}
      <Shimmer className="w-full" style={{ height: '220px' }} />
      {/* Avatar */}
      <div className="flex flex-col items-center -mt-16 px-6 pb-6 space-y-3">
        <Shimmer className="w-32 h-32 rounded-2xl" />
        <Shimmer className="h-6 w-40" />
        <Shimmer className="h-4 w-56" />
        <div className="flex space-x-3">
          <Shimmer className="h-9 w-24 rounded-full" />
          <Shimmer className="h-9 w-20 rounded-full" />
        </div>
      </div>
      {[1,2,3,4,5].map(i => <SkeletonTrackRow key={i} />)}
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
