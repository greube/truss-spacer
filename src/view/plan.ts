import type { Doc, Entity, Id, Fixture, Truss, RefObject } from '../core/model/types';
import type { GridIndex } from '../core/index/grid';
import type { Camera } from './camera';
import { yawOf } from '../core/geom/matrix';
import { formatUA } from '../core/geom/address';
import { drawSymbol, footprint } from './symbols';

export interface ViewState {
  doc: Doc; camera: Camera; index: GridIndex; selection: Set<Id>; hover: Id | null;
  preview: ((ctx: CanvasRenderingContext2D, cam: Camera) => void) | null; theme: 'dark' | 'paper';
  /** Per-fixture colour from the active tool (power circuits), used when the fixture isn't selected. */
  fixtureColour?: ((f: Fixture) => string | null) | null;
}

const DOT_BELOW = 6, LABELS_FROM = 28; // px
const GRID_STEPS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const DARK = { bg: '#14161b', grid: '#20242b', gridMajor: '#2a2f38', ink: '#e9e6df', muted: '#7d8591', truss: '#c9ccd2', accent: '#ffb21e', warn: '#ff6b4a', draft: '#ffb21e', ref: '#4a515c' };
const PAPER = { bg: '#ffffff', grid: '#eef0f3', gridMajor: '#dde1e6', ink: '#16181c', muted: '#666d78', truss: '#3a3f48', accent: '#c97f00', warn: '#d13b1c', draft: '#c97f00', ref: '#b9bfc8' };

/** Canvas 2D plan (top) view with level of detail. Draws only visible layers/classes inside the view. */
export class PlanRenderer {
  stats = { trusses: 0, fixtures: 0, symbols: 0, refs: 0, labels: 0, ms: 0 };
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  constructor(private canvas: HTMLCanvasElement, private getState: () => ViewState) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    this.dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.getState().camera.setViewport(w, h);
  }

  draw(): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const s = this.getState(), { doc, camera: cam } = s, ctx = this.ctx;
    const C = s.theme === 'paper' ? PAPER : DARK;
    this.stats = { trusses: 0, fixtures: 0, symbols: 0, refs: 0, labels: 0, ms: 0 };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, cam.w, cam.h);
    this.drawGrid(C);

    const layerOn = new Map(doc.layers.map(l => [l.id, l.visible])), classOn = new Map(doc.classes.map(c => [c.id, c.visible]));
    const visible = (e: Entity) => layerOn.get(e.layerId) !== false && (!e.classId || classOn.get(e.classId) !== false);
    const vb = cam.viewBounds();
    const ids = s.index.query({ min: { x: vb.min.x - 1000, y: vb.min.y - 1000 }, max: { x: vb.max.x + 1000, y: vb.max.y + 1000 } });
    const refs: RefObject[] = [], trusses: Truss[] = [], fixtures: Fixture[] = [];
    for (const id of ids) {
      const e = doc.entities.get(id); if (!e || !visible(e)) continue;
      if (e.kind === 'ref') refs.push(e); else if (e.kind === 'truss') trusses.push(e); else fixtures.push(e);
    }
    for (const r of refs) this.drawRef(r, C);
    for (const t of trusses) this.drawTruss(t, s.selection.has(t.id) || s.hover === t.id, C);
    for (const f of fixtures) this.drawFixture(f, s, C);
    if (s.preview) { ctx.save(); s.preview(ctx, cam); ctx.restore(); }
    this.stats.ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  }

  private drawGrid(C: typeof DARK) {
    const { camera: cam } = this.getState(), ctx = this.ctx;
    const step = GRID_STEPS.find(g => g * cam.scale >= 24) ?? GRID_STEPS[GRID_STEPS.length - 1];
    const vb = cam.viewBounds();
    ctx.lineWidth = 1;
    for (const major of [false, true]) {
      const st = major ? step * 5 : step;
      ctx.strokeStyle = major ? C.gridMajor : C.grid; ctx.beginPath();
      for (let x = Math.floor(vb.min.x / st) * st; x <= vb.max.x; x += st) { const sx = Math.round(cam.toScreen({ x, y: 0 }).x) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, cam.h); }
      for (let y = Math.floor(vb.min.y / st) * st; y <= vb.max.y; y += st) { const sy = Math.round(cam.toScreen({ x: 0, y }).y) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(cam.w, sy); }
      ctx.stroke();
    }
  }

  private drawRef(r: RefObject, C: typeof DARK) {
    const { camera: cam } = this.getState(), ctx = this.ctx, b = r.bounds;
    if (!b) return;
    const m = r.matrix;
    const corner = (x: number, y: number) => cam.toScreen({ x: m.o.x + m.u.x * x + m.v.x * y, y: m.o.y + m.u.y * x + m.v.y * y });
    const pts = [corner(b.min.x, b.min.y), corner(b.max.x, b.min.y), corner(b.max.x, b.max.y), corner(b.min.x, b.max.y)];
    ctx.strokeStyle = C.ref; ctx.lineWidth = 1; ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
    this.stats.refs++;
  }

  private drawTruss(t: Truss, hot: boolean, C: typeof DARK) {
    const { camera: cam } = this.getState(), ctx = this.ctx;
    const col = hot ? C.accent : t.state === 'draft' ? C.draft : C.truss;
    ctx.strokeStyle = col; ctx.lineWidth = hot ? 2 : 1.25;
    ctx.setLineDash(t.state === 'draft' ? [6, 4] : []);
    for (const l of t.legs) {
      const a = cam.toScreen(l.a), b = cam.toScreen(l.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const half = Math.max((t.boxSize * cam.scale) / 2, 1.5);
      if (len < 1) { ctx.strokeRect(a.x - half, a.y - half, half * 2, half * 2); continue; } // tower seen from above
      const nx = (-(b.y - a.y) / len) * half, ny = ((b.x - a.x) / len) * half;
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(b.x + nx, b.y + ny); ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(b.x - nx, b.y - ny);
      ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(a.x - nx, a.y - ny); ctx.moveTo(b.x + nx, b.y + ny); ctx.lineTo(b.x - nx, b.y - ny);
      // section joins
      const Lmm = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y); let acc = 0;
      if (half > 2) for (const s of l.sections.slice(0, -1)) { acc += s; if (acc >= Lmm) break; const k = acc / Lmm; const x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k; ctx.moveTo(x + nx * 1.6, y + ny * 1.6); ctx.lineTo(x - nx * 1.6, y - ny * 1.6); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const a = cam.toScreen(t.legs[0].a), b = cam.toScreen(t.legs[0].b);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 80) {
      ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
      let ang = Math.atan2(b.y - a.y, b.x - a.x); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; ctx.rotate(ang);
      ctx.fillStyle = col; ctx.font = '600 11px "Barlow Condensed", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText((t.state === 'draft' ? 'DRAFT · ' : '') + t.name.toUpperCase(), 0, -Math.max((t.boxSize * cam.scale) / 2, 1.5) - 3);
      ctx.restore(); this.stats.labels++;
    }
    this.stats.trusses++;
  }

  private drawFixture(f: Fixture, s: ViewState, C: typeof DARK) {
    const { camera: cam, doc } = s, ctx = this.ctx;
    const type = doc.types.get(f.typeKey);
    const cat = type?.category ?? 'generic';
    const p = cam.toScreen({ x: f.matrix.o.x, y: f.matrix.o.y });
    const size = footprint(cat) * cam.scale;
    const sel = s.selection.has(f.id) || s.hover === f.id;
    const tint = sel ? null : s.fixtureColour?.(f) ?? null;
    const col = sel ? C.accent : tint ?? (type && type.w == null ? C.warn : C.ink);
    this.stats.fixtures++;
    if (size < DOT_BELOW) { ctx.fillStyle = col; ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3); return; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-yawOf(f.matrix));
    drawSymbol(ctx, cat, size, sel, col); ctx.restore();
    this.stats.symbols++;
    if (size >= LABELS_FROM) {
      const L = doc.settings.labels, lines: string[] = [];
      if (L.unit && f.unitNumber != null) lines.push(String(f.unitNumber));
      if (L.fid && f.fixtureId) lines.push('#' + f.fixtureId);
      if (L.addr && f.address != null) lines.push(formatUA(f.address));
      if (lines.length) {
        ctx.fillStyle = col; ctx.font = `600 ${Math.min(14, Math.max(10, size / 4))}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        lines.forEach((t, i) => ctx.fillText(t, p.x, p.y + size / 2 + 2 + i * 13));
        this.stats.labels++;
      }
    }
  }
}
