// Magnifier core: Electron-free view math plus the A11yTool<'magnifier'> state
// machine. The window glue lives in magnifier-window.ts and arrives here as an
// injected LensSurface, so this file runs under plain tsx.
//
// Model: full-display magnification in the style of Windows Magnifier's
// full-screen mode. The display under the pointer is shown scaled by `zoom`
// and panned so the content under the pointer stays exactly under the pointer
// (viewport origin = p * (1 - 1/zoom)). Consequences: the view is clamped to
// the display edges by construction, a click lands on what you see at the
// pointer, and the overlay can be fully click-through. The `smoothing`
// setting is applied by the renderer as pan lag only; the frame math here is
// exact so a 0 setting is pixel-perfect.

import type { A11yTool, AccessibilitySettings, MagnifierOptions } from '../../../shared/accessibility';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface DisplayGeom { id: number; bounds: Rect; scaleFactor: number }

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 5;
/** Poll period; Windows rounds timers to ~15.6 ms, so this means "every tick". */
export const TICK_MS = 8;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, ZOOM_MIN, ZOOM_MAX) : ZOOM_MIN;
}

/** Top-left of the visible region, in display-relative DIPs, for pointer `p`
 *  (display-relative). Always inside [0, size - size/zoom]. */
export function viewOrigin(p: Point, zoom: number, size: { width: number; height: number }): Point {
  const z = clampZoom(zoom);
  const k = 1 - 1 / z;
  return {
    x: clamp(p.x, 0, size.width) * k,
    y: clamp(p.y, 0, size.height) * k,
  };
}

/** What the lens window needs to draw one frame. `point` is relative to the
 *  display's top-left, in DIPs. */
export interface LensFrame {
  display: DisplayGeom;
  point: Point;
  zoom: number;
  /** 0 = view snaps to the pointer, 1 = it glides behind it. */
  smoothing: number;
  /** The renderer may refine `point` from its own pointer events. */
  followsCursor: boolean;
}

export function computeFrame(
  absPoint: Point, zoom: number, display: DisplayGeom, smoothing = 0, followsCursor = true,
): LensFrame {
  const b = display.bounds;
  return {
    display,
    point: {
      x: clamp(absPoint.x - b.x, 0, b.width),
      y: clamp(absPoint.y - b.y, 0, b.height),
    },
    zoom: clampZoom(zoom),
    smoothing: clamp(Number.isFinite(smoothing) ? smoothing : 0, 0, 1),
    followsCursor,
  };
}

/** Window-side half of the magnifier (magnifier-window.ts implements it). */
export interface LensSurface {
  show(): void;
  update(frame: LensFrame): void;
  hide(): void;
  dispose(): void;
}

export interface MagnifierDeps {
  surface: LensSurface;
  getCursor(): Point;
  /** Caret/focused-element centre, or null when unknown (falls back to cursor). */
  getFocusPoint(): Point | null;
  displayAt(p: Point): DisplayGeom;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export function createMagnifier(deps: MagnifierDeps): A11yTool<'magnifier'> & { tick(): void } {
  let opts: MagnifierOptions | null = null;
  let timer: unknown = null;

  function tick(): void {
    if (!opts?.enabled) return;
    const cursor = deps.getCursor();
    const focus = opts.follow === 'focus' ? deps.getFocusPoint() : null;
    const p = focus ?? cursor;
    const f = computeFrame(p, opts.zoom, deps.displayAt(p), opts.smoothing, focus === null);
    // The surface dedups unchanged frames (and uses repeats to retry a failed
    // stream start), so an idle pointer costs one cursor read per tick.
    deps.surface.update(f);
  }

  function stop(): void {
    if (timer !== null) deps.clearInterval(timer);
    timer = null;
    deps.surface.hide();
  }

  return {
    id: 'magnifier',
    tick,
    apply(options: MagnifierOptions, _all: AccessibilitySettings): void {
      opts = options;
      if (!options.enabled) { stop(); return; }
      if (timer === null) {
        deps.surface.show();
        timer = deps.setInterval(tick, TICK_MS);
      }
      tick();
    },
    dispose(): void {
      stop();
      opts = null;
      deps.surface.dispose();
    },
  };
}
