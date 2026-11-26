import type { Doc, Fixture, Id, TrussSpacing, Truss } from '../core/model/types';
import type { Command } from '../core/commands/history';
import { setProps } from '../core/commands/ops';
import { translate, withYaw, yawOf } from '../core/geom/matrix';
import { compute } from './spacing';
import { alongRun, pointAt, runLength } from './runMarks';
import { suggestSections } from '../tools/addTruss';

const OFF_LINE = 300;

/**
 * Re-spaces a truss's fixtures evenly with the v1 maths, as one undoable step. Fixtures keep their order along
 * the run, their height and their rotation relative to the leg. Fixtures well off the truss line stay put unless included.
 */
function plan(doc: Doc, trussId: Id, st: TrussSpacing, opts: { includeOffLine?: boolean }) {
  const t = doc.entities.get(trussId) as Truss | undefined;
  if (!t || t.kind !== 'truss') return { err: 'That truss no longer exists.' } as const;
  const all = [...doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture' && e.trussId === trussId)
    .map(f => ({ f, ...alongRun(t, { x: f.matrix.o.x, y: f.matrix.o.y }) }));
  const offLine = all.filter(x => x.lateral > OFF_LINE).length;
  const fx = all.filter(x => opts.includeOffLine || x.lateral <= OFF_LINE).sort((a, b) => a.s - b.s);
  if (!fx.length) return { err: all.length ? 'Every fixture is off the truss line. Tick "Include" to move them.' : 'No fixtures on this truss.', offLine } as const;
  // The drawn length, the same one the marks use, so the end gaps asked for are the ones the panel shows.
  const r = compute({
    sections: String(runLength(t)), count: fx.length, mode: st.mode, inset: st.inset, insetR: st.insetB,
    diffEnds: st.diffEnds, spacing: st.gap, ref: 'left', unit: 'mm', round: 0, joinWarn: 0,
  });
  if ('err' in r) return { err: r.err, offLine } as const;
  return { t, fx, r, offLine } as const;
}

/** What Re-space would do, for the preview line: how many fixtures move and the gap they'd get. */
export function respacePlan(doc: Doc, trussId: Id, st: TrussSpacing, opts: { includeOffLine?: boolean } = {}): { count: number; gap: number | null; warning: string; offLine: number } {
  const p = plan(doc, trussId, st, opts);
  if ('err' in p) return { count: 0, gap: null, warning: p.err ?? '', offLine: p.offLine ?? 0 };
  return { count: p.fx.length, gap: p.r.pos.length > 1 ? p.r.pos[1] - p.r.pos[0] : null, warning: p.r.warn, offLine: p.offLine };
}

export function respaceCommand(doc: Doc, trussId: Id, st: TrussSpacing, opts: { includeOffLine?: boolean } = {}): { command: Command | null; warning: string } {
  const p = plan(doc, trussId, st, opts);
  if ('err' in p) return { command: null, warning: p.err ?? '' };
  const { t, fx, r } = p;
  const legYaw = (i: number) => { const l = t.legs[i]; return Math.atan2(l.b.y - l.a.y, l.b.x - l.a.x); };
  const cmds = fx.map(({ f, leg }, k) => {
    const { p, yaw } = pointAt(t, r.pos[k]);
    // Keep the LD's rotation relative to the leg: no change on a straight truss, a quarter turn round a 90° corner.
    return setProps(f.id, { matrix: withYaw(translate(f.matrix, { x: p.x - f.matrix.o.x, y: p.y - f.matrix.o.y, z: 0 }), yawOf(f.matrix) + yaw - legYaw(leg)) });
  });
  const command: Command = { label: 'Re-space', do(d) { for (const c of cmds) c.do(d); }, undo(d) { for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(d); } };
  return { command, warning: r.warn };
}

/**
 * Confirms a truss. A straight truss with sections gets its real length from them, placed so end A is startGap
 * before the first fixture along the truss (so drawing and sections agree). A truss with corners keeps its shape;
 * legs without sections get suggested ones. One undo step.
 */
export function confirmCommand(doc: Doc, trussId: Id, sections: number[] | null, startGap: number): Command {
  const t = doc.entities.get(trussId) as Truss;
  const legLen = (l: Truss['legs'][number]) => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
  if (t.legs.length === 1 && sections && sections.length) {
    const l = t.legs[0], L = legLen(l) || 1, ux = (l.b.x - l.a.x) / L, uy = (l.b.y - l.a.y) / L;
    const fx = [...doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture' && e.trussId === trussId);
    const first = fx.length ? Math.min(...fx.map(f => alongRun(t, { x: f.matrix.o.x, y: f.matrix.o.y }).s)) : startGap;
    const s0 = first - startGap, total = sections.reduce((a, b) => a + b, 0);
    const a = { x: l.a.x + ux * s0, y: l.a.y + uy * s0, z: l.a.z }, b = { x: a.x + ux * total, y: a.y + uy * total, z: l.b.z };
    return { ...setProps(trussId, { state: 'confirmed', legs: [{ a, b, sections: sections.slice() }] }), label: 'Confirm truss' };
  }
  return { ...setProps(trussId, { state: 'confirmed', legs: t.legs.map(l => ({ ...l, sections: l.sections.length ? l.sections : suggestSections(legLen(l)) })) }), label: 'Confirm truss' };
}
