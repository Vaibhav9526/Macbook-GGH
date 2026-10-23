/**
 * Headless check of the magnifier core (no Electron): zoom clamp, cursor-stable
 * view math (edge clamping, multi-display, negative origins), follow
 * cursor/focus, idempotent apply, clean disable.
 *
 * Run:  bunx tsx scripts/a11y-magnifier-smoke.mts
 */
import {
  clampZoom, computeFrame, createMagnifier, viewOrigin,
  type DisplayGeom, type LensFrame, type Point,
} from '../src/main/services/a11y/magnifier';
import type { AccessibilitySettings, MagnifierOptions } from '../src/shared/accessibility';

let fails = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) fails++;
}

const D: DisplayGeom = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1.25 };
const D2: DisplayGeom = { id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
const SZ = D.bounds;

check('zoom clamps low', clampZoom(0.2) === 1 && clampZoom(-3) === 1);
check('zoom clamps high', clampZoom(9) === 5);
check('zoom NaN -> 1', clampZoom(NaN) === 1);
check('zoom passthrough', clampZoom(2.25) === 2.25);

// Cursor-stable mapping: the content under the pointer stays under the pointer.
for (const z of [1, 1.25, 2, 3.5, 5]) {
  for (const p of [{ x: 0, y: 0 }, { x: 960, y: 540 }, { x: 1920, y: 1080 }, { x: 17, y: 1000 }]) {
    const o = viewOrigin(p, z, SZ);
    const contentAtPointer = { x: o.x + p.x / z, y: o.y + p.y / z };
    check(`pointer stable z=${z} p=${p.x},${p.y}`, Math.abs(contentAtPointer.x - p.x) < 1e-9 && Math.abs(contentAtPointer.y - p.y) < 1e-9);
    check(`view inside display z=${z} p=${p.x},${p.y}`,
      o.x >= 0 && o.y >= 0 && o.x + 1920 / z <= 1920 + 1e-9 && o.y + 1080 / z <= 1080 + 1e-9);
  }
}
check('zoom 1 is identity', viewOrigin({ x: 700, y: 300 }, 1, SZ).x === 0);
check('out-of-range pointer is clamped', viewOrigin({ x: 99999, y: -5 }, 2, SZ).x === 960 && viewOrigin({ x: 99999, y: -5 }, 2, SZ).y === 0);

// Frame: display-relative point
const f1 = computeFrame({ x: -1900, y: 20 }, 3, D2);
check('negative-origin display -> relative point', f1.point.x === 20 && f1.point.y === 20);
check('frame clamps zoom', computeFrame({ x: 5, y: 5 }, 9, D).zoom === 5);
check('frame clamps point to display', computeFrame({ x: 5000, y: 5000 }, 2, D).point.x === 1920);

// Tool state machine with fakes
const log: string[] = [];
let frames: LensFrame[] = [];
let cursor: Point = { x: 100, y: 100 };
let focus: Point | null = { x: 1000, y: 700 };
let display = D;
let tickFn: (() => void) | null = null;
let intervals = 0;
const tool = createMagnifier({
  surface: {
    show: () => log.push('show'), hide: () => log.push('hide'),
    update: (f) => { frames.push(f); }, dispose: () => log.push('dispose'),
  },
  getCursor: () => cursor,
  getFocusPoint: () => focus,
  displayAt: () => display,
  setInterval: (fn) => { tickFn = fn; intervals++; return 1; },
  clearInterval: () => { tickFn = null; },
});
const all = {} as AccessibilitySettings;
const base: MagnifierOptions = { enabled: true, zoom: 9, follow: 'cursor', smoothing: 0.5 };
const last = () => frames[frames.length - 1];
tool.apply(base, all);
tool.apply(base, all);
check('apply idempotent (one timer, one show)', intervals === 1 && log.filter((l) => l === 'show').length === 1);
check('out-of-range zoom clamped in frame', last().zoom === 5);
check('first frame is exactly at cursor (no lag)', last().point.x === 100 && last().point.y === 100);
cursor = { x: 900, y: 500 };
tickFn!();
check('next tick tracks cursor with no smoothing lag', last().point.x === 900 && last().point.y === 500);
tool.apply({ ...base, zoom: 2.25 }, all);
check('live zoom change reaches surface', last().zoom === 2.25);
display = D2; cursor = { x: -500, y: 300 };
tickFn!();
check('cursor on another display switches display', last().display.id === 2 && last().point.x === 1420);
display = D; cursor = { x: 900, y: 500 };
tool.apply({ ...base, follow: 'focus' }, all);
check('follow focus uses focus point', last().point.x === 1000 && !last().followsCursor);
focus = null;
tool.apply({ ...base, follow: 'focus' }, all);
check('focus null falls back to cursor', last().point.x === 900 && last().followsCursor);
tool.apply({ ...base, enabled: false }, all);
check('disable hides and stops timer', log[log.length - 1] === 'hide' && tickFn === null);
const n = frames.length;
tool.apply({ ...base, enabled: false }, all);
check('disabled apply sends no frames', frames.length === n);
tool.dispose();
check('dispose disposes surface', log[log.length - 1] === 'dispose');

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
