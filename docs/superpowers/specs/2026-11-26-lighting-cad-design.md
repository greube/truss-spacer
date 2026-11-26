# Lighting CAD (Truss Spacer rebuild): design

Status: for the owner's approval, 26 Nov 2026. Branch: `cad`.

## 1. Intent

The owner is a lighting and production tech in Australia. They put rigs in; they don't design them. Lighting designers (LDs) send them rigs drawn in Vectorworks. Today Truss Spacer (v1, live) and the v2 preview handle single jobs through forms and separate pages: truss spacing, power circuits, and soon DMX cabling.

The owner wants a **complete end-to-end tool**:

1. Import the LD's designed rig (MVR from Vectorworks).
2. Work on it with specialist tools: **spacing, power and cabling**.
3. Get paperwork and an updated MVR back out.

It should be **CAD-style**, not a set of web-app pages. Big plots with many trusses are easier to manage as one industry-standard drawing that you zoom, select and edit.

It must **grow into a fuller CAD tool over time**. When in doubt, choose what is more robust for editing and adding things.

It must work on a **phone** (Android, at the bump-in, in dim venues) and a **laptop** (prep).

## 2. Goals, non-goals and anti-goals

**Goals**
- Open a real Vectorworks MVR and see the whole rig in a plan view that reads like an industry plot: trusses, fixtures with symbols and labels, layers and classes, and reference objects such as stage, drape and screens.
- Navigate big plots smoothly on a mid-range Android phone and on a laptop.
- Select and edit like CAD: move, rotate, duplicate, delete, and add trusses and fixtures, with snapping, typed exact values and unlimited undo/redo.
- Run specialist tools on what's selected:
  - **spacing**. The main job is **tape marks for where the LD put each fixture**: measured from the truss end, centre or the user's own 0, with offsets, section numbers and join warnings. The backup is **re-spacing evenly** with the v1/v2 options (end gaps, centred, fixed gap), which moves the fixtures.
  - **power** (circuits and Socapex, from v2)
  - **cabling** (DMX runs and lengths)
- Export MVR that round-trips back to Vectorworks or a console without losing anything we didn't intend to change.
- Produce crew paperwork: plot PDF or PNG, power sheet, cable pull list, marks lists.
- Work fully offline once installed, as a web app from GitHub Pages.

**Non-goals (for now)**
- Designing lighting looks: focus, beams, photometrics, renders.
- A 3D view. The model is 3D so one can be added later.
- DWG import.
- General architectural drafting: walls, hatching, viewports.
- Collaboration or multi-user editing.

**Anti-goals (it fails if any of these are true, even if it technically works)**
- It **damages an LD's MVR**: losing or rewriting data the user didn't touch.
- It's **unusable on the phone**: tiny targets, or laggy pan and zoom on a real plot.
- It **needs signal** to open or edit a job at the venue.
- It **shows wrong wattages or lengths with confidence**. Anything guessed or unverified must look guessed.
- It turns into a new set of separate pages. Everything happens on the plot, with panels around it.

## 3. Constraints

- **Platforms**: Chrome on Android (phone), plus Chrome, Edge and Safari on laptops. Installable PWA, offline.
- **Hosting**: GitHub Pages, from this repo. The existing deploy publishes `main` at `/truss-spacer/` and `v2` at `/truss-spacer/v2/`. The CAD gets its own preview at `/truss-spacer/cad/`. **v1 stays live and untouched** until the CAD replaces it.
- **Build**: TypeScript with a build step (Vite) is now allowed. This deliberately departs from v1's "no build" rule, which suited a single-file app but not a CAD tool. Output is static files. No runtime requests to any server. Fonts stay self-hosted.
- **Language and units**: Australian English. Millimetres internally, as in MVR; display in m, mm or ft+in as in v1.
- **Privacy**: client MVRs (for example the sample "Ford Uncovered") are never committed, published or sent anywhere. Tests use synthetic MVRs, plus an optional local real file outside the repo.
- **Storage**: jobs can include a 10 MB-plus original MVR, so jobs live in **IndexedDB**, not localStorage. Every storage call is wrapped against failure.
- **Phone-first touch rules from v1**: targets of 44 px or more, no horizontal page scroll, safe-area insets respected, and a dark UI by default for dim venues.

## 4. What a real Vectorworks MVR contains

Findings from the owner's sample, "Ford Uncovered" (MVR 1.5, Vectorworks provider; 168 files, 10.7 MB):

- `GeneralSceneDescription.xml` (400 KB), 13 GDTF files, 145 `.glb` 3D models and 9 PNGs.
- **25 layers and 11 classes.** **9 hanging positions** in `AUXData/Position`: Entrance, Stage LX, Stage LX A/B/C, Expo Floor, Expo Flown A/B and Stage Car Specials.
- **188 fixtures.** Each has:
  - a `Matrix` (3×3 rotation plus translation in mm, Z up)
  - `GDTFSpec` (for example `Ayrton@Mistral.gdtf`) and `GDTFMode`
  - `Position` (a hanging position uuid)
  - `FixtureID`, `UnitNumber` and `CustomId`
  - `Addresses/Address`, stored as an absolute DMX number (4741 = universe 10, address 133, counting universes as 512 addresses)
  - many `CustomCommands`
  - `Classing`, `Color` and `Mappings`
  - 11 fixtures have no hanging position.
- **Flown truss is missing.** The `RIG - Truss` layer exported empty. The only `Truss` objects are 8 "TD50-300" pieces forming two vertical towers; each references a `Symbol` → `Symdef` → `.glb`. The flown fixtures still line up exactly by hanging position. For example, Expo Flown A is 23 fixtures on x ≈ 106.2 m, y 12.1–35.3 m, z ≈ 8.0–8.3 m: a straight 23.2 m line. Stage LX A and C look like L shapes or angled runs.
- **Reference objects** come through as `SceneObject` with `Symbol` or `Geometry3D` (glb): stage, drape, LED screen, foldbacks, tables, a car, shipping containers, and point loads at a bogus z of about 95 m.
- **Coordinates are about 100 m from the origin.** The app must zoom to fit and keep precision. Use 64-bit doubles in the model, and render relative to the view.
- **GDTF wattages are unreliable**: mostly the format's 1000 W default, and per-emitter values (B-EYE: 40 W). Wattage comes from the curated database, matched by manufacturer and model, or from the user.
- **Vectorworks-specific data** (`UserData/VWEntry`, `.lit` names, `CustomCommands`, `Mappings`) must survive export untouched.

## 5. Approaches considered

- **A. Our own CAD core in TypeScript (chosen).** A document model, a command-based undo system, selection, snapping, typed input, a tool plug-in system, and a fast Canvas 2D plan renderer. The model is kept in 3D (mm, matrices, like MVR) and is separate from the renderer.
  - For: full control of CAD behaviour, light enough for phones, offline web app, existing tested code carries over, grows into fuller CAD.
  - Against: more groundwork before it looks impressive.
- **B. A drawing library (Konva, Fabric, Paper.js).**
  - For: faster start on shapes and dragging.
  - Against: these are graphics libraries, not CAD. Snapping, precision, layers, big-plot performance and undo fight the library as it grows.
- **C. A 3D engine (three.js/WebGL) first.**
  - For: 3D-native, handles huge scenes.
  - Against: crisp CAD text, line weights and printable plans are hard, and it's heavy on phones.
  - Kept as a possible later second view on the same model.
- Native or desktop apps were dropped: one offline web app covers phone and laptop and already deploys.

The owner picked **A**, with the model kept 3D and the renderer separate so a 3D view can be added later.

## 6. Architecture (approach A)

**Stack**: TypeScript, Vite, Vitest (unit tests), Playwright (end-to-end at 412 px phone and 1366 px laptop). Minimal UI dependencies.

**Panel UI**: plain DOM components, or a very small library such as Preact, for the panels only. *Builder's call*, as long as the canvas and core don't depend on it.

**Modules**, one direction of dependency, top to bottom:

1. **Model** (`core/model`): plain data, no DOM.
   - **Entities**:
     - `Truss`: a **run**, a polyline in 3D that can go round corners, with a section list per leg, truss type (box size), trim height and a confirmed or draft state. Spacing measures along the run. Power and DMX treat one run as one truss: one Socapex run (more if needed) and one daisy-chain going round the corners.
     - `Fixture`: position and rotation matrix, type ref, unit number, fixture ID, address, hanging position, plus the v2 data (circuit, DMX link).
     - `HangingPosition`, `Layer` and `Class`.
     - `RefObject`: imported scene objects shown as reference geometry.
     - `Label` and `Dimension`: later.
     - `FixtureType`: manufacturer, model, mode, wattage and source.
   - Every entity has a uuid. **MVR uuids are kept**, so export can match objects back to the original file.
2. **Commands and history** (`core/commands`):
   - **Every change** is a command (do and undo) applied in a transaction. That includes tool actions such as "space fixtures" or "assign circuits".
   - Unlimited undo/redo, grouped per user action.
   - Saved with the job, so undo survives a reload: *builder's call on the limit*.
3. **Spatial index** (`core/index`): a grid or R-tree for hit-testing, box selection, snapping and drawing only what's on screen.
4. **Geometry and snapping** (`core/geom`):
   - Snap to truss ends, truss nodes and section joins, fixture centres, the grid and midpoints, plus angle snaps.
   - Exact typed values for position, length and angle, as in a CAD "Object Info" palette.
5. **Renderer** (`view/plan`): a Canvas 2D plan (top) view.
   - Draws at screen resolution with view-relative coordinates, for precision at about 100 m.
   - **Level of detail**: zoomed out, fixtures become simple marks and labels hide. Zoomed in, full symbols and labels.
   - Line weights in "paper" units, and selection highlighting.
   - Target: **60 fps pan and zoom with 2,000 fixtures and 500 truss pieces on a mid-range Android phone**, and redraw within 16 ms on a laptop.
   - The **look is CAD and plot style**: a dark drawing background by default, with a "paper" (white) mode for plotting. Truss is drawn as a double line with joins. Fixtures use our own 2D symbols by category (spot, wash, beam, profile, par or wash light, strip or batten, strobe, effect or atmospheric, generic), drawn at their real footprint and rotation.
   - Labels: unit number, fixture ID or channel, and address in U.A form. Which labels show is a per-job setting.
6. **Input** (`view/input`): Pointer Events.
   - **Touch**: one finger pans, or drags a selected object. Pinch zooms. Tap selects. Long-press gives a context menu. Two-finger tap is undo: *builder's call on gestures, but they must be consistent and listed in a help panel*.
   - **Mouse and keyboard**: wheel zoom, middle-drag or space-drag pans, box select, and standard shortcuts (Ctrl+Z/Y, Delete, Ctrl+D, arrows to nudge, Esc).
7. **Tools** (`tools/*`): plug-ins sharing one interface (activate, pointer events, preview drawing, commit as a command).
   - **Core tools**: select, move, rotate, duplicate, delete, add truss, add fixture, measure.
   - **Specialist tools**: spacing, power and cabling (milestones 2–4).
8. **Panels** (`ui/*`): toolbar, tool palette, Object Info (properties of the selection, multi-select aware), layers and classes (visibility), hanging positions list, job menu, and the help panel.
9. **I/O** (`io/*`):
   - **MVR import**:
     - Unzip with `DecompressionStream('deflate-raw')`; no zip library unless needed for browsers without it.
     - Parse the XML with `DOMParser`.
     - Map layers, classes, positions, fixtures, trusses and scene objects into the model.
     - Keep the original archive and XML DOM.
     - For reference geometry, read each glb's bounding box (from accessor min/max, without loading meshes) and draw a top-down outline. Simple projected outlines can come later.
   - **Truss inference**: for hanging positions with fixtures but no `Truss` objects, fit a line, or a polyline for L shapes, through the fixtures. Then create a **draft truss**, clearly marked as inferred, that the user confirms or edits: sections from their stock, truss type, length.
     - **Corners**: a hanging position becomes one run that goes round its corners, unless that doesn't make sense: legs that don't meet (an end gap of more than about 1 m between legs, or legs at different heights) become separate runs. The user can always **split** a run at a corner or **join** two runs that meet. Thresholds are the builder's call.
     - **Confirming ends**: the MVR shows where fixtures are, not where the truss ends. A draft starts with its ends a default distance past the outer fixtures (builder's call, shown clearly). The user confirms by entering the sections (as `3+3+2`, from their stock) and where the truss starts: drag or snap an end, or type the distance from the first fixture to the end. **Marks from a draft truss are shown as provisional** (styled differently, with a "confirm truss" prompt) and are never presented as final.
     - Real `Truss` objects get their length from their symbol or glb bounding box.
     - Vertical towers are shown as towers (a box in plan).
   - **MVR export (round trip)**:
     - Start from the **original XML DOM and archive**. Change only the nodes for entities the user changed, matched by uuid. Add new entities as new nodes in a suitable layer. Remove deleted ones.
     - Keep every unknown node and attribute, plus GDTF files, glbs and `UserData`, byte for byte where untouched.
     - **Exports go to both LDs (back into Vectorworks) and consoles**, so every export must work for both:
       - **Confirmed trusses** are written as real `Truss` objects with simple generated geometry: a box-truss glb sized to the truss type and length, plus a name, class and hanging position. That way Vectorworks and visualisers show them. **Draft trusses are not exported.**
       - **Fixtures** keep or update their position, rotation, unit number, fixture ID, address and hanging position, which is what consoles need.
       - **Added fixtures** reuse a GDTF file already in the archive when the type matches. If none exists (a database-only type), the fixture is still exported (position, name, address), and the export summary **warns** that it has no GDTF, because a console may need one.
       - The export shows a short summary first: what changed, what was added or removed, and any warnings.
     - Rezip with `CompressionStream`.
     - New jobs (no original) export a clean MVR.
   - **Jobs**: IndexedDB stores the model, history, original MVR blob and settings. Export and import of a job file for sharing.
   - **Paperwork**: PNG/PDF plot at scale with a title block, power sheet, cable pull list and marks lists (milestone 5). *PDF library choice is the builder's.*
10. **Domain modules carried over from v2**, ported to TypeScript with their tests:
    - `spacing` (`compute`, `fmt`, `parseSections`; the 260-case v1 golden test must still pass)
    - `power` (circuit grouping, Socapex, phases; brute-force test)
    - the **fixture wattage database** (`data/touring-fixtures.json` plus Open Fixture Library, built by `tools/build-fixtures.py`)
    - fixture search and "my fixtures"
11. **Fixture type matching**: on import, match `GDTFSpec` (manufacturer@model) and the fixture name against the database with fuzzy matching. Show a **review list**: matched (with source), uncertain (pick from candidates) and unknown (enter watts). Nothing gets a confident wattage without a database match or the user's say-so. Choices are remembered per job and in "my fixtures".

## 7. Screen layout

The drawing canvas fills the screen on both phone and laptop; panels sit around it.

```
Laptop (≥ 900 px)
┌──────────────────────────────────────────────────────────────┐
│ Job ▾  File ▾  Edit ▾  View ▾  Tools ▾       Undo Redo  Units │  menu/toolbar
├────┬───────────────────────────────────────────┬─────────────┤
│ ↖  │                                           │ OBJECT INFO │
│ ✥  │                                           │ Fixture 14  │
│ ⟲  │            plan view (canvas)             │ Mistral 550W│
│ ▭  │                                           │ U10.133  …  │
│ ◉  │                                           ├─────────────┤
│ ⇹  │                                           │ LAYERS      │
│ Sp │                                           │ ☑ LX-Flown  │
│ Pw │                                           │ ☐ Drape     │
│ Cb │                                           │ POSITIONS   │
├────┴───────────────────────────────────────────┴─────────────┤
│ X 106.212 m  Y 23.410 m   snap: ends ✓ grid ✓   [type value] │  status/typed input
└──────────────────────────────────────────────────────────────┘

Phone (< 900 px)
┌──────────────────────┐
│ Job ▾   ↶ ↷     ⋯    │
│                      │
│   plan view (canvas) │
│   pinch / pan / tap  │
│                      │
├──────────────────────┤
│ ↖  ✥  ⟲  ＋  Sp Pw Cb │  tool bar (44 px+)
└──────────────────────┘
 Object Info, Layers, Positions = bottom sheets, swiped up
```

The exact look (spacing, icons, colours) is the builder's, within the v1 visual language: dark-first tokens, amber accent, and the Barlow / JetBrains Mono fonts.

## 8. Milestones

Each milestone ships to `/truss-spacer/cad/` and is usable on its own.

1. **Core and import**:
   - MVR import with truss inference and the fixture type review
   - plan view with level of detail, layers and classes, hanging positions
   - select, Object Info
   - move, rotate, duplicate, delete, add truss, add fixture
   - snapping, typed values, undo/redo
   - jobs in IndexedDB, offline PWA
   - the help panel

   **Done when**, on the owner's phone and a laptop:
   - The Ford Uncovered MVR opens in under 5 s.
   - All 188 fixtures appear in their places, and the 9 hanging positions show draft trusses.
   - Panning and zooming are smooth.
   - A truss can be moved with its fixtures and undone.
   - Nothing about the job is lost after closing and reopening offline.
2. **Spacing tool**: select a truss run (or hanging position) and confirm its sections and ends.
   - **Main mode: marks for the LD's positions.** A marks list of each fixture's distance along the run from the left end, the centre or the user's own 0 (with the v1 offsets), plus section number and in-section distance, join warnings, and a flag where the LD's spacing is uneven.
   - **Backup: re-space evenly** with the v1/v2 options (end gaps, centred, fixed gap). This moves fixtures on the plot as one undoable command.
   - Tick-off marks list, copy and plot export (PNG) as in v1.
3. **Power tool**: types and wattages from the review, circuits and Socapex per truss (v2 rules), shown on the plot (circuit labels and colours), plus the power sheet and Copy power.
4. **Cabling tool**: DMX daisy-chain per truss from a chosen end. Jumper = gap + 2 × truss depth + 0.5 m, rounded up to stock lengths (1, 2, 3, 5, 10, 20, 50 m). Drawn on the plot, with a cable pull list. *Drop cables from the deck are out of scope, per the owner.*
5. **Output**: MVR export (round trip), a scaled PDF plot with title block, and the paperwork pack.
6. **Later CAD**: drawing tools (lines, rectangles, text, dimensions), a front or section view, a 3D view, label legend and key, multiple plot sheets.

## 9. Testing

- **Unit tests (Vitest)**: model and commands (do and undo are exact inverses), snapping, truss inference, address conversion, matrix maths, MVR parse, MVR round trip (export with no changes keeps the XML the same, apart from allowed normalisation, and keeps all archive members), and the ported spacing (260 golden cases) and power tests.
- **Synthetic MVR fixtures** built by a test helper, covering: trusses present or absent, L-shaped positions, towers, unknown nodes, `UserData`, and big coordinates.
- **Optional local real-file test**: reads `$MVR_SAMPLE` if set. Never committed.
- **End-to-end (Playwright)** at 412×860 (touch) and 1366×800 (mouse): import, pan/zoom, select, move, undo, offline reload, no horizontal scroll, and no console errors.
- **Performance check**: a synthetic 2,000-fixture, 500-truss rig, measuring frame times while panning (under 16 ms on a laptop; check on a phone-class CPU throttle).

## 10. Decided by the owner

- End-to-end tool: import the LD's rig, then specialist tools (spacing, power, cabling), then output.
- CAD-style, industry-standard plot rather than separate pages.
- Must work on phone and laptop.
- MVR import and export are important. Rigs mainly come from Vectorworks.
- Should grow toward fuller CAD; choose what's robust for editing and adding.
- Approach A.
- **Spacing**: the main job is marks for where the LD put the fixtures; re-spacing evenly is the backup.
- **Corners**: a run goes round corners (one truss for spacing, power and DMX) unless it doesn't make sense to.
- **Exported MVRs go to both LDs and consoles.**
- Earlier decisions that still apply: 80% of 2400 W default circuit limit (adjustable), neighbouring fixtures share circuits, one Socapex run per truss (more if needed), optional phase balancing, DMX daisy-chain per truss with "truss height + 0.5 m, next size up" slack, stock lengths 1/2/3/5/10/20/50 m, no drop cables, in-section distances off by default and not remembered, and the curated wattage database with its exclusions.

## 11. Calls made by the designer (the owner can override)

- Build on a new `cad` branch in this repo, previewed at `/truss-spacer/cad/`. v1 (main) and the v2 preview stay as they are. When the CAD is ready, it replaces v1 on `main`, with migration of v2 jobs if wanted.
- TypeScript plus Vite build step, IndexedDB for jobs.
- Our own 2D fixture symbols by category. MVR carries no 2D symbols, and GDTF 3D models are too heavy to draw in plan on phones.
- Inferred trusses are drafts until confirmed. Marks from drafts are shown as provisional, and drafts are not exported.
- Confirmed trusses are exported with simple generated box geometry. Fixtures with no GDTF are exported with a warning.
- Legs that don't meet (about 1 m apart, or at different heights) become separate runs; the user can split or join.
- Milestone 1 includes basic editing (owner's "robust for editing" steer), not just viewing.
- **v2 is frozen as a reference.** No more stages are built on `v2`. DMX cabling (v2's planned stage 3) is built in the CAD as milestone 4. The port source for `spacing`, `power` and the fixture database is the `v2` branch as it stands (commit 404a379 or later).
- **Export fidelity**: archive members we didn't change (GDTF, glb, PNG and so on) are copied byte for byte. `GeneralSceneDescription.xml` is re-serialised from the original DOM with only our changes applied. Whitespace and attribute-quote normalisation are acceptable; changing or dropping any element, attribute or text we didn't edit is not.
- **Real-file testing**: the owner's sample (Ford Uncovered) is available to the builder locally, outside the repo. Tests read it through `$MVR_SAMPLE`; it is never committed.

## 12. Left to the builder

- Panel UI approach (plain DOM or a tiny library), the PDF library, icons and exact styling.
- Spatial index type, level-of-detail thresholds, gesture details (consistent and documented), the history limit.
- Project folder structure and module boundaries within the order in section 6.
- How simple reference-geometry outlines are, beyond bounding boxes.
