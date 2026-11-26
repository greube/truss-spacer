/* A small vector PDF writer: pages, lines, shapes and text in the standard Helvetica and Courier fonts
   (WinAnsi encoding, so no fonts are embedded). Coordinates are mm from the top left of the page. */

type Rgb = [number, number, number];
type Font = 'H' | 'HB' | 'C';
const PT = 72 / 25.4; // points per mm

// Helvetica advance widths (1/1000 em) for ASCII 32..126; bold is close enough at 1.06×.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const FONT_ID: Record<Font, string> = { H: 'F1', HB: 'F2', C: 'F3' };

/** Text as WinAnsi byte values; anything the standard fonts can't show becomes "?". */
function winAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.replace(/−/g, '-').replace(/→/g, '->').replace(/\t/g, '    ')) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else out.push(WIN[ch] ?? 63);
  }
  return out;
}

const n = (v: number) => (Math.abs(v) < 1e-6 ? '0' : (+v.toFixed(3)).toString());

export class Pdf {
  private pages: { w: number; h: number; ops: string[] }[] = [];
  private get cur() { return this.pages[this.pages.length - 1]; }
  private x = (mm: number) => n(mm * PT);
  private y = (mm: number) => n((this.cur.h - mm) * PT);

  page(wMm: number, hMm: number): this { this.pages.push({ w: wMm, h: hMm, ops: ['0.75 w 1 J 1 j'] }); return this; }
  get pageCount(): number { return this.pages.length; }
  stroke(c: Rgb): this { this.cur.ops.push(`${c.map(v => n(v / 255)).join(' ')} RG`); return this; }
  fill(c: Rgb): this { this.cur.ops.push(`${c.map(v => n(v / 255)).join(' ')} rg`); return this; }
  width(mm: number): this { this.cur.ops.push(`${n(mm * PT)} w`); return this; }
  dash(mm: number[] | null): this { this.cur.ops.push(mm && mm.length ? `[${mm.map(v => n(v * PT)).join(' ')}] 0 d` : '[] 0 d'); return this; }
  /** Saves the graphics state and clips drawing to a rectangle until restore(). */
  clip(x: number, y: number, w: number, h: number): this { this.cur.ops.push(`q ${this.x(x)} ${this.y(y + h)} ${n(w * PT)} ${n(h * PT)} re W n`); return this; }
  restore(): this { this.cur.ops.push('Q'); return this; }
  line(x1: number, y1: number, x2: number, y2: number): this { this.cur.ops.push(`${this.x(x1)} ${this.y(y1)} m ${this.x(x2)} ${this.y(y2)} l S`); return this; }
  poly(pts: { x: number; y: number }[], close: boolean, mode: 'S' | 'F' | 'B' = 'S'): this {
    if (pts.length < 2) return this;
    const path = pts.map((p, i) => `${this.x(p.x)} ${this.y(p.y)} ${i ? 'l' : 'm'}`).join(' ');
    this.cur.ops.push(`${path}${close ? ' h' : ''} ${mode}`); return this;
  }
  rect(x: number, y: number, w: number, h: number, mode: 'S' | 'F' | 'B' = 'S'): this {
    this.cur.ops.push(`${this.x(x)} ${this.y(y + h)} ${n(w * PT)} ${n(h * PT)} re ${mode}`); return this;
  }
  circle(cx: number, cy: number, r: number, mode: 'S' | 'F' | 'B' = 'S'): this {
    const k = 0.5523 * r, X = this.x, Y = this.y;
    this.cur.ops.push(`${X(cx + r)} ${Y(cy)} m ${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c ${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c `
      + `${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c ${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c ${mode}`);
    return this;
  }
  /** Width of s in mm at sizePt. */
  textWidth(s: string, sizePt: number, font: Font = 'H'): number {
    const em = winAnsi(s).reduce((a, c) => a + (font === 'C' ? 600 : (c >= 32 && c <= 126 ? HELV[c - 32] : 556) * (font === 'HB' ? 1.06 : 1)), 0);
    return (em / 1000) * sizePt / PT;
  }
  /** Text with its baseline at y (mm). */
  text(x: number, y: number, s: string, sizePt: number, o: { font?: Font; align?: 'left' | 'center' | 'right'; rotate?: number } = {}): this {
    const font = o.font ?? 'H', w = this.textWidth(s, sizePt, font), a = o.rotate ?? 0;
    const shift = o.align === 'right' ? w : o.align === 'center' ? w / 2 : 0;
    const c = Math.cos(a), sn = Math.sin(a);
    const px = x - shift * c, py = y + shift * sn; // move back along the (screen-space) text direction
    const str = winAnsi(s).map(b => (b === 40 || b === 41 || b === 92 ? '\\' + String.fromCharCode(b) : String.fromCharCode(b))).join('');
    this.cur.ops.push(`BT /${FONT_ID[font]} ${n(sizePt)} Tf ${n(c)} ${n(sn)} ${n(-sn)} ${n(c)} ${this.x(px)} ${this.y(py)} Tm (${str}) Tj ET`);
    return this;
  }

  bytes(): Uint8Array {
    const objs: string[] = [];
    const add = (s: string) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages, filled in below
    for (const [name, base] of [['F1', 'Helvetica'], ['F2', 'Helvetica-Bold'], ['F3', 'Courier']]) add(`<< /Type /Font /Subtype /Type1 /Name /${name} /BaseFont /${base} /Encoding /WinAnsiEncoding >>`);
    const kids: number[] = [];
    for (const p of this.pages) {
      const content = p.ops.join('\n');
      const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(p.w * PT)} ${n(p.h * PT)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${cid} 0 R >>`));
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const b = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) b[i] = out.charCodeAt(i) & 0xff;
    return b;
  }
}
