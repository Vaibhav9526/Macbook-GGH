/**
 * Smoke test for a11y/live-captions.ts — fake transcriber and sink.
 *
 *   bunx tsx scripts/a11y-captions-smoke.mts
 */
import { CHUNK_BYTES, LiveCaptions, MAX_UTTERANCE_BYTES, type CaptionLine } from '../src/main/services/a11y/live-captions';

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    fail++;
    console.log(`FAIL ${name}`, extra ?? '');
  }
}
const tick = () => new Promise((r) => setTimeout(r, 5));

const lines: CaptionLine[] = [];
const sizes: number[] = [];
let n = 0;
let texts = ['hello there', 'hello there', '  ', 'second line'];
const caps = new LiveCaptions({
  transcribe: async (pcm) => { sizes.push(pcm.length); return { text: texts[n++] ?? '' }; },
  emit: (l) => lines.push(l),
  now: () => 42,
});
const all = {} as never;
const opts = { enabled: true, fontSize: 24, position: 'bottom' as const };

caps.pushAudio(Buffer.alloc(CHUNK_BYTES));
await tick();
check(lines.length === 0, 'disabled: no audio consumed');

caps.apply(opts, all);
caps.pushAudio(Buffer.alloc(CHUNK_BYTES / 2));
await tick();
check(sizes.length === 0, 'under 2 s: waits');
caps.pushAudio(Buffer.alloc(CHUNK_BYTES / 2));
await tick();
check(sizes[0] === CHUNK_BYTES && lines[0]?.text === 'hello there' && lines[0].ts === 42, 'full chunk emits a line', lines);

// Odd-sized pushes carry the remainder across chunks.
caps.pushAudio(Buffer.alloc(CHUNK_BYTES * 3 + 10));
await tick(); await tick(); await tick();
check(sizes.every((s) => s === CHUNK_BYTES), 'chunks are exactly 2 s', sizes);
check(lines.length === 2 && lines[1].text === 'second line', 'duplicate and blank lines dropped', lines);

// Disabling drops buffered audio and silences late results.
caps.apply({ ...opts, enabled: false }, all);
const count = lines.length;
caps.pushAudio(Buffer.alloc(CHUNK_BYTES));
await tick();
check(lines.length === count, 'disabled again: nothing emitted');

// Whole utterances: one transcribe call each, exact size, long ones split <= cap.
sizes.length = 0; lines.length = 0; n = 0;
texts = ['short one', 'long a', 'long b'];
caps.apply({ ...opts, enabled: true }, all);
caps.pushUtterance(Buffer.alloc(33_333));
await tick();
check(sizes.length === 1 && sizes[0] === 33_333 && lines[0]?.text === 'short one', 'utterance transcribed whole, unpadded', { sizes, lines });
sizes.length = 0;
caps.pushUtterance(Buffer.alloc(MAX_UTTERANCE_BYTES + 1000));
await tick(); await tick();
check(sizes.join() === `${MAX_UTTERANCE_BYTES},1000`, 'over-long utterance splits at the provider cap', sizes);
caps.apply({ ...opts, enabled: false }, all);
sizes.length = 0;
caps.pushUtterance(Buffer.alloc(33_333));
await tick();
check(sizes.length === 0, 'utterance ignored while off');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
