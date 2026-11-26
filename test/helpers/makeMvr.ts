import { writeZip } from '../../src/io/zip';
import { makeGlb } from './makeGlb';

export interface MvrFx { uuid: string; name?: string; spec?: string; mode?: string; matrix?: string | null; address?: number | number[] | null; addressBreaks?: number[]; position?: string; fid?: string; unit?: number; classing?: string }
export interface MvrOpts {
  layers?: { uuid: string; name: string; fixtures?: MvrFx[]; groups?: { matrix?: string; fixtures: MvrFx[] }[]; trusses?: { uuid: string; name: string; matrix: string; symdef: string }[]; refs?: { uuid: string; name: string; matrix: string; glb: string }[] }[];
  positions?: { uuid: string; name: string }[];
  classes?: { uuid: string; name: string }[];
  symdefs?: { uuid: string; name: string; glbs: string[] }[];
  glbs?: Record<string, { min: number[]; max: number[] }>;
  extraXml?: string; // unknown nodes to prove they're tolerated
  fixtures?: MvrFx[]; // shorthand: one layer "LX"
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
function fxXml(f: MvrFx): string {
  const addrs = f.address == null ? [] : Array.isArray(f.address) ? f.address : [f.address];
  return `<Fixture name="${esc(f.name ?? 'Fixture')}" uuid="${f.uuid}">` +
    (f.matrix === null ? '' : `<Matrix>${f.matrix ?? '{1,0,0}{0,1,0}{0,0,1}{0,0,0}'}</Matrix>`) +
    (f.classing ? `<Classing>${f.classing}</Classing>` : '') +
    `<GDTFSpec>${esc(f.spec ?? '')}</GDTFSpec><GDTFMode>${esc(f.mode ?? 'Mode 1')}</GDTFMode>` +
    (f.position ? `<Position>${f.position}</Position>` : '') +
    (addrs.length ? `<Addresses>${addrs.map((a, i) => `<Address break="${f.addressBreaks?.[i] ?? 0}">${a}</Address>`).join('')}</Addresses>` : '') +
    `<FixtureID>${f.fid ?? ''}</FixtureID><UnitNumber>${f.unit ?? 0}</UnitNumber><CustomCommands><CustomCommand>Base_Zoom.Zoom.Zoom 1,f 35.000000</CustomCommand></CustomCommands></Fixture>`;
}

export function mvrXml(o: MvrOpts): string {
  const layers = o.layers ?? [{ uuid: 'LAYER-1', name: 'LX', fixtures: o.fixtures ?? [] }];
  const aux = (o.positions ?? []).map(p => `<Position name="${esc(p.name)}" uuid="${p.uuid}"/>`).join('') +
    (o.classes ?? []).map(c => `<Class name="${esc(c.name)}" uuid="${c.uuid}"/>`).join('') +
    (o.symdefs ?? []).map(s => `<Symdef name="${esc(s.name)}" uuid="${s.uuid}"><ChildList>${s.glbs.map(g => `<Geometry3D fileName="${g}"/>`).join('')}</ChildList></Symdef>`).join('');
  const layerXml = layers.map(l => {
    const kids = (l.fixtures ?? []).map(fxXml).join('') +
      (l.groups ?? []).map(g => `<GroupObject uuid="G-${Math.random().toString(16).slice(2)}">${g.matrix ? `<Matrix>${g.matrix}</Matrix>` : ''}<ChildList>${g.fixtures.map(fxXml).join('')}</ChildList></GroupObject>`).join('') +
      (l.trusses ?? []).map(t => `<Truss name="${esc(t.name)}" uuid="${t.uuid}"><Matrix>${t.matrix}</Matrix><Geometries><Symbol symdef="${t.symdef}" uuid="S-${t.uuid}"/></Geometries><GDTFSpec></GDTFSpec></Truss>`).join('') +
      (l.refs ?? []).map(r => `<SceneObject name="${esc(r.name)}" uuid="${r.uuid}"><Matrix>${r.matrix}</Matrix><Geometries><Geometry3D fileName="${r.glb}"/></Geometries></SceneObject>`).join('');
    return kids ? `<Layer name="${esc(l.name)}" uuid="${l.uuid}"><ChildList>${kids}</ChildList></Layer>` : `<Layer name="${esc(l.name)}" uuid="${l.uuid}"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<GeneralSceneDescription verMajor="1" verMinor="5"><UserData><Data provider="Test" ver="1"/></UserData>` +
    `<Scene><AUXData>${aux}</AUXData><Layers>${layerXml}</Layers>${o.extraXml ?? ''}</Scene></GeneralSceneDescription>`;
}

export async function makeMvr(o: MvrOpts): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const files = new Map<string, Uint8Array>([['GeneralSceneDescription.xml', enc.encode(mvrXml(o))]]);
  for (const [name, b] of Object.entries(o.glbs ?? {})) files.set(name, makeGlb([b]));
  const z = await writeZip(files);
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}

export async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const z = await writeZip(new Map(Object.entries(files).map(([k, v]) => [k, new TextEncoder().encode(v)])));
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer;
}
