import type { Shell } from './shell';

/** Shows a generated PNG in a sheet with Save and (where the phone supports it) Share. */
export function showImageSheet(shell: Shell, blob: Blob, o: { heading: string; name: string; title: string; alt: string }): void {
  const url = URL.createObjectURL(blob), file = new File([blob], o.name, { type: 'image/png' });
  let canShare = false; try { canShare = typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] }); } catch { /* not supported */ }
  shell.openSheet(o.heading, el => {
    const img = document.createElement('img'); img.src = url; img.alt = o.alt; img.style.cssText = 'display:block;width:100%;height:auto;background:#fff';
    const save = document.createElement('button'); save.className = 'btn primary'; save.type = 'button'; save.textContent = 'Save PNG';
    save.onclick = () => { const a = document.createElement('a'); a.href = url; a.download = o.name; document.body.append(a); a.click(); a.remove(); shell.toast('Saved to your Downloads.'); };
    const share = document.createElement('button'); share.className = 'btn'; share.type = 'button'; share.textContent = 'Share'; share.hidden = !canShare;
    share.onclick = async () => { try { await navigator.share({ files: [file], title: o.title }); } catch (e) { if ((e as Error).name !== 'AbortError') shell.toast("Sharing didn't work. Save the PNG and send it from your gallery.", true); } };
    const row = document.createElement('div'); row.className = 'body'; row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; row.append(save, share);
    const box = document.createElement('div'); box.style.cssText = 'overflow:auto;max-height:55vh'; box.append(img);
    el.append(box, row);
  }, () => URL.revokeObjectURL(url));
}

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
