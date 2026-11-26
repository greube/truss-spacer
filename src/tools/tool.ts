import type { Doc, Entity, Fixture, Id } from '../core/model/types';
import type { History } from '../core/commands/history';
import type { GridIndex } from '../core/index/grid';
import type { Camera } from '../view/camera';
import type { V2 } from '../core/geom/vec';
import type { Mods } from '../view/input';

/** What tools and actions can reach. doc may be replaced when a job is opened, so always read app.doc. */
export interface AppCtx {
  doc: Doc; history: History; camera: Camera; index: GridIndex; selection: Set<Id>;
  /** A tool's live drawing on top of the plan (rubber band, guides, snap label). */
  preview: ((ctx: CanvasRenderingContext2D, cam: Camera) => void) | null;
  /** Redraw; pass true after changing the doc outside History (live drag previews). */
  requestDraw(rebuildIndex?: boolean): void;
  setTool(id: string): void;
  units: { fmt(mm: number): string };
  visible(e: Entity): boolean;
  /** Short message for the status line, e.g. the active snap. */
  notify(msg: string): void;
  /** True while a tool has a live preview applied to the doc (a drag in progress). Saving and shortcuts wait. */
  previewActive: boolean;
  /** A tool's colour for each fixture on the plot (the Power tool's circuits); null draws the normal colours. */
  fixtureColour?: ((f: Fixture) => string | null) | null;
  /** The plot's colour scheme, for tool overlays. */
  theme?: 'dark' | 'paper';
  /** Cancels the active tool's live preview, if any. */
  cancelPreview?(): void;
}

export interface Tool {
  id: string; label: string; cursor: string;
  activate(app: AppCtx): void;
  deactivate(): void;
  onTap?(p: V2, m: Mods): void;
  onLongPress?(p: V2, m: Mods): void;
  onDragStart?(p: V2, m: Mods): void;
  onDrag?(p: V2, m: Mods): void;
  onDragEnd?(p: V2, m: Mods): void;
  onDragCancel?(): void;
  onHover?(p: V2, m: Mods): void;
  onKey?(e: { key: string }): boolean;
}

/** Hit tolerance and snap radius in screen pixels. */
export const HIT_PX = 12, SNAP_PX = 14;
