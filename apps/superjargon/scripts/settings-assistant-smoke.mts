/**
 * Smoke test for the settings assistant (services/settings-assistant.ts).
 *
 *   bunx tsx scripts/settings-assistant-smoke.mts   (pure module — no Electron)
 *
 * Covers: gate hits/misses, JSON extraction (fenced, prose, malformed),
 * applying a valid patch, out-of-range and unknown-tile rejection, a non-JSON
 * reply changing nothing, NONE falling through, undo (incl. bounded stack and
 * profile restore), profile suggestion + yes/no, explain, stale-turn gating.
 */
import {
  SettingsAssistant,
  UndoStack,
  decideIntent,
  describePatch,
  extractJsonObject,
  UNDO_LIMIT,
} from '../src/main/services/settings-assistant';
import {
  BUILTIN_A11Y_PROFILES,
  applyA11yUpdate,
  createDefaultAccessibility,
  settingsFromProfile,
  validateA11yUpdate,
} from '../src/shared/a11y-profiles';
import type { A11yResult, A11yState } from '../src/shared/a11y-profiles';
import type { AccessibilitySettings } from '../src/shared/accessibility';

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

// ── gate ───────────────────────────────────────────────────────────────
const kind = (t: string, hasPending = false) => decideIntent(t, { hasPending })?.kind ?? null;
for (const t of [
  'magnify the screen to 2.5x',
  'turn on captions',
  'switch on the screen reader',
  'increase the contrast',
  'use the dyslexia font',
  'show the reading ruler',
  'make the zoom bigger',
]) check(kind(t) === 'patch', `gate hit: ${t}`, kind(t));
check(kind('undo that') === 'undo', 'gate: undo that');
check(kind('Undo.') === 'undo', 'gate: undo.');
check(kind('which profile suits me?') === 'suggest-profile', 'gate: which profile suits me');
check(kind('explain the magnifier tile') === 'explain', 'gate: explain tile');
check(decideIntent('explain this tile')?.kind === 'explain', 'gate: explain this tile (no tile named)');
const ap = decideIntent('apply the low vision profile');
check(ap?.kind === 'apply-profile' && ap.id === 'low-vision', 'gate: apply profile by name', ap);
check(kind('what time is it') === null, 'gate miss: ordinary question');
check(kind('open notepad and type hello') === null, 'gate miss: agent task');
check(kind('yes') === null, 'gate miss: bare yes without pending');
check(kind('yes', true) === 'yes', 'gate: yes with pending');
check(kind('no thanks', true) === 'no', 'gate: no with pending');
check(kind(`${'word '.repeat(30)}captions`) === null, 'gate miss: long utterance');
check(decideIntent('hey superjargon turn on captions', { wakePattern: 'superjargon' })?.kind === 'patch', 'gate: wake lead stripped');

// tightened gate: words common in ordinary speech need a settings verb
for (const t of [
  'send me the zoom link',
  "let's zoom in on the problem",
  'my linkedin profile needs work',
  'in contrast to last year',
  'accessibility laws are complicated',
]) check(kind(t) === null, `gate miss (no settings verb): ${t}`, kind(t));
for (const t of ['zoom in', 'increase the zoom', 'set the zoom to 3', 'turn on high contrast', 'make the contrast stronger']) {
  check(kind(t) === 'patch', `gate hit (settings verb): ${t}`, kind(t));
}
// agent tasks route to the agent loop before the assistant sees them
for (const t of [
  'superjargon agent zoom into the map',
  'super jargon, agent, open the accessibility settings page',
  'agent, magnify the image in paint',
  'hey superjargon agent turn on captions in youtube',
]) check(decideIntent(t, { wakePattern: 'super ?jargon' }) === null, `gate: agent utterance bypasses assistant: ${t}`);
check(
  decideIntent('superjargon turn on captions', { wakePattern: 'super ?jargon' })?.kind === 'patch',
  'gate: wake-led settings command is not an agent trigger',
);
// a bare undo is only ours when there is something to undo
check(decideIntent('undo', { canUndo: false }) === null, 'gate: bare undo not consumed when stack empty');
check(decideIntent('undo', { canUndo: true })?.kind === 'undo', 'gate: undo with entries');

// ── extraction ─────────────────────────────────────────────────────────
check(JSON.stringify(extractJsonObject('{"tile":"magnifier","zoom":2.5}')) === '{"tile":"magnifier","zoom":2.5}', 'extract: plain');
check((extractJsonObject('```json\n{"tile":"captions","enabled":true}\n```') as { tile: string })?.tile === 'captions', 'extract: fenced');
check((extractJsonObject('Sure! Here you go: {"voice_rate":0.8} hope that helps {x}') as { voice_rate: number })?.voice_rate === 0.8, 'extract: prose around');
check((extractJsonObject('{"tile":"captions","note":"a } brace"}') as { note: string })?.note === 'a } brace', 'extract: brace in string');
check(extractJsonObject('{"tile":"magnifier","zoom":') === null, 'extract: truncated -> null');
check(extractJsonObject('sorry, I cannot') === null, 'extract: no json -> null');
check(extractJsonObject('[1,2]') === null, 'extract: array -> null');
check(extractJsonObject('{bad} {"zoom":2}') !== null, 'extract: skips bad brace group');

// ── harness: in-memory store using the real shared logic ───────────────
function makeHarness(replies: Array<string | Error>) {
  let settings = createDefaultAccessibility();
  const state = (): A11yState => ({ settings, profiles: [...BUILTIN_A11Y_PROFILES] });
  const spoken: string[] = [];
  const prompts: string[] = [];
  let calls = 0;
  const assistant = new SettingsAssistant({
    getState: state,
    updateA11y: (u): A11yResult => {
      const v = validateA11yUpdate(u);
      if (!v.ok) return v;
      const next = applyA11yUpdate(settings, v.value);
      if (!Object.keys(v.value).every((k) => k === 'tileOrder')) next.profile = '';
      settings = next;
      return { ok: true, state: state() };
    },
    applyProfile: (id): A11yResult => {
      const p = BUILTIN_A11Y_PROFILES.find((x) => x.id === id);
      if (!p) return { ok: false, error: 'unknown profile' };
      const next = settingsFromProfile(p);
      next.tileOrder = settings.tileOrder;
      settings = next;
      return { ok: true, state: state() };
    },
    complete: async (prompt) => {
      calls++;
      prompts.push(prompt);
      const r = replies.shift();
      if (r === undefined) throw new Error('no reply scripted');
      if (r instanceof Error) throw r;
      return r;
    },
  });
  const run = (text: string, isCurrent = () => true) =>
    assistant.handle(text, {
      signal: new AbortController().signal,
      isCurrent,
      speak: async (l) => {
        spoken.push(l);
      },
    });
  return { assistant, run, spoken, prompts, calls: () => calls, get: () => settings as AccessibilitySettings };
}

// valid patch applies + confirms
{
  const h = makeHarness(['```json\n{"tile":"magnifier","zoom":2.5,"voice_rate":0.8}\n```']);
  const handled = await h.run('magnify the screen to two and a half');
  check(handled, 'patch: handled');
  check(h.get().tiles.magnifier.zoom === 2.5 && h.get().voiceRate === 0.8, 'patch: applied', h.get().tiles.magnifier);
  check(/Magnifier set to 2\.5x/.test(h.spoken[0] ?? ''), 'patch: spoken confirmation', h.spoken);
  check(h.assistant.undo.size === 1, 'patch: undo entry pushed');
  check(h.prompts[0].includes('magnifier') && h.prompts[0].includes('NONE'), 'patch: prompt carries schema');
  // undo
  const u = await h.run('undo that');
  check(u && h.get().tiles.magnifier.zoom === createDefaultAccessibility().tiles.magnifier.zoom && h.get().voiceRate === 1, 'undo: restores previous state', h.get());
  check(h.calls() === 1, 'undo: no model call');
  check(h.spoken.at(-1) === 'Undone.', 'undo: spoken');
  const spokenBefore = h.spoken.length;
  const consumed = await h.run('undo that');
  check(consumed === false && h.spoken.length === spokenBefore, 'undo: empty stack is not consumed (falls through)', h.spoken);
}

// out-of-range
{
  const h = makeHarness(['{"tile":"magnifier","zoom":9}']);
  const before = JSON.stringify(h.get());
  await h.run('zoom way in');
  check(JSON.stringify(h.get()) === before, 'range: state unchanged');
  check(/nothing changed/i.test(h.spoken[0] ?? '') && h.assistant.undo.size === 0, 'range: rejected by voice, no undo entry', h.spoken);
}
// unknown tile / option
{
  const h = makeHarness(['{"tile":"teleporter","enabled":true}', '{"tile":"captions","glitter":true}']);
  const before = JSON.stringify(h.get());
  await h.run('turn on captions');
  await h.run('turn on captions');
  check(JSON.stringify(h.get()) === before, 'unknown tile/option: state unchanged');
  check(h.spoken.length === 2 && h.spoken.every((s) => /nothing changed/i.test(s)), 'unknown tile/option: both spoken', h.spoken);
}
// non-JSON / malformed
{
  const h = makeHarness(['Sure, I have enabled captions for you!', '{"tile":"captions","enabled":']);
  const before = JSON.stringify(h.get());
  const a = await h.run('turn on captions');
  const b = await h.run('turn on captions');
  check(a && b && JSON.stringify(h.get()) === before, 'non-JSON reply: nothing changes');
  check(h.spoken.length === 2 && h.assistant.undo.size === 0, 'non-JSON reply: spoken failure, no undo', h.spoken);
}
// provider error
{
  const h = makeHarness([new Error('copilot exploded')]);
  const before = JSON.stringify(h.get());
  const r = await h.run('turn on captions');
  check(r && JSON.stringify(h.get()) === before && /nothing changed/i.test(h.spoken[0] ?? ''), 'provider error: spoken, unchanged');
}
// NONE falls through; ordinary speech costs no call
{
  const h = makeHarness(['NONE']);
  check((await h.run('the captions on that video were funny')) === false, 'NONE: falls through to pipeline');
  check((await h.run('what is the weather')) === false && h.calls() === 1, 'miss: no model call');
  check((await h.run('send me the zoom link')) === false && h.calls() === 1, 'miss: zoom without a settings verb costs no call');
  check(h.spoken.length === 0, 'fall-through speaks nothing');
}
// stale turn: reply arrives after a newer turn started
{
  const h = makeHarness(['{"tile":"captions","enabled":true}']);
  let current = true;
  const p = h.run('turn on captions', () => current);
  current = false;
  await p;
  check(!h.get().tiles.captions.enabled && h.spoken.length === 0, 'stale turn: nothing applied or spoken');
}
// profile suggestion + yes
{
  const h = makeHarness(['PROFILE: dyslexia\nYou mentioned letters swapping around, which this helps with.']);
  await h.run('which profile suits me? letters swim on the page');
  check(/Dyslexia profile/.test(h.spoken[0] ?? '') && /apply it/i.test(h.spoken[0] ?? ''), 'suggest: spoken with question', h.spoken);
  check(h.get().profile === '', 'suggest: nothing applied before yes');
  await h.run('yes');
  check(h.get().profile === 'dyslexia' && h.get().tiles.readingAids.dyslexiaFont, 'suggest: applied on yes');
  await h.run('undo that');
  check(h.get().profile === '' && !h.get().tiles.readingAids.dyslexiaFont, 'undo: reverts profile apply');
  // The suggestion was answered: a later "yes"/"sure" (to anything) must
  // not re-apply it.
  const again = await h.run('yes');
  const sure = await h.run('sure');
  check(again === false && sure === false && h.get().profile === '', 'suggest: pending cleared after yes, no re-apply', h.get().profile);
}
// suggestion declined / abandoned / unknown id
{
  const h = makeHarness(['PROFILE: motor\nHands-free helps.', 'PROFILE: wizard\nnope']);
  await h.run('which profile suits me');
  await h.run('no');
  check(h.get().profile === '', 'suggest: no leaves state');
  await h.run('yes');
  check(h.get().profile === '' && h.calls() === 1, 'suggest: yes after no does nothing');
  await h.run('which profile suits me');
  check(/nothing changed/i.test(h.spoken.at(-1) ?? '') && h.get().profile === '', 'suggest: unknown profile id rejected');
}
// pending expiry
{
  let t = 0;
  const h2 = (() => {
    let settings = createDefaultAccessibility();
    const spoken: string[] = [];
    const a = new SettingsAssistant({
      getState: () => ({ settings, profiles: [...BUILTIN_A11Y_PROFILES] }),
      updateA11y: () => ({ ok: false, error: 'x' }),
      applyProfile: (id) => {
        settings = { ...settings, profile: id };
        return { ok: true, state: { settings, profiles: [...BUILTIN_A11Y_PROFILES] } };
      },
      complete: async () => 'PROFILE: motor\nhands free',
      now: () => t,
    });
    const run = (x: string) =>
      a.handle(x, { signal: new AbortController().signal, isCurrent: () => true, speak: async (l) => void spoken.push(l) });
    return { run, get: () => settings };
  })();
  await h2.run('which profile suits me');
  t = 10 * 60_000;
  const r = await h2.run('yes');
  check(r === false && h2.get().profile === '', 'suggest: expired pending ignores yes');
}
// explain
{
  const h = makeHarness(['The magnifier enlarges the area around your cursor. It is at 1x now.']);
  await h.run('explain the magnifier tile');
  check(/enlarges/.test(h.spoken[0] ?? '') && h.prompts[0].includes('Magnifier'), 'explain: spoken from model');
  const h2 = makeHarness([]);
  await h2.run('explain this tile');
  check(h2.calls() === 0 && /which tile/i.test(h2.spoken[0] ?? ''), 'explain: no tile -> asks, no model call');
}
// apply profile by name is local (no model)
{
  const h = makeHarness([]);
  await h.run('switch to the low vision profile');
  check(h.calls() === 0 && h.get().profile === 'low-vision', 'apply-profile: local, no model call');
}

// ── undo stack bound + describe ────────────────────────────────────────
{
  const s = new UndoStack();
  for (let i = 0; i < UNDO_LIMIT + 5; i++) {
    const d = createDefaultAccessibility();
    d.voiceRate = 1 + i / 100;
    s.push(d);
  }
  check(s.size === UNDO_LIMIT, 'undo stack: bounded');
  const d = createDefaultAccessibility();
  s.push(d);
  d.voiceRate = 2;
  check(s.pop()?.voiceRate === 1, 'undo stack: stores a copy');
}
check(describePatch({ tile: 'captions', enabled: true, fontSize: 32 }) === 'Live captions on, fontSize 32', 'describe: captions', describePatch({ tile: 'captions', enabled: true, fontSize: 32 }));
check(describePatch({ voice_rate: 0.8 }) === 'Voice speed 0.8x', 'describe: voice rate');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
