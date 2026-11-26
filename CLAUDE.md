# Truss CAD (the CAD rebuild of Truss Spacer)

This `cad` branch holds the **CAD-style rebuild** of Truss Spacer.

The owner is a lighting and production tech in Australia (Melbourne/Sydney) who puts rigs in. Lighting designers send them rigs from Vectorworks (MVR). The tool imports the LD's rig, then applies specialist tools (spacing, power, cabling) and outputs paperwork and MVR. It's used on an Android phone in dim venues, and on a laptop for prep.

- **Design (the authority):** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md`
- **Milestone plans:** `docs/superpowers/plans/`
- **Other branches:**
  - `main` is the live v1 single-file app at https://greube.github.io/truss-spacer/. It's still used: the owner asked for left and centre offsets there.
  - `v2` is a frozen reference (jobs, fixture types, power) at `/truss-spacer/v2/`.
  - This branch deploys to **https://greube.github.io/truss-spacer/cad/**.

## Commands

- `npm ci`: install.
- `npm run dev`: dev server.
- `npm test`: Vitest, all unit tests.
  - Set `MVR_SAMPLE=/path/to/file.mvr` to also run the real-file tests.
  - The owner's sample "Ford Uncovered" is a **client file: never commit, publish or serve it**. Load it in browser tests through Playwright `page.route` from Node memory.
- `npm run build`: `tsc --noEmit`, then the Vite build to `dist/`, then `scripts/build-sw.mjs` writes `dist/sw.js` (the offline cache list). `BUILD_ID` env stamps the cache name.
- Browser checks use the preinstalled Playwright via `createRequire(import.meta.url)('playwright')` in `.mjs` scripts. `window.__cad` exposes `{app, jobs, renderer, shell, importBuffer}` for tests.

## Deploy

- Pushing to `cad` runs `.github/workflows/preview-cad.yml`.
- That triggers `pages.yml` **on main** (`workflow_run`), which publishes `main` at `/`, `v2` at `/v2/`, and this branch at `/cad/`. For this branch it runs `npm ci`, the tests, then the build.
- All three share one origin, so every service worker only serves and caches its own scope (`tcad:<scope>:<build>` here). It must **never** delete other caches.

## Architecture (TypeScript, Vite, no UI framework)

The direction of dependency goes top to bottom. The core has no DOM.

| Path | Role |
|---|---|
| `src/core/geom` | `vec` (2D maths, `fitLine`, `projectOnSegment`), `matrix` (the MVR `Mat` {u, v, w, o}, `parseMvrMatrix`, `yawOf`, `withYaw`, `rotateAboutZ`), `address` (absolute DMX ↔ `U.A`) |
| `src/core/model` | `types.ts`: `Doc`, `Truss` (legs and sections, `draft` / `confirmed` / `imported`), `Fixture`, `RefObject`, `FixtureType`, `Layer`, `MvrClass`, `HangingPosition`. `doc.ts`: `newDoc`, `docToJSON` / `docFromJSON` (clean and validate), `entityBounds` |
| `src/core/commands` | `History` (undo/redo, `begin`/`end` groups). `ops.ts` holds every edit as a `Command`: `addEntities`, `removeEntities`, `setProps`, `transform` (fixtures follow their truss), `duplicate`, `setVisibility`, `setFixtureType`, `updateType`, `setSettings`, `addLayer` / `layerForNew`. **Every doc change goes through `History.exec`.** |
| `src/core/index`, `snap.ts` | `GridIndex` (query, hit) and CAD snapping: truss ends, section joins, fixture centres, midpoints, 15° angles, grid |
| `src/io` | `zip.ts` (read/write with Compression Streams), `mvr/glb.ts` (bounding boxes from glTF accessors), `mvr/parse.ts` + `import.ts` (MVR → Doc, keeping the original bytes and XML), `mvr/infer.ts` (draft trusses from hanging positions; `inferCommand` is undoable) |
| `src/domain` | `spacing.ts` (v1 maths, golden-tested against 260 v1 cases), `fixtures/` (wattage DB `data.json`, built by `tools/build-fixtures.py` from OFL plus `data/touring-fixtures.json`; `match.ts`, `category.ts`, `enrich.ts`) |
| `src/view` | `camera.ts`, `plan.ts` (Canvas 2D plan renderer with level of detail, dark/paper palettes), `symbols.ts`, `input.ts` (`Gestures`: tap, drag, pinch, long press, two-finger tap, wheel) |
| `src/tools` | `Tool` interface plus `AppCtx`. `select` (tap, box select, live move with snapping, touch pan), `rotate`, `addTruss` (`suggestSections`), `addFixture`, `measure` |
| `src/app/actions.ts` | delete, duplicate, nudge, undo, redo, zoom to fit, `handleKey` |
| `src/store/jobs.ts` | IndexedDB jobs (`trussCad` database); never throws |
| `src/ui` | `shell` (layout: laptop palette and side column at ≥ 900 px, phone bottom tool bar and sheets below), `objectInfo`, `layers`, `positions`, `review` (fixture types plus picker), `jobs` (job menu, autosave, import flow), `help`, `parse` (input parsing), `theme.css` |
| `src/main.ts` | Wires everything together |

## Key decisions (see the spec and the plans' ledgers for more)

- **Imported trusses:**
  - Vectorworks MVRs may omit flown truss. Draft trusses are inferred per hanging position: height bands, straight legs (RANSAC when needed), corners joined within 1 m at the same height, 250 mm past the end fixtures.
  - Drafts are dashed. The user confirms them. Drafts are never exported.
- **Wattages:**
  - Only confident database matches are applied automatically. Everything else goes to the **Fixture types** review.
  - Custom@ types are named after the fixture.
  - Unit number 0 from Vectorworks means none.
- **Power, spacing and cabling rules** carry over from v2 (in the spec, §10).

## Conventions

- Australian English in the UI. Dates use `en-AU`.
- Phone-first: targets ≥ 44 px, no horizontal page scroll, safe-area insets.
- Escape user and file text (DOM building uses `textContent` through `ui/dom.ts`'s `h()`).
- Wrap all storage in try/catch.
- TDD: write the failing test first. Unit tests sit next to their code.
