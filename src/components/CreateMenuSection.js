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
 * through the spectrum down the sheet (amber, pink, violet, blue, slate) so
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
  now:     [251, 146, 60],    // orange: something running right now
  money:   [52, 211, 153],    // green: what you earn
};

// Folding groups. `collapsible` groups show as one tile (their name, a peek at
// what is inside and how many) and open when tapped, so the menu stays one
// screen tall instead of a long scroll. The menus keep only one group open at
// a time by passing `open` and `onToggle`; a group that is not collapsible is
// always open (Create, and whatever is happening right now).
// Icons are lucide components drawn in the group's hue, so every row, tile and
// folded group reads as one family. A folded group shows ONE icon (its own
// `icon`), not a stack of its contents.
function Glyph({ icon: Icon, tint, size = 'w-5 h-5' }) {
  if (!Icon) return null;
  const [r, g, b] = tint;
  return <Icon className={size} style={{ color: `rgb(${r},${g},${b})` }} strokeWidth={2} />;
}

export default function CreateMenuSection({ heading, icon: groupIcon, tint, items, collapsible = false, open = true, onToggle }) {
  const rows = (items || []).filter(Boolean);
  // An empty group would render a heading over nothing. That happens on its
  // own here (newsletter is editors only, Sessions is gated, merch is
  // parked), so it is handled rather than left to each caller to remember.
  if (!rows.length) return null;

  const [r, g, b] = tint;
  // One thing on its own is just shown: folding it would only add a tap.
  const folds = collapsible && rows.length > 1;
  const showRows = !folds || open;

  const rowButtons = rows.map(({ id, icon, label, sub, onClick }) => (
    <button key={id} onClick={onClick}
      className="w-full flex items-center space-x-3 p-3.5 rounded-2xl border transition active:scale-[0.98] text-left"
      style={{
        borderColor: `rgba(${r},${g},${b},0.18)`,
        background: `linear-gradient(100deg, rgba(${r},${g},${b},0.13) 0%, rgba(${r},${g},${b},0.04) 42%, rgba(255,255,255,0.02) 100%)`,
      }}>
      <span className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl"
            style={{ background: `rgba(${r},${g},${b},0.16)` }}>
        <Glyph icon={icon} tint={tint} />
      </span>
      {/* min-w-0 so a long subtitle wraps inside the row instead of
          pushing the button wider than the sheet. */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs text-white/35 mt-0.5">{sub}</p>
      </div>
    </button>
  ));

  if (!folds) {
    // An always-open group with several things in it is a grid of tiles
    // (icon and name) so the most used actions fit at a glance.
    const tiles = !collapsible && rows.length > 1;
    return (
      <div className="space-y-2">
        <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-wider"
           style={{ color: `rgba(${r},${g},${b},0.75)` }}>
          {heading}
        </p>
        {tiles ? (
          <div className="grid grid-cols-2 gap-2">
            {rows.map(({ id, icon, label, onClick }) => (
              <button key={id} onClick={onClick}
                className="flex items-center gap-2.5 p-3 rounded-2xl border transition active:scale-[0.97] text-left"
                style={{
                  borderColor: `rgba(${r},${g},${b},0.2)`,
                  background: `linear-gradient(135deg, rgba(${r},${g},${b},0.15) 0%, rgba(${r},${g},${b},0.04) 70%)`,
                }}>
                <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl"
                      style={{ background: `rgba(${r},${g},${b},0.18)` }}>
                  <Glyph icon={icon} tint={tint} />
                </span>
                <span className="text-[13px] font-semibold text-white leading-tight min-w-0">{label}</span>
              </button>
            ))}
          </div>
        ) : rowButtons}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden transition-colors"
         style={{ borderColor: `rgba(${r},${g},${b},${open ? 0.3 : 0.16})`, background: `rgba(${r},${g},${b},${open ? 0.05 : 0.025})` }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-3 p-3 text-left active:scale-[0.99] transition">
        <span className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl"
              style={{ background: `rgba(${r},${g},${b},0.18)` }}>
          <Glyph icon={groupIcon || rows[0].icon} tint={tint} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{heading}</span>
          <span className="block text-xs text-white/35 mt-0.5 truncate">{rows.map(x => x.label).join(' · ')}</span>
        </span>
        <svg viewBox="0 0 24 24" className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
             fill="none" stroke={`rgba(${r},${g},${b},0.9)`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {showRows && <div className="px-2 pb-2 space-y-2">{rowButtons}</div>}
    </div>
  );
}
