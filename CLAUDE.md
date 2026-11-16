# Truss Spacer: project handoff

A lightweight phone tool for spacing lighting fixtures along a truss during event bump-ins (load-ins). The owner is a lighting/production tech in Australia (Melbourne/Sydney), and uses it on an Android phone in dim venues.

It was built in a claude.ai chat as a single-page web app published as a Claude artifact. This repo continues it in Claude Code.

## Current state

- **Everything is in `index.html`**: HTML, CSS and JS in one file. There's no build step and no framework. The only external dependency is Google Fonts (Barlow Condensed, Barlow, JetBrains Mono), and each font has a system fallback.
- The original artifact host injected the `<!doctype>`/`<head>` skeleton and a small CSS reset. Both have been inlined at the top of `index.html`, so the file now runs standalone. Open it in a browser or serve the folder.
- There are no tests yet.

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

## Code map (inside the `<script>` IIFE)

| Piece | Role |
|---|---|
| `S` | Persisted settings, saved to `localStorage["trussSpacer"]`. All reads and writes are wrapped in try/catch. |
| `UF` | Unit factors to mm. **All internal maths is in millimetres.** |
| `parseSections()` | String to array of section lengths in mm, or `null` if invalid. |
| `compute()` | Core maths. Returns `{L, secs, joins, pos, rows, warn, n}` or `{err}`. Each row is `{i, p, mark, sec, off, gap, near}`. |
| `fmt(mm, signed)` | Display formatter for each unit, including feet and fractional inches. |
| `rnd(mm)` | Rounds to `S.round`. |
| `render()` | Draws the summary, table and warnings, then calls `svgDraw()`. Stores the last result in `window._r`. |
| `svgDraw(r)` | The on-screen truss drawing (SVG, coloured from CSS tokens). |
| `fillChips()` and chip handler | Quick-entry buttons for the truss box. |
| `buildPng()` | Canvas export, with fixed light colours for printing. |
| Export overlay and `getDownloads()` | Preview plus save. See below. |

## Host-specific code to deal with first

`getDownloads()` calls `window.claude?.use?.("downloads")`. That is the claude.ai artifact runtime's save-file API, and it **doesn't exist outside claude.ai**. Standalone, the code already falls back to hiding **Save PNG** and asking the user to long-press the preview image. That fallback works, but it's clunky.

**Suggested first task:** when `window.claude` is absent, save with a normal `<a download>` built from the blob URL. Optionally add the Web Share API (`navigator.share({files:[...]})`) so the image can go straight to Messages or WhatsApp on Android. The `<meta name="claude:viewport-fit-sides">` tag is harmless but host-specific, and can be removed.

## Next steps the owner has mentioned or been offered

- **Real Android app.** The owner's original ask was "a lightweight android application". The options, from least to most work:
  1. **PWA**: add `manifest.webmanifest`, icons and a service worker for full offline use, so "Add to Home screen" installs it properly. Self-host the fonts so offline is truly offline.
  2. **Capacitor or TWA wrapper**: produce an APK or AAB around the same `index.html`.
  3. Native Kotlin rewrite. Probably not worth it.

  Hosting for the PWA could be GitHub Pages.
- A single "all gaps X" label on the export when the chain-line gap labels don't fit.
- Swap the chip sizes for the owner's actual truss stock if asked (for example 0.5 m and 1.25 m pieces).
- Make the in-section switch remember its state, but only if asked. It is currently off by design.

## Conventions

- Australian English in UI copy ("metres", "centre"). Dates use the `en-AU` locale.
- Keep it one file unless a PWA or wrapper needs more. Use no frameworks.
- Phone-first: touch targets of at least 42–50px, no horizontal scroll at 360–412px width, and safe-area insets respected.
- Colours only via CSS tokens. Every new colour needs a light value and a dark value.
- Wrap all `localStorage` access in try/catch.
- Test by rendering in headless Chromium (Playwright) at about 412px. Use `has_touch`/`is_mobile` for tap behaviour. Check the PNG export at several fixture counts (6, 14, 24, 45) to exercise label tilting.
