// Reading aids — pure descriptor builders for A11yTool<'readingAids'>. No
// Electron, no DOM: the tool computes a ReadingAidsDescriptor (CSS variables,
// classes, font stack, ruler and motion flags) and hands it to an injected
// publish(); workstream A's IPC/renderers apply it.

import type { A11yPalette, A11yTool, AccessibilitySettings, ReadingAidsOptions } from '../../../shared/accessibility';

export interface PaletteColors {
  bg: string;
  fg: string;
  accent: string;
  ok: string;
  warn: string;
  danger: string;
}

/**
 * Colour-blind palettes use the Okabe-Ito set, which stays distinguishable
 * under all three dichromacies; status colours are moved off the confusable
 * axis (red/green for pro/deuteranopia, blue/yellow for tritanopia).
 */
export const PALETTES: Record<A11yPalette, PaletteColors> = {
  'default': { bg: '#0f0f11', fg: '#f5f5f7', accent: '#3b82f6', ok: '#22c55e', warn: '#f59e0b', danger: '#ef4444' },
  'high-contrast': { bg: '#000000', fg: '#ffffff', accent: '#ffff00', ok: '#00ff00', warn: '#ffd400', danger: '#ff6b6b' },
  'protanopia': { bg: '#0f0f11', fg: '#f5f5f7', accent: '#56b4e9', ok: '#009e73', warn: '#f0e442', danger: '#e69f00' },
  'deuteranopia': { bg: '#0f0f11', fg: '#f5f5f7', accent: '#56b4e9', ok: '#3d9be9', warn: '#f0e442', danger: '#e69f00' },
  'tritanopia': { bg: '#0f0f11', fg: '#f5f5f7', accent: '#cc79a7', ok: '#009e73', warn: '#ff7f50', danger: '#d55e00' },
};

/** Dyslexia-friendly stack from fonts already on Windows 10/11 (Verdana and
 *  Tahoma have wide, distinct letterforms). No font is bundled; shipping
 *  OpenDyslexic would mean bundling its OFL files. */
export const DYSLEXIA_FONT_STACK =
  "Verdana, Tahoma, 'Trebuchet MS', 'Segoe UI', 'Comic Sans MS', sans-serif";

export const RULER_HEIGHT = 48;
/** Alpha of the dimmed area outside the ruler band. */
export const RULER_DIM = 0.45;

export interface ReadingAidsDescriptor {
  enabled: boolean;
  /** Classes for the renderer root element. */
  classes: string[];
  /** CSS custom properties to set on the root element. */
  cssVars: Record<string, string>;
  /** Font-family override, or null to keep the app font. */
  fontFamily: string | null;
  reducedMotion: boolean;
  ruler: { enabled: boolean; height: number; dim: number; color: string };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours (1-21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function describeReadingAids(o: ReadingAidsOptions): ReadingAidsDescriptor {
  const base: ReadingAidsDescriptor = {
    enabled: false, classes: [], cssVars: {}, fontFamily: null, reducedMotion: false,
    ruler: { enabled: false, height: RULER_HEIGHT, dim: RULER_DIM, color: PALETTES.default.accent },
  };
  if (!o.enabled) return base;
  const p = PALETTES[o.palette] ?? PALETTES.default;
  const classes = ['a11y-reading'];
  const cssVars: Record<string, string> = {};
  if (o.palette !== 'default') {
    classes.push(`a11y-palette-${o.palette}`);
    cssVars['--a11y-bg'] = p.bg;
    cssVars['--a11y-fg'] = p.fg;
    cssVars['--a11y-accent'] = p.accent;
    cssVars['--a11y-ok'] = p.ok;
    cssVars['--a11y-warn'] = p.warn;
    cssVars['--a11y-danger'] = p.danger;
  }
  if (o.dyslexiaFont) {
    classes.push('a11y-dyslexia');
    cssVars['--a11y-font'] = DYSLEXIA_FONT_STACK;
    // Looser spacing is the other half of dyslexia-friendly text.
    cssVars['--a11y-letter-spacing'] = '0.04em';
    cssVars['--a11y-line-height'] = '1.6';
  }
  if (o.readingRuler) classes.push('a11y-ruler');
  if (o.reducedMotion) {
    classes.push('a11y-reduced-motion');
    cssVars['--a11y-motion-scale'] = '0';
  }
  return {
    enabled: true,
    classes,
    cssVars,
    fontFamily: o.dyslexiaFont ? DYSLEXIA_FONT_STACK : null,
    reducedMotion: o.reducedMotion,
    ruler: { enabled: o.readingRuler, height: RULER_HEIGHT, dim: RULER_DIM, color: p.accent },
  };
}

/** Re-point the app's design tokens (panel, stream) and the dashboard's own
 *  --a-* tokens at the active palette. Without this a palette only recoloured
 *  the bare <body>: every component paints from --bg-* / --text-* and kept its
 *  default colours. Appended after the design-system sheet, so it wins on order. */
export const PALETTE_TOKEN_CSS =
  ':root{--bg-deepest:var(--a11y-bg);--bg-base:var(--a11y-bg);' +
  '--bg-raised:color-mix(in srgb,var(--a11y-bg) 92%,var(--a11y-fg));' +
  '--bg-elevated:color-mix(in srgb,var(--a11y-bg) 86%,var(--a11y-fg));' +
  '--bg-surface:color-mix(in srgb,var(--a11y-bg) 80%,var(--a11y-fg));' +
  '--border-subtle:color-mix(in srgb,var(--a11y-fg) 55%,var(--a11y-bg));--border-strong:var(--a11y-fg);' +
  '--text-primary:var(--a11y-fg);--text-secondary:var(--a11y-fg);' +
  '--text-tertiary:color-mix(in srgb,var(--a11y-fg) 80%,var(--a11y-bg));' +
  '--accent:var(--a11y-accent);--accent-hover:var(--a11y-accent);' +
  '--success:var(--a11y-ok);--warning:var(--a11y-warn);--destructive:var(--a11y-danger);}' +
  'body.a11y-reading .a11y-dash{--a-bg:var(--a11y-bg);' +
  '--a-bg-2:color-mix(in srgb,var(--a11y-bg) 85%,var(--a11y-fg));' +
  '--a-line:color-mix(in srgb,var(--a11y-fg) 60%,var(--a11y-bg));' +
  '--a-ink:var(--a11y-fg);--a-muted:var(--a11y-fg);--a-focus:var(--a11y-accent);--a-on:var(--a11y-ok);}';

/** CSS text equivalent of a descriptor, for renderers that inject a <style>. */
export function descriptorToCss(d: ReadingAidsDescriptor): string {
  if (!d.enabled) return '';
  const vars = Object.entries(d.cssVars).map(([k, v]) => `${k}:${v};`).join('');
  let css = `:root{${vars}}`;
  if (d.cssVars['--a11y-bg']) css += 'body.a11y-reading{background:var(--a11y-bg);color:var(--a11y-fg);}';
  if (d.cssVars['--a11y-bg']) css += PALETTE_TOKEN_CSS;
  if (d.fontFamily) {
    css += 'body.a11y-dyslexia,body.a11y-dyslexia *{font-family:var(--a11y-font)!important;' +
      'letter-spacing:var(--a11y-letter-spacing);line-height:var(--a11y-line-height);}';
  }
  if (d.reducedMotion) {
    css += 'body.a11y-reduced-motion *{animation-duration:0.001ms!important;' +
      'animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important;}';
  }
  return css;
}

/** Reading-ruler band: a horizontal strip centred on the pointer, clamped to
 *  the display. The overlay dims everything outside it. */
export function rulerBand(
  pointerY: number, display: { x: number; y: number; width: number; height: number }, height = RULER_HEIGHT,
): { x: number; y: number; width: number; height: number } {
  const y = Math.min(display.y + display.height - height, Math.max(display.y, pointerY - height / 2));
  return { x: display.x, y: Math.round(y), width: display.width, height };
}

export interface ReadingAidsDeps {
  publish(d: ReadingAidsDescriptor): void;
}

export function createReadingAids(deps: ReadingAidsDeps): A11yTool<'readingAids'> {
  let last = '';
  return {
    id: 'readingAids',
    apply(options: ReadingAidsOptions, _all: AccessibilitySettings): void {
      const d = describeReadingAids(options);
      const key = JSON.stringify(d);
      if (key === last) return; // idempotent
      last = key;
      deps.publish(d);
    },
    dispose(): void {
      last = '';
      deps.publish(describeReadingAids({
        enabled: false, palette: 'default', dyslexiaFont: false, readingRuler: false, reducedMotion: false,
      }));
    },
  };
}
