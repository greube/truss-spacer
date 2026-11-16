# Truss Spacer: project handoff

A lightweight phone tool for spacing lighting fixtures along a truss during event bump-ins (load-ins). The owner is a lighting/production tech in Australia (Melbourne/Sydney), and uses it on an Android phone in dim venues.

It was built in a claude.ai chat as a single-page web app published as a Claude artifact. This repo continues it in Claude Code.

## Current state

- **v2 is in progress on the `v2` branch.** The plan, decisions and build order are in `docs/v2-plan.md`. Stage 1 (jobs with multiple trusses) is done.
- **Files, with no build step and no framework.** Plain `<script>` tags, not ES modules, so `index.html` still opens straight from `file://`.
  - `index.html`: markup and CSS
  - `js/spacing.js`: pure spacing maths, unchanged from v1
  - `js/store.js`: jobs, migration, job files
  - `js/app.js`: UI

  Alongside those, only what the PWA needs:
  - `manifest.webmanifest`
  - `sw.js`
  - `icons/` (generated from `icon.svg` and `maskable.svg`)
  - `fonts/` (self-hosted Latin-subset WOFF2 of Barlow, Barlow Condensed and JetBrains Mono, under the OFL)

  The app makes no external requests.
- **PWA**: `sw.js` precaches every file in its `ASSETS` list and serves stale-while-revalidate. **Add any new file to `ASSETS`.** The SW only registers over http(s).
- **Deploy**: `.github/workflows/pages.yml` publishes only the app files to GitHub Pages on every push to `main`. It stamps `VERSION` in `sw.js` with the commit SHA so each deploy gets a fresh cache. URL: https://greube.github.io/truss-spacer/
- The original artifact host injected the `<!doctype>`/`<head>` skeleton and a small CSS reset. Both have been inlined at the top of `index.html`, so the file now runs standalone. Open it in a browser or serve the folder.
- **Tests**: `node --test tests/*.test.js`.
  - `tests/spacing.test.js` checks `js/spacing.js` against 260 cases recorded from v1 in Chromium (`tests/v1-golden.json`). If it fails, the maths has changed.
  - `tests/store.test.js` covers migration and job files.

## What the app does

1. **Truss input**: section lengths typed as `3+3+2` or `4x2.5`. Commas and `-` also work as separators, because the Android numeric keypad has no `+` key. A row of quick-add chips sits under the box: size buttons, `+`, ⌫ and Clear. Chip sizes depend on the unit (m: 1–4, mm: 1000–4000, ft: 4/5/8/10).
2. **Fixture count**: stepper, 1–99.
3. **Layout modes** (`S.mode`):
   - `edge`, labelled "Set end gaps": a user-set end gap. With "Different gap each end" (`S.diffEnds`) there are separate left and right gaps (`S.inset`, `S.insetR`). Fixtures are spaced evenly between.
   - `equal`: the end gap equals the fixture gap, `L/(n+1)`.
   - `cells`, labelled "Centred": the end gap is half the fixture gap, `L/n` cells.
   - `fixed`: the user sets the gap (`S.spacing`) and the group is centred. The app warns if the group is longer than the truss and says how many fit.
4. **Measure from** (`S.ref`): left end, centre (signed marks: − is left, + is right) or right end. When measuring from the right, the rows reverse, gaps read in that direction, and section numbers and in-section offsets count from the right.
5. **In-section distances switch** (`showSec`): off by default and **deliberately not persisted**, so it resets to off on every load. The owner asked for this. When it's on, it adds section number plus offset within the section to the table, the copied text and the exported image (a second line under each mark, and extra table columns).
6. **Join warning**: fixtures within `S.joinWarn` mm (default 100) of a section join are flagged in red everywhere, because clamps foul the couplers.
7. **Units and rounding**: m, mm, or ft+in with fractions down to 1/16. Marks round to tape-friendly steps (default 5 mm or 1/8″). Changing units converts the existing values.
8. **Marks table**: tap a row once to select it (highlighted on the drawing) and again to tick it done. Done state resets whenever the layout inputs change.
9. **Copy list**: plain-text summary sent to the clipboard, for texting to crew.
10. **Keep screen on**: Screen Wake Lock API, which fails gracefully.
11. **Export image**: `buildPng()` draws a 2400px-wide white plot sheet on a canvas. It contains:
    - The header with the date (en-AU), truss, count, mode, gap and end gaps
    - The truss drawing with sections and joins
    - Numbered fixtures
    - A chain dimension line of all gaps, end gaps included
    - The marks from the 0 reference
    - The overall length
    - The full table
    - A footnote

    Mark labels sit **horizontal when they fit** and tilt only as much as needed so neighbouring labels clear each other (`ang` computed from the minimum fixture spacing). Gap labels on the chain line are skipped when they don't fit.
12. **Light and dark theme**: dark-first tokens on `:root`, with light overrides via `prefers-color-scheme` and `data-theme`.

## Jobs and trusses (v2 stage 1)

- **Job**: a named set of trusses, plus job-wide settings (`unit`, `round`, `joinWarn`). Changing units converts every truss in the job.
- **Truss**: `{id, name, sections, count, mode, inset, insetR, diffEnds, spacing, ref}`. Lengths are kept in the job's unit, as typed.
- **Tabs**: **Rig** (an overview card per truss, plus "Copy rig"), then one tab per truss, then "+ Truss". Each truss tab is the v1 screen, with a name field and Move, Duplicate and Delete buttons.
- **Jobs ▾ sheet**: rename, new, duplicate and delete jobs, and switch between them.
  - Save file downloads `name.truss.json`.
  - Share sends the job through the share sheet. Android won't share `.json`, so it falls back to `.truss.txt`.
  - Open file imports a job with fresh ids.
- **Saving**: `localStorage["trussSpacerJobs"]`. On first run, v1's `localStorage["trussSpacer"]` becomes the job "My rig". The v1 key is never deleted, because v1 on `main` shares the same origin.

## Code map

| Piece | Role |
|---|---|
| `S` (`app.js`) | Working settings: the job's settings merged with the open truss. **Write through `put(key, value)`**, which also updates the job. Saved via `store.js`. All storage access is wrapped in try/catch. |
| `store.js` | `load()`, `save()`, `newJob()`, `newTruss()`, `cleanJob()`, `toFile()` and `fromFile()`. It cleans and validates everything it loads or imports. |
| `spacing.js` | `UF` (unit factors to mm; **all internal maths is in millimetres**), `parseSections(str, S)`, `compute(S)`, `fmt(mm, signed, S)`, `rnd(mm, S)` and `markTxt(row, S)`. Each takes `S` as a parameter. `app.js` wraps them as `fmt(mm, signed)` and so on, using the current `S`. |
| `compute()` | Core maths. Returns `{L, secs, joins, pos, rows, warn, n}` or `{err}`. Each row is `{i, p, mark, sec, off, gap, near}`. |
| `render()` | Draws the tabs, then either `renderRig()` or the truss view (summary, table, warnings and `svgDraw()`). Stores the last result in `window._r`. |
| `svgDraw(r)` | The on-screen truss drawing (SVG, coloured from CSS tokens). |
| `fillChips()` and chip handler | Quick-entry buttons for the truss box. |
| `buildPng()` | Canvas export, with fixed light colours for printing. The title is the truss name, with the job name and date at top right. |
| Export overlay | Preview, **Save PNG** and **Share**. Save uses the claude.ai `downloads` API when present (`getDownloads()`), otherwise an `<a download>` from the blob URL. **Share** uses `navigator.share({files})` and shows only when `navigator.canShare` accepts a PNG file. |

## Next steps the owner has mentioned or been offered

- **Real Android app.** The owner's original ask was "a lightweight android application". The options, from least to most work:
  1. ~~**PWA**~~: done (manifest, icons, service worker, self-hosted fonts, GitHub Pages).
  2. **Capacitor or TWA wrapper**: produce an APK or AAB around the same `index.html`.
  3. Native Kotlin rewrite. Probably not worth it.

- Very dense layouts (e.g. 45 fixtures on 8 m with in-section distances on) overlap mark labels on the export even at 90°. This is a known limitation of the label maths.
- A single "all gaps X" label on the export when the chain-line gap labels don't fit.
- Swap the chip sizes for the owner's actual truss stock if asked (for example 0.5 m and 1.25 m pieces).
- Make the in-section switch remember its state, but only if asked. It is currently off by design.

## Conventions

- Australian English in UI copy ("metres", "centre"). Dates use the `en-AU` locale.
- Keep to a few plain files: no frameworks and no build step. Every file the app loads must be listed in `ASSETS` in `sw.js` and copied by `.github/workflows/pages.yml`.
- Escape user text (job and truss names) with `esc()` before putting it into HTML.
- Phone-first: touch targets of at least 42–50px, no horizontal scroll at 360–412px width, and safe-area insets respected.
- Colours only via CSS tokens. Every new colour needs a light value and a dark value.
- Wrap all `localStorage` access in try/catch.
- Test by rendering in headless Chromium (Playwright) at about 412px. Use `has_touch`/`is_mobile` for tap behaviour. Check the PNG export at several fixture counts (6, 14, 24, 45) to exercise label tilting.
