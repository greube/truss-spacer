# Overnight build: morning summary (27 Nov 2026)

You asked me to keep building through the night and make the calls myself. Milestones 1 to 5 of the CAD spec are built, reviewed and live. Each one had a fresh reviewer at the end, and I fixed the important findings, each with a test that failed first.

**Live:** https://greube.github.io/truss-spacer/cad/ (branch `cad`). The v1 app at `/` and v2 at `/v2/` are untouched.

## What you can do now

1. **Open your MVR.** Use Job ▾ → Open MVR…
   - The fixture types review lists the 8 types that need a wattage.
   - Draft (dashed) trusses are worked out from the hanging positions.
2. **Spacing ⇔.** Tap a truss.
   - You get tape marks for where the LD put each fixture, measured from end A, the centre or end B, with your v1 offsets.
   - In-section distances and join warnings are there.
   - Tap rows to tick them off, and use Copy list or Export image.
   - Confirm a draft truss by entering its real sections.
   - Re-space evenly is the backup.
3. **Power ⚡.**
   - **On the plot:** fixtures are coloured by circuit (neighbours only, 80% of 2400 W, 6 per Socapex, one Socapex run per truss).
   - **The panel:** totals, phases (optional), warnings, and each run's circuits.
   - **Lists:** Copy power gives the text list, and Export sheet gives a PNG.
   - Types with no wattage are orange and count as 0 W, and they're never shown as a real load.
4. **DMX ⌁.**
   - **The chain:** a daisy-chain per truss from the end you pick. Each cable is the gap + 2 × truss depth + 0.5 m, rounded up to 1, 2, 3, 5, 10, 20 or 50 m.
   - **Universes:** a truss with two universes gets two lines.
   - **The pull list:** shown in the panel, and Copy cables gives it as text. On your file it's 177 cables, 652 m.
   - Floor runs aren't fed from a truss end, so they're flagged "needs its own DMX feed" and that feed cable isn't counted.
5. **Job ▾ → Export MVR.** Sends the rig back to the LD or the console, changing only what you changed.
   - On your file, an export with no edits keeps every member except the scene XML byte for byte, and the XML comes back the same apart from whitespace.
   - Draft trusses are left out, and the export tells you how many.
6. **Job ▾ → Export PDF pack.** A3 plot with a title block, then every marks list, the power list and the DMX list. Your file gives 12 pages.

On a phone, Rotate and Measure are under **More**, so the tool bar keeps 7 buttons at a usable size. The tool panels no longer block the screen, so Undo and the plot stay usable while they're open.

## How I checked it

- **Unit tests:** 285, including your file's import and export round trip, run locally through `MVR_SAMPLE` and never committed.
- **Browser checks:** `e2e/m1` to `m5b`, on a phone and a laptop, against your file loaded from memory.
- **Speed:** the worst draw is about 6 ms at 4× CPU throttle with 2000 fixtures.

## Worth knowing

- **The PDF plot of your rig is a 1:500 overview.** The rig is about 44 × 69 m, and 1:250 misses A3 by about a millimetre. Detailed 1:100 sheets across several pages are milestone 6 in the spec ("multiple plot sheets").
- **Undo history isn't saved with a job yet.** The work itself is saved. See the milestone 1 decisions below.
- **Power lists use Fixture IDs (923…)** when a fixture has no unit number. Your Vectorworks file has none.

## Decisions I made for you

Each line gives the decision, then what it costs if it's wrong. Undo history persistence is the main one to look at.

### Milestone 1 (core and import)
- **Tests read your MVR from disk (`@types/node` added).** Wrong: Node globals type-check in app code (e2e would catch it).
- **The XML parser can be swapped (`importMvr(buf, {parseXml})`).** Wrong: nothing (internal).
- **Truss inference is an undoable command and doesn't edit fixtures directly.** Wrong: nothing.
- **Inference splits fixtures by height first, and a leg needs at least 3 fixtures with no gap over 4 m.** Wrong: a sparse position gets a warning instead of a draft, and you draw it.
- **Model names match ignoring punctuation ("A.leda B-EYE" = "Aleda B-EYE").** Wrong: two models that differ only by punctuation would be treated as one.
- **"Model + one word" matches only when there's no ambiguity** (Rogue R2 Spot vs Wash isn't guessed). Wrong: a few more types land in Check.
- **Custom/Generic types match using the fixture's name.** Wrong: nothing.
- **B-EYE counts as a wash and cyc as a strip** (symbol shape only). Wrong: symbol shape only.
- **Hidden layers can't be selected.** Wrong: nothing.
- **The camera owns its viewport.** Wrong: nothing.
- **The plot uses fixed dark and paper palettes, not CSS variables.** Wrong: canvas colours don't follow CSS token edits.
- **Strips are drawn 1 m long.** Wrong: symbol size only.
- **Moves preview live on the plot** (trusses carry their fixtures while you drag). Wrong: a crash mid-drag could leave the preview applied until reload. It's never saved.
- **Box select follows CAD convention** (left to right: inside; right to left: crossing). Ctrl A selects all. Wrong: nothing.
- **Dragging an unselected object selects and moves it.** Wrong: nothing.
- **Drawn trusses get a 6 m trim height** (editable). Wrong: their exported height until you edit it.
- **Adding to an empty job creates a "Plot" layer.** Wrong: nothing.
- **Fonts are declared in index.html.** Wrong: nothing.
- **On a phone, Zoom to fit and Paper mode are under More.** Wrong: one extra tap.
- **Vectorworks unit number 0 means none, and Custom@ types are named after the fixture.** Wrong: a real unit number 0 would show blank.
- **`window.__cad` is there for automated tests.** Wrong: nothing (no data leaves the device).
- **Setting a wattage updates the type and keeps its GDTF link.** Wrong: nothing.
- **Matching runs once at import, before undo history starts.** Wrong: nothing.
- **Custom/Generic types don't fall back to one-word searches** (they suggested unrelated fixtures). Wrong: more types show as Unknown.
- **The CAD service worker never touches other caches,** and the inherited v2 workflow was removed from `cad`. Wrong: nothing.
- **Browser tests get your file from memory and never serve it.** Wrong: nothing.
- **Undo history isn't saved with the job yet.** It needs a serialisable command log. Wrong: after reopening a job, earlier steps can't be undone (the work is kept).

### Milestone 2 (spacing)
- **Fixture positions come from the drawing.** Sections set section numbers and joins, and end B and centre use the drawn length. Wrong: until the truss is confirmed, marks follow a mis-drawn truss.
- **Positions past an end keep their signed distance (as v1).** Wrong: nothing.
- **Rows are numbered by the LD's unit numbers when there are any.** Wrong: the numbering differs from v1's 1..n.
- **Confirming a straight draft resets its geometry from your sections and the end-A gap.** Wrong: a wrong start gap shifts every mark (undoable).
- **Suggested draft sections round up to a whole metre first.** Wrong: it's only a suggestion.
- **`__cad` also exposes ops and the spacing tool for tests.** Wrong: nothing.
- **The drawn length wins over sections everywhere, with a visible warning where they disagree** (panel, copy text, PNG). Wrong: marks follow the drawing until the sections are fixed.

### Milestone 3 (power)
- **Floor positions read left to right** (or bottom to top for a line running up the plan). Wrong: labels run right to left on some positions.
- **On a phone, Power takes Measure's tool bar slot** (Measure goes to More). Wrong: one extra tap to measure.
- **The phone Power sheet opens when you choose the tool or tap a run, and never reopens by itself.** Wrong: after closing it, tap a fixture to get it back.
- **The power browser check sets the 8 wattages directly rather than through the review screens.** Wrong: a review-to-power wiring bug could slip past that check.
- **Tool panels on a phone are non-modal sheets above the tool bar.** Wrong: they cover the lower half of the plot while open.
- **Power lists use unit numbers, else Fixture IDs.** Wrong: crews see Fixture IDs where they expected unit numbers.
- **A huge single loose cluster is accepted** (the review's "one Unassigned run" is otherwise fixed). Wrong: about 1000 loose fixtures in one cluster replan in about 0.4 s per edit.

### Milestone 4 (DMX)
- **Floor and loose runs have no feed cable counted** (they're flagged instead). Wrong: the pull list is one cable short per floor run.
- **On a phone, DMX takes Rotate's tool bar slot** (Rotate goes to More; Object Info keeps typed rotation). Wrong: one extra tap to rotate.
- **Fixtures not on a truss are chained nearest-first.** Wrong: odd routes on irregular layouts (flagged "check the route").
- **A position splits into separate runs only at a gap over 5 m that's also over 3× its usual spacing.** Wrong: an irregular row with one big gap is split in two.

### Milestone 5a (MVR export)
- **A node's position is rewritten only when it moved relative to its parent.** Wrong: nothing found.
- **Types with no GDTF file are written as "Maker@Model.gdtf",** with a warning (Vectorworks' Custom@ convention). Wrong: a console asks for a GDTF that isn't in the file.

### Milestone 5b (PDF)
- **I wrote a small PDF writer of my own** (offline, no new dependency, standard fonts). Wrong: emoji and CJK print as "?".
- **The plot scale is the largest standard one that fits** (1:20 … 1:500). Wrong: nothing.
- **Lists are on A4 portrait pages; the plot is on A3 landscape.** Wrong: mixed page sizes in one file (every viewer handles it).
- **Stray loose objects far away are left off the plot only when the rig won't fit at 1:250 or better, and never trusses or what hangs on them.** Wrong: stray objects at 0,0 shrink an already large plot.

## Small issues I deferred (not fixed)

### Milestone 1
- Escape closes every open sheet at once.
- Duplicated or dragged-away fixtures keep their truss link, so they follow that truss later.
- Fixtures with a missing type draw in normal ink, not the warning colour.
- Every autosave rewrites the original MVR into storage.
- Add-truss points survive a job switch.

### Milestone 2
- The phone Spacing sheet's old reopen-on-undo behaviour (the sheet is non-modal now).
- Changing jobs leaves the old spacing pick.
- One offset is shared between End A and Centre (v1 kept two), and Swap A/B doesn't swap the end gaps.
- Plot mark labels can overlap between 46 and 55 px apart.
- "+−0.300 m" shows when a fixture sits before its section start.
- The gap can differ by 1 mm between the header and the table.
- The # column can repeat when only some fixtures have unit numbers.
- The uneven flag doesn't say what the usual gap is.

### Milestone 3
- The phone power panel rebuilds fully on every change, which is slow on big positions.
- Settings inputs give no error feedback, and re-entering the same value adds an empty undo step.
- Balance phases does nothing above 6 per Socapex (as v2).
- Unit numbers and Fixture IDs can mix in one list.
- The phone panel's height doesn't follow rotation, and Escape closes it.

### Milestone 4
- Chain colours follow the chain, not the universe, and the paper-mode start labels are low contrast.
- Chains are still drawn to fixtures on hidden layers.
- Pull-list tags read "3 M".
- Tapping the end that's already chosen adds an empty undo step.
- The phone sheet can hide the picked run.
- Length labels are small on a phone at zoom to fit.

### Milestone 5a
- Rotating a vertical tower doesn't rotate its MVR model (its position is right).
- New elements ignore a default XML namespace (Vectorworks files have none).
- A non-UTF-8 encoding declaration is kept while the bytes are UTF-8.
- Duplicated reference objects aren't exported.
- Deleting a truss drops comments and unusual children inside it.
- Zip entries have no date.
- The export sheet shows "0.0 MB" for small files, and an export is ignored silently mid-drag.

### Milestone 5b
- Truss labels on legs drawn right to left sit over the truss.
- Fixture labels on vertical trusses overlap the outline.
- Line weights are heavy at 1:500.
- Each truss's marks list starts a new page, with no "(continued)".
- An empty job's plot page says "Scale 1:20".
- The fixture key merges same-named models from different makers.
- Tabs count as 1 column when wrapping.
- A from-scratch export warns "No GDTF file" for every type.

## What's next (spec milestone 6, when you want it)

- drawing tools (lines, rectangles, text, dimensions)
- front or section view, and a 3D view
- label legend
- **multiple plot sheets at 1:100**: the obvious next one for your rig size
- saving undo history with the job

The plans are in `docs/superpowers/plans/`, and the design is `docs/superpowers/specs/2026-11-26-lighting-cad-design.md`.
