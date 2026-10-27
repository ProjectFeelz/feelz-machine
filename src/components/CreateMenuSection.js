import React from 'react';

/**
 * src/components/CreateMenuSection.js
 *
 * One group of rows in a create menu: a heading, a hue, and its buttons.
 *
 *
 * WHY IT IS ITS OWN FILE
 *
 * The artist menu (CreateMenuModal) and the listener menu (ListenerCreateMenu)
 * are two different components that have always had to look identical. They
 * each carried their own copy of the row markup, and the copies had already
 * drifted apart in padding and text opacity. Grouping them meant writing the
 * same gradient twice, which is how the next pair of copies drifts too.
 *
 * So the row lives here and both menus render it. A change to the look lands
 * in both, which is the only reason this file exists.
 *
 *
 * THE HUES
 *
 * Each group passes a `tint` as an [r, g, b] triple, and the menus step
 * through the spectrum down the sheet — amber, pink, violet, blue, slate — so
 * the whole menu reads as one gradient rather than five unrelated colours.
 * The tint drives three things at once: the row's left-to-right wash, its
 * border, and the icon tile. Keeping them from one value is what stops a row
 * ending up with a blue edge and a pink icon.
 *
 * The groups are deliberately the same colours in both menus, so "the blue
 * band is my account" holds wherever you are.
 */
export const MENU_TINTS = {
  create:  [250, 204, 21],    // amber
  fans:    [244, 114, 182],   // pink
  profile: [167, 139, 250],   // violet
  account: [96, 165, 250],    // blue
  more:    [148, 163, 184],   // slate
};

export default function CreateMenuSection({ heading, tint, items }) {
  const rows = (items || []).filter(Boolean);
  // An empty group would render a heading over nothing. That happens on its
  // own here — newsletter is editors only, Sessions is gated, merch is
  // parked — so it is handled rather than left to each caller to remember.
  if (!rows.length) return null;

  const [r, g, b] = tint;

  return (
    <div className="space-y-2">
      <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wider"
         style={{ color: `rgba(${r},${g},${b},0.75)` }}>
        {heading}
      </p>

      {rows.map(({ id, icon, label, sub, onClick }) => (
        <button key={id} onClick={onClick}
          className="w-full flex items-center space-x-3 p-3.5 rounded-2xl border transition active:scale-[0.98] text-left"
          style={{
            borderColor: `rgba(${r},${g},${b},0.18)`,
            background: `linear-gradient(100deg, rgba(${r},${g},${b},0.13) 0%, rgba(${r},${g},${b},0.04) 42%, rgba(255,255,255,0.02) 100%)`,
          }}>
          <span className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-xl"
                style={{ background: `rgba(${r},${g},${b},0.16)` }}>
            {icon}
          </span>
          {/* min-w-0 so a long subtitle wraps inside the row instead of
              pushing the button wider than the sheet. */}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className="text-xs text-white/35 mt-0.5">{sub}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
