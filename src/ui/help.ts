import { h } from './dom';

export function renderHelp(el: HTMLElement): void {
  const pair = (k: string, v: string) => [h('dt', { text: k }), h('dd', { text: v })];
  el.append(h('div', { class: 'body help' },
    h('p', { class: 'note', text: 'Phone' }),
    h('dl', {}, ...pair('Tap', 'Select (Select tool), or place a point (drawing tools)'), ...pair('Drag', 'Move what you drag; on empty space, pan'),
      ...pair('Pinch', 'Zoom'), ...pair('Two-finger tap', 'Undo'), ...pair('Long press', 'Select and show its details')),
    h('p', { class: 'note', text: 'Laptop' }),
    h('dl', {}, ...pair('Wheel', 'Zoom at the pointer'), ...pair('Drag', 'Move what you drag; on empty space, box select (left to right: fully inside; right to left: crossing)'),
      ...pair('Shift + click', 'Add to or remove from the selection'), ...pair('Ctrl Z / Ctrl Shift Z', 'Undo / redo'), ...pair('Delete', 'Delete the selection'),
      ...pair('Ctrl D', 'Duplicate'), ...pair('Arrows', 'Nudge 100 mm (Alt: 10 mm)'), ...pair('F', 'Zoom to fit (or to the selection)'), ...pair('Esc', 'Clear selection, back to Select'),
      ...pair('Enter', 'Finish the truss you are drawing')),
    h('p', { class: 'note', text: 'Snapping finds truss ends, section joins, fixture centres and midpoints, and 15° angles while drawing. Draft trusses (dashed) were worked out from hanging positions: check their length and sections, then Confirm truss.' }),
  ));
}
