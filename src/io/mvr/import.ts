import type { Doc } from '../../core/model/types';
import { readZip, ZipError } from '../zip';
import { parseScene } from './parse';

export class MvrError extends Error {}

export interface ImportResult { doc: Doc; original: Uint8Array; xml: string; warnings: string[] }

/** Opens an .mvr (zip) and maps its scene. Keeps the original bytes and XML for round-trip export. */
export async function importMvr(buf: ArrayBuffer, opts: { parseXml?: (xml: string) => Document } = {}): Promise<ImportResult> {
  let files: Map<string, Uint8Array>;
  try { files = await readZip(buf); }
  catch (e) { throw new MvrError(e instanceof ZipError && /damaged|format|incomplete/.test(e.message) ? e.message : "This isn't a zip archive, so it can't be an MVR."); }
  const entry = [...files.keys()].find(k => k.toLowerCase() === 'generalscenedescription.xml');
  if (!entry) throw new MvrError("This file isn't an MVR (no GeneralSceneDescription.xml).");
  const xml = new TextDecoder().decode(files.get(entry)!);
  const parseXml = opts.parseXml ?? ((s: string) => new DOMParser().parseFromString(s, 'application/xml'));
  let dom: Document;
  try { dom = parseXml(xml); } catch { throw new MvrError("The scene description couldn't be read."); }
  if (!dom?.documentElement || dom.documentElement.tagName !== 'GeneralSceneDescription' || dom.getElementsByTagName('parsererror').length)
    throw new MvrError("The scene description couldn't be read.");
  const { doc, warnings } = parseScene(dom, files);
  return { doc, original: new Uint8Array(buf.slice(0)), xml, warnings };
}
