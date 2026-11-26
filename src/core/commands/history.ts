import type { Doc } from '../model/types';

/** Every document change is a Command. It keeps what it needs to undo itself. */
export interface Command { label: string; do(d: Doc): void; undo(d: Doc): void }

const LIMIT = 500;

class Group implements Command {
  constructor(public label: string, public cmds: Command[] = []) {}
  do(d: Doc) { for (const c of this.cmds) c.do(d); }
  undo(d: Doc) { for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i].undo(d); }
}

export class History {
  private done: Command[] = [];
  private undone: Command[] = [];
  private group: Group | null = null;
  private depth = 0;
  private listeners = new Set<(c: Command | null) => void>();
  constructor(public doc: Doc) {}

  get canUndo() { return this.done.length > 0; }
  get canRedo() { return this.undone.length > 0; }
  get undoLabel() { return this.done[this.done.length - 1]?.label ?? ''; }

  exec(c: Command): void {
    c.do(this.doc);
    if (this.group) { this.group.cmds.push(c); this.emit(c); return; }
    this.push(c); this.emit(c);
  }
  /** Commands until end() undo as one step. Nested begin/end pairs fold into the outer group. */
  begin(label: string): void { if (this.depth++ === 0) this.group = new Group(label); }
  end(): void {
    if (this.depth === 0) return;
    if (--this.depth === 0 && this.group) { const g = this.group; this.group = null; if (g.cmds.length) this.push(g); }
  }
  undo(): void { const c = this.done.pop(); if (!c) return; c.undo(this.doc); this.undone.push(c); this.emit(c); }
  redo(): void { const c = this.undone.pop(); if (!c) return; c.do(this.doc); this.done.push(c); this.emit(c); }
  /** Forget all steps (new or freshly loaded document). */
  reset(doc: Doc): void { this.doc = doc; this.done = []; this.undone = []; this.group = null; this.depth = 0; this.emit(null); }
  onChange(fn: (c: Command | null) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  private push(c: Command) { this.done.push(c); if (this.done.length > LIMIT) this.done.shift(); this.undone = []; }
  private emit(c: Command | null) { for (const fn of this.listeners) fn(c); }
}
