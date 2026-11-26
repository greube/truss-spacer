/* The scaled plot page for the PDF pack: A3 landscape, the plan at a standard scale, a title block on the right. */
import type { Doc, Entity, Fixture, Truss, RefObject, Category } from '../core/model/types';
import type { Pdf } from '../io/pdf';
import { entityBounds } from '../core/model/doc';
import { formatUA } from '../core/geom/address';
import { yawOf } from '../core/geom/matrix';
import { footprint } from '../view/symbols';

export const PAGE = { w: 420, h: 297 }, MARGIN = 10, STRIP = 60;
const SCALES = [20, 25, 50, 75, 100, 200, 250, 500];
const INK: [number, number, number] = [22, 24, 28], MUTED: [number, number, number] = [102, 109, 120], REF: [number, number, number] = [170, 176, 186], DRAFT: [number, number, number] = [201, 127, 0];

/** The largest standard scale at which the drawing fits the area; otherwise scaled to fit and not to scale. */
export function pickScale(b: { w: number; h: number }, area: { w: number; h: number }): { denom: number; fits: boolean } {
  for (const d of SCALES) if (b.w / d <= area.w && b.h / d <= area.h) return { denom: d, fits: true };
  return { denom: Math.max(b.w / area.w, b.h / area.h) * 1.0001, fits: false };
}

const label = (f: Fixture) => (f.unitNumber != null ? String(f.unitNumber) : f.fixtureId || '');
/** Text angle kept readable (never upside down). */
const readable = (a: number) => { let r = a; while (r > Math.PI / 2) r -= Math.PI; while (r <= -Math.PI / 2) r += Math.PI; return r; };

export function drawPlotPage(pdf: Pdf, doc: Doc, o: { jobName: string; source: string; sheet: number; sheets: number; visible(e: Entity): boolean }): void {
  pdf.page(PAGE.w, PAGE.h);
  const area = { x: MARGIN, y: MARGIN, w: PAGE.w - 2 * MARGIN - STRIP - 5, h: PAGE.h - 2 * MARGIN };
  const ents = [...doc.entities.values()].filter(e => o.visible(e));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  // scale to the rig (trusses and fixtures) plus 2 m all round; reference objects far away (point loads, things
  // placed at 0,0) would otherwise shrink it, so they're clipped to the frame instead
  const allRig = ents.filter(e => e.kind !== 'ref');
  // a few rig objects stranded far away (placed at 0,0 by the import) mustn't shrink the plot either
  const centre = (e: Entity) => { const b = entityBounds(doc, e); return { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 }; };
  const window = (vals: number[]) => {
    const v = vals.slice().sort((a, b) => a - b), lo = v[Math.floor(0.05 * (v.length - 1))], hi = v[Math.ceil(0.95 * (v.length - 1))], r = Math.max(hi - lo, 10000);
    return [lo - r, hi + r];
  };
  // Only when the whole rig won't fit at 1:250 or better: drop a few loose objects (never trusses or what hangs on
  // them) far outside the 5th–95th percentile window, so a real front-of-house truss or second room stays on
  const boundsOf = (es: Entity[]) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const e of es) { const bb = entityBounds(doc, e); a = Math.min(a, bb.min.x); b = Math.min(b, bb.min.y); c = Math.max(c, bb.max.x); d = Math.max(d, bb.max.y); } return { w: c - a + 4000, h: d - b + 4000 }; };
  const whole = allRig.length ? pickScale(boundsOf(allRig), area) : { denom: 1, fits: true };
  const cs = allRig.map(centre), [x0, x1] = allRig.length ? window(cs.map(c => c.x)) : [0, 0], [y0, y1] = allRig.length ? window(cs.map(c => c.y)) : [0, 0];
  const anchored = (e: Entity) => e.kind === 'truss' || (e.kind === 'fixture' && !!e.trussId && !!doc.entities.get(e.trussId));
  const filter = !(whole.fits && whole.denom <= 250);
  const rigEnts = allRig.filter((e, i) => !filter || anchored(e) || (cs[i].x >= x0 && cs[i].x <= x1 && cs[i].y >= y0 && cs[i].y <= y1));
  const stranded = allRig.length - rigEnts.length, sized = rigEnts.length ? rigEnts : ents;
  for (const e of sized) { const b = entityBounds(doc, e); minX = Math.min(minX, b.min.x); minY = Math.min(minY, b.min.y); maxX = Math.max(maxX, b.max.x); maxY = Math.max(maxY, b.max.y); }
  if (!sized.length) { minX = minY = 0; maxX = maxY = 1000; }
  if (rigEnts.length) { minX -= 2000; minY -= 2000; maxX += 2000; maxY += 2000; }
  const { denom, fits } = pickScale({ w: maxX - minX || 1, h: maxY - minY || 1 }, area);
  const ox = area.x + (area.w - (maxX - minX) / denom) / 2, oy = area.y + (area.h - (maxY - minY) / denom) / 2;
  const P = (x: number, y: number) => ({ x: ox + (x - minX) / denom, y: oy + (maxY - y) / denom });
  const mm = (v: number) => v / denom;

  // frame
  pdf.stroke(INK).width(0.5).dash(null).rect(MARGIN / 2, MARGIN / 2, PAGE.w - MARGIN, PAGE.h - MARGIN);

  pdf.clip(area.x - 2, area.y - 2, area.w + 4, area.h + 4);
  // reference objects
  pdf.stroke(REF).width(0.2);
  for (const e of ents) if (e.kind === 'ref') { const b = entityBounds(doc, e as RefObject), a = P(b.min.x, b.max.y); pdf.rect(a.x, a.y, mm(b.max.x - b.min.x), mm(b.max.y - b.min.y)); }

  // trusses
  for (const t of ents.filter((e): e is Truss => e.kind === 'truss')) {
    const draft = t.state === 'draft', col = draft ? DRAFT : INK, hw = t.boxSize / 2;
    pdf.stroke(col).fill(col).dash(draft ? [2, 1.2] : null);
    t.legs.forEach((l, i) => {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * hw, ny = dx / L * hw;
      pdf.width(0.35).poly([P(l.a.x + nx, l.a.y + ny), P(l.b.x + nx, l.b.y + ny), P(l.b.x - nx, l.b.y - ny), P(l.a.x - nx, l.a.y - ny)], true);
      pdf.width(0.12).line(P(l.a.x, l.a.y).x, P(l.a.x, l.a.y).y, P(l.b.x, l.b.y).x, P(l.b.x, l.b.y).y);
      if (i === 0) {
        const ang = readable(Math.atan2(dy, dx)), m = P((l.a.x + l.b.x) / 2 + nx * 2.2, (l.a.y + l.b.y) / 2 + ny * 2.2);
        pdf.text(m.x, m.y, draft ? `DRAFT · ${t.name}` : t.name, 7, { font: 'HB', align: 'center', rotate: ang });
      }
    });
  }
  pdf.dash(null);

  // fixtures
  const counts = new Map<string, number>();
  for (const f of ents.filter((e): e is Fixture => e.kind === 'fixture')) {
    const type = doc.types.get(f.typeKey), cat: Category = type?.category ?? 'generic';
    counts.set(type?.n || f.name || 'Unknown type', (counts.get(type?.n || f.name || 'Unknown type') ?? 0) + 1);
    const c = P(f.matrix.o.x, f.matrix.o.y), s = Math.max(1.2, mm(footprint(cat))), r = s / 2, yaw = yawOf(f.matrix);
    pdf.stroke(INK).width(0.2);
    const rot = (x: number, y: number) => ({ x: c.x + x * Math.cos(yaw) + y * Math.sin(yaw), y: c.y - x * Math.sin(yaw) + y * Math.cos(yaw) });
    if (cat === 'strip') pdf.poly([rot(-r * 0.18, -r), rot(r * 0.18, -r), rot(r * 0.18, r), rot(-r * 0.18, r)], true);
    else if (cat === 'wash' || cat === 'strobe') pdf.poly([rot(-r * 0.8, -r * 0.8), rot(r * 0.8, -r * 0.8), rot(r * 0.8, r * 0.8), rot(-r * 0.8, r * 0.8)], true);
    else if (cat === 'profile') pdf.poly([rot(-r, -r * 0.35), rot(r, -r * 0.35), rot(r, r * 0.35), rot(-r, r * 0.35)], true);
    else { pdf.circle(c.x, c.y, r * 0.75); if (cat === 'spot') { const a = rot(r * 0.75, 0), b = rot(r, 0); pdf.line(a.x, a.y, b.x, b.y); } }
    if (s >= 2.5) {
      const size = Math.min(6, Math.max(3.5, s * 1.1)), lines = [label(f), f.address != null ? formatUA(f.address) : ''].filter(Boolean);
      pdf.fill(INK);
      lines.forEach((t, i) => pdf.text(c.x, c.y + r + 0.4 + (i + 1) * size * 0.36, t, size, { align: 'center' }));
    }
  }

  pdf.restore();
  // title block
  const tx = PAGE.w - MARGIN - STRIP, tw = STRIP;
  pdf.stroke(INK).width(0.35).line(tx - 2.5, MARGIN / 2, tx - 2.5, PAGE.h - MARGIN / 2);
  let y = MARGIN + 6;
  const line = (t: string, size: number, font: 'H' | 'HB' = 'H', col = INK) => { pdf.fill(col).text(tx, y, t, size, { font }); y += size * 0.45 + 1.2; };
  line('TRUSS CAD', 14, 'HB');
  line(pdf.fit(o.jobName || 'Job', tw, 10, 'HB'), 10, 'HB');
  if (o.source) line(pdf.fit(o.source, tw, 7), 7, 'H', MUTED);
  line(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }), 7, 'H', MUTED);
  y += 2;
  line(fits ? `Scale 1:${denom}` : 'Not to scale', 9, 'HB');
  line('Printed on A3 landscape', 6, 'H', MUTED);
  if (fits) { // scale bar: the largest round length up to 50 mm on paper
    const len = [500, 1000, 2000, 5000, 10000, 20000].filter(v => v / denom <= 50).pop() ?? 500, w = len / denom;
    pdf.stroke(INK).width(0.3).rect(tx, y, w, 1.6).fill(INK).rect(tx, y, w / 2, 1.6, 'F');
    y += 5; line(`${len / 1000} m`, 6);
  }
  line(`Sheet ${o.sheet} of ${o.sheets}`, 8);
  y += 3; line('Fixtures', 8, 'HB');
  const keys = [...counts].sort((a, b) => b[1] - a[1]);
  for (const [name, n] of keys.slice(0, 24)) line(pdf.fit(name, tw, 6.5, 'H', ` × ${n}`), 6.5);
  if (keys.length > 24) line(`+${keys.length - 24} more types`, 6.5, 'H', MUTED);
  if (stranded) { y += 2; for (const l of pdf.wrapTo(`${stranded} object${stranded === 1 ? '' : 's'} far from the rig ${stranded === 1 ? 'is' : 'are'} off this plot.`, tw, 6)) line(l, 6, 'H', DRAFT); }
  const drafts = ents.filter(e => e.kind === 'truss' && e.state === 'draft').length;
  if (drafts) { y += 2; for (const l of pdf.wrapTo(`${drafts} draft truss${drafts === 1 ? '' : 'es'} (dashed): estimated, confirm before marking out.`, tw, 6)) line(l, 6, 'H', DRAFT); }
}
