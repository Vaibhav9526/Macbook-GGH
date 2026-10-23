/**
 * Sentence-streaming TTS, Electron-free and injectable.
 *
 * The talk turn used to wait for the whole model reply, synthesize it as
 * one request, and only then play. Here the raw model chunks are fed in as
 * they arrive; complete sentences are cut out of the tag-stripped text and
 * handed to the synthesizer immediately, so the first sentence is audible
 * while the model is still writing the rest.
 *
 * Two pieces:
 *   SentenceSplitter  raw chunks → speakable sentences (never DSL tags,
 *                     never file-block bodies, never a half-arrived tag).
 *   SpeechQueue       sentences → synthesize (bounded look-ahead) → play,
 *                     strictly in order, cancellable.
 */
import { TAG_STRIP_REGEX } from './element-detector';

// A sentence shorter than this is merged into the next one: "Sure." as its
// own request costs a full round trip for half a second of audio and
// makes the voice choppy.
const MIN_CHARS = 24;
// Past this with no terminator (a long list or run-on) cut at a clause
// break instead of waiting for the model to finish the thought.
const MAX_CHARS = 220;
const MIN_CLAUSE_CHARS = 60;
// An unclosed '[' this far back is prose, not a tag still arriving.
const MAX_TAG_HOLD = 400;

// Lowercase, dots included, token directly before a '.'. A period after
// one of these is not a sentence end.
const ABBREVIATIONS = new Set([
  'e.g', 'i.e', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'no', 'approx', 'inc', 'ltd', 'co', 'fig', 'u.s', 'a.m', 'p.m', 'eg', 'ie',
]);

/**
 * Index where raw text can be trusted to be final under TAG_STRIP_REGEX:
 * everything before an unterminated tag or an unclosed FILE block is held
 * back, because those still-arriving bytes would be spoken as prose
 * otherwise (the regex only drops a tag once its closing bracket exists).
 */
function safeRawEnd(raw: string): number {
  let end = raw.length;
  const fileOpen = raw.lastIndexOf('[FILE:');
  if (fileOpen >= 0 && raw.indexOf('[/FILE]', fileOpen) < 0) end = Math.min(end, fileOpen);

  const open = raw.lastIndexOf('[');
  if (open >= 0 && open < end && raw.length - open < MAX_TAG_HOLD) {
    // Backslash escapes the next char, so an escaped ']' does not close a tag.
    let closed = false;
    for (let i = open + 1; i < raw.length; i++) {
      if (raw[i] === '\\') { i++; continue; }
      if (raw[i] === ']') { closed = true; break; }
    }
    if (!closed) end = Math.min(end, open);
  }
  return end;
}

function stripTags(raw: string): string {
  return raw.replace(TAG_STRIP_REGEX, '');
}

function speakable(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Offset just past the first sentence in `text`, or -1 if none is complete. */
function nextBoundary(text: string, final: boolean): number {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') {
      // A line break ends a unit even without punctuation (list items,
      // headings) — but not a blank leading line.
      if (text.slice(0, i).trim()) return i + 1;
      continue;
    }
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue;
    // Swallow a run of terminators and trailing closers: `?!"`, `.)`.
    let j = i + 1;
    while (j < text.length && /[.!?…"'”’)\]]/.test(text[j])) j++;
    if (j >= text.length) {
      // Terminator at the very end: the next chunk may continue it
      // ("3." → "3.5"), so only a final flush may accept it.
      if (final) return j;
      return -1;
    }
    if (!/\s/.test(text[j])) { i = j - 1; continue; } // "3.5", "e.g", "a.b"

    if (c === '.') {
      const before = text.slice(0, i).match(/([A-Za-z](?:[A-Za-z.]*[A-Za-z])?|\d+)$/);
      const token = before ? before[1] : '';
      const lower = token.toLowerCase();
      if (/^\d+$/.test(token)) { i = j - 1; continue; } // "1. First item"
      if (token.length === 1 && /[A-Z]/.test(token)) { i = j - 1; continue; } // initial
      if (ABBREVIATIONS.has(lower)) { i = j - 1; continue; }
      if (lower === 'etc') {
        // "etc." ends the sentence only when a new one visibly starts.
        const rest = text.slice(j).trimStart();
        if (!rest) { if (final) return j; return -1; }
        if (!/[A-Z]/.test(rest[0])) { i = j - 1; continue; }
      }
    }
    return j;
  }
  if (!final && text.length > MAX_CHARS) {
    const head = text.slice(0, MAX_CHARS);
    const m = [...head.matchAll(/[,;:—–]\s/g)].pop();
    if (m && m.index !== undefined && m.index + 1 >= MIN_CLAUSE_CHARS) return m.index + 2;
  }
  return -1;
}

export class SentenceSplitter {
  private raw = '';
  /** Chars of the tag-stripped text already turned into sentences. */
  private consumed = 0;
  /** Cut sentences too short to speak alone, waiting to merge with the next. */
  private carry = '';

  /** Everything fed so far (the caller reconciles it against the final text). */
  get fed(): string { return this.raw; }

  feed(chunk: string): string[] {
    this.raw += chunk;
    return this.drain(stripTags(this.raw.slice(0, safeRawEnd(this.raw))), false);
  }

  /** Release held-back text; call once the reply is complete. */
  flush(): string[] {
    return this.drain(stripTags(this.raw), true);
  }

  private drain(clean: string, final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const rest = clean.slice(this.consumed);
      const end = rest ? nextBoundary(rest, final) : -1;
      if (end < 0) break;
      this.consumed += end;
      this.carry += rest.slice(0, end);
      if (speakable(this.carry).length >= MIN_CHARS) this.take(out);
    }
    if (final) {
      this.carry += clean.slice(this.consumed);
      this.consumed = clean.length;
      this.take(out);
    }
    return out;
  }

  private take(out: string[]): void {
    const s = speakable(this.carry);
    this.carry = '';
    // Punctuation-only scraps ("...", "—") are not worth a request.
    if (/[\p{L}\p{N}]/u.test(s)) out.push(s);
  }
}

export interface SpeechQueueDeps {
  /** Resolve audio, or null when the provider cannot speak this text. May throw. */
  synthesize: (text: string, signal: AbortSignal) => Promise<Buffer | null>;
  /** Hand a finished buffer to playback. `enqueue` is false only for the first one. */
  play: (audio: Buffer, enqueue: boolean) => void;
  /** False once the owning turn was superseded; nothing more may play. */
  isActive: () => boolean;
  /** Turn-level abort (PTT interrupt) — cancels the queue when it fires. */
  signal?: AbortSignal;
  /** Synths allowed in flight at once: 1 playing-ahead + 1 next = 2. */
  maxInFlight?: number;
  onSynthStart?: (index: number) => void;
  onAudio?: (index: number) => void;
  onPlay?: (index: number) => void;
}

export interface SpeechQueueResult {
  /** Sentences that were never played (a failed synthesis and everything after it). */
  unspoken: string[];
  /** How many sentences reached playback. */
  played: number;
}

interface Item {
  text: string;
  promise: Promise<Buffer | null> | null;
}

export class SpeechQueue {
  private items: Item[] = [];
  private nextStart = 0;
  private nextPlay = 0;
  private inFlight = 0;
  private closed = false;
  private cancelled = false;
  private failedAt = -1;
  private played = 0;
  private draining: Promise<void> | null = null;
  private readonly abort = new AbortController();
  private readonly maxInFlight: number;

  constructor(private readonly deps: SpeechQueueDeps) {
    this.maxInFlight = Math.max(1, deps.maxInFlight ?? 2);
    if (deps.signal) {
      if (deps.signal.aborted) this.cancel();
      else deps.signal.addEventListener('abort', () => this.cancel(), { once: true });
    }
  }

  push(text: string): void {
    if (this.closed || this.cancelled) return;
    this.items.push({ text, promise: null });
    this.startMore();
    this.kick();
  }

  /** No more sentences: resolves once everything queued has been handed to playback. */
  async close(): Promise<SpeechQueueResult> {
    this.closed = true;
    this.kick();
    while (this.draining) await this.draining;
    const unspoken =
      this.failedAt >= 0 && !this.cancelled ? this.items.slice(this.failedAt).map((i) => i.text) : [];
    return { unspoken, played: this.played };
  }

  /** Drop queued text and abort pending synthesis. Idempotent. */
  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.abort.abort();
  }

  get isCancelled(): boolean { return this.cancelled; }

  /** True once any sentence has been sent to the synthesizer. */
  get started(): boolean { return this.nextStart > 0; }

  private startMore(): void {
    while (
      !this.cancelled &&
      this.failedAt < 0 &&
      this.inFlight < this.maxInFlight &&
      this.nextStart < this.items.length
    ) {
      const index = this.nextStart++;
      const item = this.items[index];
      this.inFlight++;
      this.deps.onSynthStart?.(index);
      item.promise = this.deps
        .synthesize(item.text, this.abort.signal)
        .catch((err) => {
          // A cancelled request rejecting is the cancel working.
          if (!this.cancelled) console.warn('[SuperJargon] sentence TTS failed:', err);
          return null;
        })
        .finally(() => {
          this.inFlight--;
          this.startMore();
        });
    }
  }

  private kick(): void {
    if (this.draining) return;
    this.draining = this.run().finally(() => {
      this.draining = null;
      if (!this.cancelled && this.failedAt < 0 && this.nextPlay < this.items.length) this.kick();
    });
  }

  private async run(): Promise<void> {
    while (this.nextPlay < this.items.length && !this.cancelled && this.failedAt < 0) {
      const index = this.nextPlay;
      const audio = await this.items[index].promise;
      if (this.cancelled || !this.deps.isActive()) { this.cancel(); return; }
      if (!audio || audio.length === 0) {
        // Everything from here on goes to the caller's whole-text fallback;
        // later sentences already in flight are discarded to keep order.
        this.failedAt = index;
        this.abort.abort();
        return;
      }
      this.deps.onAudio?.(index);
      this.deps.play(audio, index > 0);
      this.deps.onPlay?.(index);
      this.played++;
      this.nextPlay++;
      this.startMore();
    }
  }
}

export interface SpeechStreamResult extends SpeechQueueResult {
  /** True when the model text never matched what was streamed and nothing played. */
  abandoned: boolean;
}

/** Splitter + queue wired together: the object a talk turn holds. */
export class SpeechStream {
  private readonly splitter = new SentenceSplitter();
  private readonly queue: SpeechQueue;

  constructor(deps: SpeechQueueDeps) {
    this.queue = new SpeechQueue(deps);
  }

  feed(chunk: string): void {
    for (const s of this.splitter.feed(chunk)) this.queue.push(s);
  }

  cancel(): void {
    this.queue.cancel();
  }

  /**
   * The reply is complete. `fullText` is the provider's final text: any
   * suffix the chunk stream missed (providers that do not stream, or drop
   * a last delta) is fed first. If it disagrees with what was streamed and
   * nothing has played yet, abandon so the caller speaks it the old way.
   */
  async finish(fullText: string): Promise<SpeechStreamResult> {
    const fed = this.splitter.fed;
    if (!fullText.startsWith(fed)) {
      // Streamed chunks disagree with the final text. If no audio has been
      // requested yet nothing was said wrong, so let the caller speak the
      // authoritative text the old way; otherwise finish what was started.
      if (!this.queue.started) {
        this.queue.cancel();
        return { unspoken: [], played: 0, abandoned: true };
      }
    } else {
      this.feed(fullText.slice(fed.length));
    }
    for (const s of this.splitter.flush()) this.queue.push(s);
    const res = await this.queue.close();
    return { ...res, abandoned: false };
  }
}
