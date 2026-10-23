/**
 * Smoke test for the transcription language setting (English / Hindi / Auto).
 *
 * Bun-ONLY (needs the electron stub for the settings + key stores):
 *   bun --preload ./scripts/store-preload.ts ./scripts/transcription-smoke.mts
 * Under any other runner it prints SKIP and exits 0.
 *
 * fetch is replaced with a recorder, so no network call is made; every
 * assertion is about the multipart request we WOULD have sent to Whisper.
 *
 * Covers:
 *  a) default is English and the request pins language=en
 *  b) Hindi pins language=hi and the prompt carries Devanagari + the Latin brand
 *  c) Auto omits the language field entirely
 *  d) the English-only distil model is swapped for large-v3 when not English
 *  e) the OpenAI provider forwards the language too
 *  f) a junk stored language falls back to en on the wire
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
  console.log('SKIP transcription language :: requires bun --preload store-preload.ts');
  console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-transcription-smoke-'));
process.env.SUPERJARGON_SMOKE_USERDATA = tmp;

const settingsStore = await import('../src/main/services/settings-store');
const keyStore = await import('../src/main/services/key-store');
const { GroqWhisperProvider, OpenAIWhisperProvider, whisperLanguageCode, vocabPrompt } =
  await import('../src/main/services/transcription');

keyStore.setApiKey('groq', 'gsk_test');
keyStore.setApiKey('openai', 'sk-test');

interface Sent { url: string; form: FormData }
const sent: Sent[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  sent.push({ url: String(url), form: init.body as FormData });
  return new Response(JSON.stringify({ text: 'ok' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof fetch;

// 0.5 s of 16 kHz mono PCM16 silence — above the 150 ms accidental-tap floor.
const pcm = Buffer.alloc(16000);
const field = (s: Sent | undefined, k: string): string | null => {
  const v = s?.form.get(k);
  return typeof v === 'string' ? v : null;
};
const last = (): Sent | undefined => sent[sent.length - 1];

try {
  // a) default
  check(settingsStore.get('transcriptionLanguage') === 'en', 'default: transcriptionLanguage is en');
  await new GroqWhisperProvider().transcribe(pcm);
  check(field(last(), 'language') === 'en', 'groq/en: request pins language=en', field(last(), 'language'));
  check(!/[ऀ-ॿ]/.test(field(last(), 'prompt') ?? ''), 'groq/en: prompt has no Devanagari');

  // b) Hindi
  settingsStore.set('transcriptionLanguage', 'hi');
  await new GroqWhisperProvider().transcribe(pcm);
  check(field(last(), 'language') === 'hi', 'groq/hi: request pins language=hi', field(last(), 'language'));
  const hiPrompt = field(last(), 'prompt') ?? '';
  check(/[ऀ-ॿ]/.test(hiPrompt), 'groq/hi: prompt carries Devanagari command words');
  check(hiPrompt.includes('SuperJargon'), 'groq/hi: brand stays in Latin script for the wake matchers');

  // c) Auto
  settingsStore.set('transcriptionLanguage', 'auto');
  await new GroqWhisperProvider().transcribe(pcm);
  check(field(last(), 'language') === null, 'groq/auto: no language field (Whisper detects)');
  check((field(last(), 'prompt') ?? '').includes('click'), 'groq/auto: prompt also has the English vocabulary');

  // d) English-only distil model must not be used for non-English
  settingsStore.set('groqTranscriptionModel', 'distil-whisper-large-v3-en');
  settingsStore.set('transcriptionLanguage', 'hi');
  await new GroqWhisperProvider().transcribe(pcm);
  check(field(last(), 'model') === 'whisper-large-v3', 'groq/hi: distil-en swapped for large-v3', field(last(), 'model'));
  settingsStore.set('transcriptionLanguage', 'en');
  await new GroqWhisperProvider().transcribe(pcm);
  check(field(last(), 'model') === 'distil-whisper-large-v3-en', 'groq/en: distil-en still allowed', field(last(), 'model'));

  // e) OpenAI
  settingsStore.set('transcriptionLanguage', 'hi');
  await new OpenAIWhisperProvider().transcribe(pcm);
  check(field(last(), 'language') === 'hi', 'openai/hi: language forwarded', field(last(), 'language'));
  settingsStore.set('transcriptionLanguage', 'auto');
  await new OpenAIWhisperProvider().transcribe(pcm);
  check(field(last(), 'language') === null, 'openai/auto: no language field');

  // f) junk value
  check(whisperLanguageCode('fr' as never) === 'en', 'junk language code falls back to en');
  check(vocabPrompt('en').length > 0 && vocabPrompt('hi').length > 0, 'vocabPrompt returns text for each language');
} finally {
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail ? 1 : 0);
