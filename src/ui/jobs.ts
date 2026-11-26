import type { AppCtx } from '../tools/tool';
import type { Shell } from './shell';
import type { Doc } from '../core/model/types';
import { h } from './dom';
import { saveJob, loadJob, listJobs, deleteJob, storageOk } from '../store/jobs';
import { docToJSON, docFromJSON, newDoc, newId } from '../core/model/doc';
import { importMvr } from '../io/mvr/import';
import { inferCommand } from '../io/mvr/infer';
import { enrichTypes } from '../domain/fixtures/enrich';

export interface Current { id: string; name: string; sourceName: string; original: Blob | null }
export interface JobDeps { app: AppCtx; shell: Shell; setDoc(doc: Doc, name: string): void; openReview(): void }

/** Job lifecycle: open the latest on start, autosave after changes, the Job menu, and MVR import. */
export function createJobs(d: JobDeps) {
  let current: Current = { id: newId(), name: 'New job', sourceName: '', original: null };
  let timer: ReturnType<typeof setTimeout> | null = null, warned = false, saving = Promise.resolve();
  const dateTxt = (t: number) => new Date(t).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  async function saveNow() {
    const rec = { id: current.id, name: current.name, updated: Date.now(), doc: docToJSON(d.app.doc), original: current.original, sourceName: current.sourceName };
    saving = saving.then(async () => { const ok = await saveJob(rec); if (!ok && !warned) { warned = true; d.shell.toast("This device isn't saving jobs. Your work stays open until you close the app.", true); } });
    return saving;
  }
  function autosave() { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; void saveNow(); }, 500); }

  function show(c: Current, doc: Doc) { current = c; d.setDoc(doc, c.name); }

  async function startup() {
    if (!(await storageOk())) { warned = true; d.shell.toast("This device isn't saving jobs. Your work stays open until you close the app.", true); return; }
    const list = await listJobs();
    if (list.length) await open(list[0].id);
  }
  async function open(id: string) {
    const r = await loadJob(id); if (!r) { d.shell.toast("That job couldn't be opened.", true); return; }
    show({ id: r.id, name: r.name, sourceName: r.sourceName, original: r.original }, docFromJSON(r.doc));
  }
  async function newJob() { if (timer) { clearTimeout(timer); timer = null; await saveNow(); } show({ id: newId(), name: 'New job', sourceName: '', original: null }, newDoc()); void saveNow(); }

  /** Opens an MVR as a new job: import, draft trusses, wattage matches, then the review. */
  async function importFile(file: File | Blob, name = (file as File).name ?? 'Imported rig.mvr') {
    let r;
    try { r = await importMvr(await file.arrayBuffer()); }
    catch (e) { d.shell.toast((e as Error).message || "That file couldn't be opened.", true); return null; }
    if (timer) { clearTimeout(timer); timer = null; await saveNow(); }
    const summary = enrichTypes(r.doc);
    show({ id: newId(), name: name.replace(/\.mvr$/i, ''), sourceName: name, original: new Blob([r.original as BlobPart]) }, r.doc);
    const inf = inferCommand(r.doc);
    if (inf.command) d.app.history.exec(inf.command);
    await saveNow();
    const warn = [...r.warnings, ...inf.warnings];
    if (warn.length) d.shell.toast(warn.join(' '), true);
    if (summary.uncertain || summary.unknown) d.openReview();
    return { summary, drafts: inf.count, warnings: warn };
  }

  function openSheet() {
    const s = d.shell.openSheet('Jobs', async el => {
      const file = h('input', { type: 'file', accept: '.mvr', hidden: true, onchange: async () => { const f = file.files?.[0]; if (f) { s.close(); await importFile(f); } } });
      const name = h('input', { type: 'text', value: current.name, 'aria-label': 'Job name', style: { minHeight: '44px', width: '100%', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px', fontSize: '17px' },
        onchange: () => { current.name = name.value.trim() || 'Untitled job'; d.shell.jobName.textContent = current.name; void saveNow(); } });
      const list = h('div', { class: 'list' });
      el.append(h('div', { class: 'body' }, h('label', { class: 'note', text: 'This job' }), name,
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn primary', type: 'button', text: 'Open MVR…', onclick: () => file.click() }),
          h('button', { class: 'btn', type: 'button', text: 'New job', onclick: async () => { s.close(); await newJob(); } }),
          h('button', { class: 'btn', type: 'button', text: 'Fixture types', onclick: () => { s.close(); d.openReview(); } }), file),
        current.sourceName ? h('p', { class: 'note', text: `From ${current.sourceName}. The original file is kept with the job for export.` }) : null,
        h('label', { class: 'note', text: 'Jobs on this device' }), list));
      const jobs = await listJobs();
      if (!jobs.length) list.append(h('p', { class: 'note', text: warned ? "This device isn't saving jobs." : 'No saved jobs yet.' }));
      for (const j of jobs) list.append(h('div', { class: 'item', style: { gridTemplateColumns: 'minmax(0,1fr) auto auto' } },
        h('button', { class: 'btn', type: 'button', style: { textAlign: 'left', border: j.id === current.id ? '1px solid var(--accent)' : undefined }, onclick: async () => { s.close(); if (timer) { clearTimeout(timer); timer = null; await saveNow(); } await open(j.id); } },
          h('b', { text: j.name }), ' ', h('small', { text: dateTxt(j.updated) })),
        h('span'),
        j.id === current.id ? h('span', { class: 'tag', text: 'Open' }) : h('button', { class: 'btn warn', type: 'button', text: 'Delete', onclick: async () => {
          if (!confirm(`Delete “${j.name}”? This can't be undone.`)) return; await deleteJob(j.id); s.refresh(); } })));
    });
  }

  return { startup, autosave, saveNow, importFile, openSheet, get current() { return current; } };
}
