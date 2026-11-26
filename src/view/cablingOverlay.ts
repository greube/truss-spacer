import type { Doc, Entity, Fixture, Truss } from '../core/model/types';
import type { V2 } from '../core/geom/vec';
import type { RigCabling } from '../domain/cabling';
import type { Camera } from './camera';
import { alongRun, pointAt, runLength } from '../domain/runMarks';
import { CIRCUIT_COLOURS } from './powerOverlay';

const legLen = (l: Truss['legs'][number]) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

/** World points along a truss from s0 to s1 (through any corners), pushed sideways by off mm. */
function pathAlong(t: Truss, s0: number, s1: number, off: number): V2[] {
  const stops = [s0]; let acc = 0;
  for (const l of t.legs.slice(0, -1)) { acc += legLen(l); if (acc > Math.min(s0, s1) && acc < Math.max(s0, s1)) stops.push(acc); }
  stops.push(s1); if (s1 < s0) { const mid = stops.slice(1, -1).reverse(); stops.splice(1, mid.length, ...mid); }
  return stops.map(s => { const { p, yaw } = pointAt(t, s); return { x: p.x - Math.sin(yaw) * off, y: p.y + Math.cos(yaw) * off }; });
}

/** DMX chains: a line per chain from the feed end through its fixtures, the stock length of each cable, and a DMX marker. */
export function drawCablingOverlay(ctx: CanvasRenderingContext2D, cam: Camera, doc: Doc, rc: RigCabling, picked: string | null, visible: (e: Entity) => boolean, theme: 'dark' | 'paper'): void {
  const ink = theme === 'paper' ? '#16181c' : '#e9e6df';
  for (const r of rc.runs) {
    const t = r.kind === 'truss' ? (doc.entities.get(r.group) as Truss | undefined) : undefined;
    if (t && !visible(t)) continue;
    const on = picked == null || picked === r.group, L = t ? runLength(t) : 0;
    r.chains.forEach((ch, ci) => {
      const col = CIRCUIT_COLOURS[ci % CIRCUIT_COLOURS.length];
      const off = t ? t.boxSize * 0.4 + ci * 120 : 0;
      ctx.globalAlpha = on ? 1 : 0.35; ctx.strokeStyle = col; ctx.lineWidth = on && picked ? 2.5 : 1.5; ctx.setLineDash([]);
      for (const c of ch.cables) {
        const to = doc.entities.get(c.toId) as Fixture | undefined; if (!to) continue;
        const from = c.fromId ? (doc.entities.get(c.fromId) as Fixture | undefined) : undefined;
        const toPt = { x: to.matrix.o.x, y: to.matrix.o.y };
        let pts: V2[];
        if (t) {
          const sTo = alongRun(t, toPt).s, sFrom = from ? alongRun(t, { x: from.matrix.o.x, y: from.matrix.o.y }).s : r.from === 'a' ? 0 : L;
          pts = pathAlong(t, sFrom, sTo, off);
        } else pts = [from ? { x: from.matrix.o.x, y: from.matrix.o.y } : toPt, toPt];
        const sp = pts.map(p => cam.toScreen(p));
        ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y); for (const p of sp.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke();
        if (!from && t) { // feed marker at the truss end
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sp[0].x, sp[0].y, 4, 0, Math.PI * 2); ctx.fill();
          if (on) { ctx.font = '700 11px "Barlow Condensed", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(ch.universe != null ? `DMX U${ch.universe}` : 'DMX', sp[0].x, sp[0].y - 6); }
        }
        const a = sp[0], b = sp[sp.length - 1];
        if (on && Math.hypot(b.x - a.x, b.y - a.y) > 44) {
          const m = sp[Math.floor((sp.length - 1) / 2)], n = sp[Math.floor((sp.length - 1) / 2) + 1] ?? m;
          ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = c.over ? '#ff4b3a' : ink;
          ctx.fillText(`${c.count > 1 ? c.count + '×' : ''}${c.len / 1000}m`, (m.x + n.x) / 2, (m.y + n.y) / 2 - 7);
        }
      }
      ctx.globalAlpha = 1;
    });
  }
}
