import type { Doc, Entity, Id, Bounds } from '../model/types';
import type { V2 } from '../geom/vec';
import { entityBounds } from '../model/doc';
import { projectOnSegment } from '../geom/vec';

const MAX_CELLS = 400; // objects spanning more cells than this go on a short "big" list

/** Uniform grid over plan bounds, for hit-testing, box select, snapping and drawing only what's on screen. */
export class GridIndex {
  private cells = new Map<string, Set<Id>>();
  private boxes = new Map<Id, Bounds>();
  private big = new Set<Id>();
  constructor(private cell = 2000) {}

  rebuild(doc: Doc): void {
    this.cells.clear(); this.boxes.clear(); this.big.clear();
    for (const e of doc.entities.values()) this.update(e.id, entityBounds(doc, e));
  }

  private range(b: Bounds) {
    const c = this.cell;
    return { x0: Math.floor(b.min.x / c), x1: Math.floor(b.max.x / c), y0: Math.floor(b.min.y / c), y1: Math.floor(b.max.y / c) };
  }

  update(id: Id, b: Bounds | null): void {
    const old = this.boxes.get(id);
    if (old) {
      if (this.big.delete(id)) { /* was big */ } else {
        const r = this.range(old);
        for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) this.cells.get(x + ',' + y)?.delete(id);
      }
      this.boxes.delete(id);
    }
    if (!b) return;
    this.boxes.set(id, b);
    const r = this.range(b);
    if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > MAX_CELLS) { this.big.add(id); return; }
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) {
      const k = x + ',' + y; let s = this.cells.get(k); if (!s) this.cells.set(k, (s = new Set())); s.add(id);
    }
  }

  query(b: Bounds): Id[] {
    const out = new Set<Id>();
    const touch = (id: Id) => { const x = this.boxes.get(id)!; if (x.min.x <= b.max.x && x.max.x >= b.min.x && x.min.y <= b.max.y && x.max.y >= b.min.y) out.add(id); };
    const r = this.range(b);
    if ((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) > this.cells.size) { for (const id of this.boxes.keys()) touch(id); return [...out]; }
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) for (const id of this.cells.get(x + ',' + y) ?? []) touch(id);
    for (const id of this.big) touch(id);
    return [...out];
  }

  /** What's under p (within tol mm): fixtures beat trusses beat reference objects, then the nearest. */
  hit(p: V2, tol: number, doc: Doc, visible: (e: Entity) => boolean = () => true): Id | null {
    const rank = { fixture: 0, truss: 1, ref: 2 } as const;
    let best: { id: Id; r: number; d: number } | null = null;
    for (const id of this.query({ min: { x: p.x - tol - 400, y: p.y - tol - 400 }, max: { x: p.x + tol + 400, y: p.y + tol + 400 } })) {
      const e = doc.entities.get(id); if (!e || !visible(e)) continue;
      let d = Infinity;
      if (e.kind === 'fixture') { const o = e.matrix.o; d = Math.hypot(p.x - o.x, p.y - o.y); if (d > 300 + tol) continue; }
      else if (e.kind === 'truss') { d = Math.min(...e.legs.map(l => projectOnSegment(p, l.a, l.b).d)); if (d > e.boxSize / 2 + tol) continue; }
      else { const b = this.boxes.get(id)!; if (p.x < b.min.x - tol || p.x > b.max.x + tol || p.y < b.min.y - tol || p.y > b.max.y + tol) continue; d = 0; }
      const r = rank[e.kind];
      if (!best || r < best.r || (r === best.r && d < best.d)) best = { id, r, d };
    }
    return best?.id ?? null;
  }
}
