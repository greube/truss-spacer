import { describe, test, expect } from 'vitest';
import { readZip, writeZip, crc32, ZipError } from './zip';

const enc = (s: string) => new TextEncoder().encode(s);
const rand = (n: number) => { const b = new Uint8Array(n); let x = 7; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; b[i] = x >>> 24; } return b; };
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('zip', () => {
  test('crc32 matches the standard value', () => { expect(crc32(enc('hello'))).toBe(0x3610a686); });
  const files = new Map<string, Uint8Array>([['GeneralSceneDescription.xml', enc('<GeneralSceneDescription/>')], ['Ayrton@Mistral.gdtf', rand(5000)], ['empty.txt', new Uint8Array(0)]]);
  test('round trip with deflate', async () => { expect(await readZip(buf(await writeZip(files)))).toEqual(files); });
  test('round trip stored', async () => { expect(await readZip(buf(await writeZip(files, { deflate: false })))).toEqual(files); });
  test('UTF-8 file names survive', async () => {
    const f = new Map([['Fixture “Wash” é.gdtf', enc('x')]]);
    expect([...(await readZip(buf(await writeZip(f)))).keys()]).toEqual(['Fixture “Wash” é.gdtf']);
  });
  test('not a zip', async () => {
    await expect(readZip(buf(enc('%PDF-1.7 hello')))).rejects.toThrow("This file isn't a zip archive.");
    await expect(readZip(buf(enc('%PDF-1.7')))).rejects.toBeInstanceOf(ZipError);
  });
  test('truncated archive', async () => {
    const z = await writeZip(files);
    await expect(readZip(buf(z.slice(0, z.length - 30)))).rejects.toBeInstanceOf(ZipError);
  });
});

const SAMPLE = process.env.MVR_SAMPLE;
test.skipIf(!SAMPLE)('reads the real Vectorworks MVR', async () => {
  const { readFileSync } = await import('node:fs');
  const files = await readZip(buf(new Uint8Array(readFileSync(SAMPLE!))));
  expect(files.size).toBe(168); expect(files.has('GeneralSceneDescription.xml')).toBe(true);
});
