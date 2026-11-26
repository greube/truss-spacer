import type { Category } from '../core/model/types';

/** Real-world footprint of a fixture symbol in mm. */
export const footprint = (c: Category): number => (c === 'spot' || c === 'wash' || c === 'profile' ? 600 : c === 'strip' ? 1000 : 400);

/**
 * Draws a plan symbol centred at the origin, facing +x (the fixture's yaw is applied by the caller).
 * Shapes are simple and distinct per family, in the spirit of standard plot symbols.
 */
export function drawSymbol(ctx: CanvasRenderingContext2D, cat: Category, size: number, filled: boolean, colour: string): void {
  const r = size / 2, lw = Math.max(1, size / 18);
  ctx.lineWidth = lw; ctx.strokeStyle = colour; ctx.fillStyle = colour;
  ctx.beginPath();
  switch (cat) {
    case 'spot': // circle with a lens nose
      ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2); ctx.moveTo(r * 0.75, -r * 0.3); ctx.lineTo(r, -r * 0.3); ctx.lineTo(r, r * 0.3); ctx.lineTo(r * 0.75, r * 0.3); break;
    case 'wash': // rounded square
      roundRect(ctx, -r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.35); break;
    case 'beam': // circle with a cross
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.moveTo(-r * 0.7, 0); ctx.lineTo(r * 0.7, 0); ctx.moveTo(0, -r * 0.7); ctx.lineTo(0, r * 0.7); break;
    case 'profile': // long barrel with a lens
      ctx.rect(-r, -r * 0.35, r * 1.5, r * 0.7); ctx.moveTo(r * 0.5, -r * 0.5); ctx.lineTo(r, -r * 0.5); ctx.lineTo(r, r * 0.5); ctx.lineTo(r * 0.5, r * 0.5); ctx.closePath(); break;
    case 'par': // can
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.moveTo(r * 0.6, -r * 0.45); ctx.lineTo(r * 0.85, -r * 0.45); ctx.lineTo(r * 0.85, r * 0.45); ctx.lineTo(r * 0.6, r * 0.45); break;
    case 'strip': // long thin batten, across the facing direction
      ctx.rect(-r * 0.18, -r, r * 0.36, r * 2); break;
    case 'strobe': // box with a flash
      ctx.rect(-r * 0.8, -r * 0.5, r * 1.6, r); ctx.moveTo(-r * 0.4, -r * 0.3); ctx.lineTo(0, r * 0.1); ctx.lineTo(-r * 0.1, -r * 0.1); ctx.lineTo(r * 0.4, r * 0.3); break;
    case 'effect': // hexagon
      for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; i ? ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8) : ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); } ctx.closePath(); break;
    default: // generic: square with a nose
      ctx.rect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4); ctx.moveTo(r * 0.7, 0); ctx.lineTo(r, 0);
  }
  if (filled) { ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
