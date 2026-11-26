import type { V3 } from '../geom/vec';
import type { Mat } from '../geom/matrix';

/** Plan symbol family for a fixture type. */
export type Category = 'spot' | 'wash' | 'beam' | 'profile' | 'par' | 'strip' | 'strobe' | 'effect' | 'generic';
/** Uppercase UUID. Imported entities keep their MVR uuid. */
export type Id = string;

export interface Layer { id: Id; name: string; visible: boolean }
export interface MvrClass { id: Id; name: string; visible: boolean }
export interface HangingPosition { id: Id; name: string }

/** w = max watts (null = not known yet); src: s spec sheet, l rated, o Open Fixture Library, m user's own, j edited in this job. */
export interface FixtureType {
  key: string; m: string; n: string; w: number | null; src: 's' | 'l' | 'o' | 'm' | 'j' | null; url: string;
  gdtfSpec: string; mode: string; category: Category;
}

/** One straight piece of a truss run, in mm. sections: piece lengths in mm, empty = not set. */
export interface Leg { a: V3; b: V3; sections: number[] }

/**
 * How a truss is measured and re-spaced (all lengths mm). ref: which end (A = first leg's start, B = last leg's end)
 * or the centre is 0. offset moves 0 off that point: offsetSide 'after' = the truss sits beyond the user's 0
 * (marks get bigger), like v1's "Right". mode/inset/insetB/diffEnds/gap are the v1 re-space options.
 */
export interface TrussSpacing {
  ref: 'a' | 'centre' | 'b'; offset: number; offsetSide: 'before' | 'after'; joinWarn: number;
  mode: 'edge' | 'equal' | 'cells' | 'fixed'; inset: number; insetB: number; diffEnds: boolean; gap: number;
}
export const DEFAULT_SPACING: TrussSpacing = { ref: 'a', offset: 0, offsetSide: 'after', joinWarn: 100, mode: 'edge', inset: 250, insetB: 250, diffEnds: false, gap: 1200 };

export interface Truss {
  id: Id; kind: 'truss'; name: string; layerId: Id; classId: Id | null; positionId: Id | null;
  legs: Leg[]; boxSize: number; state: 'draft' | 'confirmed' | 'imported'; mvrUuid: Id | null;
  spacing?: TrussSpacing;
}

export interface Fixture {
  id: Id; kind: 'fixture'; name: string; layerId: Id; classId: Id | null; positionId: Id | null; trussId: Id | null;
  matrix: Mat; typeKey: string; unitNumber: number | null; fixtureId: string; address: number | null; mvrUuid: Id | null;
}

/** Imported scene object shown as reference geometry; bounds are local (before matrix). */
export interface RefObject {
  id: Id; kind: 'ref'; name: string; layerId: Id; classId: Id | null; matrix: Mat; bounds: { min: V3; max: V3 } | null;
}

export type Entity = Truss | Fixture | RefObject;

export interface DocSettings {
  unit: 'm' | 'mm' | 'ft'; round: number;
  labels: { unit: boolean; fid: boolean; addr: boolean };
  power: PowerSettings;
}

/** Power planning settings for the job (spec §10). */
export interface PowerSettings { circuitW: number; loadPct: number; perSoca: number; fill: 'spread' | 'fewest'; phases: boolean }
export const DEFAULT_POWER: PowerSettings = { circuitW: 2400, loadPct: 80, perSoca: 6, fill: 'spread', phases: false };

export interface Doc {
  entities: Map<Id, Entity>;
  layers: Layer[]; classes: MvrClass[]; positions: HangingPosition[];
  types: Map<string, FixtureType>;
  settings: DocSettings;
}

export type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };
