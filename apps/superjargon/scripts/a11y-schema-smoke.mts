/**
 * Smoke test for the accessibility dashboard schema (shared/a11y-profiles.ts).
 *
 *   bunx tsx scripts/a11y-schema-smoke.mts   (pure module — no Electron)
 *
 * Covers:
 *  a) defaults are valid and fresh per call
 *  b) every built-in profile validates and yields valid settings
 *  c) validateA11yPatch accepts the assistant's shape, rejects bad ranges,
 *     unknown tiles/keys and empty patches (incl. boundary values)
 *  d) validateA11yUpdate: tileOrder + deep-partial checks
 *  e) normalizeAccessibility repairs a corrupt settings file field by field
 */
import { A11Y_TILE_IDS } from '../src/shared/accessibility';
import {
  BUILTIN_A11Y_PROFILES,
  applyA11yUpdate,
  a11yPatchToUpdate,
  createDefaultAccessibility,
  normalizeAccessibility,
  resetAccessibilityFrom,
  settingsFromProfile,
  validateA11yPatch,
  validateA11yUpdate,
} from '../src/shared/a11y-profiles';
import { DEFAULT_SETTINGS } from '../src/shared/types';

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

const ok = (v: { ok: boolean }): boolean => v.ok;

// ── a) defaults ──────────────────────────────────────────────────────────
{
  const d = createDefaultAccessibility();
  check(d.tileOrder.length === A11Y_TILE_IDS.length, 'defaults: every tile ordered');
  check(Object.keys(d.tiles).length === A11Y_TILE_IDS.length, 'defaults: every tile has options');
  check(JSON.stringify(normalizeAccessibility(d)) === JSON.stringify(d), 'defaults: survive normalize unchanged');
  check(
    JSON.stringify(DEFAULT_SETTINGS.accessibility) === JSON.stringify(d),
    'defaults: DEFAULT_SETTINGS.accessibility matches',
  );
  d.tiles.magnifier.zoom = 5;
  check(createDefaultAccessibility().tiles.magnifier.zoom === 2, 'defaults: fresh object per call');
  check(DEFAULT_SETTINGS.a11yProfiles.length === 0, 'defaults: no saved profiles');
}

// ── b) built-in profiles ─────────────────────────────────────────────────
{
  const names = BUILTIN_A11Y_PROFILES.map((p) => p.name);
  for (const want of ['Low vision', 'Deaf / hard of hearing', 'Dyslexia', 'Motor']) {
    check(names.includes(want), `profiles: ${want} exists`);
  }
  check(new Set(BUILTIN_A11Y_PROFILES.map((p) => p.id)).size === BUILTIN_A11Y_PROFILES.length, 'profiles: unique ids');
  for (const p of BUILTIN_A11Y_PROFILES) {
    check(ok(validateA11yUpdate(p.settings)), `profiles: ${p.id} overlay is valid`);
    const s = settingsFromProfile(p);
    check(s.profile === p.id, `profiles: ${p.id} recorded as active`);
    check(
      JSON.stringify(normalizeAccessibility(s)) === JSON.stringify(s),
      `profiles: ${p.id} produces valid settings`,
    );
  }

  // Motor must not turn dictation on: dictation + hands-free skips the wake
  // word and types every overheard utterance.
  const motor = BUILTIN_A11Y_PROFILES.find((p) => p.id === 'motor');
  check(!!motor && motor.settings.tiles?.dictation === undefined, 'profiles: motor does not name dictation');
  check(!!motor && motor.settings.tiles?.handsFree?.enabled === true, 'profiles: motor keeps hands-free');
  if (motor) {
    check(!settingsFromProfile(motor).tiles.dictation.enabled, 'profiles: motor leaves dictation off from defaults');
  }

  // Applying a profile over live settings leaves the bridged tiles and the
  // reply speed alone unless the profile names them.
  const live = createDefaultAccessibility();
  live.tiles.handsFree.enabled = true;
  live.tiles.dictation.enabled = true;
  live.tiles.voice.enabled = false;
  live.tiles.pointing.enabled = false;
  live.voiceRate = 1.15;
  const deaf = BUILTIN_A11Y_PROFILES.find((p) => p.id === 'deaf-hoh');
  if (deaf) {
    const s = settingsFromProfile(deaf, live);
    check(
      s.tiles.handsFree.enabled && s.tiles.dictation.enabled && !s.tiles.voice.enabled && !s.tiles.pointing.enabled,
      'profiles: unnamed bridged tiles keep their live values',
      s.tiles,
    );
    check(s.voiceRate === 1.15, 'profiles: unnamed voiceRate keeps the live value', s.voiceRate);
    check(s.tiles.captions.enabled && s.profile === 'deaf-hoh', 'profiles: named tiles still applied');
  }
  const lowVision = BUILTIN_A11Y_PROFILES.find((p) => p.id === 'low-vision');
  if (lowVision) {
    const s = settingsFromProfile(lowVision, live);
    check(s.tiles.voice.enabled && s.tiles.handsFree.enabled, 'profiles: a named bridged tile wins, others kept', s.tiles);
  }
  const dys = BUILTIN_A11Y_PROFILES.find((p) => p.id === 'dyslexia');
  if (dys) {
    check(settingsFromProfile(dys, live).voiceRate === 0.9, 'profiles: a named voiceRate wins');
  }
  const reset = resetAccessibilityFrom({ ...live, tiles: { ...live.tiles, magnifier: { ...live.tiles.magnifier, enabled: true } } });
  check(
    !reset.tiles.magnifier.enabled && reset.tiles.handsFree.enabled && reset.tiles.dictation.enabled &&
      !reset.tiles.voice.enabled && !reset.tiles.pointing.enabled && reset.voiceRate === 1.15 && reset.profile === '',
    'reset: tools to defaults, bridged tiles + voiceRate kept',
    reset,
  );
}

// ── c) flat assistant patch ──────────────────────────────────────────────
{
  const good = validateA11yPatch({ tile: 'magnifier', zoom: 2.5, voice_rate: 0.8 });
  check(good.ok, 'patch: spec example accepted', good);
  if (good.ok) {
    const u = a11yPatchToUpdate(good.value);
    const s = applyA11yUpdate(createDefaultAccessibility(), u);
    check(s.tiles.magnifier.zoom === 2.5 && s.voiceRate === 0.8, 'patch: converts and applies');
  }
  check(ok(validateA11yPatch({ voice_rate: 1.5 })), 'patch: voice_rate alone is fine');
  check(
    ok(validateA11yPatch({ tile: 'magnifier', zoom: 1 })) && ok(validateA11yPatch({ tile: 'magnifier', zoom: 5 })),
    'patch: zoom bounds inclusive',
  );
  check(
    ok(validateA11yPatch({ tile: 'screenReader', rate: 0.5 })) && ok(validateA11yPatch({ tile: 'screenReader', rate: 2 })),
    'patch: rate bounds inclusive',
  );
  check(
    ok(validateA11yPatch({ tile: 'captions', fontSize: 14 })) && ok(validateA11yPatch({ tile: 'captions', fontSize: 48 })),
    'patch: fontSize bounds inclusive',
  );
  check(
    ok(validateA11yPatch({ tile: 'magnifier', smoothing: 0 })) && ok(validateA11yPatch({ tile: 'magnifier', smoothing: 1 })),
    'patch: smoothing bounds inclusive',
  );
  check(ok(validateA11yPatch({ tile: 'readingAids', palette: 'tritanopia', dyslexiaFont: true })), 'patch: enum + bool accepted');
  check(ok(validateA11yPatch({ tile: 'voice', enabled: true })), 'patch: simple tile enabled');

  const bad: Array<[string, unknown]> = [
    ['null', null],
    ['array', []],
    ['string', 'zoom'],
    ['empty', {}],
    ['tile only', { tile: 'magnifier' }],
    ['unknown tile', { tile: 'telepathy', enabled: true }],
    ['tile not a string', { tile: 3 }],
    ['option without tile', { zoom: 2 }],
    ['unknown key', { tile: 'magnifier', brightness: 3 }],
    ['key from another tile', { tile: 'magnifier', fontSize: 20 }],
    ['proto key', JSON.parse('{"tile":"magnifier","__proto__":1}')],
    ['constructor key', { tile: 'magnifier', constructor: 1 }],
    ['zoom too low', { tile: 'magnifier', zoom: 0.99 }],
    ['zoom too high', { tile: 'magnifier', zoom: 5.01 }],
    ['zoom NaN', { tile: 'magnifier', zoom: NaN }],
    ['zoom Infinity', { tile: 'magnifier', zoom: Infinity }],
    ['zoom string', { tile: 'magnifier', zoom: '2' }],
    ['smoothing > 1', { tile: 'magnifier', smoothing: 1.1 }],
    ['rate too low', { tile: 'screenReader', rate: 0.4 }],
    ['rate too high', { tile: 'screenReader', rate: 2.1 }],
    ['fontSize 13', { tile: 'captions', fontSize: 13 }],
    ['fontSize 49', { tile: 'captions', fontSize: 49 }],
    ['bad enum', { tile: 'magnifier', follow: 'mouse' }],
    ['bad palette', { tile: 'readingAids', palette: 'neon' }],
    ['bool as string', { tile: 'voice', enabled: 'yes' }],
    ['voice_rate low', { voice_rate: 0.49 }],
    ['voice_rate high', { voice_rate: 2.01 }],
    ['voice_rate string', { voice_rate: 'fast' }],
  ];
  for (const [name, patch] of bad) {
    const r = validateA11yPatch(patch);
    check(!r.ok && r.error.length > 0, `patch: rejects ${name}`, r);
  }
  const frozen = Object.freeze({ tile: 'magnifier', zoom: 2 });
  check(ok(validateA11yPatch(frozen)), 'patch: does not mutate its input');
}

// ── d) deep-partial updates ──────────────────────────────────────────────
{
  const reversed = [...A11Y_TILE_IDS].reverse();
  check(ok(validateA11yUpdate({ tileOrder: reversed })), 'update: reorder accepted');
  check(!ok(validateA11yUpdate({ tileOrder: reversed.slice(1) })), 'update: short tileOrder rejected');
  check(!ok(validateA11yUpdate({ tileOrder: [...reversed.slice(1), reversed[1]] })), 'update: duplicate in tileOrder rejected');
  check(!ok(validateA11yUpdate({ tileOrder: [...reversed.slice(1), 'nope'] })), 'update: unknown id in tileOrder rejected');
  check(!ok(validateA11yUpdate({ profile: 'x' })), 'update: profile is not client-settable');
  check(!ok(validateA11yUpdate({ tiles: { nope: { enabled: true } } })), 'update: unknown tile rejected');
  check(!ok(validateA11yUpdate({ tiles: { magnifier: { zoom: 9 } } })), 'update: out-of-range option rejected');
  check(!ok(validateA11yUpdate({ tiles: { magnifier: { nope: 1 } } })), 'update: unknown option rejected');
  check(!ok(validateA11yUpdate({ voiceRate: 3 })), 'update: voiceRate range enforced');
  const merged = applyA11yUpdate(createDefaultAccessibility(), { tiles: { magnifier: { zoom: 4 } } });
  check(merged.tiles.magnifier.zoom === 4 && merged.tiles.magnifier.follow === 'cursor', 'update: deep-merges one option');
}

// ── e) load-time repair ──────────────────────────────────────────────────
{
  const d = createDefaultAccessibility();
  check(JSON.stringify(normalizeAccessibility(undefined)) === JSON.stringify(d), 'normalize: missing → defaults');
  check(JSON.stringify(normalizeAccessibility('junk')) === JSON.stringify(d), 'normalize: non-object → defaults');
  const fixed = normalizeAccessibility({
    profile: 'low-vision',
    voiceRate: 99,
    tileOrder: ['captions', 'captions', 'bogus'],
    tiles: {
      magnifier: { enabled: true, zoom: 40, follow: 'focus', extra: 1 },
      captions: 'nope',
      voice: { enabled: 'yes' },
    },
  });
  check(fixed.profile === 'low-vision', 'normalize: keeps a string profile');
  check(fixed.voiceRate === 1, 'normalize: bad voiceRate → default');
  check(
    fixed.tileOrder[0] === 'captions' && fixed.tileOrder.length === A11Y_TILE_IDS.length,
    'normalize: order deduped and completed',
  );
  check(
    fixed.tiles.magnifier.enabled === true && fixed.tiles.magnifier.follow === 'focus',
    'normalize: keeps valid fields beside bad ones',
  );
  check(fixed.tiles.magnifier.zoom === 2, 'normalize: out-of-range zoom → default');
  check(!('extra' in fixed.tiles.magnifier), 'normalize: drops unknown keys');
  check(fixed.tiles.voice.enabled === true, 'normalize: wrong-typed bool → default');
}

console.log(`\n${pass} passed, ${fail} failed, 0 skipped`);
process.exit(fail > 0 ? 1 : 0);
