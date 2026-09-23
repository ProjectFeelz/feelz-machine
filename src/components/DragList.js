// src/components/DragList.js
//
// Drag to reorder, with a finger or a mouse.
//
// Pointer events rather than HTML5 drag and drop: the HTML5 API does not fire
// on touch screens at all, and most people setting up an album are on a phone.
// One code path covers both.
//
// The rows swap under the finger as you move, so what you see while dragging
// is the order you will get. Nothing is saved until you let go, and then
// onReorder is called once with the finished list.
//
// Usage:
//   <DragList items={tracks} getKey={t => t.id} onReorder={save}>
//     {(track, { handleProps, dragging }) => (
//       <div>
//         <button {...handleProps}><GripVertical /></button>
//         {track.title}
//       </div>
//     )}
//   </DragList>
//
// handleProps must go on the grip: dragging starts only from there, so the
// list still scrolls normally everywhere else.

import React, { useCallback, useEffect, useRef, useState } from 'react';

export default function DragList({ items, getKey, onReorder, children, className = 'space-y-2', disabled = false }) {
  const [order, setOrder] = useState(items);
  const [dragKey, setDragKey] = useState(null);
  const rowRefs = useRef(new Map());
  const drag = useRef(null);

  // Follow the parent unless a drag is in progress, which would yank the row
  // out from under the finger.
  useEffect(() => { if (!drag.current) setOrder(items); }, [items]);

  const keyOf = useCallback((item, i) => (getKey ? getKey(item) : i), [getKey]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    const y = e.clientY;

    setOrder(prev => {
      const from = prev.findIndex((it, i) => keyOf(it, i) === d.key);
      if (from < 0) return prev;

      // Which row is the pointer over? Measured live, so a row that has just
      // moved is measured where it now is.
      let to = from;
      prev.forEach((it, i) => {
        const el = rowRefs.current.get(keyOf(it, i));
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) to = i;
      });
      if (to === from) return prev;

      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      d.changed = true;
      return next;
    });
  }, [keyOf]);

  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setDragKey(null);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    if (d?.changed) {
      setOrder(cur => { onReorder?.(cur); return cur; });
    }
  }, [onPointerMove, onReorder]);

  const startDrag = useCallback((e, key) => {
    if (disabled) return;
    // Left button or a touch, never a right click.
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    drag.current = { key, changed: false };
    setDragKey(key);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }, [disabled, onPointerMove, endDrag]);

  useEffect(() => () => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }, [onPointerMove, endDrag]);

  return (
    <div className={className}>
      {order.map((item, i) => {
        const key = keyOf(item, i);
        const dragging = dragKey === key;
        return (
          <div
            key={key}
            ref={el => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); }}
            style={{
              opacity: dragging ? 0.85 : 1,
              transform: dragging ? 'scale(1.01)' : 'none',
              transition: dragging ? 'none' : 'transform 0.15s ease',
            }}
          >
            {children(item, {
              index: i,
              dragging,
              handleProps: {
                onPointerDown: (e) => startDrag(e, key),
                style: { touchAction: 'none', cursor: disabled ? 'default' : 'grab' },
                'aria-label': 'Drag to reorder',
                title: 'Drag to reorder',
              },
            })}
          </div>
        );
      })}
    </div>
  );
}