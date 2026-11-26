import { h } from './dom';

export function renderHelp(el: HTMLElement): void {
  const pair = (k: string, v: string) => [h('dt', { text: k }), h('dd', { text: v })];
  el.append(h('div', { class: 'body help' },
    h('p', { class: 'note', text: 'Phone' }),
    h('dl', {}, ...pair('Tap', 'Select (Select tool), or place a point (drawing tools)'), ...pair('Drag', 'Move what you drag; on empty space, pan'),
      ...pair('Pinch', 'Zoom'), ...pair('Two-finger tap', 'Undo'), ...pair('Long press', 'Select and show its details')),
    h('p', { class: 'note', text: 'Laptop' }),
    h('dl', {}, ...pair('Wheel / pinch', 'Zoom at the pointer (trackpad: pinch or Ctrl + scroll)'), ...pair('Middle-drag, Space + drag', 'Pan (trackpad: two-finger scroll)'), ...pair('Drag', 'Move what you drag; on empty space, box select (left to right: fully inside; right to left: crossing)'),
      ...pair('Shift + click', 'Add to or remove from the selection'), ...pair('Ctrl Z / Ctrl Shift Z', 'Undo / redo'), ...pair('Delete', 'Delete the selection'),
      ...pair('Ctrl D', 'Duplicate'), ...pair('Arrows', 'Nudge 100 mm (Alt: 10 mm)'), ...pair('F', 'Zoom to fit (or to the selection)'), ...pair('Esc', 'Clear selection, back to Select'),
      ...pair('Enter', 'Finish the truss you are drawing')),
    h('p', { class: 'note', text: 'Tools' }),
    h('dl', {}, ...pair('Spacing', 'Tap a truss: tape marks for where the LD put each fixture, from end A, the centre or end B. Re-space evenly as a backup.'),
      ...pair('Power', 'Fixtures coloured by circuit (neighbours only, 80% of 2400 W by default, 6 per Socapex, one Socapex run per truss). Copy power or export the sheet.'),
      ...pair('DMX', 'A daisy-chain per truss from the end you choose: each cable is the gap + 2 × truss depth + 0.5 m, rounded up to stock lengths. Copy cables for the pull list.'),
      ...pair('Export MVR', 'Job menu. Sends the rig back to the LD or the console; only what you changed is changed. Draft trusses are left out.')),
    h('p', { class: 'note', text: 'On a phone, Rotate and Measure are under More.' }),
    h('p', { class: 'note', text: 'Snapping finds truss ends, section joins, fixture centres and midpoints, and 15° angles while drawing. Draft trusses (dashed) were worked out from hanging positions: check their length and sections, then Confirm truss.' }),
  ));
}
