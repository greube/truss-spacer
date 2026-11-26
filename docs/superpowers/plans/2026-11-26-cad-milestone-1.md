# Lighting CAD: Milestone 1 (Core and import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a real Vectorworks MVR on phone or laptop, see the whole rig as a CAD plan with draft trusses inferred from hanging positions, and select, edit and undo with snapping and typed values. Jobs are saved offline.

**Architecture:**
- TypeScript app built with Vite into static files, served from GitHub Pages at `/truss-spacer/cad/` as an offline PWA.
- A pure core (geometry, model, commands, index, MVR I/O, inference, fixture database) with no DOM, under test with Vitest.
- A Canvas 2D plan renderer and pointer-event tools on top, plus plain-DOM panels.

**Tech Stack:**
- TypeScript 7.0.2, Vite 8.4.0, Vitest 5.1.2 (exact versions, `--save-exact`).
- Plain DOM (no UI framework). Canvas 2D. IndexedDB.
- `DecompressionStream` / `CompressionStream` (`deflate-raw`) for zip.
- Playwright 1.63 (preinstalled, used through `require('playwright')` in Node e2e scripts).
- Dev-only test helpers: `@xmldom/xmldom` (DOMParser in Vitest) and `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-11-26-lighting-cad-design.md` (read sections 4, 6, 7, 8 and 11 before starting).

## Global Constraints

- Australian English in all UI copy ("metres", "centre", "colour"). Dates in `en-AU`.
- Internal units are millimetres, as 64-bit doubles. MVR matrices are right-handed, Z up, 1 unit = 1 mm.
- No runtime network requests; the app works fully offline once loaded. Fonts are self-hosted (copy `fonts/`).
- Client MVRs are never committed or published. Real-file tests read `process.env.MVR_SAMPLE` and skip when it's unset. The owner's sample is at `/root/.claude/uploads/9a3158c4-6d1f-5880-acd6-9445fb7085b9/c182f633-Ford_Uncovered_MVR.mvr`.
- Phone rules: touch targets ≥ 44 px, no horizontal page scroll at 360–412 px, safe-area insets respected, dark UI by default (amber accent `#ffb21e` in dark, `#d98a00` in light; tokens from the v2 `index.html`).
- Colours only through CSS custom properties, with a light and a dark value each.
- Every IndexedDB and localStorage call is wrapped in try/catch. On failure, show a warning and keep working in memory.
- Escape all user and file text before it goes into HTML. Render it with `textContent`, never `innerHTML`.
- Every document change goes through `History.exec()` (Task 3). No tool or panel mutates the `Doc` directly.
- Never change or drop MVR data the user didn't edit. Keep MVR uuids on imported entities, and keep the original archive bytes in the job.
- Layout breakpoint: ≥ 900 px wide is laptop layout (side panels); < 900 px is phone layout (bottom tool bar plus bottom sheets).
- Performance target: 60 fps pan and zoom with 2,000 fixtures and 500 truss pieces, i.e. a frame under 16 ms on a laptop, and under 16 ms with 4× CPU throttle in Chromium.

## Review Focus

1. **The wrong kind of file** (a PDF, a `.zip` without `GeneralSceneDescription.xml`, a truncated download): a friendly error naming the problem, with no crash and the current job untouched. Test in Task 6.
2. **MVR shapes the sample doesn't have**:
   - fixtures nested inside `GroupObject` child lists
   - fixtures with no `Matrix`, no `Addresses`, or several `Address` nodes
   - a `GDTFSpec` without `.gdtf`
   - layers with no `ChildList`

   All import, and missing values fall back to defaults. Test in Task 6.
3. **A tap that wobbles a few pixels on a phone** must select, not move the object. **A pinch that starts as a one-finger drag** must turn into zoom without moving anything. Test in Task 11.
4. **IndexedDB unavailable or full** (private window, quota): the app opens and works in memory, and shows "This device isn't saving jobs" once. Test in Task 14.
5. **Resizing or rotating the phone mid-edit**: the canvas resizes to the new size and device pixel ratio, the view keeps its centre and scale, and the selection survives. Test in Task 13.

---

## File structure (created by these tasks)

```
package.json, tsconfig.json, vite.config.ts, index.html           Task 1
public/manifest.webmanifest, public/icons/*, public/fonts/*       Task 1 (copied), Task 15 (manifest)
scripts/build-sw.mjs                                              Task 15
src/main.ts                                                       Task 1 → wired up in Task 13
src/core/geom/vec.ts, matrix.ts, address.ts                       Task 2
src/core/model/types.ts, doc.ts                                   Task 3
src/core/commands/history.ts, ops.ts                              Task 3
src/io/zip.ts                                                     Task 4
src/io/mvr/glb.ts                                                 Task 5
src/io/mvr/parse.ts, src/io/mvr/import.ts                         Task 6
src/io/mvr/infer.ts                                               Task 7
src/domain/fixtures/data.json (generated), db.ts, match.ts, category.ts   Task 8
src/domain/spacing.ts (port of js/spacing.js, used for fmt now)   Task 8
src/core/index/grid.ts, src/core/snap.ts                          Task 9
src/view/camera.ts, symbols.ts, plan.ts                           Task 10
src/view/input.ts, src/tools/tool.ts, select.ts, src/app/actions.ts       Task 11
src/tools/rotate.ts, addTruss.ts, addFixture.ts, measure.ts       Task 12
src/ui/dom.ts, shell.ts, objectInfo.ts, layers.ts, positions.ts, help.ts, theme.css   Task 13
src/store/jobs.ts, src/ui/jobs.ts, src/ui/review.ts               Task 14
.github/workflows/preview-cad.yml (cad), pages.yml (main)         Task 15
test/helpers/makeMvr.ts, makeGlb.ts                               Tasks 5–6
e2e/m1.mjs, e2e/perf.mjs                                          Task 16
```

Unit tests sit next to their code as `*.test.ts`. The old v2 runtime files at the repo root (`index.html`, `js/`, `sw.js`, `manifest.webmanifest`) are removed from the `cad` branch in Task 1; they stay on `v2`. `data/touring-fixtures.json` and `tools/build-fixtures.py` stay. `tests/v1-golden.json` moves to `src/domain/v1-golden.json`.

---

### Task 1: Scaffold the TypeScript app

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/smoke.test.ts`
- Move: `icons/` → `public/icons/`, `fonts/` → `public/fonts/`, `tests/v1-golden.json` → `src/domain/v1-golden.json`
- Delete (cad branch only): `js/`, root `index.html` (replaced), `sw.js`, `manifest.webmanifest`, `tests/*.test.js`

**Interfaces:**
- Produces npm scripts: `dev`, `build` (`tsc --noEmit && vite build && node scripts/build-sw.mjs`; the last part is added in Task 15), `test` (`vitest run`), `e2e` (`node e2e/m1.mjs`).

- [ ] **Step 1:** `npm init -y`, then `npm i -D --save-exact typescript@7.0.2 vite@8.4.0 vitest@5.1.2`.
- [ ] **Step 2:** Configuration.
  - `tsconfig.json`: `strict: true`, `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `lib: ["ES2022","DOM","DOM.Iterable"]`, `resolveJsonModule: true`, `noEmit: true`.
  - `vite.config.ts`: `base: './'`, `build.outDir: 'dist'`, `test.environment: 'node'`.
- [ ] **Step 3:** Write `src/smoke.test.ts` asserting `1 + 1 === 2`. Run `npx vitest run`. Expected: 1 passed.
- [ ] **Step 4:** `index.html` and `src/main.ts`.
  - `index.html`: `lang="en-AU"`, the viewport meta with `viewport-fit=cover`, `<title>Truss CAD</title>`, `<div id="app"></div>`, `<script type="module" src="/src/main.ts">`.
  - `main.ts` renders the text "Truss CAD" into `#app`.
- [ ] **Step 5:** Run `npm run build`. Expected: `dist/index.html` exists, and the assets use relative `./assets/` paths.
- [ ] **Step 6:** Add `node_modules/` and `dist/` to `.gitignore`. Commit: `chore(cad): scaffold TypeScript/Vite app, retire v2 runtime files on cad branch`.

### Task 2: Geometry, MVR matrices and DMX addresses

**Files:**
- Create: `src/core/geom/vec.ts`, `src/core/geom/matrix.ts`, `src/core/geom/address.ts`
- Test: `src/core/geom/geom.test.ts`

**Interfaces:**
- Produces `vec.ts`:
  - `type V2 = {x:number;y:number}` and `type V3 = {x:number;y:number;z:number}`
  - `add`, `sub`, `scale`, `dot`, `len`, `dist`, `norm` (2D)
  - `projectOnSegment(p:V2,a:V2,b:V2): {t:number; point:V2; d:number}`
  - `fitLine(points:V2[]): {origin:V2; dir:V2; maxResidual:number}`: principal-axis least squares.
- Produces `matrix.ts`:
  - `type Mat = {u:V3; v:V3; w:V3; o:V3}`: u, v and w are the rotated X, Y and Z axes; o is the translation in mm.
  - `IDENTITY: Mat`
  - `parseMvrMatrix(s:string): Mat` and `formatMvrMatrix(m:Mat): string`
  - `yawOf(m:Mat): number` (radians, `atan2(u.y,u.x)`)
  - `withYaw(m:Mat, yaw:number): Mat`: keeps u.z, v.z and w and the translation, rotating only about Z
  - `translate(m:Mat, d:V3): Mat` and `rotateAboutZ(m:Mat, pivot:V2, angle:number): Mat`
- Produces `address.ts`:
  - `toUniverseAddress(abs:number): {universe:number; address:number}`
  - `fromUniverseAddress(u:number, a:number): number`
  - `formatUA(abs:number): string` (gives `"10.133"`)

- [ ] **Step 1: Write the failing tests**

```ts
expect(parseMvrMatrix('{1,0,0}{0,-1,0}{0,0,-1}{100751.935698,-31833.060348,0}').o).toEqual({x:100751.935698,y:-31833.060348,z:0});
expect(parseMvrMatrix(formatMvrMatrix(m))).toEqual(m); // round trip for a rotated m
expect(yawOf(parseMvrMatrix('{0.158127,-0.987419,0}{0.987419,0.158127,0}{0,0,1}{0,0,0}'))).toBeCloseTo(Math.atan2(-0.987419,0.158127),6);
expect(toUniverseAddress(4741)).toEqual({universe:10,address:133});
expect(toUniverseAddress(1)).toEqual({universe:1,address:1});
expect(toUniverseAddress(512)).toEqual({universe:1,address:512});
expect(fromUniverseAddress(10,133)).toBe(4741);
expect(fitLine([{x:0,y:0},{x:1000,y:10},{x:2000,y:0}]).maxResidual).toBeLessThan(10);
expect(projectOnSegment({x:5,y:5},{x:0,y:0},{x:10,y:0})).toMatchObject({t:0.5,d:5});
const r=rotateAboutZ(IDENTITY,{x:1000,y:0},Math.PI/2); expect(r.o.x).toBeCloseTo(1000); expect(r.o.y).toBeCloseTo(-1000);
```

- [ ] **Step 2:** Run `npx vitest run src/core/geom`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three files. `formatMvrMatrix` writes 6 decimal places in the `{a,b,c}{…}{…}{…}` form.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): geometry, MVR matrix and DMX address helpers`.

### Task 3: Document model, commands and undo/redo

**Files:**
- Create: `src/core/model/types.ts`, `src/core/model/doc.ts`, `src/core/commands/history.ts`, `src/core/commands/ops.ts`
- Test: `src/core/commands/history.test.ts`

**Interfaces:**
- Produces `types.ts`:
  - `type Category = 'spot'|'wash'|'beam'|'profile'|'par'|'strip'|'strobe'|'effect'|'generic'` (Task 8's `categorise` returns it)
  - `type Id = string`: an uppercase UUID. Imported entities keep their MVR uuid. New ones use `crypto.randomUUID().toUpperCase()`.
  - `Layer {id; name; visible:boolean}` and `MvrClass {id; name; visible:boolean}`
  - `HangingPosition {id; name}`
  - `FixtureType {key:string; m:string; n:string; w:number|null; src:'s'|'l'|'o'|'m'|'j'|null; url:string; gdtfSpec:string; mode:string; category:Category}`
  - `Leg {a:V3; b:V3; sections:number[]}` (sections in mm; empty means not set)
  - `Truss {id; kind:'truss'; name; layerId; classId|null; positionId|null; legs:Leg[]; boxSize:number; state:'draft'|'confirmed'|'imported'; mvrUuid|null}`
  - `Fixture {id; kind:'fixture'; name; layerId; classId|null; positionId|null; trussId|null; matrix:Mat; typeKey:string; unitNumber:number|null; fixtureId:string; address:number|null; mvrUuid|null}`
  - `RefObject {id; kind:'ref'; name; layerId; classId|null; matrix:Mat; bounds:{min:V3;max:V3}|null}` (bounds are local)
  - `Entity = Truss | Fixture | RefObject`
  - `Doc {entities:Map<Id,Entity>; layers:Layer[]; classes:MvrClass[]; positions:HangingPosition[]; types:Map<string,FixtureType>; settings:{unit:'m'|'mm'|'ft'; round:number; labels:{unit:boolean;fid:boolean;addr:boolean}}}`
- Produces `doc.ts`:
  - `newDoc(): Doc`
  - `newId(): Id`
  - `docToJSON(d:Doc): unknown` and `docFromJSON(j:unknown): Doc`. These validate and clean, dropping malformed entities rather than throwing.
  - `entityBounds(d:Doc, e:Entity): {min:V2;max:V2}`
  - `docBounds(d:Doc): {min:V2;max:V2}|null`
- Produces `history.ts`:
  - `interface Command {label:string; do(d:Doc):void; undo(d:Doc):void}`
  - `class History`, with:
    - `constructor(doc:Doc)`
    - `exec(c:Command):void`, `undo():void`, `redo():void`
    - `canUndo:boolean`, `canRedo:boolean`
    - `begin(label:string):void` and `end():void`: group commands into one undo step
    - `onChange(fn:(c:Command|null)=>void):()=>void`
  - The redo stack clears when a new command runs. The undo limit is 500.
- Produces `ops.ts`:
  - `addEntities(es:Entity[]):Command` and `removeEntities(ids:Id[]):Command`. Removing a truss sets `trussId=null` on its fixtures, and undo restores that.
  - `setProps(id:Id, patch:Partial<Entity>):Command`: stores the old values of the patched keys.
  - `transform(ids:Id[], f:(m:Mat)=>Mat):Command`. For trusses, it applies to the leg points. When a truss is in `ids`, the fixtures whose `trussId` is that truss move with it.
  - `duplicate(ids:Id[], offset:V2):Command`: new ids, `mvrUuid=null`, and duplicated fixtures follow a duplicated truss.
  - `setVisibility(kind:'layer'|'class', id:Id, visible:boolean):Command`
  - `setFixtureType(ids:Id[], typeKey:string, type?:FixtureType):Command`

- [ ] **Step 1: Write the failing tests**

```ts
// for each op: snapshot docToJSON before, exec, undo -> deep equal to before; redo -> equal to after-exec snapshot
test.each(opsUnderTest)('%s: undo restores exactly', ...)
expect(moving a truss with transform also moves its fixtures by the same delta)
expect(removeEntities([trussId]) then undo -> fixture.trussId restored)
expect(h.begin('x'); exec a; exec b; h.end(); h.undo() undoes both)
expect(after undo, exec new -> canRedo === false)
expect(docFromJSON({entities:[{kind:'fixture'}], junk:1}).entities.size).toBe(0) // malformed dropped
```

- [ ] **Step 2:** Run `npx vitest run src/core`. Expected: FAIL.
- [ ] **Step 3:** Implement. A `Command` stores everything it needs to undo itself; no doc snapshots.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): document model and undoable commands`.

### Task 4: Zip read and write

**Files:**
- Create: `src/io/zip.ts`
- Test: `src/io/zip.test.ts`

**Interfaces:**
- Produces:
  - `readZip(buf:ArrayBuffer): Promise<Map<string, Uint8Array>>`. Supports STORE (0) and DEFLATE (8) through `DecompressionStream('deflate-raw')`. It throws a `ZipError` with message `"This file isn't a zip archive."` or `"This archive uses a format the app can't read."`.
  - `writeZip(files:Map<string,Uint8Array>, opts?:{deflate?:boolean}): Promise<Uint8Array>`, with CRC32, DEFLATE through `CompressionStream('deflate-raw')` by default, UTF-8 names (bit 11) and no zip64.
  - `crc32(b:Uint8Array):number`

- [ ] **Step 1: Write the failing tests**

```ts
expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686);
const files=new Map([['GeneralSceneDescription.xml',enc('<x/>')],['a@b.gdtf',randomBytes(5000)]]);
expect(await readZip((await writeZip(files)).buffer)).toEqual(files);             // deflate
expect(await readZip((await writeZip(files,{deflate:false})).buffer)).toEqual(files); // store
await expect(readZip(enc('%PDF-1.7').buffer)).rejects.toThrow("This file isn't a zip archive.");
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Read from the end-of-central-directory record, then the central directory, then the local headers; don't rely on local header sizes, because data descriptors may be present.
- [ ] **Step 4:** Run the tests (Node 22 has the stream APIs). Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): zip reader/writer using browser compression streams`.

### Task 5: GLB bounding boxes

**Files:**
- Create: `src/io/mvr/glb.ts`, `test/helpers/makeGlb.ts`
- Test: `src/io/mvr/glb.test.ts`

**Interfaces:**
- Produces `glbBounds(buf:Uint8Array): {min:V3;max:V3}|null`.
  - Parses only the JSON chunk.
  - Unions the `POSITION` accessor `min`/`max` of every mesh primitive, transformed by each node's world matrix (node `matrix`, or TRS, through the scene's node tree). The 8 box corners are transformed per accessor.
  - Returns `null` for a bad file.
  - glTF is Y-up. Convert to MVR's Z-up with (x, y, z)gltf → (x, −z, y)mvr, then scale metres → mm (×1000).
- Produces `makeGlb(meshes:{min:number[];max:number[];translation?:number[]}[]): Uint8Array`, a test helper.

- [ ] **Step 1: Write the failing tests**

```ts
expect(glbBounds(makeGlb([{min:[0,0,0],max:[1,2,3]}]))).toEqual({min:{x:0,y:-3000,z:0},max:{x:1000,y:0,z:2000}});
expect(glbBounds(makeGlb([{min:[0,0,0],max:[1,1,1],translation:[2,0,0]}]))!.max.x).toBe(3000);
expect(glbBounds(new Uint8Array([1,2,3]))).toBeNull();
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run against the sample: a test that, when `MVR_SAMPLE` is set, reads every `.glb` in it and expects `glbBounds` to be non-null for at least 140 of the 145. Expected: PASS (and skipped when the variable is unset).
- [ ] **Step 5:** Commit: `feat(cad): read glb bounding boxes without loading meshes`.

### Task 6: MVR parse and import

**Files:**
- Create: `src/io/mvr/parse.ts`, `src/io/mvr/import.ts`, `test/helpers/makeMvr.ts`
- Test: `src/io/mvr/import.test.ts`

**Interfaces:**
- Consumes: `readZip` (Task 4), `glbBounds` (Task 5), `parseMvrMatrix` (Task 2), `newDoc` and the types (Task 3).
- Produces:
  - `importMvr(buf:ArrayBuffer): Promise<{doc:Doc; original:Uint8Array; xml:string; warnings:string[]}>`. It throws `MvrError` with:
    - `"This file isn't an MVR (no GeneralSceneDescription.xml)."` for a zip without the scene file
    - `"This isn't a zip archive."` (re-wrapped `ZipError`)
    - `"The scene description couldn't be read."` for XML parse errors
  - `parseScene(xml:string, files:Map<string,Uint8Array>): {doc:Doc; warnings:string[]}`, the pure part, which uses `DOMParser`. In Vitest, use `@xmldom/xmldom` as a dev dependency, passed in through a `parseXml` parameter defaulting to `new DOMParser()`.
  - `makeMvr(opts): Promise<ArrayBuffer>`, a test helper building synthetic scenes (layers, classes, positions, fixtures, trusses, groups, symdefs).
- Mapping rules (from spec §4):
  - `Layers/Layer` → `Layer` (visible = true).
  - `AUXData/Class` → `MvrClass`.
  - `AUXData/Position` → `HangingPosition`.
  - Walk every `ChildList` recursively, including inside `GroupObject`. A group's own `Matrix` (default identity) multiplies into its children's matrices.
  - `Fixture` → `Fixture`:
    - `matrix`; `typeKey = GDTFSpec` without the `.gdtf` suffix, or `"name:"+name` if empty
    - `unitNumber`, `fixtureId` (`FixtureID` text), `address` = the first `Address` with `break="0"`, otherwise the first `Address`, otherwise null
    - `positionId`, `classId`, `layerId`, `mvrUuid = uuid`
  - Each distinct `typeKey` creates a `FixtureType` with `m`/`n` split at `@`, `w = null`, `src = null` and `category = 'generic'` (filled in by Task 8).
  - `Truss` → `Truss`, `state:'imported'`, with one leg along local X from the symbol geometry's bounding box (`min.x`..`max.x` at `y=z=0`), transformed by its matrix. If the box is taller than it is long, it's a vertical tower: the leg runs from `o` to `o + (0,0,height)`.
  - `SceneObject` → `RefObject`, with bounds from the union of its `Geometry3D` glbs and its `Symbol` → `Symdef` child geometries.
  - Unknown elements are ignored by the model (they stay in the kept `xml` and original).
  - Missing `Matrix` → identity, with a warning `"<n> objects had no position and were placed at 0,0"`.

- [ ] **Step 1: Write the failing tests**

```ts
const {doc}=await importMvr(await makeMvr({fixtures:[{uuid:'A',spec:'Ayrton@Mistral.gdtf',matrix:'{1,0,0}{0,1,0}{0,0,1}{1000,2000,8000}',address:4741,position:'P1'}],positions:[{uuid:'P1',name:'LX1'}]}));
expect([...doc.entities.values()][0]).toMatchObject({kind:'fixture',mvrUuid:'A',typeKey:'Ayrton@Mistral',address:4741,positionId:'P1'});
expect(doc.types.get('Ayrton@Mistral')).toMatchObject({m:'Ayrton',n:'Mistral'});
// fixtures inside a GroupObject with a translated group matrix land at group+local position
// fixture with no Matrix/Addresses imports with identity + address null and produces the warning
// several Address nodes: break="0" wins
await expect(importMvr(await zipOf({'readme.txt':'x'}))).rejects.toThrow('no GeneralSceneDescription.xml');
await expect(importMvr(enc('%PDF').buffer)).rejects.toThrow("isn't a zip archive");
// MVR_SAMPLE (skip if unset):
expect(fixtures.length).toBe(188); expect(doc.layers.length).toBe(25); expect(doc.positions.length).toBe(9); expect(doc.classes.length).toBe(11);
expect(trusses.filter(t=>t.state==='imported').length).toBe(8);
expect(fixture with FixtureID '923'.address).toBe(4741);
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, including with `MVR_SAMPLE=<path>`. Expected: PASS, with the sample import under 2 s in Node.
- [ ] **Step 5:** Commit: `feat(cad): import MVR scenes (layers, classes, positions, fixtures, trusses, reference objects)`.

### Task 7: Draft trusses from hanging positions

**Files:**
- Create: `src/io/mvr/infer.ts`
- Test: `src/io/mvr/infer.test.ts`

**Interfaces:**
- Consumes: `fitLine` and `projectOnSegment` (Task 2), types (Task 3).
- Produces `inferTrusses(doc:Doc, opts?:InferOpts): Truss[]`. It creates draft trusses and sets `trussId` on the fixtures it assigns. It returns the new trusses, so the caller adds them with `addEntities` and they become undoable. `InferOpts` defaults, from spec §11:
  - `minHeight: 1500`
  - `maxResidual: 300`
  - `joinGap: 1000`
  - `maxHeightStep: 400`
  - `endOverhang: 250`
  - `boxSize: 300`
  - `maxLegs: 4`
- Algorithm (not determined by the signature):
  1. Group fixtures by `positionId`, skipping positions that already have an imported `Truss` and fixtures with `positionId=null`.
  2. Skip a group if its median fixture z < `minHeight`. That's a floor position, with no truss.
  3. **Legs.** If `fitLine` of the group's XY points has `maxResidual ≤ maxResidual`, it's one leg. Otherwise run RANSAC: try every pair of points, count inliers within `maxResidual`, and take the best line's inliers as a leg. Repeat on the rest, up to `maxLegs`. If points remain after `maxLegs`, give up on that position and add the warning `"Couldn't work out the truss for <name>"`.
  4. Each leg spans its points' projections, extended by `endOverhang` at both ends. Leg z = max fixture z in the leg.
  5. **Runs.** Order the legs into a chain by nearest ends. Join two consecutive legs into one run if their nearest ends are within `joinGap` and their z differs by ≤ `maxHeightStep`. Snap the shared corner to the intersection of the two lines when it lies within `joinGap` of both ends. Otherwise they become separate runs.
  6. Name runs after the position, with " (2)", " (3)" and so on when a position splits.

- [ ] **Step 1: Write the failing tests**

```ts
// straight: 10 fixtures on y=0, x=0..9000 step 1000, z=8000 -> 1 truss, 1 leg, a.x=-250, b.x=9250, a.z=8000, state 'draft', all fixtures trussId set
// L shape: 5 on y=0 (x 0..4000) + 5 on x=4250 (y 250..4250), z 10000 -> 1 truss, 2 legs sharing a corner near (4250,0)
// two parallel lines 3 m apart same position -> 2 trusses ("LX1", "LX1 (2)")
// heights 8000 and 9000 meeting at a corner -> 2 trusses (height step > 400)
// floor: z=0 -> no truss
// position with an imported Truss -> skipped
// MVR_SAMPLE: Expo Flown A -> 1 straight truss, length between 23400 and 23800 mm; Entrance / Expo Floor / Stage LX (floor) -> none;
//             every fixture assigned to a draft is within 300 mm of its leg
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests, plus the sample. Expected: PASS. Write each sample position's result (legs and lengths) into the commit message body for the record.
- [ ] **Step 5:** Commit: `feat(cad): infer draft trusses from hanging positions`.

### Task 8: Fixture database, type matching and symbol categories

**Files:**
- Modify: `tools/build-fixtures.py`: write `src/domain/fixtures/data.json` (the same rows as `js/fixtures-data.js`, as plain JSON) instead of the JS file. Update the usage docstring.
- Create: `src/domain/fixtures/db.ts` (TypeScript port of the v2 `js/fixtures.js` search and "my fixtures"; localStorage key `trussSpacerMyFixtures`, kept), `src/domain/fixtures/match.ts`, `src/domain/fixtures/category.ts`, `src/domain/spacing.ts` (TypeScript port of the v2 `js/spacing.js`, unchanged maths)
- Test: `src/domain/fixtures/fixtures.test.ts`, `src/domain/spacing.test.ts` (port of `tests/spacing.test.js`, reading `src/domain/v1-golden.json`)

**Interfaces:**
- Produces:
  - `search(q:string, limit?:number): DbType[]`, with `DbType = {key; m; n; w; src; url}`
  - `mine()`, `addMine(m,n,w)`, `removeMine(key)`, `label(t)`
  - `matchType(t:FixtureType): {status:'matched'|'uncertain'|'unknown'; candidates:DbType[]}`
  - `categorise(m:string, n:string): Category` (`Category` from `src/core/model/types.ts`)
  - `fmt(mm:number, signed:boolean, S:{unit:'m'|'mm'|'ft'; round:number}): string` and the rest of the spacing API, with the same names as `js/spacing.js`
- Matching rules:
  - Normalise to lowercase alphanumeric words.
  - If `m` is `Custom` or `Generic` or empty, match on the fixture `name` instead.
  - **matched**: the top result has the same normalised manufacturer, and its model words equal the query model words, or contain all of them with ≤ 1 extra word.
  - **uncertain**: there are results but they don't meet that test. Up to 5 candidates.
  - **unknown**: no results.
- Category keywords: `strobe|atomic|blinder` → strobe; `beam|sharpy` → beam; `profile|source four|ellipsoidal|leko` → profile; `spot` → spot; `wash|aura|par.*wash` → wash; `par` → par; `bar|batten|strip|tube|line` → strip; `fog|haze|fan|fogger|atme` → effect; otherwise generic. First match wins, checked in this order.

- [ ] **Step 1: Write the failing tests**

```ts
expect(matchType(t('Ayrton','Mistral'))).toMatchObject({status:'matched',candidates:[{w:550}]});
expect(matchType(t('Ayrton','Eurus')).candidates[0].w).toBe(900);
expect(matchType(t('Clay Paky','Aleda B-EYE K10')).status).not.toBe('unknown');
expect(matchType(t('Silver Star','Pluto 2000')).status).toBe('unknown');
expect(matchType({...t('Custom','Light_Instr_ShowPro_CYC_RGBW'),n:'ShowPro CYC RGBW'}).status).not.toBe('matched');
expect(categorise('Elation','SIXBAR 1000')).toBe('strip'); expect(categorise('MDG','theFAN')).toBe('effect'); expect(categorise('Clay Paky','Sharpy')).toBe('beam');
// spacing golden: 260 cases pass (port of tests/spacing.test.js)
```

- [ ] **Step 2:** Run `python3 tools/build-fixtures.py <ofl>/fixtures`. The OFL checkout steps are at the top of the script. Then run the tests. Expected: `data.json` written with 780 rows; tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): fixture database, type matching, symbol categories; port spacing maths`.

### Task 9: Spatial index and snapping

**Files:**
- Create: `src/core/index/grid.ts`, `src/core/snap.ts`
- Test: `src/core/index/grid.test.ts`, `src/core/snap.test.ts`

**Interfaces:**
- Produces:
  - `class GridIndex`: `constructor(cell=2000)`, `rebuild(doc:Doc)`, `update(id:Id, b:Bounds|null)`, `query(b:Bounds): Id[]`, and `hit(p:V2, tol:number, doc:Doc): Id|null`. `hit` prefers fixtures over trusses over ref objects, then the nearest.
  - `snap(p:V2, ctx:{doc:Doc; index:GridIndex; tolWorld:number; grid:number; exclude:Set<Id>; from?:V2}): {p:V2; kind:'end'|'node'|'join'|'fixture'|'mid'|'grid'|'angle'|'none'; label:string}`
- Priority within `tolWorld`:
  1. truss leg ends and corners ("end")
  2. section joins ("join")
  3. fixture centres ("fixture")
  4. leg midpoints ("mid")
  5. grid ("grid")

  With `from`, the angle from `from` snaps to the nearest 15° when within 3°. The grid size is chosen by the caller.

- [ ] **Step 1: Write the failing tests**

```ts
// index: 2,000 random fixtures; query(rect) === brute-force filter; hit prefers fixture lying on a truss
// snap: point 20 mm from a truss end with tol 100 -> kind 'end' at the end; nothing near -> grid; exclude set skips the dragged entity
// angle: from (0,0) to (1000, 30) -> snapped onto 0°
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): spatial grid index and CAD snapping`.

### Task 10: Camera and plan renderer

**Files:**
- Create: `src/view/camera.ts`, `src/view/symbols.ts`, `src/view/plan.ts`
- Test: `src/view/camera.test.ts`

**Interfaces:**
- Produces:
  - `class Camera {cx; cy; scale}`, where `scale` is px per mm. It has:
    - `toScreen(p:V2):V2` and `toWorld(p:V2):V2`. Screen y points down and world y points up.
    - `zoomAt(screen:V2, factor:number)`, clamped to 0.0005–2 px/mm
    - `panBy(dx:number, dy:number)`
    - `fit(b:Bounds, w:number, h:number, margin=40)`
  - `drawSymbol(ctx, cat:Category, sizePx:number, selected:boolean, colour:string)`. The fixture's footprint is 400 mm by default, and 600 mm for spot, wash and profile.
  - `class PlanRenderer`, with:
    - `constructor(canvas:HTMLCanvasElement, getState:()=>ViewState)`
    - `resize()`: uses device pixel ratio
    - `draw()`
  - `ViewState = {doc; camera; index; selection:Set<Id>; hover:Id|null; preview:(ctx,cam)=>void|null; theme:'dark'|'paper'}`
- Drawing rules:
  - Only draw entities whose layer and class are visible and whose bounds intersect the view (through `index.query`).
  - **Trusses**: a double line with the box width at real scale (min 3 px apart), with section joins as ticks. Draft trusses are dashed amber with the label "DRAFT". Imported and confirmed trusses are solid.
  - **Fixtures**:
    - symbol size = footprint × scale. Under 6 px, a 3 px dot; 6 px or more, the full symbol rotated by `yawOf`.
    - labels (unit number, fixture ID, U.A address, per `settings.labels`) only when the symbol is ≥ 28 px
    - colour by state: selected = accent, no type matched = warn, otherwise ink
  - **Ref objects**: their transformed bounds drawn as a thin muted rectangle.
  - Draw coordinates relative to the camera centre, so precision holds about 100 m out.
  - The theme switches the background, ink and grid colours through CSS variables read once per draw.

- [ ] **Step 1: Write the failing tests**

```ts
const c=new Camera(); c.fit({min:{x:90000,y:-40000},max:{x:130000,y:45000}},412,700);
expect(c.toWorld(c.toScreen({x:110000,y:0}))).toEqual({x:expect.closeTo(110000,3),y:expect.closeTo(0,3)});
c.zoomAt({x:100,y:100},2); // world point under (100,100) unchanged
expect(c.toScreen(worldUnder)).toEqual({x:expect.closeTo(100,6),y:expect.closeTo(100,6)});
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the camera, symbols and renderer.
- [ ] **Step 4:** Run the tests. Expected: PASS. The visual check happens in Task 16.
- [ ] **Step 5:** Commit: `feat(cad): camera and level-of-detail plan renderer`.

### Task 11: Input, selection, moving and core actions

**Files:**
- Create: `src/view/input.ts`, `src/tools/tool.ts`, `src/tools/select.ts`, `src/app/actions.ts`
- Test: `src/view/input.test.ts`, `src/tools/select.test.ts`

**Interfaces:**
- Produces:
  - `class Gestures` (`constructor(el:HTMLElement, handlers:GestureHandlers)`) turns Pointer Events into `tap`, `longpress` (500 ms, ≤ 8 px movement), `dragstart`/`drag`/`dragend` (after > 8 px on touch or > 3 px on mouse), `pinch` (2 pointers: scale + centre, cancelling any drag in progress without committing), `wheel`, and `twoFingerTap`. `handlers` all receive screen coordinates plus `pointerType`.
  - `interface Tool {id:string; label:string; cursor:string; activate(app:AppCtx):void; deactivate():void; onTap?; onDragStart?; onDrag?; onDragEnd?; onKey?; drawPreview?(ctx,cam):void}`
  - `AppCtx = {doc; history; camera; index; selection:Set<Id>; requestDraw():void; setTool(id:string):void; units:{fmt(mm:number):string}}`
  - `SelectTool`:
    - tap selects the hit entity (Shift or Ctrl adds or toggles); tap on empty space clears
    - a drag starting on a selected entity moves the selection with snapping (the snap applies to the grabbed entity's reference point: its fixture centre, or its truss end nearest the grab). It previews live, then commits one `transform` command on dragend.
    - a drag on empty space box-selects with a mouse, and pans with touch
  - `actions.ts`: `deleteSelection(app)`, `duplicateSelection(app)` (offset 1000, 1000), `nudge(app, dx, dy)` (step 100 mm, or 10 mm with Alt), `undo(app)`, `redo(app)` and `zoomToFit(app)`.
  - Key map: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo, Delete/Backspace delete, Ctrl+D duplicate, arrows nudge, Esc clears the selection or cancels the tool, F zooms to fit.
  - Two-finger tap = undo.

- [ ] **Step 1: Write the failing tests** (with synthetic PointerEvent sequences on a stub element)

```ts
// pointerdown, move 5px, up within 300ms (touch) -> tap, no dragstart
// pointerdown, move 20px -> dragstart then drag events; up -> dragend
// one finger moves 20px (dragstart), second finger down -> 'dragcancel' then pinch events; nothing committed
// SelectTool: dragging a selected truss 1000mm commits exactly one history entry; undo restores truss + its fixtures
// deleteSelection then undo restores entities; duplicate yields new ids, offset applied
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `Gestures` emits `dragcancel` when a pinch starts, and `SelectTool` handles it by dropping the preview.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): gestures, selection, move with snapping, core edit actions`.

### Task 12: Rotate, add truss, add fixture, measure

**Files:**
- Create: `src/tools/rotate.ts`, `src/tools/addTruss.ts`, `src/tools/addFixture.ts`, `src/tools/measure.ts`
- Test: `src/tools/tools.test.ts`

**Interfaces:**
- Consumes: `Tool` and `AppCtx` (Task 11), `snap` (Task 9), `ops` (Task 3).
- Produces:
  - **RotateTool**: the pivot is the selection's bounds centre (tap elsewhere to move the pivot). Dragging sets the angle, snapped to 15° (Alt turns snapping off). One `transform` command on release.
  - **AddTrussTool**:
    - tap sets the start; each further tap adds a leg end (snapped, with angle snap from the previous point)
    - tapping the last point again, or pressing Enter or **Done**, finishes; Esc cancels
    - result: one `addEntities` with `state:'confirmed'`, `boxSize` 300, and each leg's `sections` from `suggestSections(lengthMm)`
    - `suggestSections(length:number, stock=[3000,2000,1000,500]): number[]` is greedy largest-first, with any remainder over 0 added as the closest stock piece ≥ the remainder; exported
  - **AddFixtureTool**:
    - tap places a fixture of the "current type" (last used, chosen in the type picker), snapped
    - if within 300 mm of a truss leg, it's placed on the leg line with `trussId` set and its yaw following the leg
    - `unitNumber` = the next free one on that truss
  - **MeasureTool**: two taps show the distance and angle as a preview label, formatted with `units.fmt`. It never changes the doc.

- [ ] **Step 1: Write the failing tests**

```ts
expect(suggestSections(8000)).toEqual([3000,3000,2000]); expect(suggestSections(7250)).toEqual([3000,3000,1000,500]);
// AddTruss: taps at (0,0),(6000,0),(6000,4000), Enter -> 1 truss, 2 legs, one history entry
// AddFixture near a leg -> trussId set, matrix origin on the leg, yaw = leg angle; unitNumber increments
// Rotate 90° about pivot -> fixture positions rotated; undo restores
// Measure leaves history length unchanged
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): rotate, add truss, add fixture and measure tools`.

### Task 13: App shell and panels

**Files:**
- Create: `src/ui/dom.ts`, `src/ui/shell.ts`, `src/ui/objectInfo.ts`, `src/ui/layers.ts`, `src/ui/positions.ts`, `src/ui/help.ts`, `src/ui/theme.css`
- Modify: `src/main.ts` (build the `AppCtx`, the renderer and the shell)
- Test: `src/ui/objectInfo.test.ts` (pure helpers only)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - **Layout** per spec §7:
    - ≥ 900 px: top bar (Job ▾, Undo, Redo, units, theme), left tool palette, canvas, right column (Object Info, Layers and classes, Positions), status bar (cursor X/Y, active snap label).
    - < 900 px: top bar, full canvas, bottom tool bar (Select, Move/Rotate, Add truss, Add fixture, Measure, More), with the panels as bottom sheets.
  - **Object Info**:
    - **Fixture**: name, type (button → type picker from Task 14), X, Y, Z (in the job's units), rotation in °, unit number, fixture ID, address as `U.A` (parse "10.133" or "4741"), hanging position, truss.
    - **Truss**: name, state, box size, total length (read-only), and per-leg length and sections (as `3+3+2`, parsed with the ported `parseSections`).
    - **Draft truss**: a **Confirm truss** button that sets `state:'confirmed'` and fills empty `sections` with `suggestSections`.
    - **Multi-select**: shows shared values; editing applies to all as one command.
    - Edits commit on change or Enter, as `setProps`/`transform` commands.
    - Pure helpers: `parseLengthInput(s:string, unit):number|null` and `parseUA(s:string):number|null` (`"10.133"`→4741, `"4741"`→4741, `"0.1"`→null, `"1.513"`→null).
  - **Layers and classes**: lists with visibility checkboxes (`setVisibility` commands).
  - **Positions**: a list with fixture count and truss state. Tap selects that position's truss and fixtures and zooms to them.
  - **Help**: the gesture and shortcut list from Task 11, opened from More or `?`.
  - **Resize**: on resize or orientation change, call `renderer.resize()`, keep `camera.cx`/`cy`/`scale`, and redraw.
  - **Theme**: dark by default; the "Paper" toggle stored in localStorage `trussCadTheme` (wrapped in try/catch).

- [ ] **Step 1: Write the failing tests**

```ts
expect(parseUA('10.133')).toBe(4741); expect(parseUA('4741')).toBe(4741); expect(parseUA('1.513')).toBeNull(); expect(parseUA('abc')).toBeNull();
expect(parseLengthInput('2.5','m')).toBe(2500); expect(parseLengthInput('2500','mm')).toBe(2500); expect(parseLengthInput('x','m')).toBeNull();
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the shell and panels.
- [ ] **Step 4:** Run the tests, then `npm run dev` and open it at 412×860 and at 1366×800 in Playwright, checking there's no horizontal scroll and the layout switches at 900 px. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): app shell, Object Info, layers, positions and help panels`.

### Task 14: Jobs, import flow and fixture type review

**Files:**
- Create: `src/store/jobs.ts`, `src/ui/jobs.ts`, `src/ui/review.ts`
- Test: `src/store/jobs.test.ts` (with `fake-indexeddb` as a dev dependency)

**Interfaces:**
- Produces `jobs.ts`:
  - IndexedDB database `trussCad`, version 1, store `jobs` (key `id`)
  - `JobRecord = {id; name; updated:number; doc:unknown; original:Blob|null; sourceName:string}`
  - `saveJob(r)`, `loadJob(id)`, `listJobs(): Promise<{id;name;updated}[]>`, `deleteJob(id)`
  - `storageOk(): Promise<boolean>`
  - Every function catches errors and resolves to a value, `null`, `[]` or `false`; none rejects.
- Produces the jobs UI (Job ▾ sheet):
  - New job, Open MVR… (file input `accept=".mvr"`), the job list (open, rename, delete with confirm), and the current job name.
  - **Autosave**: 500 ms after the last history change.
  - If `storageOk()` is false, show "This device isn't saving jobs. Your work stays open until you close the app." once per session.
- Import flow:
  1. `importMvr`. On an error, show its message and leave the current job open.
  2. `inferTrusses`, added as one history step labelled "Draft trusses".
  3. `matchType` for each type: matched types get `w`, `src` and `url` from the database; every type gets `category` from `categorise`.
  4. Zoom to fit, then open the review.
- Produces the review sheet:
  - Lists types with their fixture count and status: Matched (wattage plus source), Check (pick from candidates, or "None of these"), Unknown (enter watts, or search the database).
  - Each choice is a `setFixtureType` command.
  - Reopen it from Job ▾ → "Fixture types". Selecting a fixture's type in Object Info opens the same picker, filtered to that type.

- [ ] **Step 1: Write the failing tests**

```ts
// save -> list -> load round trip (doc + original blob bytes)
// deleteJob removes it; listJobs sorted by updated desc
// with indexedDB undefined: storageOk() false, saveJob resolves false, listJobs resolves []
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(cad): jobs in IndexedDB, MVR import flow and fixture type review`.

### Task 15: Offline PWA and the `/cad/` preview deploy

**Files:**
- Create: `scripts/build-sw.mjs`, `public/manifest.webmanifest`, `.github/workflows/preview-cad.yml` (on `cad`)
- Modify: `package.json` (`build` script), `.github/workflows/pages.yml` **on `main`**, `CLAUDE.md` (on `cad`: describe the CAD project, scripts, layout, and that the old v1/v2 notes describe `main`/`v2`)

**Interfaces:**
- Produces:
  - `scripts/build-sw.mjs` lists every file in `dist/` (except `sw.js`) and writes `dist/sw.js`, using the same scope-aware logic as the v2 `sw.js`: `PREFIX` by scope, `cache:'reload'` precache, `no-cache` refresh, shell for navigations, only own `ASSETS`. It sets `BUILD` = `process.env.BUILD_ID ?? 'dev'`.
  - `main.ts` registers `sw.js` (http/https only), with the reload-on-`controllerchange` and check-on-visible behaviour from v2.
  - Manifest: `name "Truss CAD (preview)"`, `short_name "Truss CAD"`, `start_url "./"`, `scope "./"`, `display "standalone"`, the existing icons, theme colour `#121418`.
  - `pages.yml` (main): if branch `cad` exists, check it out to `cadsrc`, `npm ci`, `BUILD_ID=<sha> npm run build`, and copy `dist/` to `_site/cad/`. `preview-cad.yml` (cad) mirrors `preview-v2.yml`, triggering on push to `cad`. Add `"Preview cad"` to `pages.yml`'s `workflow_run.workflows`.

- [ ] **Step 1:** Write `build-sw.mjs`. Run `npm run build`, then `node -e` to check that `dist/sw.js` contains every file in `dist` (for example `assets/index-*.js`). Expected: all listed.
- [ ] **Step 2:** Serve `dist` under `/truss-spacer/cad/` with the GitHub-like cache server (`Cache-Control: max-age=600`). In Playwright: load it, wait for the service worker, go offline, reload, and the app renders. Then check that the live app's service worker at `/truss-spacer/` doesn't intercept `/truss-spacer/cad/`, by serving both. Expected: PASS.
- [ ] **Step 3:** Commit on `cad`: `feat(cad): offline service worker, manifest and preview trigger`. Push.
- [ ] **Step 4:** On `main`, update `pages.yml`, commit `ci: also publish the cad branch at /cad/`, push, and wait for the deploy run to succeed. Then check that `https://greube.github.io/truss-spacer/cad/` returns 200, and that `/truss-spacer/` and `/truss-spacer/v2/` still serve their own builds.
- [ ] **Step 5:** Update `CLAUDE.md` on `cad` and commit `docs(cad): project guide for the CAD rebuild`.

### Task 16: Milestone 1 acceptance (end-to-end and performance)

**Files:**
- Create: `e2e/m1.mjs`, `e2e/perf.mjs`, `test/helpers/bigRig.ts` (synthetic 2,000-fixture, 500-truss MVR via `makeMvr`)

**Interfaces:**
- Consumes the built app (`npm run build`, served locally under `/truss-spacer/cad/`).

- [ ] **Step 1: Write `e2e/m1.mjs`.** It covers each spec §8 milestone-1 "done when" item, at 412×860 (touch) and 1366×800 (mouse):
  - Opening `MVR_SAMPLE` takes under 5 s (from file chosen to drawn). It shows 188 fixtures, and the positions panel lists 9 positions, with draft trusses for the flown ones.
  - Pinch or wheel zoom and pan work.
  - Tapping a fixture shows its Object Info (with "10.133" for FixtureID 923).
  - Dragging a draft truss moves it and its fixtures; undo restores them.
  - Duplicate, delete and undo work.
  - Adding a truss with 3 taps works.
  - Editing X in Object Info moves the object.
  - Closing the page, going offline and reopening keeps the job, the edits and the visibility settings.
  - The wrong file (a PDF) shows an error, and the job stays open.
  - With IndexedDB blocked (`page.addInitScript` deleting `indexedDB`), the warning shows and editing still works.
  - Rotating the viewport (412×860 → 860×412) keeps the selection and centre.
  - There's no horizontal scroll and no console errors.
  - Screenshots go to the scratchpad for a visual check: plan dark, plan paper, the review sheet, Object Info.
- [ ] **Step 2:** Run `MVR_SAMPLE=<path> node e2e/m1.mjs`. Expected: every check prints PASS.
- [ ] **Step 3: Write `e2e/perf.mjs`.** Load the big rig, then pan continuously for 3 s using `requestAnimationFrame` timestamps, at a 1366×800 laptop size and at 412×860 with CDP CPU throttling at 4×. Expected: the 95th-percentile frame is under 16 ms at both sizes, throttled included (report the actual numbers). If the throttled run misses, record the numbers and fix the hot path before moving on.
- [ ] **Step 4:** Fix anything that fails, then rerun both scripts and `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `test(cad): milestone 1 acceptance and performance checks`, push `cad`, and confirm that the `/cad/` preview deploys.
