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

export interface Truss {
  id: Id; kind: 'truss'; name: string; layerId: Id; classId: Id | null; positionId: Id | null;
  legs: Leg[]; boxSize: number; state: 'draft' | 'confirmed' | 'imported'; mvrUuid: Id | null;
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
}

export interface Doc {
  entities: Map<Id, Entity>;
  layers: Layer[]; classes: MvrClass[]; positions: HangingPosition[];
  types: Map<string, FixtureType>;
  settings: DocSettings;
}

export type Bounds = { min: { x: number; y: number }; max: { x: number; y: number } };
