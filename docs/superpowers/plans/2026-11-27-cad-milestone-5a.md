# Lighting CAD: Milestone 5a (MVR export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the job as an MVR the LD's Vectorworks and the consoles can open. Imported jobs round-trip: only what the user changed is touched. Jobs with no original get a minimal, valid MVR.

**Architecture:**
- `src/io/mvr/export.ts` reads the kept original archive and parses its XML DOM.
- It re-parses the original into a "base" Doc with the existing `parseScene` and diffs it against the current Doc by entity id (= MVR uuid). It then edits only the nodes whose entities changed, were deleted or were added.
- It re-serialises the XML and writes the zip with every other member copied byte for byte.

**Tech stack:** as before. `@xmldom/xmldom` (already a dev dependency) gives the tests a DOM; the browser uses `DOMParser` / `XMLSerializer`.

**Spec:** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md`, §6 (export: "start from the original XML DOM and archive…"), §8 milestone 5, and §11 (export fidelity).

## Global Constraints

- **Export fidelity (spec §11):**
  - Archive members we didn't change are copied byte for byte.
  - `GeneralSceneDescription.xml` is re-serialised from the original DOM with only our changes applied.
  - Whitespace and attribute-quote normalisation are acceptable. Changing or dropping anything we didn't edit is not.
- **Drafts are never exported** (CLAUDE.md key decisions).
- **Matrices are written in the parent's frame:** layer matrix, then group and truss parents, as `parseScene` composes them.

## Decisions taken by the executor (owner asleep)

- **What counts as changed:**
  - **Fixture:**
    - world matrix (tolerance 0.01 mm / 1e-6)
    - name
    - unit number, written to `UnitNumber`
    - `FixtureID`
    - address, written to the `Address` with `break="0"`, or a new one
    - type, written to `GDTFSpec` (key + `.gdtf`) and `GDTFMode`
    - class, written to `Classing`
    - position, written to `Position`
  - **Truss and reference object:** the world placement.
- **An imported truss moved or rotated** gets a new `Matrix` = delta ∘ base world. The delta is the move and turn that takes the base leg onto the new one, so its geometry follows. A length change can't be written into fixed geometry. The export goes ahead with the warning "Truss X was resized; its MVR geometry keeps the original length."
- **Deleting an object whose node has children that still exist** (fixtures hung on a deleted truss): those child nodes move up to the deleted node's parent list, with matrices recalculated so they stay where they are.
- **New fixtures** go into their layer's `ChildList`. If the layer isn't in the file (made in the app), a new `Layer` node is added.
- **Confirmed trusses with no MVR node** (confirmed drafts, drawn trusses) are written as one `Truss` node per leg:
  - the matrix puts x along the leg from end A
  - it gets a `Geometries/Geometry3D`-free body, so Vectorworks shows it as a named truss object
  - a warning is given: "N trusses have no 3D model in the MVR"
- **A type changed to one with no GDTF file in the archive** gets the warning "Fixture type X has no GDTF file in this MVR; consoles may ask for it."
- **The file name** is the job name plus `.mvr`. It's saved and shared the same way as the PNGs.

## Review Focus

1. **Export with no changes:** re-importing gives the same Doc, every non-XML member is identical, and every element and attribute of the XML survives.
2. **A fixture on a truss where the truss was moved with its fixtures:** the truss's Matrix changes and the fixture's local Matrix doesn't.
3. **A deleted truss whose fixtures were kept:** the fixtures stay at the same world place.
4. **Unicode or special characters** in names (`&`, `<`, emoji) are escaped and survive the round trip.
5. **An address above universe 1** (e.g. 4741) round-trips exactly.

---

### Task 1: Matrix inverse

**Files:** modify `src/core/geom/matrix.ts`; test `src/core/geom/matrix.test.ts`

**Interfaces:** `invert(m: Mat): Mat`, so that `compose(invert(m), m)` ≈ IDENTITY. Move `compose` from `parse.ts` into `matrix.ts`, re-exported from `parse.ts`.

Tests:
- invert of a translate plus rotate gives the identity when composed with the original
- `compose(invert(a), compose(a, b))` ≈ b

Commit `feat(cad): matrix inverse`.

### Task 2: Export engine

**Files:** create `src/io/mvr/export.ts`; test `src/io/mvr/export.test.ts`, built on a synthetic MVR (layer with a Matrix, a truss with a child fixture, a loose fixture, a scene object, a GDTF member, a group)

**Interfaces:**
- `exportMvr(doc: Doc, original: Uint8Array | null, deps: { parseXml(s: string): Document; serialize(d: Document): string; newDocument?(): Document }): Promise<{ bytes: Uint8Array; warnings: string[] }>`

Tests, one per Review Focus line, plus:
- moving one fixture changes only its Matrix text
- changing an address, unit number and name updates those nodes
- a new fixture lands in its layer and re-imports at the same place, with its address
- a draft truss isn't exported, while a confirmed inferred truss is (one node per leg)
- exporting with no original gives a valid MVR that re-imports with the same fixtures and trusses

Commit `feat(cad): MVR export that only touches what changed`.

### Task 3: Export button

**Files:**
- Modify `src/ui/jobs.ts`: the job menu gets "Export MVR", which uses `current.original`.
- Modify `src/main.ts` / `src/ui/imageSheet.ts`: a generic file save and share for the result.

The warnings are shown in the sheet before saving.

Test: an e2e step in `e2e/m5.mjs`:
1. import the sample, move one fixture, export
2. re-import the exported bytes in the page
3. the fixture count is the same and the moved fixture is at its new place
4. no console errors

Commit `feat(cad): export MVR from the job menu`.
