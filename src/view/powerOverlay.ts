import type { Doc, Entity, Fixture, Id } from '../core/model/types';
import type { RigPower } from '../domain/powerRig';
import type { Camera } from './camera';
import { footprint } from './symbols';

/** Six mid-tone colours that read on the dark plot and on paper. Amber is left out: it means "selected". */
export const CIRCUIT_COLOURS = ['#3b9be8', '#e0569b', '#3fae5a', '#9b6be0', '#18a7a0', '#b9824a'] as const;
export const OVER_COLOUR = '#ff4b3a';

/** Fixture → colour: circuits alternate through the palette along each run, so neighbours differ. */
export function powerColours(rp: RigPower): Map<Id, string> {
  const out = new Map<Id, string>();
  for (const g of rp.groups) {
    let k = -1, last = '';
    for (const id of g.fixtureIds) {
      const fp = rp.byFixture.get(id); if (!fp) continue;
      if (fp.label !== last) { k++; last = fp.label; }
      out.set(id, fp.over ? OVER_COLOUR : CIRCUIT_COLOURS[k % CIRCUIT_COLOURS.length]);
    }
  }
  return out;
}

/** Circuit labels ("A3") above each fixture when neighbours on the run are far enough apart on screen. */
export function drawPowerOverlay(ctx: CanvasRenderingContext2D, cam: Camera, doc: Doc, rp: RigPower, visible: (e: Entity) => boolean, _theme: 'dark' | 'paper', colours = powerColours(rp)): void {
  ctx.font = '700 11px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const g of rp.groups) {
    const pts: { f: Fixture; x: number; y: number }[] = [];
    for (const id of g.fixtureIds) {
      const f = doc.entities.get(id) as Fixture | undefined;
      if (!f || !visible(f)) continue;
      const s = cam.toScreen({ x: f.matrix.o.x, y: f.matrix.o.y });
      pts.push({ f, x: s.x, y: s.y });
    }
    let minGap = Infinity;
    for (let i = 1; i < pts.length; i++) minGap = Math.min(minGap, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    if (minGap < 30) continue;
    for (const { f, x, y } of pts) {
      if (x < -40 || y < -40 || x > cam.w + 40 || y > cam.h + 40) continue;
      const fp = rp.byFixture.get(f.id); if (!fp) continue;
      const size = footprint(doc.types.get(f.typeKey)?.category ?? 'generic') * cam.scale;
      ctx.fillStyle = colours.get(f.id) ?? OVER_COLOUR;
      ctx.fillText(fp.watts == null ? fp.label + '?' : fp.label, x, y - Math.max(6, size / 2) - 3);
    }
  }
}
