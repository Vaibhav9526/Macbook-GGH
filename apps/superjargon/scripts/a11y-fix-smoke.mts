/**
 * Smoke test for the FIX workstream: legacy bridge (wrapper tiles + voice rate),
 * region/window capture geometry, shared caption transcripts, vision gate,
 * palette token CSS and the read-screen shortcut constant.
 *
 *   bunx tsx scripts/a11y-fix-smoke.mts
 */
import { LegacyBridge, clampRate, type LegacyState } from '../src/main/services/a11y/legacy-bridge';
import { regionAroundPoint, toImageRect, matchWindowSource } from '../src/main/services/a11y/capture-region';
import { providerSeesImages } from '../src/shared/a11y-vision';
import { A11yManager, type A11yManagerTools } from '../src/main/a11y-manager';
import { LiveCaptions } from '../src/main/services/a11y/live-captions';
import { describeReadingAids, descriptorToCss, PALETTE_TOKEN_CSS } from '../src/main/services/a11y/reading-aids';
import { createDefaultAccessibility, applyA11yUpdate } from '../src/shared/a11y-profiles';
import type { AccessibilitySettings } from '../src/shared/accessibility';

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else { fail++; console.log(`FAIL ${name}`, extra ?? ''); }
}

// -- legacy bridge ---------------------------------------------------------
function makeBridge(initialLegacy: Partial<LegacyState> = {}) {
  let a11y: AccessibilitySettings = createDefaultAccessibility();
  const legacy: LegacyState = {
    speakReplies: true, dictationEnabled: false, isClickyCursorEnabled: true, alwaysOnEnabled: false, voiceSpeed: 1,
    ...initialLegacy,
  };
  const calls: string[] = [];
  let bridge: LegacyBridge;
  const settle = () => bridge.sync(); // what the SETTINGS_CHANGED broadcast does
  bridge = new LegacyBridge({
    getA11y: () => a11y,
    getLegacy: () => ({ ...legacy }),
    updateA11y: (u) => { a11y = applyA11yUpdate(a11y, u); calls.push('a11y'); return true; },
    setSpeakReplies: (v) => { legacy.speakReplies = v; calls.push(`speak:${v}`); settle(); },
    setDictation: (v) => { legacy.dictationEnabled = v; calls.push(`dict:${v}`); settle(); },
    setCursorVisible: (v) => { legacy.isClickyCursorEnabled = v; calls.push(`cursor:${v}`); settle(); },
    setAlwaysOn: (v) => { legacy.alwaysOnEnabled = v; calls.push(`always:${v}`); settle(); },
    setVoiceSpeed: (v) => { legacy.voiceSpeed = v; calls.push(`speed:${v}`); settle(); },
    notify: () => { calls.push('notify'); },
  });
  return {
    bridge, legacy, calls,
    get a11y() { return a11y; },
    set a11y(v: AccessibilitySettings) { a11y = v; },
  };
}

{
  const h = makeBridge({ alwaysOnEnabled: true, speakReplies: false });
  h.bridge.sync();
  check(h.a11y.tiles.handsFree.enabled === true && h.a11y.tiles.voice.enabled === false,
    'first pass: legacy is truth, dashboard corrected', h.a11y.tiles);
  check(h.legacy.alwaysOnEnabled === true && h.legacy.speakReplies === false, 'first pass: legacy untouched');
}
{
  const h = makeBridge();
  h.bridge.sync();
  check(h.calls.length === 0, 'defaults agree: first pass writes nothing', h.calls);
  h.a11y = applyA11yUpdate(h.a11y, { tiles: { handsFree: { enabled: true } } });
  h.bridge.sync();
  check(h.legacy.alwaysOnEnabled === true && h.calls.includes('always:true'), 'dashboard hands-free on -> alwaysOn set', h.calls);
  h.calls.length = 0;
  h.bridge.sync();
  check(h.calls.length === 0, 'idempotent: second pass is a no-op', h.calls);
  h.legacy.alwaysOnEnabled = false; // turned off in the tray / by voice
  h.bridge.sync();
  check(h.a11y.tiles.handsFree.enabled === false, 'legacy change mirrors into the dashboard');
  h.a11y = applyA11yUpdate(h.a11y, { tiles: { dictation: { enabled: true }, voice: { enabled: false } } });
  h.bridge.sync();
  check(h.legacy.dictationEnabled === true && h.legacy.speakReplies === false, 'several tiles in one change all apply');
}
{
  const h = makeBridge();
  h.bridge.sync();
  h.a11y = applyA11yUpdate(h.a11y, { voiceRate: 1.1 });
  h.bridge.sync();
  check(h.legacy.voiceSpeed === 1.1, 'dashboard voiceRate -> voiceSpeed', h.legacy.voiceSpeed);
  // voiceSpeed is a provider speed (ElevenLabs 0.7–1.2): the dashboard's
  // 0.5–2 range is clamped at the bridge, and the clamp is stable.
  h.a11y = applyA11yUpdate(h.a11y, { voiceRate: 1.8 });
  h.bridge.sync();
  check(h.legacy.voiceSpeed === 1.2 && h.a11y.voiceRate === 1.8, 'dashboard voiceRate clamped into provider range', [h.legacy.voiceSpeed, h.a11y.voiceRate]);
  h.calls.length = 0;
  h.bridge.sync();
  check(h.calls.length === 0, 'clamped speed: next pass is a no-op', h.calls);
  h.a11y = applyA11yUpdate(h.a11y, { voiceRate: 0.5 });
  h.bridge.sync();
  check(h.legacy.voiceSpeed === 0.7, 'dashboard voiceRate clamped at the low end', h.legacy.voiceSpeed);
  h.legacy.voiceSpeed = 0.8; // "talk slower"
  h.bridge.sync();
  check(Math.abs(h.a11y.voiceRate - 0.8) < 1e-9, 'voiceSpeed -> dashboard voiceRate', h.a11y.voiceRate);
  check(clampRate(9) === 2 && clampRate(0) === 0.5 && clampRate(NaN) === 1, 'clampRate bounds');
}
{
  // Default dashboard (reset / a profile that never names voice+pointing) must
  // not switch spoken replies or the cursor off.
  const d = createDefaultAccessibility();
  check(d.tiles.voice.enabled && d.tiles.pointing.enabled && !d.tiles.handsFree.enabled && !d.tiles.dictation.enabled,
    'default tiles match the legacy defaults');
}

// -- capture geometry ------------------------------------------------------
{
  const disp = { x: 0, y: 0, width: 1536, height: 864 };
  const r = regionAroundPoint({ x: 768, y: 432 }, disp);
  check(r.x === 318 && r.y === 152 && r.width === 900 && r.height === 560, 'region centred on pointer', r);
  const corner = regionAroundPoint({ x: 5, y: 860 }, disp);
  check(corner.x === 0 && corner.y === 304 && corner.width === 900, 'region slides inside the display at a corner', corner);
  const small = regionAroundPoint({ x: 100, y: 100 }, { x: 0, y: 0, width: 400, height: 300 });
  check(small.width === 400 && small.height === 300, 'region never exceeds a small display', small);
  const sec = regionAroundPoint({ x: 2000, y: 100 }, { x: 1536, y: 0, width: 1920, height: 1080 });
  check(sec.x >= 1536 && sec.x + sec.width <= 3456, 'region respects a secondary display origin', sec);
  const ir = toImageRect(r, disp, 1568, 882);
  check(ir.x === Math.round(318 * 1568 / 1536) && ir.width <= 1568 - ir.x && ir.height <= 882 - ir.y, 'region maps into image pixels', ir);
  const wins = [{ name: 'Untitled - Notepad' }, { name: 'Calculator' }, { name: '' }];
  check(matchWindowSource(wins, 'Calculator')?.name === 'Calculator', 'window match: exact');
  check(matchWindowSource(wins, 'untitled - notepad')?.name === 'Untitled - Notepad', 'window match: case-insensitive');
  check(matchWindowSource(wins, 'Nothing here') === null && matchWindowSource(wins, '') === null, 'window match: none');
}

// -- vision gate -----------------------------------------------------------
check(!providerSeesImages('copilot-cli') && providerSeesImages('anthropic') && providerSeesImages('openai') && providerSeesImages('ollama'),
  'copilot-cli is the provider without images');

// -- shared caption transcripts --------------------------------------------
{
  const lines: string[] = [];
  const caps = new LiveCaptions({ transcribe: async () => ({ text: 'x' }), emit: (l) => lines.push(l.text) });
  caps.pushText('ignored while off');
  caps.apply({ enabled: true, fontSize: 24, position: 'bottom' });
  caps.pushText('  hello there  ');
  caps.pushText('hello there');
  caps.pushText('');
  check(lines.length === 1 && lines[0] === 'hello there', 'pushText trims, dedupes, ignores empty/off', lines);

  const pushedAudio: number[] = [];
  const texts: string[] = [];
  const mk = (id: string, extra: object) => ({ id, apply: () => {}, dispose: () => {}, ...extra });
  const tools = {
    screenReader: mk('screenReader', { readNow: async () => '' }),
    captions: mk('captions', { pushAudio: () => {}, pushUtterance: (b: Buffer) => pushedAudio.push(b.length), pushText: (t: string) => texts.push(t) }),
    magnifier: mk('magnifier', {}),
    readingAids: mk('readingAids', {}),
  } as unknown as A11yManagerTools;
  let s = createDefaultAccessibility();
  s = applyA11yUpdate(s, { tiles: { captions: { enabled: true } } });
  let beforeSyncs = 0;
  const m = new A11yManager({
    tools, getSettings: () => s, onCaptionOptions: () => {}, onCaptionsActive: () => {},
    beforeSync: () => { beforeSyncs++; },
    setTimeout: () => 0, clearTimeout: () => {},
  });
  m.sync();
  check(beforeSyncs === 1, 'beforeSync runs on sync');
  const utt = Buffer.alloc(32_000);
  m.pushUtterance(utt, true);
  check(pushedAudio.length === 0, 'admitted utterance is not transcribed a second time');
  check(m.takeSharedTranscript(utt, 'the shared text') && texts[0] === 'the shared text', 'shared transcript reaches captions');
  check(!m.takeSharedTranscript(utt, 'again'), 'a transcript is taken once');
  m.pushUtterance(Buffer.alloc(32_000), false);
  check(pushedAudio.length === 1, 'unadmitted utterance still goes through the caption transcriber');
  const other = Buffer.alloc(100);
  check(!m.takeSharedTranscript(other, 'stranger'), 'unknown buffer is not routed');
}

// -- palette tokens --------------------------------------------------------
{
  const hc = descriptorToCss(describeReadingAids({ enabled: true, palette: 'high-contrast', dyslexiaFont: false, readingRuler: false, reducedMotion: false }));
  const def = descriptorToCss(describeReadingAids({ enabled: true, palette: 'default', dyslexiaFont: false, readingRuler: false, reducedMotion: false }));
  check(hc.includes(PALETTE_TOKEN_CSS) && hc.includes('--bg-base:var(--a11y-bg)') && hc.includes('.a11y-dash'), 'palette re-points design tokens and dashboard tokens');
  check(!def.includes('--bg-base'), 'default palette leaves the design tokens alone');
}


console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
