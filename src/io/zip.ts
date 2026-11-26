/** Minimal zip reader/writer (STORE and DEFLATE) using the platform's compression streams. No zip64. */
export class ZipError extends Error {}

let table: Uint32Array | null = null;
export function crc32(b: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<any> }): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream as any));
  return new Uint8Array(await out.arrayBuffer());
}
const inflate = (d: Uint8Array) => pipe(d, new DecompressionStream('deflate-raw'));
const deflate = (d: Uint8Array) => pipe(d, new CompressionStream('deflate-raw'));

export async function readZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const notZip = () => new ZipError("This file isn't a zip archive.");
  // End of central directory: search backwards (comment may follow)
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw notZip();
  const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff + cdSize > u8.length) throw notZip();
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw notZip();
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (local + 30 > u8.length || dv.getUint32(local, true) !== 0x04034b50) throw notZip();
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    if (start + csize > u8.length) throw notZip();
    const raw = u8.subarray(start, start + csize);
    if (name.endsWith('/')) continue;
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) { try { data = await inflate(raw); } catch { throw new ZipError("This archive is damaged and couldn't be read."); } }
    else throw new ZipError("This archive uses a format the app can't read.");
    if (data.length !== size) throw new ZipError("This archive is damaged and couldn't be read.");
    out.set(name, data);
  }
  return out;
}

export async function writeZip(files: Map<string, Uint8Array>, opts: { deflate?: boolean } = {}): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameB = enc.encode(name);
    const comp = opts.deflate === false || data.length === 0 ? data : await deflate(data);
    const method = comp === data ? 0 : 8;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, comp.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, method, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, comp.length, true); cd.setUint32(24, data.length, true); cd.setUint16(28, nameB.length, true);
    cd.setUint32(42, offset, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, comp);
    central.push(new Uint8Array(cd.buffer), nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.size, true); end.setUint16(10, files.size, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
