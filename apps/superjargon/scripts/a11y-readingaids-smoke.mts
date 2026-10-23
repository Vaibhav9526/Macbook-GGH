/**
 * Headless check of reading-aids descriptors: palette output, contrast,
 * dyslexia stack, ruler band, reduced motion, tool idempotence.
 *
 * Run:  bunx tsx scripts/a11y-readingaids-smoke.mts
 */
import {
  contrastRatio, createReadingAids, describeReadingAids, descriptorToCss, DYSLEXIA_FONT_STACK,
  PALETTES, rulerBand, type ReadingAidsDescriptor,
} from '../src/main/services/a11y/reading-aids';
import { A11Y_TILE_IDS, type A11yPalette, type AccessibilitySettings, type ReadingAidsOptions } from '../src/shared/accessibility';

let fails = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) fails++;
}

const off: ReadingAidsOptions = { enabled: true, palette: 'default', dyslexiaFont: false, readingRuler: false, reducedMotion: false };

check('tile ids still include readingAids', A11Y_TILE_IDS.includes('readingAids'));
const disabled = describeReadingAids({ ...off, enabled: false, palette: 'high-contrast', dyslexiaFont: true });
check('disabled emits nothing', !disabled.enabled && disabled.classes.length === 0 && Object.keys(disabled.cssVars).length === 0);
const def = describeReadingAids(off);
check('default palette sets no overrides', def.classes.join() === 'a11y-reading' && Object.keys(def.cssVars).length === 0);

const palettes: A11yPalette[] = ['high-contrast', 'protanopia', 'deuteranopia', 'tritanopia'];
for (const pal of palettes) {
  const d = describeReadingAids({ ...off, palette: pal });
  check(`${pal} class + vars`, d.classes.includes(`a11y-palette-${pal}`) && d.cssVars['--a11y-bg'] === PALETTES[pal].bg &&
    ['--a11y-fg', '--a11y-accent', '--a11y-ok', '--a11y-warn', '--a11y-danger'].every((k) => /^#[0-9a-f]{6}$/.test(d.cssVars[k])));
  check(`${pal} text contrast >= 7:1`, contrastRatio(PALETTES[pal].fg, PALETTES[pal].bg) >= 7);
}
check('high-contrast is 21:1', Math.round(contrastRatio('#000000', '#ffffff')) === 21);
check('high-contrast accent >= 7:1', contrastRatio(PALETTES['high-contrast'].accent, '#000000') >= 7);
for (const pal of ['protanopia', 'deuteranopia', 'tritanopia'] as A11yPalette[]) {
  const c = PALETTES[pal];
  check(`${pal} ok/danger differ`, c.ok !== c.danger);
  check(`${pal} status colours readable on bg (>= 4.5)`,
    [c.accent, c.ok, c.warn, c.danger].every((x) => contrastRatio(x, c.bg) >= 4.5));
}
check('protan/deutan ok colours differ from default green', PALETTES.protanopia.ok !== PALETTES.default.ok);

const dys = describeReadingAids({ ...off, dyslexiaFont: true });
check('dyslexia font stack, system fonts only', dys.fontFamily === DYSLEXIA_FONT_STACK && /Verdana/.test(DYSLEXIA_FONT_STACK) && !/\.woff|url\(/.test(DYSLEXIA_FONT_STACK));
check('dyslexia adds spacing vars', dys.cssVars['--a11y-letter-spacing'] === '0.04em');
const rm = describeReadingAids({ ...off, reducedMotion: true });
check('reduced motion flag + class', rm.reducedMotion && rm.classes.includes('a11y-reduced-motion'));
check('reduced-motion css kills animations', /animation-duration:0\.001ms/.test(descriptorToCss(rm)));
check('css empty when disabled', descriptorToCss(disabled) === '');

const D = { x: 0, y: 0, width: 1920, height: 1080 };
check('ruler centred on pointer', rulerBand(500, D).y === 476);
check('ruler clamps top', rulerBand(-50, D).y === 0);
check('ruler clamps bottom', rulerBand(5000, D).y + 48 === 1080);
check('ruler spans display', rulerBand(500, D).width === 1920);
check('ruler flag in descriptor', describeReadingAids({ ...off, readingRuler: true }).ruler.enabled);

const pubs: ReadingAidsDescriptor[] = [];
const tool = createReadingAids({ publish: (d) => pubs.push(d) });
const all = {} as AccessibilitySettings;
tool.apply(off, all); tool.apply({ ...off }, all);
check('apply idempotent', pubs.length === 1);
tool.apply({ ...off, palette: 'tritanopia' }, all);
check('apply republishes on change', pubs.length === 2);
tool.dispose();
check('dispose publishes disabled descriptor', !pubs[pubs.length - 1].enabled);

console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
