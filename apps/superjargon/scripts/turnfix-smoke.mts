/**
 * Smoke test for the turn-pipeline review fixes in companion-manager.ts:
 *  a) agent mode is refused (spoken + shown) when the Mind provider can't
 *     see screenshots (copilot-cli) — no run starts, and the agent-mode
 *     streamMind backstop errors instead of calling the provider
 *  b) explicit agent utterances bypass the settings assistant
 *  c) a failed streamed-reply remainder never falls back to the OS voice
 *     (it would overlap the MP3 sentences already queued)
 *  d) screen-reader speech holds voice state 'responding' so the always-on
 *     gate drops what the mic hears, and releases it on stop
 *  e) a PTT press fires onTurnStart (main wires it to the screen reader stop)
 *  f) describeScreenshot uses a fresh session key per read and disposes it
 *  g) [POINT]/draw scene cues are dropped for a provider that can't see
 *
 * Bun-ONLY (uses the companion electron+nut-js stub):
 *   bun --preload ./scripts/companion-stub-preload.ts ./scripts/turnfix-smoke.mts
 * Under any other runner it prints SKIP lines and exits 0.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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

if (typeof Bun === 'undefined') {
  skipped++;
  console.log('SKIP turnfix: all cases :: requires bun --preload companion stub');
  console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-turnfix-'));
process.env.SUPERJARGON_SMOKE_USERDATA = tmp;

const { CompanionManager, AGENT_NO_VISION_MESSAGE } = await import('../src/main/companion-manager');
const settingsStore = await import('../src/main/services/settings-store');
const keyStore = await import('../src/main/services/key-store');
import type { FlickySettings, ScreenCapture, VoiceState, Scene } from '../src/shared/types';

const completes: string[] = [];
const speakTexts: string[] = [];
const voiceStates: VoiceState[] = [];
const scenes: Array<Scene | null> = [];

const mgr = new CompanionManager({
  onVoiceStateChanged: (s) => voiceStates.push(s),
  onTranscriptUpdate: () => {},
  onAiResponseChunk: () => {},
  onAiResponseComplete: (t) => completes.push(t),
  onError: () => {},
  onScene: (s) => scenes.push(s),
  onSceneCue: () => {},
  onAgentStatus: () => {},
  onAgentAction: () => {},
  onTypeFulfilled: () => {},
  onSettingsChanged: (_s: FlickySettings) => {},
  onMemoryStatsChanged: () => {},
  onChatEntryAdded: () => {},
  onStartAudioCapture: () => {},
  onStopAudioCapture: () => {},
  onPlayAudio: () => {},
  onStopAudio: () => {},
  onCursorVisibilityChanged: () => {},
  onStreamVisibilityChanged: () => {},
  onSpeakText: (text) => speakTexts.push(text),
});
mgr.stopRoutines();

type MindCb = { onChunk: (t: string) => void; onComplete: (t: string) => void; onError: (e: Error) => void };
type Priv = {
  processUserText: (text: string, opts?: { cameFromPtt?: boolean }) => Promise<void>;
  orchestrator: { runTask: (agentId: string, task: string) => Promise<void> };
  settingsAssistant: { deps: { complete: (p: string, s: AbortSignal) => Promise<string> } };
  buildAgentDeps: (id: string) => {
    streamMind: (p: string, s: ScreenCapture[], h: unknown[], mode: 'talk' | 'agent', sig: AbortSignal, cb: MindCb) => Promise<void>;
  };
  completeTalkTurn: (
    userText: string, fullText: string, usage: undefined, isCurrent: () => boolean, turnId: number,
    agentId?: string, announce?: boolean,
    speech?: { finish: (t: string) => Promise<{ played: number; unspoken: string[]; abandoned: boolean }>; cancel: () => void } | null,
  ) => Promise<void>;
  fishTts: { synthesize: (t: string, o: unknown) => Promise<Buffer | null> };
  claudeCli: { streamChat: (...a: unknown[]) => Promise<void>; disposeSession: (k: string) => void };
  claude: { streamChat: (...a: unknown[]) => Promise<void> };
  voiceState: VoiceState;
  turnId: number;
  lastScreenshots: ScreenCapture[];
};
const priv = mgr as unknown as Priv;

const runs: Array<{ agentId: string; task: string }> = [];
priv.orchestrator.runTask = async (agentId, task) => {
  runs.push({ agentId, task });
};
let assistantCalls = 0;
priv.settingsAssistant.deps.complete = async () => {
  assistantCalls++;
  return 'NONE';
};

function baseline(): void {
  settingsStore.set('agentEnabled', true);
  settingsStore.set('dictationEnabled', false);
  settingsStore.set('alwaysOnEnabled', false);
  settingsStore.set('speakReplies', true);
  settingsStore.set('mindProvider', 'anthropic');
  runs.length = 0;
  completes.length = 0;
  speakTexts.length = 0;
  assistantCalls = 0;
}

// ── a) agent refusal on a provider that can't see ──────────────────────
{
  baseline();
  settingsStore.set('mindProvider', 'copilot-cli');
  await priv.processUserText('superjargon agent open notepad and click save', { cameFromPtt: true });
  check(runs.length === 0, 'agent refused on copilot-cli: no run started', runs);
  check(completes.includes(AGENT_NO_VISION_MESSAGE), 'agent refused: explanation shown in chat', completes);
  check(speakTexts.some((t) => t.includes('agent mode needs')), 'agent refused: explanation spoken', speakTexts);
  check(priv.voiceState === 'idle', 'agent refused: voice back to idle', priv.voiceState);

  runs.length = 0;
  await priv.processUserText('open notepad', { cameFromPtt: true });
  check(runs.length === 0, 'agent refused: bare PTT imperative too', runs);

  // Backstop: the agent-mode stream itself refuses without touching a provider.
  let providerCalled = false;
  const realClaude = priv.claude.streamChat;
  priv.claude.streamChat = async () => {
    providerCalled = true;
  };
  let err: Error | null = null;
  await priv.buildAgentDeps('main').streamMind('click save', [], [], 'agent', new AbortController().signal, {
    onChunk: () => {},
    onComplete: () => {},
    onError: (e) => {
      err = e;
    },
  });
  check(err !== null && !providerCalled, 'agent streamMind backstop: errors, no provider call', String(err));
  priv.claude.streamChat = realClaude;

  baseline();
  await priv.processUserText('superjargon agent open notepad', { cameFromPtt: true });
  check(runs.length === 1 && runs[0].task === 'open notepad', 'vision provider: agent run starts', runs);
}

// ── b) agent utterances bypass the settings assistant ──────────────────
{
  baseline();
  await priv.processUserText('superjargon agent zoom into the map', { cameFromPtt: true });
  check(assistantCalls === 0, 'agent utterance: settings assistant never called', assistantCalls);
  check(runs.length === 1 && runs[0].task === 'zoom into the map', 'agent utterance: routed to the agent loop', runs);
  baseline();
  await priv.processUserText('undo', { cameFromPtt: true });
  check(assistantCalls === 0 && !completes.some((c) => /nothing to undo/i.test(c)), 'bare undo with empty stack not consumed', completes);
}

// ── c) streamed remainder: no OS-voice fallback over queued MP3s ───────
{
  baseline();
  settingsStore.set('ttsProvider', 'fishaudio');
  keyStore.setApiKey('fishaudio', 'smoke-fake-key');
  priv.fishTts = {
    synthesize: async () => {
      throw new Error('402 insufficient credit');
    },
  };
  const speech = {
    finish: async () => ({ played: 2, unspoken: ['and the rest.'], abandoned: false }),
    cancel: () => {},
  };
  const id = ++priv.turnId;
  await priv.completeTalkTurn('hi', 'first. second. and the rest.', undefined, () => priv.turnId === id, id, 'main', false, speech);
  check(speakTexts.length === 0, 'streamed remainder failure: OS voice not started over the queue', speakTexts);

  // Nothing streamed yet → the whole-text path keeps its OS-voice fallback.
  const none = { finish: async () => ({ played: 0, unspoken: ['whole reply.'], abandoned: false }), cancel: () => {} };
  const id2 = ++priv.turnId;
  await priv.completeTalkTurn('hi', 'whole reply.', undefined, () => priv.turnId === id2, id2, 'main', false, none);
  check(speakTexts.includes('whole reply.'), 'nothing played: OS-voice fallback still speaks', speakTexts);
}

// ── d) screen-reader speech gates the always-on mic ────────────────────
{
  baseline();
  settingsStore.set('alwaysOnEnabled', true);
  mgr.beginAssistiveSpeech('button: Save. heading: SuperJargon settings', 1);
  check(priv.voiceState === 'responding', 'assistive speech: voice state responding', priv.voiceState);
  const admitted = mgr.handleVadUtterance(Buffer.alloc(3200));
  check(admitted === false, 'assistive speech: VAD utterance dropped (mic hears the reader)');
  mgr.endAssistiveSpeech();
  check(priv.voiceState === 'idle', 'assistive speech stop: voice state released', priv.voiceState);
  // A live turn's state is never claimed.
  priv.voiceState = 'processing';
  mgr.beginAssistiveSpeech('text', 1);
  check(priv.voiceState === 'processing', 'assistive speech: never claims a busy pipeline');
  mgr.endAssistiveSpeech();
  check(priv.voiceState === 'processing', 'assistive speech: release leaves a busy pipeline alone');
  priv.voiceState = 'idle';
  settingsStore.set('alwaysOnEnabled', false);
}

// ── e) PTT press fires onTurnStart ─────────────────────────────────────
{
  baseline();
  let fired = 0;
  mgr.onTurnStart = () => {
    fired++;
  };
  await mgr.startPushToTalk();
  check(fired === 1, 'PTT press: onTurnStart fired (screen reader stop hook)', fired);
  mgr.resetFromMicError();
  mgr.onTurnStart = undefined;
}

// ── f) describeScreenshot: fresh session per read, disposed after ──────
{
  baseline();
  settingsStore.set('mindProvider', 'claude-cli');
  const keys: string[] = [];
  const disposed: string[] = [];
  priv.claudeCli = {
    streamChat: async (...a: unknown[]) => {
      const opts = a[4] as { sessionKey?: string };
      const cb = a[5] as MindCb;
      keys.push(opts.sessionKey ?? '');
      cb.onComplete('button: Save [POINT:10,10:save]');
    },
    disposeSession: (k: string) => {
      disposed.push(k);
    },
  };
  const shot = { imageData: '', mediaType: 'image/jpeg', width: 1, height: 1 } as unknown as ScreenCapture;
  const t1 = await mgr.describeScreenshot('read', shot, new AbortController().signal);
  await mgr.describeScreenshot('read', shot, new AbortController().signal);
  check(t1 === 'button: Save', 'describe: tags stripped', t1);
  check(keys.length === 2 && keys[0] !== keys[1], 'describe: a fresh session key per read', keys);
  check(disposed.includes(keys[0]) && disposed.includes(keys[1]), 'describe: each one-shot session disposed', disposed);
}

// ── g) scene cues dropped when the provider can't see ──────────────────
{
  baseline();
  settingsStore.set('speakReplies', false);
  const shot: ScreenCapture = {
    dataBase64: '',
    displayId: 7,
    imageWidth: 960,
    imageHeight: 540,
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    isCursorScreen: true,
  };
  const reply = 'the save button lives [POINT:640,380:Save:screen0]';
  // Control: a vision provider draws the scene from the same reply.
  priv.lastScreenshots = [shot];
  scenes.length = 0;
  const id0 = ++priv.turnId;
  await priv.completeTalkTurn('where is save', reply, undefined, () => priv.turnId === id0, id0);
  check(scenes.some((s) => s !== null), 'vision provider: scene drawn (control)', scenes.length);

  settingsStore.set('mindProvider', 'copilot-cli');
  priv.lastScreenshots = [shot];
  scenes.length = 0;
  const id = ++priv.turnId;
  await priv.completeTalkTurn('where is save', reply, undefined, () => priv.turnId === id, id);
  check(!scenes.some((s) => s !== null), 'copilot-cli: no scene drawn from guessed coordinates', scenes);
  ++priv.turnId; // fence the control scene's timers
}

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* ignore */
}
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail > 0 ? 1 : 0);
