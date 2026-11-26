import type { V2 } from '../core/geom/vec';

export interface Mods { pointerType: 'mouse' | 'touch' | 'pen'; shift: boolean; ctrl: boolean; alt: boolean }
export interface GestureHandlers {
  tap?(p: V2, m: Mods): void;
  longpress?(p: V2, m: Mods): void;
  dragstart?(p: V2, m: Mods): void;
  drag?(p: V2, m: Mods): void;
  dragend?(p: V2, m: Mods): void;
  dragcancel?(): void;
  /** centre in screen px, scale relative to the last pinch event, and how far the centre moved */
  pinch?(centre: V2, scale: number, dx: number, dy: number): void;
  wheel?(p: V2, deltaY: number, m: Mods): void;
  twoFingerTap?(): void;
  hover?(p: V2, m: Mods): void;
}

const LONGPRESS_MS = 500, TWO_TAP_MS = 250, TOUCH_SLOP = 8, MOUSE_SLOP = 3;
type Ptr = { x: number; y: number; sx: number; sy: number; t0: number };

/** Turns Pointer Events into taps, drags, long presses, pinches and wheel zoom. */
export class Gestures {
  private ptrs = new Map<number, Ptr>();
  private dragging = false;
  private consumed = false; // the current touch sequence already did something (long press, pinch)
  private pinchD = 0; private pinchC: V2 = { x: 0, y: 0 }; private pinched = false; private twoStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastMods: Mods = { pointerType: 'mouse', shift: false, ctrl: false, alt: false };

  constructor(private el: HTMLElement, private h: GestureHandlers) {
    el.addEventListener('pointerdown', e => this.down(e as PointerEvent));
    el.addEventListener('pointermove', e => this.move(e as PointerEvent));
    el.addEventListener('pointerup', e => this.up(e as PointerEvent, false));
    el.addEventListener('pointercancel', e => this.up(e as PointerEvent, true));
    el.addEventListener('wheel', e => { const w = e as WheelEvent; w.preventDefault(); this.h.wheel?.(this.pos(w), w.deltaY, this.mods(w)); }, { passive: false } as any);
  }

  private pos(e: { clientX: number; clientY: number }): V2 { const r = this.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  private mods(e: any): Mods { return { pointerType: (e.pointerType || 'mouse') as Mods['pointerType'], shift: !!e.shiftKey, ctrl: !!(e.ctrlKey || e.metaKey), alt: !!e.altKey }; }
  private clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  private pair(): [Ptr, Ptr] { const [a, b] = [...this.ptrs.values()]; return [a, b]; }

  private down(e: PointerEvent) {
    const p = this.pos(e); this.lastMods = this.mods(e);
    try { this.el.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: this.now() });
    if (this.ptrs.size === 1) {
      this.consumed = false; this.dragging = false; this.pinched = false;
      this.clearTimer();
      this.timer = setTimeout(() => { this.timer = null; if (!this.dragging && this.ptrs.size === 1) { this.consumed = true; this.h.longpress?.(p, this.lastMods); } }, LONGPRESS_MS);
    } else if (this.ptrs.size === 2) {
      this.clearTimer();
      if (this.dragging) { this.dragging = false; this.h.dragcancel?.(); }
      this.consumed = true; this.twoStart = this.now();
      const [a, b] = this.pair(); this.pinchD = Math.hypot(b.x - a.x, b.y - a.y) || 1; this.pinchC = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  private move(e: PointerEvent) {
    const p = this.pos(e), m = this.mods(e);
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) { if (m.pointerType === 'mouse' && !e.buttons) this.h.hover?.(p, m); return; }
    ptr.x = p.x; ptr.y = p.y;
    if (this.ptrs.size >= 2) {
      const [a, b] = this.pair(); const d = Math.hypot(b.x - a.x, b.y - a.y) || 1, c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (Math.abs(d - this.pinchD) > 0.5 || Math.hypot(c.x - this.pinchC.x, c.y - this.pinchC.y) > 0.5) {
        this.pinched = true; this.h.pinch?.(c, d / this.pinchD, c.x - this.pinchC.x, c.y - this.pinchC.y);
        this.pinchD = d; this.pinchC = c;
      }
      return;
    }
    if (this.consumed) return;
    const slop = m.pointerType === 'mouse' ? MOUSE_SLOP : TOUCH_SLOP;
    if (!this.dragging && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > slop) {
      this.dragging = true; this.clearTimer(); this.h.dragstart?.({ x: ptr.sx, y: ptr.sy }, m);
    }
    if (this.dragging) this.h.drag?.(p, m);
  }

  private up(e: PointerEvent, cancelled: boolean) {
    const p = this.pos(e), m = this.mods(e);
    const ptr = this.ptrs.get(e.pointerId); if (!ptr) return;
    const wasTwo = this.ptrs.size === 2;
    this.ptrs.delete(e.pointerId);
    try { this.el.releasePointerCapture?.(e.pointerId); } catch { /* fine */ }
    if (wasTwo) {
      // second finger lifted: a quick two-finger tap if nothing moved
      if (!this.pinched && this.now() - this.twoStart < TWO_TAP_MS && !cancelled) this.twoTapPending = true;
      return;
    }
    if (this.ptrs.size) return;
    this.clearTimer();
    if (this.twoTapPending) { this.twoTapPending = false; if (!this.pinched && this.now() - this.twoStart < TWO_TAP_MS * 2) this.h.twoFingerTap?.(); return; }
    if (this.dragging) { this.dragging = false; cancelled ? this.h.dragcancel?.() : this.h.dragend?.(p, m); return; }
    if (!this.consumed && !cancelled) this.h.tap?.(p, m);
  }
  private twoTapPending = false;
}
