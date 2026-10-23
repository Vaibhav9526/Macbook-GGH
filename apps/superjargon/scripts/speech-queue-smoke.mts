// scripts/speech-queue-smoke.mts
// run: bunx tsx scripts/speech-queue-smoke.mts
//
// Sentence-streaming TTS: splitter correctness (tags, file blocks,
// abbreviations, decimals, half-arrived tags) and queue behavior
// (ordering, first-sentence-early, prefetch bound, interruption,
// failure hand-off to the whole-text fallback). Electron-free.

import { SentenceSplitter, SpeechQueue, SpeechStream } from '../src/main/services/speech-queue';
import { finishTurn, markTurn, resetTurnTiming, summarizeTurn } from '../src/main/services/turn-timing';

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Feed text in tiny chunks (worst case for tag hold-back) and collect sentences. */
function split(text: string, size: number): string[] {
  const s = new SentenceSplitter();
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(...s.feed(text.slice(i, i + size)));
  out.push(...s.flush());
  return out;
}

// ── splitter ─────────────────────────────────────────────────────────
{
  const text = 'Click the blue button at the top. Then press enter to save it! Does that make sense?';
  const expect = [
    'Click the blue button at the top.',
    'Then press enter to save it!',
    'Does that make sense?',
  ];
  for (const size of [1, 3, 7, 1000]) {
    check(JSON.stringify(split(text, size)) === JSON.stringify(expect), `plain sentences, chunk ${size}`, split(text, size));
  }
}
{
  const out = split('Use a tool like git, e.g. for versioning your files. Version 3.5 is the latest one out there. Ask Dr. Smith about it later today.', 5);
  check(out.length === 3, 'abbreviations and decimals do not split', out);
  check(out[0].includes('e.g. for versioning'), 'e.g. kept inside sentence', out[0]);
  check(out[1].includes('3.5'), 'decimal kept', out[1]);
  check(out[2].includes('Dr. Smith'), 'Dr. kept', out[2]);
}
{
  const out = split('Here is the thing you wanted to see [POINT:120,340:save button] right over there. Then type [TYPE:hello\\] world] into the box please. [CLEAR]', 2);
  const joined = out.join(' ');
  check(!/\[|\]|POINT|TYPE|CLEAR/.test(joined), 'tags never spoken', out);
  check(out.length === 2, 'tag-bearing text still splits into 2', out);
}
{
  const s = new SentenceSplitter();
  const first = s.feed('The first sentence is long enough. And now a half tag [POIN');
  check(first.length === 1 && first[0] === 'The first sentence is long enough.', 'half-arrived tag held back', first);
  const second = s.feed('T:10,20] arrives and the sentence ends here. ');
  check(second.length === 1 && !second[0].includes('POINT'), 'tag completed then stripped', second);
}
{
  const text = 'I wrote the file for you. [FILE:notes.md]# Title\nThis line. Has sentences. And more.\n[/FILE] It is saved in your artifacts now.';
  for (const size of [1, 4, 1000]) {
    const out = split(text, size);
    check(out.join(' ') === 'I wrote the file for you. It is saved in your artifacts now.', `file block body never spoken, chunk ${size}`, out);
  }
  // Truncated reply: block never closes, its body must not be spoken on flush either.
  const trunc = split('Writing it now for you. [FILE:a.csv]a,b\n1,2', 3);
  check(trunc.join(' ') === 'Writing it now for you.', 'unclosed file block dropped', trunc);
}
{
  const out = split('Ok. Sure. This one is long enough to be its own sentence.', 4);
  check(out.length === 1 || out[0].length >= 24, 'short sentences merge forward', out);
}
{
  const out = split('1. First item here to do today\n2. Second item here to do later\n3. Third.', 6);
  check(out.length >= 2 && out.every((x) => x.length > 0), 'list lines split on newlines, numbering not a boundary', out);
}
{
  const long = 'alpha beta gamma delta, ' .repeat(12) + 'omega.';
  const s = new SentenceSplitter();
  const early = s.feed(long.slice(0, 260));
  check(early.length === 1 && early[0].length < 230, 'run-on cut at a clause break', early);
}

// ── queue ────────────────────────────────────────────────────────────
type Ev = string;
function harness(opts: {
  delays?: (i: number) => number;
  fail?: (i: number) => 'null' | 'throw' | null;
  maxInFlight?: number;
  signal?: AbortSignal;
  active?: () => boolean;
}) {
  const events: Ev[] = [];
  let inFlight = 0;
  let peak = 0;
  const texts: string[] = [];
  const t0 = Date.now();
  const stamps: Record<string, number> = {};
  const q = new SpeechQueue({
    maxInFlight: opts.maxInFlight,
    signal: opts.signal,
    isActive: opts.active ?? (() => true),
    synthesize: async (text, signal) => {
      const i = texts.push(text) - 1;
      inFlight++; peak = Math.max(peak, inFlight);
      events.push(`synth:${i}`);
      try {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, opts.delays ? opts.delays(i) : 10);
          signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
        });
        const f = opts.fail?.(i);
        if (f === 'throw') throw new Error('boom');
        if (f === 'null') return null;
        return Buffer.from(`audio:${text}`);
      } finally { inFlight--; }
    },
    play: (buf, enqueue) => {
      events.push(`play:${buf.toString().slice(6)}${enqueue ? '+q' : ''}`);
      stamps[`play${events.length}`] = Date.now() - t0;
    },
  });
  return { q, events, texts, peak: () => peak, stamps };
}

{
  // Out-of-order completion: sentence 0 is the slowest, yet plays first.
  const h = harness({ delays: (i) => [80, 10, 10][i] ?? 10 });
  h.q.push('a'); h.q.push('b'); h.q.push('c');
  const res = await h.q.close();
  const plays = h.events.filter((e) => e.startsWith('play'));
  check(JSON.stringify(plays) === JSON.stringify(['play:a', 'play:b+q', 'play:c+q']), 'strict playback order', plays);
  check(res.played === 3 && res.unspoken.length === 0, 'all played, nothing unspoken', res);
  check(h.peak() <= 2, 'prefetch depth bounded to 2 in flight', h.peak());
}
{
  // First sentence audible before the later ones are even pushed.
  const h = harness({});
  h.q.push('first');
  await sleep(40);
  check(h.events.includes('play:first'), 'first sentence plays before more text arrives', h.events);
  h.q.push('second');
  const res = await h.q.close();
  check(res.played === 2, 'late sentence still plays', res);
}
{
  // Interruption mid-flight: nothing plays after cancel, synthesis aborted.
  const ac = new AbortController();
  const h = harness({ signal: ac.signal, delays: () => 60 });
  h.q.push('a'); h.q.push('b'); h.q.push('c');
  await sleep(20);
  ac.abort();
  const res = await h.q.close();
  check(!h.events.some((e) => e.startsWith('play')), 'abort: no audio plays', h.events);
  check(res.played === 0 && res.unspoken.length === 0, 'abort: nothing to fall back on', res);
  check(!h.texts.includes('c'), 'abort: unstarted sentence never synthesized', h.texts);
}
{
  // Turn goes stale between synth and play.
  let active = true;
  const h = harness({ active: () => active, delays: () => 30 });
  h.q.push('a');
  await sleep(10);
  active = false;
  await h.q.close();
  check(!h.events.some((e) => e.startsWith('play')), 'stale turn: audio dropped', h.events);
}
{
  // Provider failure on sentence 1: 0 played, 1 and 2 handed back, order preserved.
  const h = harness({ fail: (i) => (i === 1 ? 'throw' : null) });
  h.q.push('a'); h.q.push('b'); h.q.push('c');
  const res = await h.q.close();
  check(res.played === 1, 'failure: sentences before the failure played', res);
  check(JSON.stringify(res.unspoken) === JSON.stringify(['b', 'c']), 'failure: failed + later sentences returned for fallback', res);
  check(!h.events.includes('play:c+q'), 'failure: later audio not played out of order', h.events);
}
{
  const h = harness({ fail: () => 'null' });
  h.q.push('only one');
  const res = await h.q.close();
  check(res.played === 0 && res.unspoken[0] === 'only one', 'null synthesis (no voice) falls back', res);
}

// ── stream (splitter + queue) ────────────────────────────────────────
{
  const played: string[] = [];
  let firstPlayAt = -1;
  const t0 = Date.now();
  const stream = new SpeechStream({
    isActive: () => true,
    synthesize: async (text) => { await sleep(15); return Buffer.from(text); },
    play: (b) => { if (firstPlayAt < 0) firstPlayAt = Date.now() - t0; played.push(b.toString()); },
  });
  const reply = 'Open the settings panel from the tray icon. [POINT:10,10:tray] Then toggle the voice switch. Done now.';
  const parts = reply.match(/.{1,6}/g) ?? [];
  let streamEnd = 0;
  for (const p of parts) { stream.feed(p); await sleep(8); }
  streamEnd = Date.now() - t0;
  check(firstPlayAt >= 0 && firstPlayAt < streamEnd, 'stream: first audio before the model finished', { firstPlayAt, streamEnd });
  const res = await stream.finish(reply);
  check(res.unspoken.length === 0 && !res.abandoned, 'stream: clean finish', res);
  check(!played.join(' ').includes('POINT'), 'stream: no tag audio', played);
  check(played.join(' ') === 'Open the settings panel from the tray icon. Then toggle the voice switch. Done now.', 'stream: full text in order', played);
}
{
  // Provider that never streams chunks: finish() feeds the whole text.
  const played: string[] = [];
  const stream = new SpeechStream({
    isActive: () => true,
    synthesize: async (t) => Buffer.from(t),
    play: (b) => played.push(b.toString()),
  });
  const res = await stream.finish('A reply that arrived all at once, with no chunks at all.');
  check(played.length === 1 && res.played === 1, 'stream: non-streaming provider still speaks', played);
}
{
  const stream = new SpeechStream({
    isActive: () => true,
    synthesize: async (t) => Buffer.from(t),
    play: () => { /* nothing should play */ },
  });
  stream.feed('Streamed text that was later rewritten by the provider.');
  const res = await stream.finish('Completely different final text.');
  check(res.abandoned, 'stream: mismatch with nothing played is abandoned for the old path', res);
}

// ── turn timing ──────────────────────────────────────────────────────
{
  resetTurnTiming();
  markTurn(7, 'speech-end', 1000);
  markTurn(7, 'transcript-ready', 1400);
  markTurn(7, 'first-model-chunk', 2500);
  markTurn(7, 'first-model-chunk', 9999); // first mark wins
  markTurn(7, 'playback-start', 3000);
  const line = summarizeTurn(7) ?? '';
  check(line.includes('transcript-ready=+400ms') && line.includes('first-model-chunk=+1500ms') && line.includes('total=2000ms'), 'timing: durations', line);
  check(!/[a-z]{4,} [a-z]{4,} [a-z]{4,}/.test(line.replace(/timing:.*/, '')), 'timing: no free text', line);
  finishTurn(7);
  check(summarizeTurn(7) === null, 'timing: finish forgets the turn');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
