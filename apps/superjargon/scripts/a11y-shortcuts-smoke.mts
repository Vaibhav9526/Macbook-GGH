/**
 * Smoke test for the accessibility shortcuts: defaults, load-time repair and
 * the action -> store call mapping (injected fakes, no Electron).
 *
 *   bunx tsx scripts/a11y-shortcuts-smoke.mts
 */
import {
  A11Y_SHORTCUT_ACTIONS, DEFAULT_A11Y_SHORTCUTS, canonicalAccelerator, normalizeA11yShortcuts,
} from '../src/shared/a11y-shortcuts';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { createDefaultAccessibility, type A11yResult, type A11yUpdate } from '../src/shared/a11y-profiles';
import { A11yShortcutController } from '../src/main/a11y-shortcuts';

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    fail++;
    console.log(`FAIL ${name}`, extra ?? '');
  }
}

// ── defaults ───────────────────────────────────────────────────────────
const talk = [DEFAULT_SETTINGS.pushToTalkShortcut, DEFAULT_SETTINGS.dictationShortcut, DEFAULT_SETTINGS.agentPttShortcut];
const defaults = A11Y_SHORTCUT_ACTIONS.map((a) => canonicalAccelerator(DEFAULT_A11Y_SHORTCUTS[a]));
check(defaults.every(Boolean), 'every default is a valid accelerator');
check(new Set(defaults).size === defaults.length, 'defaults are unique');
check(!defaults.some((d) => talk.map(canonicalAccelerator).includes(d)), 'defaults avoid the three talk shortcuts');
check(DEFAULT_SETTINGS.a11yShortcuts.readScreen === DEFAULT_A11Y_SHORTCUTS.readScreen, 'settings defaults carry the map');

// ── repair ─────────────────────────────────────────────────────────────
check(!normalizeA11yShortcuts(DEFAULT_A11Y_SHORTCUTS, talk).changed, 'valid map is left alone');
const r1 = normalizeA11yShortcuts(undefined, talk);
check(r1.changed && r1.shortcuts.toggleMagnifier === DEFAULT_A11Y_SHORTCUTS.toggleMagnifier, 'missing map -> defaults');
const r2 = normalizeA11yShortcuts({ toggleMagnifier: 'banana', readScreen: 42, stopReading: '' }, talk);
check(r2.shortcuts.toggleMagnifier === DEFAULT_A11Y_SHORTCUTS.toggleMagnifier, 'invalid string -> default');
check(r2.shortcuts.readScreen === DEFAULT_A11Y_SHORTCUTS.readScreen, 'non-string -> default');
check(r2.shortcuts.stopReading === '', "'' stays unbound");
const r3 = normalizeA11yShortcuts({ toggleCaptions: 'ctrl+alt+x', toggleMagnifier: 'Ctrl+Alt+Shift+Q', resetA11y: 'control+alt+shift+q' }, talk);
check(r3.shortcuts.toggleCaptions === '', 'collision with a talk shortcut is unbound');
check(r3.shortcuts.resetA11y === '' && r3.shortcuts.toggleMagnifier === 'Ctrl+Alt+Shift+Q', 'duplicate between actions: first wins');
check(canonicalAccelerator('Shift+Ctrl+a') === 'Ctrl+Shift+A' && canonicalAccelerator('A') === '', 'canonical form, modifier required');

// ── action -> store mapping ────────────────────────────────────────────
let state = createDefaultAccessibility();
let clock = 1_000_000;
const calls: string[] = [];
const said: string[] = [];
const registered = new Map<string, () => void>();
let refuse: string | null = null;
let saved = { ...DEFAULT_A11Y_SHORTCUTS };
const ok = (): A11yResult => ({ ok: true, state: { settings: state, profiles: [] } });
const ctl = new A11yShortcutController({
  register: (a, h) => { if (a === refuse) return false; registered.set(a, h); return true; },
  unregister: (a) => { registered.delete(a); },
  getBindings: () => saved,
  saveBindings: (b) => { saved = { ...b }; },
  reserved: () => talk,
  getState: () => state,
  now: () => clock,
  update: (u: A11yUpdate) => { calls.push(`update ${JSON.stringify(u)}`); return ok(); },
  applyProfile: (id) => {
    calls.push(`profile ${id}`);
    // A real apply returns the new settings; keep the snapshot equal to what
    // getState() still reports so the "changed?" comparison sees a change.
    return { ok: true, state: { settings: { ...state, profile: id }, profiles: [] } };
  },
  reset: () => { calls.push('reset'); return ok(); },
  readScreen: () => calls.push('readScreen'),
  stopReading: () => calls.push('stopReading'),
  openDashboard: () => calls.push('openDashboard'),
  say: (t) => said.push(t),
  changed: () => calls.push('changed'),
});

check(ctl.registerAll().length === 0 && registered.size === A11Y_SHORTCUT_ACTIONS.length, 'all 18 registered');
const press = (action: (typeof A11Y_SHORTCUT_ACTIONS)[number]) => {
  calls.length = 0; said.length = 0;
  registered.get(canonicalAccelerator(DEFAULT_A11Y_SHORTCUTS[action]))?.();
};
// canonical key used by the controller is the canonical string, but register() gets the raw one
press('toggleMagnifier');
check(calls[0] === 'update {"tiles":{"magnifier":{"enabled":true}}}' && said[0] === 'Magnifier on', 'toggleMagnifier -> updateA11y', [calls, said]);
state = createDefaultAccessibility();
press('magnifierZoomIn');
check(calls[0] === 'update {"tiles":{"magnifier":{"zoom":2.25}}}' && said.length === 0, 'zoom in steps 0.25 from default 2 and stays silent', [calls, said]);
press('magnifierZoomOut');
check(calls[0] === 'update {"tiles":{"magnifier":{"zoom":1.75}}}' && said.length === 0, 'zoom out 0.25, no speech', [calls, said]);
press('cycleColourPalette');
check(calls[0].includes('"palette":"high-contrast"') && calls[0].includes('"enabled":true'), 'palette cycles and enables the tile', calls);
press('toggleDyslexiaFont');
check(calls[0].includes('"dyslexiaFont":true') && calls[0].includes('"enabled":true'), 'aid on also enables reading aids', calls);
press('profileMotor');
check(calls.includes('profile motor') && said[0] === 'Motor profile applied', 'profile shortcut -> applyProfile', [calls, said]);
press('resetA11y');
check(calls[0] === 'reset', 'reset -> resetA11y');
press('readScreen');
check(calls[0] === 'readScreen', 'readScreen -> readScreenNow');
press('openDashboard');
check(calls[0] === 'openDashboard', 'openDashboard');

// A held key auto-repeats: one press must toggle once and speak once.
clock += 5_000;
calls.length = 0; said.length = 0;
const held = registered.get(canonicalAccelerator(DEFAULT_A11Y_SHORTCUTS.toggleCaptions))!;
held(); held(); held();
check(calls.filter((c) => c.startsWith('update')).length === 1 && said.length === 1, 'held key fires once (no toggle/announce loop)', [calls, said]);
clock += 5_000;
held();
check(calls.filter((c) => c.startsWith('update')).length === 2, 'a later press fires again', calls);

// ── rebinding, refusal, rollback ───────────────────────────────────────
refuse = 'Ctrl+Alt+Shift+Q';
const bad = ctl.setBinding('toggleCaptions', 'Ctrl+Alt+Shift+Q');
check(!bad.ok && saved.toggleCaptions === DEFAULT_A11Y_SHORTCUTS.toggleCaptions, 'OS refusal rolls back to the previous binding', bad);
check(registered.size === A11Y_SHORTCUT_ACTIONS.length, 'refusal did not drop the other shortcuts');
refuse = null;
check(!ctl.setBinding('toggleCaptions', 'Ctrl+Alt+X').ok, 'cannot take a talk shortcut');
check(!ctl.setBinding('toggleCaptions', DEFAULT_A11Y_SHORTCUTS.toggleMagnifier).ok, 'cannot duplicate another action');
check(!ctl.setBinding('nope', 'Ctrl+Alt+Shift+Q').ok && !ctl.setBinding('toggleCaptions', 'Q').ok, 'bad action / no modifier rejected');
check(ctl.setBinding('toggleCaptions', '').ok && saved.toggleCaptions === '' && registered.size === 17, 'clear unbinds');
check(ctl.setBinding('toggleCaptions', 'Ctrl+Alt+Shift+Q').ok && saved.toggleCaptions === 'Ctrl+Alt+Shift+Q', 'rebind works');

// one refusal at registration time must not break the rest
refuse = 'Ctrl+Alt+Shift+M';
const failedNow = ctl.registerAll();
check(failedNow.length === 1 && failedNow[0] === 'toggleMagnifier' && registered.size === 17, 'one failed registration leaves 17 working', failedNow);
refuse = null;
ctl.suspend();
check(registered.size === 0, 'suspend frees every key');
ctl.resume();
check(registered.size === 18, 'resume re-registers');
check(ctl.resetBindings().ok && saved.toggleCaptions === DEFAULT_A11Y_SHORTCUTS.toggleCaptions, 'reset restores defaults');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
