import type { Doc, Fixture, Truss, TrussSpacing } from '../core/model/types';
import type { FmtSettings } from '../domain/spacing';
import type { Camera } from './camera';
import { runMarks, markLabel, pointAt, zeroAlong, runLength } from '../domain/runMarks';

const ACCENT = '#ffb21e', WARN = '#ff6b4a', INK = '#e9e6df', MUTED = '#9097a3';

/** Spacing tool overlay: end labels A and B, the 0 marker, and each fixture's mark when there's room. */
export function drawSpacingOverlay(ctx: CanvasRenderingContext2D, cam: Camera, doc: Doc, t: Truss, st: TrussSpacing, S: FmtSettings): void {
  const fixtures = [...doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture' && e.trussId === t.id);
  const rows = runMarks(t, fixtures, st, S);
  const draft = t.state === 'draft';
  const end = (p: { x: number; y: number }, label: string) => {
    const s = cam.toScreen(p);
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1204'; ctx.font = '700 13px "Barlow Condensed", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, s.x, s.y + 0.5);
  };
  const L = runLength(t);
  end(pointAt(t, 0).p, 'A'); end(pointAt(t, L).p, 'B');
  // 0 marker across the truss
  const z = zeroAlong(t, st), zp = pointAt(t, z), zs = cam.toScreen(zp.p);
  const nx = -Math.sin(zp.yaw), ny = -Math.cos(zp.yaw), r = Math.max(18, (t.boxSize * cam.scale) / 2 + 10);
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath();
  ctx.moveTo(zs.x - nx * r, zs.y - ny * r); ctx.lineTo(zs.x + nx * r, zs.y + ny * r); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = ACCENT; ctx.font = '700 12px "JetBrains Mono", monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('0', zs.x + nx * r + 4, zs.y + ny * r);
  // marks under fixtures, when neighbours are far enough apart on screen
  const pts = rows.map(row => { const f = fixtures.find(x => x.id === row.id)!; return { row, s: cam.toScreen({ x: f.matrix.o.x, y: f.matrix.o.y }) }; });
  let minGap = Infinity; for (let i = 1; i < pts.length; i++) minGap = Math.min(minGap, Math.hypot(pts[i].s.x - pts[i - 1].s.x, pts[i].s.y - pts[i - 1].s.y));
  if (minGap < 46) return;
  ctx.font = `${draft ? 'italic ' : ''}600 11px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const { row, s } of pts) {
    ctx.fillStyle = row.near || row.offLine ? WARN : draft ? MUTED : INK;
    ctx.fillText(markLabel(row.mark, st, S), s.x, s.y + Math.max(14, 0.35 * 600 * cam.scale) + 16);
  }
}
