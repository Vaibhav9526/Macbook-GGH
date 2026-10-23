/**
 * WCAG 2.2 AA checks that can run without a browser:
 *   1. colour contrast of every reading-aids palette and of the dashboard's
 *      own colour tokens (parsed out of DashboardTab.tsx, so the numbers are
 *      the shipped ones);
 *   2. a static scan for the ARIA / focus / sizing hooks the review relies on.
 *
 *   bunx tsx scripts/a11y-wcag-check.mts
 *
 * Static scans are string checks, not a rendered accessibility tree — they
 * catch regressions of known fixes, not new defects.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, PALETTES } from '../src/main/services/a11y/reading-aids';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    fail++;
    console.log(`FAIL ${name}`, extra ?? '');
  }
}
const ratio = (a: string, b: string) => Math.round(contrastRatio(a, b) * 100) / 100;
function atLeast(min: number, label: string, fg: string, bg: string): void {
  const r = ratio(fg, bg);
  check(r >= min, `${label}: ${fg} on ${bg} = ${r}:1 (need ${min})`);
}

// ── 1a. Reading-aids palettes ──────────────────────────────────────────
for (const [name, p] of Object.entries(PALETTES)) {
  atLeast(4.5, `${name} text`, p.fg, p.bg);
  for (const k of ['accent', 'ok', 'warn', 'danger'] as const) {
    atLeast(4.5, `${name} ${k} (text + UI >= 3)`, p[k], p.bg);
  }
}

// ── 1b. Dashboard tokens, read from the shipped CSS ────────────────────
// The dashboard is split across several components plus a shared stylesheet; scan them as one.
const PANEL = 'src/renderer/components/panel/';
const dash =
  ['DashboardTab.tsx', 'TileCard.tsx', 'TileOptions.tsx', 'RangeInput.tsx', 'DashboardHeader.tsx']
    .map((f) => read(PANEL + f))
    .join('\n') +
  '\n' +
  read('src/renderer/styles/a11y.css');
const tok: Record<string, string> = {};
for (const m of dash.matchAll(/--(a-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) tok[m[1]] = m[2];
check(Object.keys(tok).length >= 7, 'dashboard colour tokens parsed', tok);
atLeast(4.5, 'ink on bg', tok['a-ink'], tok['a-bg']);
atLeast(4.5, 'ink on bg-2', tok['a-ink'], tok['a-bg-2']);
atLeast(4.5, 'muted text on bg', tok['a-muted'], tok['a-bg']);
atLeast(4.5, 'muted text on bg-2', tok['a-muted'], tok['a-bg-2']);
atLeast(3, 'focus ring on bg', tok['a-focus'], tok['a-bg']);
atLeast(3, 'focus ring on bg-2', tok['a-focus'], tok['a-bg-2']);
atLeast(3, 'control border on bg (1.4.11)', tok['a-line'], tok['a-bg']);
atLeast(3, 'control border on bg-2 (1.4.11)', tok['a-line'], tok['a-bg-2']);
atLeast(3, 'switch-on fill on bg', tok['a-on'], tok['a-bg']);
atLeast(3, 'switch-on knob on fill', '#111114', tok['a-on']);
atLeast(3, 'switch-off knob on track', tok['a-ink'], tok['a-bg-2']);
atLeast(4.5, 'button text on button fill', '#111114', tok['a-ink']);
atLeast(4.5, 'error text on error fill', '#ffb4b4', '#3a1f1f');

// ── 2. Static ARIA / focus / size scan ─────────────────────────────────
const bar = read('src/renderer/components/panel/ProfileBar.tsx');
const cap = read('src/renderer/components/CaptionView.tsx');
const streamCss = read('src/renderer/styles/stream.css');
const has = (src: string, re: RegExp) => re.test(src);

check(has(dash, /role="switch"/) && has(dash, /aria-checked=\{on\}/), 'tile toggles are role=switch with aria-checked');
check(has(dash, /role="switch"[\s\S]{0,200}aria-labelledby=\{titleId\}/), 'switch named by the tile heading (4.1.2)');
check(has(dash, /:focus-visible \{ outline: 3px/), 'visible focus indicator on buttons/selects/inputs (2.4.7)');
check(has(dash, /input\[type="range"\][^}]*min-height: 24px/), 'range inputs >= 24px tall (2.5.8)');
check(has(dash, /\.a11y-check input \{[^}]*width: 24px; height: 24px/), 'checkboxes >= 24px (2.5.8)');
check(has(dash, /\.a11y-move \.a11y-btn \{[^}]*min-height: 30px/), 'move buttons >= 24px (2.5.8)');
check(has(dash, /prefers-reduced-motion: no-preference/), 'transitions only when motion is allowed');
check(has(dash, /role="alert"/), 'errors announced');
check(has(dash, /aria-live="polite"/), 'reorder announced via live region');
check(has(dash, /Move earlier/) && has(dash, /Move later/), 'reorder has a non-drag, non-gesture alternative (2.5.7)');
check(has(dash, /tagName === 'SELECT'/), 'Alt+Arrow shortcut skips <select> (Alt+Down opens it)');
check(has(dash, /aria-valuetext/), 'sliders expose a readable value (4.1.2)');

check(has(bar, /role="group"[^>]*aria-label/), 'profile bar is a labelled group');
check(has(bar, /htmlFor=\{nameId\}/), 'profile name input has a label (1.3.1)');
check(has(bar, /aria-pressed=\{active\}/), 'profile cards expose their selected state (4.1.2)');
check(has(bar, /role="status"/), 'profile apply/save results are announced (4.1.3)');
check(has(bar, /\.focus\(\)/), 'focus is restored after Apply / Save closes (2.4.3)');
check(has(bar, /Escape/), 'Escape closes the save form (no keyboard trap, 2.1.2)');

check(has(cap, /aria-live="polite"/) && has(cap, /role="log"/), 'captions are a polite live log');
check(!has(streamCss, /\.caption-view:empty\s*\{\s*display:\s*none/), 'empty caption region stays in the a11y tree (live-region reliability)');
check(has(streamCss, /overflow-wrap:\s*anywhere/), 'captions wrap instead of overflowing (1.4.10 reflow)');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
