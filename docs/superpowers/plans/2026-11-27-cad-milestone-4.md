# Lighting CAD: Milestone 4 (Cabling tool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DMX daisy-chain for each truss run (and each floor position), starting from a chosen end, with every jumper sized by the owner's rule and rounded up to stock lengths. It's drawn on the plot and summed into a cable pull list that can be copied.

**Architecture:**
- `src/domain/cabling.ts` is pure and reuses milestone 3's `powerGroups` for the runs and their order. It works out the chains and jumpers.
- A `CablingTool` draws the chains as an overlay, like Power.
- A Cabling panel shows each run's chain, a start-end switch (stored on the truss, undoable), the pull list and Copy cables.

**Tech stack:** as before (TypeScript, Vite, Vitest, Canvas 2D, Playwright e2e).

**Spec:** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md`, §8 milestone 4 and §10.

## Global Constraints

- Everything in milestones 1 to 3's constraints still applies.
- **Jumper rule (spec §8 and §10):**
  - length = gap + 2 × truss depth + 0.5 m, rounded up to the next stock length.
  - Stock lengths are 1, 2, 3, 5, 10, 20 and 50 m.
  - Truss depth is `truss.boxSize`.
- One daisy-chain per truss run. It goes round corners and starts from the chosen end, A by default.
- **Drop cables from the deck are out of scope.** The chain starts at the truss end, and the first cable runs from that end to the first fixture.
- Cabling is computed, not stored. Only the start end is stored, as `Truss.dmxFrom?: 'a' | 'b'`, cleaned on load, undefined meaning A.

## Decisions taken by the executor (owner asleep)

- **Runs** are milestone 3's power groups:
  - **Trusses**: the gap is the distance along the run, so it goes through corners.
  - **Hanging positions without a truss** (floor): depth 0, and the gap is measured along their line.
  - **Unassigned fixtures**: they're chained in X order, the gap is the straight-line distance, and the run is flagged "check the route".
- **Universes:**
  - A run whose fixtures span more than one DMX universe gets a separate chain for each universe, each starting from the same end. That's how it's cabled: one line per universe.
  - Fixtures with no address join the run's first chain and are flagged.
- A gap over 50 m is flagged "over 50 m: join cables" and counted as ⌈gap / 50⌉ × 50 m cables.
- **Phone tool bar:** Select, Truss, Fixture, Spacing, Power, **DMX**, More. Rotate moves into More on the phone; Object Info still has a typed rotation.
- The cable pull list PNG is left for milestone 5 (paperwork). This milestone has the panel list and Copy cables.

## Review Focus

1. **A truss with fixtures in two universes**: two chains, each from the chosen end, and the pull list counts both.
2. **An L-shaped run**: the jumper across the corner uses the along-run gap, not the straight line.
3. **Switching the start end** changes the first cable (end to the first fixture) and is undoable.
4. **Gaps right on a stock length** (for example gap + slack = exactly 3.000 m) give 3 m, not 5 m. Floating-point error mustn't push them up a size.
5. **A run of one fixture** gets just the feed cable from the end. An empty truss has no chain.

---

### Task 1: Cabling maths

**Files:**
- Create: `src/domain/cabling.ts`
- Test: `src/domain/cabling.test.ts`

**Interfaces:**
- `STOCK = [1000, 2000, 3000, 5000, 10000, 20000, 50000]`
- `stockFor(mm: number): { len: number; count: number }`: the smallest stock length that covers `mm` (with a 1 mm tolerance), or `{ len: 50000, count: ceil }` over 50 m.
- `jumper(gap: number, depth: number): { need: number; len: number; count: number }`, where need = gap + 2 × depth + 500.
- `rigCabling(doc: Doc): { runs: CableRun[]; pull: Map<number, number>; total: number }`
  - `CableRun = { group: string; name: string; kind; from: 'a' | 'b'; chains: Chain[]; flags: string[] }`
  - `Chain = { universe: number | null; cables: Cable[] }`
  - `Cable = { fromId: Id | null; toId: Id; gap; need; len; count; over: boolean }`
- Tests:
  - `stockFor`:
    - 2999 → 3000
    - 3000 → 3000
    - 3000.0000001 → 3000
    - 3002 → 5000
    - 120000 → 50000 × 3
  - `jumper(1200, 300)` → need 2300, 3 m.
  - A truss with 4 fixtures from A: the feed cable from the end, then 3 jumpers, with exact lengths.
  - From B: the order is reversed and the feed comes from the B end.
  - An L-shaped run uses the along-run gap through the corner.
  - Two universes give two chains, and the pull list sums both.
  - A floor position has depth 0.
  - A run of one fixture has only the feed. An empty truss is absent.
  - Unassigned fixtures are flagged.

Commit `feat(cad): DMX daisy-chain and jumper maths`.

### Task 2: Start end on the truss

**Files:**
- Modify: `src/core/model/types.ts` (`Truss.dmxFrom?`) and `src/core/model/doc.ts` (clean it: only 'a' or 'b' survive)
- Test: a round trip and junk being dropped, in `history.test.ts`

Commit `feat(cad): DMX start end on each truss`.

### Task 3: Cabling tool, overlay and panel

**Files:**
- Create: `src/tools/cabling.ts`, `src/view/cablingOverlay.ts`, `src/ui/cablingPanel.ts`, `src/ui/cablingText.ts`
- Modify: `src/main.ts` and `src/ui/shell.ts`
- Test: `src/tools/cabling.test.ts` and `src/ui/cablingText.test.ts`
- **Tool**: tapping a fixture or truss picks its run, and dragging pans. It's cached like the Power tool and invalidated on every History change.
- **Overlay**:
  - each chain drawn as a polyline from the feed end through its fixtures, offset 0.4 × box size to the side of the truss, in a per-universe colour
  - a "DMX" marker at the start
  - each jumper's stock length at its midpoint, when there's room
- **Panel**:
  - totals: cable count, metres, and the pull list ("3 m × 12")
  - flags
  - for the picked run, its chains with each cable (from → to, gap, length)
  - a Start from A / B switch, as an undoable `setProps(dmxFrom)`
  - Copy cables
- `cablingText(jobName, rc, doc)` is a plain text pull list followed by each run. Tests pin its exact output for a 2-truss rig.
- Tool tests: picking on tap, and the overlay draws without throwing.

Commit `feat(cad): cabling tool with chains on the plot and a pull list`.

### Task 4: Milestone 4 acceptance

**Files:**
- Create: `e2e/m4.mjs`
- Modify: `package.json` (e2e)

Steps (phone and laptop, owner's sample in memory):
1. Choose the DMX tool. The panel shows a pull list whose cable count equals the number of fixtures, since each fixture gets one cable in (feed or jumper).
2. Tap Expo Flown A. Its chain is listed.
3. Start from B changes the first cable, and Undo restores it.
4. Copy cables gives text starting with "DMX CABLES:".
5. No horizontal scroll and no console errors.

Then run `npm test`, `npm run build`, and m1 through m4. Commit, push and check the deploy.
