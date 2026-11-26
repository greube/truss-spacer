# Lighting CAD: Milestone 2 (Spacing tool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select a truss run on the plot and get tape marks for where the LD put each fixture (the main job), or re-space them evenly with the v1 options (the backup). Marks list with tick-off, copy, and a PNG plot as in v1.

**Architecture:**
- A pure `domain/runMarks.ts` measures fixtures along a truss run (a polyline of legs with sections). It reuses `spacing.ts` (v1 maths, golden-tested) for even re-spacing.
- A `SpacingTool` plus a Spacing panel use it.
- Settings are saved per truss on `Truss.spacing`.

**Tech Stack:** As milestone 1. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md` (§2 goals, §8 milestone 2, §10 owner decisions). Milestone 1's plan and ledger cover the existing code (`CLAUDE.md` has the map).

## Global Constraints

- Everything in milestone 1's Global Constraints still applies: Australian English, mm internally, every change through `History`, `textContent` only, phone and laptop layouts, offline.
- **The main mode never moves fixtures.** Only "Re-space evenly" moves them, as one undo step.
- **Draft trusses give provisional marks:** shown dimmed, labelled "Provisional: confirm the truss", and never in copied text or images without the word "PROVISIONAL".
- **The in-section distances switch is off by default and never saved**, as the owner asked in v1.
- **Rounding, units, join warning and offsets behave like v1 on `main`**: default 5 mm rounding, 100 mm join warning, the centre offset as "Truss off centre" and the end-A offset as "End off your 0". These are per truss.

## Decisions taken by the executor (owner asleep; recorded for review)

- A run's ends are labelled **A** (`legs[0].a`) and **B** (the last leg's `b`) on the plot. "Measure from" offers End A, Centre and End B, because left and right are ambiguous on angled or cornered runs. A **Swap A/B** action reverses the run.
- Distance along a run is measured along the truss centre line, through its corners. A fixture's position along the run is its projection onto the nearest leg.
- **Sections along the run** are each leg's sections in order. A leg without sections counts as one section of its own length. Leg corners always count as joins.
- **Uneven spacing**: gaps that differ from the median gap by more than 25 mm are flagged ("Gap 1.320 m: the others are 1.500 m").
- **Re-space evenly** keeps the fixtures' order along the run and their heights. Each fixture's yaw is set to follow its leg.

## Review Focus

1. **A fixture assigned to a truss but far from its line** (more than 300 mm), for example after the user moved it: it still gets a mark, flagged "Off the truss line by 0.420 m", and isn't moved by Re-space unless the user chooses to include it. Test in Task 2.
2. **Sections that don't match the drawn length** (sections total 8 m, leg 8.55 m): marks still compute, against the sections as the truss's real length (the drawing is approximate). The panel shows the mismatch warning from Object Info. Test in Task 2.
3. **Measuring from B on a run with corners**: the marks, section numbers and in-section distances all count from B, matching v1's right-end behaviour. Test in Task 2.
4. **A truss with 0 or 1 fixtures**: the panel shows "No fixtures on this truss" or a single mark, with no gaps and no crash. Re-space with 1 fixture centres it (v1 behaviour). Test in Task 3.
5. **Undo after Re-space while the Spacing panel is open**: the marks list refreshes to the restored positions. Test in Task 5.

---

### Task 1: Per-truss spacing settings in the model

**Files:**
- Modify: `src/core/model/types.ts`, `src/core/model/doc.ts` (`docFromJSON` cleaning)
- Test: `src/core/commands/history.test.ts` (round trip)

**Interfaces:**
- Produces `TrussSpacing = { ref: 'a' | 'centre' | 'b'; offset: number; offsetSide: 'before' | 'after'; joinWarn: number; mode: 'edge' | 'equal' | 'cells' | 'fixed'; inset: number; insetB: number; diffEnds: boolean; gap: number }`.
  - All values in mm.
  - `offset` applies to the chosen reference.
  - `offsetSide` says which way the run sits relative to the user's 0: `'after'` means the run starts beyond the 0 (marks increase), the same as v1's "Right".
- `Truss.spacing?: TrussSpacing`, plus `DEFAULT_SPACING` (ref 'a', offset 0, 'after', joinWarn 100, mode 'edge', inset 250, insetB 250, diffEnds false, gap 1200).
- Steps: write a test that a doc with `spacing` round-trips through `docToJSON`/`docFromJSON` and that malformed spacing falls back to defaults. Watch it fail, implement it, watch it pass, commit `feat(cad): per-truss spacing settings`.

### Task 2: Marks along a run (`domain/runMarks.ts`)

**Files:**
- Create: `src/domain/runMarks.ts`
- Test: `src/domain/runMarks.test.ts`

**Interfaces:**
- `runLength(t: Truss): number`: sum of leg lengths.
- `runSections(t: Truss): number[]`: concatenated leg sections, with an empty leg counting as one section of its length.
- `alongRun(t: Truss, p: V2): { s: number; lateral: number; leg: number }`: nearest leg, distance from end A in mm.
- `pointAt(t: Truss, s: number): { p: V3; yaw: number }`
- `runMarks(t: Truss, fixtures: Fixture[], st: TrussSpacing, fmt: { round: number }): MarkRow[]`, with `MarkRow = { id; unit: number | null; s; mark; sec; off; near; gap: number | null; offLine: number | null; uneven: boolean }`
  - Rows are ordered from the chosen reference: A to B, or B to A for `ref 'b'`. For centre, they run A to B with signed marks.
  - The length used is the sections total if set, otherwise the drawn length.
  - Zero is: end A `-offset` / `+offset` by `offsetSide`; centre is L/2 shifted by the offset; end B is L, with no offset (as v1).
  - `rnd` comes from `spacing.ts`.
- **Must match v1:** for a straight one-leg truss with fixtures placed at the positions v1's `compute()` produces, `runMarks` gives the same `mark`, `sec`, `off`, `near` and `gap`. Take 40 cases from `src/domain/v1-golden.json` (straight, any mode, `ref` left/right/centre) and compare. That's the key test.
- Other tests (write these first):
  - an L-shaped run measured from A and from B (section numbers counting from B)
  - an off-line fixture flagged with `offLine`
  - uneven gaps flagged
  - sections ≠ drawn length (uses the sections total)
  - a centre offset and an A offset matching `main`'s offset behaviour, including fixture 1 at −0.250 m for a 0.5 m left offset on 3+3+2 with 0.25 m end gaps
- Commit `feat(cad): marks along a truss run`.

### Task 3: Re-space evenly as one command

**Files:**
- Create: `src/domain/respace.ts`
- Test: `src/domain/respace.test.ts`

**Interfaces:**
- `respaceCommand(doc: Doc, trussId: Id, st: TrussSpacing): { command: Command | null; warning: string }`
  - Builds `SpacingSettings` for `spacing.compute()`: sections are the run sections (in mm, unit `'mm'`, round 0), count = the fixtures on the truss, mode and insets from `st`.
  - Maps each position `p` back through `pointAt`. The k-th fixture in current order along the run goes to the k-th position. Height is kept, yaw comes from the leg.
  - Returns one grouped command of `setProps` matrices (label "Re-space").
  - `warning` passes on `compute()`'s warning (for example, too many fixtures at a fixed gap). It's `"No fixtures on this truss"` for 0 fixtures, and `null` command for errors.
- Tests (first):
  - 6 fixtures in edge mode on 3+3+2 land at 0.25, 1.75 … 7.75 m along the run
  - an L run re-spaces through the corner
  - 1 fixture is centred
  - undo restores every fixture exactly
  - fixtures more than 300 mm off the line are left out unless `includeOffLine`
- Commit `feat(cad): re-space a truss evenly (undoable)`.

### Task 4: Spacing tool and plot overlay

**Files:**
- Create: `src/tools/spacing.ts`
- Modify: `src/view/plan.ts` (overlay), `src/main.ts` (register the tool, toolbar button "Spacing", phone tool bar)
- Test: `src/tools/spacing.test.ts`

**Interfaces:**
- `SpacingTool implements Tool` (id `'spacing'`):
  - Tapping a truss (or one of its fixtures) makes it the current run and opens the panel.
  - Tapping a fixture in the list selects it on the plot.
  - `current: Id | null`.
- Plan overlay (only while the spacing tool is active):
  - end labels **A** and **B** at the run ends
  - the 0 marker with a dashed line (as v1)
  - each fixture's mark under it when there's room (formatted with `fmt`; dimmed and italic if provisional)
  - near-join fixtures in warn colour
- Tests:
  - tapping a truss sets `current`
  - tapping its fixture selects that truss
  - tapping empty space clears it
  - the overlay draws without throwing (fake canvas, as in `plan.test.ts`)
- Commit `feat(cad): spacing tool and plot overlay`.

### Task 5: Spacing panel (marks list, settings, re-space, copy)

**Files:**
- Create: `src/ui/spacingPanel.ts`
- Modify: `src/main.ts` (laptop: the right column shows the Spacing panel above Object Info while the tool is active; phone: a bottom sheet that opens when a run is chosen)
- Test: `src/ui/spacingText.test.ts` (copy text helper)

**Interfaces:**
- `renderSpacingPanel(el, app, trussId, state: { showSec: boolean; done: Set<Id>; sel: Id | null })` shows:
  - **Header**: truss name, state tag, length, sections. A draft truss gets the Confirm button (same as Object Info) and the provisional note.
  - **Measure from**: segmented End A / Centre / End B, plus the offset input, labelled "Truss off centre" for Centre or "End A off your 0" for End A, with Before/After as in v1 (`setProps` on `truss.spacing`). There's also a Swap A/B button.
  - **In-section distances** switch (`state.showSec`, not saved).
  - **Marks table**: # (unit number, otherwise position order), mark, in-section (when on), gap, plus flags (Near a join, Off the line, Uneven). Tapping a row once selects it (highlighted on the plot); tapping again ticks it done, as in v1. Done ticks reset when the run's positions change.
  - Buttons: **Copy list**, **Export image** (Task 6).
  - **Re-space evenly** (collapsed `details`): the mode buttons as in v1 (Set end gaps, Equal gaps, Centred, Fixed gap), end gaps with "Different gap each end", and the gap for Fixed. A preview line shows the resulting gap, then **Apply** (one undo step), with `compute()` warnings shown.
- `spacingText(trussName, rows, st, unit, showSec, provisional): string`, the copy text. Same format as v1: name, then `Truss <sections> = <length>, <n> fixtures, gap <g>`, then `Marks from <End A|centre|End B>[ (offset …)]:`, then the lines. It starts with `PROVISIONAL: confirm truss first` when the truss is a draft.
- Tests: the `spacingText` output for a straight confirmed truss matches v1's copy format exactly (compare with a v1 golden case), plus the provisional prefix and the in-section suffix.
- Commit `feat(cad): spacing panel with marks list, settings and re-space`.

### Task 6: Plot image export (PNG) for a run

**Files:**
- Create: `src/ui/plotPng.ts` (adapted from v1 `buildPng()` on `main`)
- Modify: `src/ui/spacingPanel.ts` (Export image: preview sheet with Save PNG / Share, as v1, using `<a download>` and `navigator.share`)

**Interfaces:**
- `buildRunPng(run: { name; sections: number[]; rows: MarkRow[]; st; unit; round; showSec; provisional; jobName }): Promise<Blob>`
  - A straight-unrolled run (corners shown as joins labelled "Corner"), with v1's layout: header, truss drawing, numbered fixtures, chain dimension, marks with tilt-to-fit labels, overall length, table and footnote.
  - "PROVISIONAL" is stamped across the header when draft.
- Verification: export at 6, 14, 24 and 45 fixtures in e2e (Task 7) and check the images visually (labels tilt as in v1).
- Commit `feat(cad): plot image export for a truss run`.

### Task 7: Milestone 2 acceptance

**Files:**
- Create: `e2e/m2.mjs`

Steps (412×860 touch and 1366×800 mouse, with the owner's sample via `MVR_SAMPLE` in memory):
1. Open the sample and choose the Spacing tool.
2. Tap Expo Flown A. The panel shows 23 marks, provisional.
3. Confirm the truss with sections `8x3`. The marks are no longer provisional, and the first mark is between 0.2 and 0.3 m from end A.
4. Switch to Centre with a 0.5 m offset: the marks shift by 0.5 m.
5. Turn in-section distances on: section numbers appear.
6. Copy the list: the text starts with "Expo Flown A".
7. Re-space with Equal gaps: the gaps become equal, and undo restores the LD's positions exactly.
8. Export the image: a PNG is saved (download event).
9. A truss with 0 fixtures: the panel says "No fixtures on this truss".
10. No horizontal scroll and no console errors.

Then run `npm test`, `node e2e/m1.mjs` (regression) and `node e2e/m2.mjs`. Commit `test(cad): milestone 2 acceptance`, push `cad`, and check the `/cad/` preview deploys.
