import type { Doc, Entity, Fixture, Id } from '../core/model/types';
import type { RigPower } from '../domain/powerRig';
import type { Camera } from './camera';
import { footprint } from './symbols';

/** Six mid-tone colours that read on the dark plot and on paper. Amber is left out: it means "selected". */
export const CIRCUIT_COLOURS = ['#3b9be8', '#c9c23a', '#3fae5a', '#9b6be0', '#18a7a0', '#8f9bb3'] as const;
export const OVER_COLOUR = '#ff4b3a';
/** Fixtures with no wattage: they count as 0 W, so they keep a warning look (with a '?' label). */
export const NO_WATTS_COLOUR = '#ff9a3c';
/** Darker label ink for the white Paper theme. */
const darken = (hex: string, k = 0.55) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');

/** Fixture → colour: circuits alternate through the palette along each run, so neighbours differ. */
export function powerColours(rp: RigPower): Map<Id, string> {
  const out = new Map<Id, string>();
  for (const g of rp.groups) {
    let k = -1, last = '';
    for (const id of g.fixtureIds) {
      const fp = rp.byFixture.get(id); if (!fp) continue;
      if (fp.label !== last) { k++; last = fp.label; }
      out.set(id, fp.over ? OVER_COLOUR : fp.watts == null ? NO_WATTS_COLOUR : CIRCUIT_COLOURS[k % CIRCUIT_COLOURS.length]);
    }
  }
  return out;
}

/** Circuit labels ("A3") above fixtures, each where it has room from its visible neighbours on the run.
    Fixtures stacked at one spot (a boom) share one label, e.g. "A1–A2". */
export function drawPowerOverlay(ctx: CanvasRenderingContext2D, cam: Camera, doc: Doc, rp: RigPower, visible: (e: Entity) => boolean, theme: 'dark' | 'paper', colours = powerColours(rp)): void {
  ctx.font = '700 11px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const g of rp.groups) {
    type Pt = { f: Fixture; x: number; y: number };
    const clusters: Pt[][] = [];
    for (const id of g.fixtureIds) {
      const f = doc.entities.get(id) as Fixture | undefined;
      if (!f || !visible(f)) continue;
      const s = cam.toScreen({ x: f.matrix.o.x, y: f.matrix.o.y }), last = clusters[clusters.length - 1]?.[0];
      if (last && Math.hypot(s.x - last.x, s.y - last.y) < 4) clusters[clusters.length - 1].push({ f, x: s.x, y: s.y });
      else clusters.push([{ f, x: s.x, y: s.y }]);
    }
    clusters.forEach((c, i) => {
      const { x, y } = c[0];
      if (x < -40 || y < -40 || x > cam.w + 40 || y > cam.h + 40) return;
      const d = (o?: Pt[]) => (o ? Math.hypot(o[0].x - x, o[0].y - y) : Infinity);
      if (Math.min(d(clusters[i - 1]), d(clusters[i + 1])) < 30) return;
      const fps = c.map(p => rp.byFixture.get(p.f.id)).filter((v): v is NonNullable<typeof v> => !!v);
      if (!fps.length) return;
      const labels = [...new Set(fps.map(fp => fp.label))];
      const text = (labels.length > 1 ? `${labels[0]}–${labels[labels.length - 1]}` : labels[0]) + (fps.some(fp => fp.watts == null) ? '?' : '');
      const size = footprint(doc.types.get(c[0].f.typeKey)?.category ?? 'generic') * cam.scale;
      const col = colours.get(c[0].f.id) ?? OVER_COLOUR;
      ctx.fillStyle = theme === 'paper' ? darken(col) : col;
      ctx.fillText(text, x, y - Math.max(6, size / 2) - 3);
    });
  }
}
