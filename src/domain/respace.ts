import type { Doc, Fixture, Id, TrussSpacing, Truss } from '../core/model/types';
import type { Command } from '../core/commands/history';
import { setProps } from '../core/commands/ops';
import { translate, withYaw } from '../core/geom/matrix';
import { compute } from './spacing';
import { alongRun, pointAt, runSections } from './runMarks';

const OFF_LINE = 300;

/**
 * Re-spaces a truss's fixtures evenly with the v1 maths, as one undoable step. Fixtures keep their order along
 * the run and their height; each turns to follow its leg. Fixtures well off the truss line stay put unless included.
 */
export function respaceCommand(doc: Doc, trussId: Id, st: TrussSpacing, opts: { includeOffLine?: boolean } = {}): { command: Command | null; warning: string } {
  const t = doc.entities.get(trussId) as Truss | undefined;
  if (!t || t.kind !== 'truss') return { command: null, warning: 'That truss no longer exists.' };
  const fx = [...doc.entities.values()].filter((e): e is Fixture => e.kind === 'fixture' && e.trussId === trussId)
    .map(f => ({ f, ...alongRun(t, { x: f.matrix.o.x, y: f.matrix.o.y }) }))
    .filter(x => opts.includeOffLine || x.lateral <= OFF_LINE)
    .sort((a, b) => a.s - b.s);
  if (!fx.length) return { command: null, warning: 'No fixtures on this truss.' };
  const r = compute({
    sections: runSections(t).map(s => String(s)).join('+'), count: fx.length, mode: st.mode, inset: st.inset, insetR: st.insetB,
    diffEnds: st.diffEnds, spacing: st.gap, ref: 'left', unit: 'mm', round: 0, joinWarn: 0,
  });
  if ('err' in r) return { command: null, warning: r.err };
  const cmds = fx.map(({ f }, k) => {
    const { p, yaw } = pointAt(t, r.pos[k]);
    return setProps(f.id, { matrix: withYaw(translate(f.matrix, { x: p.x - f.matrix.o.x, y: p.y - f.matrix.o.y, z: 0 }), yaw) });
  });
  const command: Command = { label: 'Re-space', do(d) { for (const c of cmds) c.do(d); }, undo(d) { for (let i = cmds.length - 1; i >= 0; i--) cmds[i].undo(d); } };
  return { command, warning: r.warn };
}
