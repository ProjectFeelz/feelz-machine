// src/components/TrackComments.js
//
// ONE COMMENT THREAD PER TRACK, REACHABLE FROM EVERYWHERE.
//
// Comments have always been stored per track, in track_comments keyed on
// track_id. What was missing was a way in: only For You and the beat page had
// a button, so a comment left on For You was invisible on that same song's
// track page, and the album page and the three dot menu had nothing at all.
// The thread was already shared; nothing could see it.
//
// This is the button and the sheet chrome, pulled out of ForYouPage and
// BeatDetailPage where each had its own copy, so that every surface opens the
// SAME thread through the SAME component:
//
//   src/pages/TrackPage.js           next to the heart
//   src/pages/AlbumDetailPage.js     on each track row, next to the heart
//   src/components/TrackActionSheet.js  a row in the three dot menu
//   src/pages/ForYouPage.js          the action rail it already had
//   src/pages/BeatDetailPage.js      the card it already had
//
// A comment left on any one of them appears on all of them, because there was
// only ever one thread.
//
// routePrefix is passed through to TrackCommentSheet and only affects the deep
// link in the notification the artist receives: 'track' for a song, 'beat' for
// a beat, so tapping the notification lands on the right page.

import React from 'react';
import { MessageCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import TrackCommentSheet from './TrackCommentSheet';

/**
 * The sheet, with its backdrop. Rendered by CommentButton, and exported on its
 * own for the pages that manage the open state themselves.
 */
export function TrackCommentsOverlay({ track, user, onClose, routePrefix = 'track' }) {
  if (!track) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        // Isolate this layer, prevent iOS reflowing the page beneath
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
      }}
      onClick={onClose}
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '480px',
          height: '65vh',
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10,10,10,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '24px 24px 0 0',
          // No marginBottom: TrackCommentSheet's own fixed input handles the
          // keyboard, and adding one here would double the offset.
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
        }}>
        <TrackCommentSheet
          track={track}
          user={user}
          onClose={onClose}
          routePrefix={routePrefix}
        />
      </div>
    </div>
  );
}

/**
 * The bubble. Shows the count when there is one, opens the thread.
 *
 * The count is read once per track and refreshed when the sheet is closed, so
 * leaving a comment updates the number without a round trip on every render.
 * A failed count is not an error worth showing: the bubble still opens.
 *
 * `variant` only picks the layout:
 *   'inline'  icon and count side by side, for a row of actions.
 *   'stacked' icon above the count, for the For You style rail.
 *   'badge'   count as a small dot on the corner, for a round icon button
 *             where there is no room for a number beside the icon.
 *   'none'    icon only.
 */
export function CommentButton({
  track,
  user,
  routePrefix = 'track',
  variant = 'inline',
  className = '',
  iconClassName = 'w-5 h-5',
  onOpenChange,
}) {
  const [open, setOpen]   = React.useState(false);
  const [count, setCount] = React.useState(null);

  const loadCount = React.useCallback(async () => {
    if (!track?.id) return;
    const { count: n, error } = await supabase
      .from('track_comments')
      .select('id', { count: 'exact', head: true })
      .eq('track_id', track.id);
    if (error) { console.error('[comments] count failed:', error.code, error.message); return; }
    setCount(n || 0);
  }, [track?.id]);

  React.useEffect(() => { loadCount(); }, [loadCount]);

  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
    loadCount();
  };

  const stacked = variant === 'stacked';

  return (
    <>
      <button
        onClick={(e) => {
          // Rows on the album page are themselves clickable (they start the
          // track), so the tap must not fall through to the row.
          e.stopPropagation();
          setOpen(true);
          onOpenChange?.(true);
        }}
        aria-label="Comments"
        className={
          className ||
          (stacked
            ? 'flex flex-col items-center space-y-1 transition active:scale-90'
            : 'flex items-center space-x-1 transition active:scale-90')
        }>
        <MessageCircle className={`${iconClassName} text-white/40`} />
        {count > 0 && variant !== 'none' && (
          variant === 'badge' ? (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{ background: 'rgba(167,139,250,0.9)' }}>
              {count > 99 ? '99+' : count}
            </span>
          ) : (
            <span className={stacked ? 'text-[10px] text-white/50 font-medium' : 'text-[11px] text-white/35 font-medium'}>
              {count}
            </span>
          )
        )}
      </button>

      {open && (
        <TrackCommentsOverlay
          track={track}
          user={user}
          routePrefix={routePrefix}
          onClose={close}
        />
      )}
    </>
  );
}

export default CommentButton;