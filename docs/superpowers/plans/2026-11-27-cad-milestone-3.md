# Lighting CAD: Milestone 3 (Power tool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Circuits and Socapex runs worked out for the whole rig from the fixture wattages, using the owner's v2 rules. They're shown on the plot (circuit labels and colours), in a Power panel with a rig summary and per-run tables, and as a copyable power list and an exportable power sheet PNG.

**Architecture:**
- Port v2's pure `power.js` (`planTruss` / `planRig`, brute-force tested) to `src/domain/power.ts`, unchanged.
- A `src/domain/powerRig.ts` turns the doc into ordered groups: trusses in order along the run, plus floor and other non-truss fixtures by hanging position. It runs `planRig` and returns a fixture → circuit map.
- A `PowerTool` adds the plot overlay. A Power panel and sheet export reuse milestone 2's panel patterns.

**Spec:** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md` §8 milestone 3 and §10. The v2 rules come from `git show v2:js/power.js` and `git show v2:tests/power.test.js`.

## Global Constraints

- Everything in milestones 1 and 2's constraints still applies.
- **The owner's rules (spec §10)**:
  - A circuit is a run of neighbouring fixtures on one truss.
  - The limit is `circuitW × loadPct%`: 2400 W × 80% = 1920 W by default, adjustable.
  - Loads are balanced by keeping the heaviest circuit as light as possible.
  - 6 circuits per Socapex, and one Socapex run per truss (more if needed).
  - `fill: spread` (the default) or `fewest`.
  - Optional phase balancing: 1 and 4 = L1, 2 and 5 = L2, 3 and 6 = L3.
  - A fixture over the limit sits alone and is flagged. Fixtures with no wattage count as 0 W and are flagged.
- **Power is computed, not stored.** Settings live in `doc.settings` (add `circuitW`, `loadPct`, `perSoca`, `fill`, `phases`), so it always reflects the current plot and types.
- **Nothing pretends to know a wattage**: unknown types show "No wattage" and link to the Fixture types review.

## Decisions taken by the executor (owner asleep)

- **Groups ("runs" for power)**:
  1. each truss, with its fixtures in order along the run
  2. fixtures with no truss but a hanging position: one group per position, ordered along the position's best-fit line (the floor cyc row at Entrance, for example)
  3. anything else: one "Unassigned" group, ordered by X then Y
- Group names follow the truss or position name.
- **Socapex labels** are letters per group (A, B…), as in v2, shown with the group name: "Expo Flown A · A3".
- **Plot colours**: while the Power tool is active, fixtures are coloured by circuit within their group (6 distinct colours that alternate, readable in both themes), with the circuit label under each fixture when there's room. Over-limit fixtures are warn-coloured.
- **The power sheet PNG** is v2's `buildPowerPng` adapted to groups, and Copy power is v2's `powerText`.

## Review Focus

1. **A rig where some types have no wattage**: the power summary says how many fixtures are counted as 0 W, links to Fixture types, and the plan still forms (no crash, no NaN).
2. **A fixture over the circuit limit by itself** (for example a 2600 W Molefay 4-lite): its own circuit, flagged in red on the plot, in the panel and in the sheet.
3. **Changing settings** (limit %, per Socapex, fill, phases) immediately updates the plot colours, the panel and the copied text, and settings changes are undoable.
4. **A truss with more than 6 circuits' worth** gets a second Socapex (B…) for that same truss, never shared with another truss.
5. **Moving a fixture along its truss past its neighbour** changes the circuit grouping on the next draw, because order comes from position, not from the original list.

---

### Task 1: Port v2 power maths

**Files:**
- Create: `src/domain/power.ts` (typed port of `v2:js/power.js`)
- Test: `src/domain/power.test.ts` (port of `v2:tests/power.test.js`, every case including the brute-force optimality test)

**Interfaces:**
- `planTruss(watts: (number | null)[], opt: { limit: number; perSoca?: number; fill?: 'spread' | 'fewest' }): { groups: Group[]; socas: number; unknown: number[]; overs: number[] }`
- `planRig(trusses: { id: string; watts: (number | null)[] }[], settings: PowerSettings): RigPlan`
- `circuitMap(pt): Map<number, Circuit>`
- `socaLabel(k)`
- The types are copied from v2's JSDoc.

Steps: port the tests first and watch them fail, port the code, watch them pass, commit `feat(cad): port v2 power circuit maths`.

### Task 2: Power settings in the doc

**Files:**
- Modify: `src/core/model/types.ts` (`DocSettings.power`), `src/core/model/doc.ts` (defaults and cleaning: `circuitW` 100–100000, default 2400; `loadPct` 10–100, default 80; `perSoca` 1–12, default 6; `fill` 'spread'; `phases` false)
- Test: round trip and junk fallback in `history.test.ts`; `setSettings({ power })` is undoable.

Commit `feat(cad): power settings in the job`.

### Task 3: Rig groups and the power plan

**Files:**
- Create: `src/domain/powerRig.ts`
- Test: `src/domain/powerRig.test.ts`

**Interfaces:**
- `powerGroups(doc: Doc): { id: string; name: string; kind: 'truss' | 'position' | 'loose'; fixtureIds: string[] }[]`, ordered as in the decisions above. Trusses come first in doc order, then positions, then loose fixtures.
- `rigPower(doc: Doc): { plan: RigPlan; groups: …; byFixture: Map<Id, { group: string; label: string; phase: number; load: number; over: boolean }>; unknownTypes: number }`. Watts come from `doc.types.get(f.typeKey)?.w ?? null`.
- Tests:
  - fixtures on a truss are grouped in order along the run, even when the doc lists them out of order
  - floor fixtures with a position form a group ordered along their line
  - an over-limit 2600 W fixture is alone and flagged
  - unknown types are counted as 0 W
  - a 14 × 1225 W truss gets Socapex A, B and C
  - moving a fixture past its neighbour changes its circuit

Commit `feat(cad): group the rig and plan its power`.

### Task 4: Power tool and plot overlay

**Files:**
- Create: `src/tools/power.ts`, `src/view/powerOverlay.ts`
- Modify: `src/view/plan.ts` (an optional fixture colour override from the active overlay), `src/main.ts` (register; tool bar "Power" ⚡)
- Test: `src/tools/power.test.ts`
- **Tool behaviour**: tapping a fixture or truss selects its group and opens the panel scrolled to that group. Dragging pans.
- **Overlay**: circuit colours (`plan.ts` takes `fixtureColour?: (f) => string | null` in its view state) and labels such as "A3" under fixtures when there's room.
- Tests: the overlay colour function gives the same colour to fixtures on the same circuit and different colours to neighbouring circuits, and over-limit fixtures get the warn colour. The tool picks a group on tap.

Commit `feat(cad): power tool with circuit colours on the plot`.

### Task 5: Power panel, Copy power and settings

**Files:**
- Create: `src/ui/powerPanel.ts`, `src/ui/powerText.ts`
- Test: `src/ui/powerText.test.ts`
- **Panel** (laptop side column, phone sheet, as for Spacing):
  - totals: watts, amps at 240 V, circuits, Socapex, and per phase when on
  - warnings: over-limit, and no wattage with a **Fixture types** button
  - per-group cards with Socapex, circuit, fixtures (#unit numbers and types), load, a bar and %
  - power settings (circuit rating, load %, per Socapex, fill, phases), as undoable `setSettings` commands
- `powerText(jobName, rp, doc): string` is v2's format with groups. Its tests pin the exact output for a two-truss rig.

Commit `feat(cad): power panel, copy power and settings`.

### Task 6: Power sheet PNG

**Files:**
- Create: `src/ui/powerPng.ts` (v2's `buildPowerPng` adapted to groups)
- Modify: `src/ui/powerPanel.ts` (an Export sheet button, using the milestone 2 image preview sheet; move that sheet into a reusable `src/ui/imageSheet.ts`)

Commit `feat(cad): power sheet image`.

### Task 7: Milestone 3 acceptance

**Files:**
- Create: `e2e/m3.mjs`

Steps (phone and laptop, owner's sample in memory):
1. Set wattages for the 8 unknown types through the review (a fixed test value, for example 300 W).
2. Choose the Power tool.
3. Totals show 188 fixtures' worth of watts, with no "counted as 0 W" warning.
4. Expo Flown A has its own Socapex, with circuits of neighbouring fixtures only.
5. Phases on: three phase totals appear, and their sum equals the total.
6. Load % 50: more circuits.
7. Undo restores the previous totals.
8. Copy power: the text starts with "POWER:".
9. Export the sheet: a PNG downloads.
10. No horizontal scroll and no console errors.

Then run `npm test`, `node e2e/m1.mjs`, `node e2e/m2.mjs` and `node e2e/m3.mjs`. Commit, push and check the deploy.
