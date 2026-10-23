/**
 * Smoke test for a11y/screen-reader.ts — fakes for native text / capture /
 * describe / speak.
 *
 *   bunx tsx scripts/a11y-screenreader-smoke.mts
 */
import { ScreenReader, NO_VISION_MESSAGE } from '../src/main/services/a11y/screen-reader';
import type { ScreenCapture } from '../src/shared/types';

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    fail++;
    console.log(`FAIL ${name}`, extra ?? '');
  }
}

const shot = { dataBase64: 'AAAA', displayId: 1, imageWidth: 10, imageHeight: 10,
  displayBounds: { x: 0, y: 0, width: 10, height: 10 }, isCursorScreen: true } as ScreenCapture;

const spoken: Array<{ text: string; rate: number }> = [];
const scopes: string[] = [];
const errors: string[] = [];
let stops = 0;
let starts = 0;
let described = 0;
let native: (() => Promise<string | null>) = async () => null;
let canSee = true;
let describeImpl = async (): Promise<string> => '# Title\n**button**: Save, disabled';
const sr = new ScreenReader({
  readText: () => native(),
  visionAvailable: () => canSee,
  capture: async (scope) => { scopes.push(scope); return shot; },
  describe: (_s, _sig) => { described++; return describeImpl(); },
  speak: (text, rate) => { spoken.push({ text, rate }); },
  stopSpeaking: () => { stops++; },
  onStart: () => { starts++; },
  onError: (m) => errors.push(m),
  describeTimeoutMs: 200,
});
const all = {} as never;

check((await sr.readNow()) === '' && spoken.length === 0, 'disabled: reads nothing');

sr.apply({ enabled: true, scope: 'region', rate: 5 }, all);
const t = await sr.readNow();
check(t === 'Title button: Save, disabled', 'markdown stripped', t);
check(spoken[0]?.rate === 2, 'rate clamped to 2', spoken[0]);
check(scopes[0] === 'region', 'scope forwarded');
check(starts === 1, 'onStart fired once per read', starts);

// Native accessibility text wins; no screenshot / model call.
native = async () => 'Window: Notepad. text box: Search, text hello. button: Close.';
spoken.length = 0; scopes.length = 0; described = 0;
const nativeText = await sr.readNow();
check(nativeText.includes('Search') && spoken[0]?.text === nativeText, 'native text is spoken verbatim', nativeText);
check(scopes.length === 0 && described === 0, 'native text skips capture and describe', { scopes, described });

// A failing native read falls through to vision.
native = async () => { throw new Error('UIA broke'); };
spoken.length = 0; described = 0;
check((await sr.readNow()) === 'Title button: Save, disabled' && described === 1, 'native failure falls back to vision');

// No native text + a non-vision provider: say why, never call describe.
native = async () => null;
canSee = false;
spoken.length = 0; described = 0; errors.length = 0;
check((await sr.readNow()) === '' && described === 0 && errors[0] === NO_VISION_MESSAGE, 'no vision: clear message, no model call', errors);
canSee = true;

// An empty description is an error, not silence.
describeImpl = async () => '   ';
errors.length = 0;
check((await sr.readNow()) === '' && /no description/i.test(errors[0] ?? ''), 'empty description reported', errors);

// A hung provider times out with a spoken-able error.
describeImpl = () => new Promise(() => {});
errors.length = 0;
check((await sr.readNow()) === '' && /too long/i.test(errors[0] ?? ''), 'describe timeout reported', errors);

// A newer read supersedes a slow in-flight one.
describeImpl = () => new Promise((r) => { setTimeout(() => r('first'), 50); });
const slow = sr.readNow();
await Promise.resolve();
describeImpl = async () => 'second';
const fast = sr.readNow();
check((await slow) === '' && (await fast) === 'second', 'newer read supersedes older');

// Disabling cancels in-flight speech.
const before = stops;
sr.apply({ enabled: false, scope: 'region', rate: 1 }, all);
check(stops > before, 'disable stops speech');

// Errors surface through onError, not exceptions.
sr.apply({ enabled: true, scope: 'window', rate: 1 }, all);
describeImpl = async () => { throw new Error('boom'); };
errors.length = 0;
check((await sr.readNow()) === '' && errors[0] === 'boom', 'error reported');

sr.dispose();
check((await sr.readNow()) === '', 'disposed: reads nothing');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
