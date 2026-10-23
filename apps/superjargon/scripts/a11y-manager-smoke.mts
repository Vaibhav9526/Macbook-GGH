/**
 * Smoke test for main/a11y-manager.ts — fake tools, fake timers.
 *
 *   bunx tsx scripts/a11y-manager-smoke.mts
 */
import { A11yManager, type A11yManagerTools } from '../src/main/a11y-manager';
import { createDefaultAccessibility } from '../src/shared/a11y-profiles';
import type { AccessibilitySettings, CaptionsOptions } from '../src/shared/accessibility';

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    fail++;
    console.log(`FAIL ${name}`, extra ?? '');
  }
}

const log: string[] = [];
const pushed: number[] = [];
const fake = <T extends object>(id: string, extra: T) => ({
  id,
  apply: (o: { enabled: boolean }) => { log.push(`${id}.apply:${o.enabled}`); },
  dispose: () => { log.push(`${id}.dispose`); },
  ...extra,
});
const tools = {
  screenReader: fake('screenReader', { readNow: async () => { log.push('readNow'); return 'hi'; } }),
  captions: fake('captions', { pushAudio: () => {}, pushUtterance: (b: Buffer) => { pushed.push(b.length); } }),
  magnifier: fake('magnifier', {}),
  readingAids: fake('readingAids', {}),
} as unknown as A11yManagerTools;

let settings: AccessibilitySettings = createDefaultAccessibility();
const capOpts: CaptionsOptions[] = [];
const active: boolean[] = [];
let timers: Array<() => void> = [];
const m = new A11yManager({
  tools,
  getSettings: () => settings,
  onCaptionOptions: (o) => capOpts.push(o),
  onCaptionsActive: (a) => active.push(a),
  setTimeout: (fn) => { timers.push(fn); return timers.length; },
  clearTimeout: () => { timers = []; },
});

m.sync();
check(['screenReader', 'magnifier', 'captions', 'readingAids'].every((id) => log.some((l) => l.startsWith(`${id}.apply`))),
  'first sync applies every tile', log);

log.length = 0;
m.sync();
check(log.length === 0, 'unchanged settings re-apply nothing', log);

settings = structuredClone(settings);
settings.tiles.magnifier.enabled = true;
settings.tiles.magnifier.zoom = 3;
m.sync();
check(log.join() === 'magnifier.apply:true', 'only the changed tile is re-applied', log);

// Captions: on -> active callback + options; utterance padded + paced.
log.length = 0;
settings = structuredClone(settings);
settings.tiles.captions.enabled = true;
m.sync();
check(active.join() === 'true' && capOpts.at(-1)?.enabled === true && m.captionsActive, 'captions on notifies host', { active, capOpts });

m.pushUtterance(Buffer.alloc(150_001));
check(pushed.length === 1 && pushed[0] === 150_001, 'utterance goes out whole: no padding, no chunking', pushed);
settings = structuredClone(settings);
settings.tiles.captions.enabled = false;
m.sync();
const before = pushed.length;
check(active.join() === 'true,false', 'captions off releases the mic', active);
m.pushUtterance(Buffer.alloc(64_000));
check(pushed.length === before, 'utterances ignored while off');

check((await m.readScreenNow()) === 'hi' && log.includes('readNow'), 'readScreenNow delegates to the tool');

// Dispose: every tool disposed once, captions release fires if on.
settings = structuredClone(settings);
settings.tiles.captions.enabled = true;
m.sync();
log.length = 0;
m.dispose();
m.dispose();
const disposed = log.filter((l) => l.endsWith('.dispose')).sort();
check(disposed.length === 4, 'dispose() disposes all four tools exactly once', disposed);
check(active.at(-1) === false, 'dispose releases captions pin', active);
log.length = 0;
settings = structuredClone(settings);
settings.tiles.magnifier.zoom = 4;
m.sync();
check(log.length === 0, 'sync after dispose is a no-op');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
