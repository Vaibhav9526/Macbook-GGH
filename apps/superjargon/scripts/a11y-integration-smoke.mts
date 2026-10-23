/**
 * Integration smoke for the accessibility dashboard against the REAL
 * settings-store (electron stubbed by store-preload.ts).
 *
 *   bunx tsx scripts/a11y-integration-smoke.mts
 *   bun --preload ./scripts/store-preload.ts ./scripts/a11y-integration-smoke.mts
 *
 * dev-verify runs it under tsx (its PRELOAD_FOR table matches by filename and
 * this name isn't in it), so under tsx it respawns itself under bun with the
 * stub. No bun on PATH -> SKIP lines, never a fake PASS.
 *
 * Covers:
 *  a) voice stays off Copilot: mindProvider='copilot-cli' leaves the STT/TTS
 *     provider settings untouched (in memory, on disk, after a cold reload),
 *     and no transcription/TTS source reads mindProvider
 *  b) a11y settings survive save -> cold-process reload
 *  c) corrupted a11y values on disk are repaired at load (and re-persisted)
 *  d) the store rejects unknown tiles / out-of-range patches and changes nothing
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

declare const Bun: unknown;

let pass = 0;
let fail = 0;
let skipped = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

const root = fileURLToPath(new URL('..', import.meta.url));
const self = fileURLToPath(import.meta.url);
const preload = fileURLToPath(new URL('./store-preload.ts', import.meta.url));
const helper = fileURLToPath(new URL('./store-read-helper.mts', import.meta.url));

if (typeof Bun === 'undefined') {
  const res = spawnSync('bun', ['--preload', JSON.stringify(preload), JSON.stringify(self)], {
    cwd: root,
    encoding: 'utf-8',
    // bun is an npm .cmd shim on Windows, so it needs a shell; the repo path has spaces, hence the quoting.
    shell: true,
  });
  if (res.error || res.status === null || /not recognized|not found/i.test(String(res.stderr))) {
    skipped++;
    console.log('SKIP a11y integration :: requires bun (electron stub preload)');
    console.log(`\n0 passed, 0 failed, ${skipped} skipped`);
    process.exit(0);
  }
  process.stdout.write(String(res.stdout ?? ''));
  process.stderr.write(String(res.stderr ?? ''));
  process.exit(res.status ?? 1);
}

// ── Temp userData + seed, BEFORE the first store import ──────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-a11y-int-'));
process.env.SUPERJARGON_SMOKE_USERDATA = dir;
const settingsPath = path.join(dir, 'superjargon-settings.json');
const readDisk = (): Record<string, any> => JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const coldReload = (): Record<string, any> => {
  const res = spawnSync(process.execPath, ['--preload', preload, helper], {
    cwd: root,
    env: { ...process.env, SUPERJARGON_SMOKE_USERDATA: dir },
    encoding: 'utf-8',
  });
  if (res.status !== 0) throw new Error(`reload helper failed: ${String(res.stderr).slice(-300)}`);
  return JSON.parse(String(res.stdout).trim().split('\n').pop() ?? '{}').settings;
};

fs.writeFileSync(
  settingsPath,
  JSON.stringify({ mindProvider: 'copilot-cli', ttsProvider: 'elevenlabs', transcriptionProvider: 'openai' }),
);
const store = await import('../src/main/services/settings-store');

// ── a) voice stays off Copilot ───────────────────────────────────────────
{
  const all = store.getAll();
  check(all.mindProvider === 'copilot-cli', 'voice: copilot-cli is accepted as a Mind provider', all.mindProvider);
  check(
    all.ttsProvider === 'elevenlabs' && all.transcriptionProvider === 'openai',
    'voice: STT/TTS untouched by the Mind provider at load',
    { tts: all.ttsProvider, stt: all.transcriptionProvider },
  );
  store.set('mindProvider', 'openai');
  store.set('mindProvider', 'copilot-cli');
  const after = store.getAll();
  check(
    after.ttsProvider === 'elevenlabs' && after.transcriptionProvider === 'openai',
    'voice: switching Mind provider leaves STT/TTS alone',
  );
  const disk = coldReload();
  check(
    disk.mindProvider === 'copilot-cli' && disk.ttsProvider === 'elevenlabs' && disk.transcriptionProvider === 'openai',
    'voice: cold reload keeps copilot Mind + independent voice providers',
    { m: disk.mindProvider, t: disk.ttsProvider, s: disk.transcriptionProvider },
  );
  // Static guard: the voice path must never branch on the Mind provider.
  const svc = path.join(root, 'src', 'main', 'services');
  for (const f of ['transcription.ts', 'elevenlabs-tts.ts', 'fish-audio-tts.ts']) {
    const p = path.join(svc, f);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf-8');
    check(!/mindProvider|copilot/i.test(src), `voice: ${f} does not reference mindProvider/copilot`);
  }
}

// ── b) round-trip ────────────────────────────────────────────────────────
{
  const r1 = store.updateA11y({ tiles: { magnifier: { enabled: true, zoom: 3.5 }, captions: { fontSize: 32 } }, voiceRate: 0.8 });
  const r2 = store.updateA11y({ tileOrder: [...store.getA11yState().settings.tileOrder].reverse() });
  const r3 = store.saveA11yProfile('QA profile');
  check(r1.ok && r2.ok && r3.ok, 'roundtrip: updates and profile save succeed', { r1, r2, r3 });
  const saved = store.getA11yState();
  const cold = coldReload();
  check(
    JSON.stringify(cold.accessibility) === JSON.stringify(saved.settings),
    'roundtrip: accessibility identical after cold reload',
  );
  check(cold.accessibility.tiles.magnifier.enabled === true && cold.accessibility.tiles.magnifier.zoom === 3.5, 'roundtrip: tile toggle + zoom persisted');
  check(cold.accessibility.voiceRate === 0.8, 'roundtrip: voiceRate persisted');
  check(
    cold.accessibility.tileOrder[0] === saved.settings.tileOrder[0] && cold.accessibility.profile === saved.settings.profile,
    'roundtrip: tile order and active profile persisted',
  );
  check(
    Array.isArray(cold.a11yProfiles) && cold.a11yProfiles.some((p: any) => p.name === 'QA profile'),
    'roundtrip: saved custom profile persisted',
  );
  const again = store.saveA11yProfile('qa PROFILE');
  check(again.ok && store.getA11yState().profiles.filter((p) => p.name.toLowerCase() === 'qa profile').length === 1, 'roundtrip: same name overwrites, no duplicate');
  check(!store.saveA11yProfile('Low vision').ok, 'roundtrip: built-in name rejected');
  check(!store.saveA11yProfile('   ').ok, 'roundtrip: blank name rejected');
  check(!store.applyA11yProfile('no-such-profile').ok, 'roundtrip: unknown profile id rejected');
  const applied = store.applyA11yProfile('low-vision');
  check(applied.ok && store.getA11yState().settings.tiles.magnifier.zoom === 3, 'roundtrip: builtin profile applies over current values');
  check(store.resetA11y().ok && store.getA11yState().settings.tiles.magnifier.enabled === false, 'roundtrip: reset returns to defaults');
}

// ── c) corrupted values repaired at load ─────────────────────────────────
{
  const d = readDisk();
  d.accessibility = {
    profile: 7,
    voiceRate: 'fast',
    tileOrder: ['voice', 'voice', 'bogus'],
    tiles: {
      magnifier: { enabled: 'yes', zoom: 99, follow: 'focus' },
      captions: { fontSize: -4, position: 'top' },
      readingAids: 'broken',
      screenReader: { rate: 0.1 },
    },
  };
  d.a11yProfiles = [{ id: 'x', name: 'Bad', builtin: false, settings: { tiles: { magnifier: { zoom: 100 } } } }, 'junk'];
  fs.writeFileSync(settingsPath, JSON.stringify(d));
  const cold = coldReload();
  const a = cold.accessibility;
  check(a.voiceRate === 1 && a.profile === '', 'repair: bad voiceRate/profile -> defaults', { v: a.voiceRate, p: a.profile });
  check(a.tileOrder[0] === 'voice' && a.tileOrder.length === 8 && new Set(a.tileOrder).size === 8, 'repair: tileOrder deduped and completed', a.tileOrder);
  check(a.tiles.magnifier.zoom === 2 && a.tiles.magnifier.enabled === false && a.tiles.magnifier.follow === 'focus', 'repair: only the bad magnifier fields reset');
  check(a.tiles.captions.fontSize === 24 && a.tiles.captions.position === 'top', 'repair: captions fontSize reset, position kept');
  check(a.tiles.readingAids.palette === 'default' && a.tiles.screenReader.rate === 1, 'repair: non-object tile and low rate -> defaults');
  check(cold.a11yProfiles.length === 0, 'repair: invalid saved profiles dropped');
  const onDisk = readDisk();
  check(onDisk.accessibility.tiles.magnifier.zoom === 2 && onDisk.a11yProfiles.length === 0, 'repair: repaired values re-persisted to disk');
}

// ── d) rejection through the real store ──────────────────────────────────
{
  const before = JSON.stringify(readDisk().accessibility);
  const stateBefore = JSON.stringify(store.getA11yState().settings);
  const bad: Array<[string, unknown]> = [
    ['unknown tile', { tiles: { telepathy: { enabled: true } } }],
    ['out-of-range zoom', { tiles: { magnifier: { zoom: 9 } } }],
    ['out-of-range fontSize', { tiles: { captions: { fontSize: 100 } } }],
    ['unknown option', { tiles: { magnifier: { brightness: 1 } } }],
    ['voiceRate too high', { voiceRate: 5 }],
    ['client-set profile', { profile: 'low-vision' }],
    ['bad tileOrder', { tileOrder: ['voice'] }],
    ['non-object', 'zoom=2'],
    ['null', null],
  ];
  for (const [name, patch] of bad) {
    const r = store.updateA11y(patch);
    check(!r.ok && r.error.length > 0, `reject: ${name}`, r);
  }
  check(JSON.stringify(store.getA11yState().settings) === stateBefore, 'reject: in-memory settings unchanged');
  check(JSON.stringify(readDisk().accessibility) === before, 'reject: disk unchanged');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail > 0 ? 1 : 0);
