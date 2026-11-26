# Lighting CAD: Milestone 5b (PDF plot and paperwork pack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One PDF for the crew, from the job menu:
1. a vector plot at a standard scale on A3 landscape, with a title block
2. a marks list for each truss
3. the power list
4. the DMX pull list

**Architecture:**
- **PDF writer**: a small vector PDF writer of our own, `src/io/pdf.ts`. It handles pages, lines, rectangles, circles and text in the standard Helvetica and Courier fonts with WinAnsi encoding. There's no dependency and it works offline.
- **Plot**: `src/ui/plotPdf.ts` draws the plan in mm on paper.
- **Pack**: `src/ui/packPdf.ts` adds text pages built from the existing copy-text functions, so the paperwork matches what the app shows and copies.

**Tech stack:** as before.

**Spec:** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md`, §6 paperwork ("PNG/PDF plot at scale with a title block, power sheet, cable pull list and marks lists"; the PDF library is the builder's choice) and §8 milestone 5.

## Global Constraints

- Everything in the earlier milestones' constraints still applies: Australian English, `en-AU` dates, nothing served from client files.
- **Drafts are drawn dashed and labelled "DRAFT" on the plot.** Their marks list is headed PROVISIONAL, as the PNG is.
- **Hidden layers and classes** are left off the plot. Power and DMX lists stay whole-rig, as in the app.

## Decisions taken by the executor (owner asleep)

- **Paper**: A3 landscape (420 × 297 mm), with 10 mm margins and a 60 mm title block strip on the right.
- **Scale**: the largest of 1:20, 1:25, 1:50, 1:75, 1:100, 1:200, 1:250 and 1:500 at which the visible drawing fits. If even 1:500 doesn't fit, it's scaled to fit and the title block says "Not to scale".
- **Title block**:
  - "TRUSS CAD", the job name, the source file, the date (en-AU), the scale, "Sheet 1 of N"
  - a scale bar
  - a key of fixture types with counts
- **Plot content**:
  - **trusses**: box outlines with a centre line; drafts dashed
  - **fixtures**: symbol outlines by category, with the unit number (or Fixture ID) and the U.A address under each when there's room at that scale
  - **reference objects**: their bounds outlined in grey
  - truss names
- **Text**: characters outside WinAnsi (emoji, CJK) print as "?". En dash, ×, ° and accented Latin letters are kept.

## Review Focus

1. **Names with `(`, `)`, `\`, `&`, emoji and ×** come out escaped and readable in the PDF, and nothing breaks the file.
2. **A rig larger than 1:500 on A3** gets "Not to scale" and still fits.
3. **A job with no fixtures**: the pack still has the plot page. The empty lists are omitted, or their pages say "None".
4. **A very long marks list (60+ fixtures)** flows onto further pages, and "Sheet x of N" stays correct.
5. **The xref offsets are exact**, so the file opens in strict readers (Chrome's viewer, pdf.js, Acrobat).

---

### Task 1: PDF writer

**Files:** create `src/io/pdf.ts`; test `src/io/pdf.test.ts`

**Interfaces:**
- `class Pdf` with:
  - `page(wMm, hMm)`
  - `stroke(rgb)`, `fill(rgb)`, `width(mm)`, `dash(mm[] | null)`
  - `line(x1, y1, x2, y2)`, `rect(x, y, w, h, mode: 'S' | 'F' | 'B')`, `circle(cx, cy, r, mode)`, `poly(points, close, mode)`
  - `text(x, y, s, sizePt, { font?: 'H' | 'HB' | 'C'; align?: 'left' | 'center' | 'right'; rotate?: rad })`
  - `textWidth(s, sizePt, font)`
  - `bytes(): Uint8Array`
- The coordinates are mm from the **top left**; the writer flips them to PDF points.
- `textWidth` uses the standard Helvetica and Courier widths. The Helvetica table is for ASCII only; other characters count as 0.556 em.

**Tests:**
- the file starts `%PDF-1.4` and ends `%%EOF`
- each xref offset points at the right `n 0 obj`
- the page count in `/Count` matches
- `(`, `)` and `\` are escaped, and `–` and `×` map to WinAnsi bytes 0x96 and 0xD7
- an emoji becomes `?`
- text with `align: 'right'` ends at x

Commit `feat(cad): small vector PDF writer`.

### Task 2: Scaled plot page

**Files:** create `src/ui/plotPdf.ts`; test `src/ui/plotPdf.test.ts`

**Interfaces:**
- `pickScale(boundsMm: { w; h }, areaMm: { w; h }): { denom: number; fits: boolean }`
- `drawPlotPage(pdf, doc, opts: { jobName; source; sheet: number; sheets: number; visible(e) })`

**Tests:**
- `pickScale`: 20 m × 10 m in a 350 × 277 mm area gives 1:100; 2 m gives 1:20; 300 m gives `fits: false`
- a page for a 2-truss, 6-fixture rig contains the job name, "1:", "DRAFT" for a draft truss, and each unit number
- a hidden layer's fixture is absent

Commit `feat(cad): scaled PDF plot with a title block`.

### Task 3: The paperwork pack

**Files:**
- Create `src/ui/packPdf.ts`; test `src/ui/packPdf.test.ts`
- Modify `src/ui/jobs.ts` (an "Export PDF pack" button) and `src/main.ts`

**Interfaces:**
- `buildPack(doc, { jobName; source; visible }): Uint8Array`
  - The plot page comes first.
  - Then text pages in Courier at 9 pt: each truss's marks list (`spacingText`), the power list (`powerText`) and the DMX list (`cablingText`).
  - Pages break at the bottom margin, with a running header (job and section) and footer ("Sheet x of N").
- The file is saved and shared through `showFileSheet`, named `<job> paperwork.pdf`.

**Tests:**
- the pack for the 2-truss rig has the plot plus 3 or more pages, and its `/Count` matches the number of "Sheet x of N" footers
- a 70-fixture truss's list runs over 2 pages
- a job with no fixtures gives just the plot page and a page saying "No fixtures"

Commit `feat(cad): PDF paperwork pack from the job menu`.

### Task 4: Acceptance

**Files:** create `e2e/m5b.mjs`

Steps, with the owner's sample in memory, on phone and laptop:
1. Open the job menu and choose Export PDF pack.
2. A download whose bytes start with `%PDF`.
3. Its `/Count` is at least 4.
4. No console errors.

Then run the full regression, commit, push and check the deploy.
