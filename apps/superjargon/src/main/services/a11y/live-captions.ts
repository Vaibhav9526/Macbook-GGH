import type { AccessibilitySettings, A11yTool } from '../../../shared/accessibility';

/**
 * Live captions: rolling ~2 s PCM16 (mono, 16 kHz) chunks → transcribe →
 * caption lines. Zero Electron deps; the transcriber (transcribeWith bound
 * to the user's provider) and the line sink are injected. Chunks transcribe
 * strictly in order so lines never swap.
 */

export interface CaptionLine {
  text: string;
  /** ms epoch the chunk finished transcribing. */
  ts: number;
}

export interface LiveCaptionsDeps {
  transcribe: (pcm: Buffer) => Promise<{ text: string }>;
  emit: (line: CaptionLine) => void;
  onError?: (message: string) => void;
  now?: () => number;
}

/** 16 kHz × 2 bytes × 2 s. */
export const CHUNK_BYTES = 64_000;
/** Chunks waiting on a slow provider before the oldest is dropped —
 *  captions that lag behind speech are worse than a gap. */
const MAX_BACKLOG = 2;
/** A whole VAD utterance is one transcription job, up to this size (~25 s;
 *  providers refuse past ~30 s). Longer speech splits into segments. */
export const MAX_UTTERANCE_BYTES = 800_000;
/** Utterances waiting on a slow provider (each is real speech, so the
 *  backlog is deeper than for rolling chunks). */
const MAX_UTTERANCE_BACKLOG = 6;

export class LiveCaptions implements A11yTool<'captions'> {
  readonly id = 'captions' as const;
  private enabled = false;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private queue: Buffer[] = [];
  private draining = false;
  private gen = 0;
  private lastText = '';

  constructor(private readonly deps: LiveCaptionsDeps) {}

  apply(options: AccessibilitySettings['tiles']['captions']): void {
    this.setEnabled(options.enabled);
  }

  /** A line transcribed elsewhere (the always-on pipeline); same dedupe and
   *  gen rules as a chunk we transcribed ourselves. */
  pushText(text: string): void {
    const line = text.trim();
    if (!this.enabled || !line || line === this.lastText) return;
    this.lastText = line;
    this.deps.emit({ text: line, ts: (this.deps.now ?? Date.now)() });
  }

  /** Feed raw PCM16 from the mic tap; no-op while captions are off. */
  pushAudio(pcm: Buffer | Uint8Array): void {
    if (!this.enabled) return;
    const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    this.pending.push(buf);
    this.pendingBytes += buf.length;
    while (this.pendingBytes >= CHUNK_BYTES) {
      const all = Buffer.concat(this.pending);
      this.enqueue(all.subarray(0, CHUNK_BYTES));
      const rest = all.subarray(CHUNK_BYTES);
      this.pending = rest.length ? [rest] : [];
      this.pendingBytes = rest.length;
    }
  }

  /** One finished utterance (PCM16 mono 16 kHz), transcribed whole: no silence
   *  padding and no mid-word cuts. */
  pushUtterance(pcm: Buffer | Uint8Array): void {
    if (!this.enabled) return;
    const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    for (let i = 0; i < buf.length; i += MAX_UTTERANCE_BYTES) {
      this.queue.push(buf.subarray(i, i + MAX_UTTERANCE_BYTES));
    }
    while (this.queue.length > MAX_UTTERANCE_BACKLOG) this.queue.shift();
    void this.drain();
  }

  dispose(): void {
    this.setEnabled(false);
  }

  private setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) {
      this.gen++;
      this.pending = [];
      this.pendingBytes = 0;
      this.queue = [];
      this.lastText = '';
    }
  }

  private enqueue(chunk: Buffer): void {
    this.queue.push(chunk);
    while (this.queue.length > MAX_BACKLOG) this.queue.shift();
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const chunk = this.queue.shift() as Buffer;
        const gen = this.gen;
        try {
          const { text } = await this.deps.transcribe(chunk);
          const line = text.trim();
          // gen check: a chunk finishing after disable must not emit.
          if (gen !== this.gen || !line || line === this.lastText) continue;
          this.lastText = line;
          this.deps.emit({ text: line, ts: (this.deps.now ?? Date.now)() });
        } catch (err) {
          if (gen === this.gen) {
            this.deps.onError?.(err instanceof Error ? err.message : 'captions failed');
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
