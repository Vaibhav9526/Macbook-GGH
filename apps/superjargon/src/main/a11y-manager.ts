import type { A11yTool, AccessibilitySettings, CaptionsOptions } from '../shared/accessibility';

/**
 * Glue between the dashboard settings and the four tool services. Electron
 * free on purpose (the real deps are built in a11y-wiring.ts) so the smoke
 * test can drive it with fakes under plain tsx.
 *
 * `sync()` is the only entry point settings changes need: it re-applies a
 * tile only when that tile's options actually changed, so the 30 Hz
 * stream-bounds SETTINGS_CHANGED storm costs one JSON compare per tile.
 */

export interface A11yManagerTools {
  screenReader: A11yTool<'screenReader'> & { readNow(): Promise<string>; stop?(): void };
  captions: A11yTool<'captions'> & { pushAudio(pcm: Buffer): void; pushUtterance(pcm: Buffer): void; pushText?(text: string): void };
  magnifier: A11yTool<'magnifier'>;
  readingAids: A11yTool<'readingAids'>;
}

export interface A11yManagerDeps {
  tools: A11yManagerTools;
  getSettings(): AccessibilitySettings;
  /** Runs at the top of every sync(): keeps the wrapper tiles and the legacy
   *  features they stand for in step (may itself change settings). */
  beforeSync?(): void;
  /** Caption tile options changed (font size / position / enabled). */
  onCaptionOptions(o: CaptionsOptions): void;
  /** Captions went on/off — main arms or releases the mic and pins the stream window. */
  onCaptionsActive(active: boolean): void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

/** Window over which settings broadcasts collapse into one sync(). */
export const SYNC_COALESCE_MS = 40;

const TILES: readonly (keyof A11yManagerTools)[] = ['screenReader', 'magnifier', 'captions', 'readingAids'];

export class A11yManager {
  private readonly last = new Map<keyof A11yManagerTools, string>();
  private captionsOn = false;
  private disposed = false;
  private syncTimer: unknown = null;
  /** Utterances whose transcript the always-on path will hand back to us. */
  private awaitingShared: Array<{ pcm: Uint8Array; at: number }> = [];

  constructor(private readonly deps: A11yManagerDeps) {}

  get captionsActive(): boolean {
    return this.captionsOn;
  }

  /** Re-apply every tile whose options changed since the last call. */
  sync(): void {
    if (this.disposed) return;
    try {
      this.deps.beforeSync?.();
    } catch (err) {
      console.error('[SuperJargon] a11y legacy sync failed:', err instanceof Error ? err.message : err);
    }
    const all = this.deps.getSettings();
    for (const id of TILES) {
      const options = all.tiles[id];
      const key = JSON.stringify(options);
      if (this.last.get(id) === key) continue;
      this.last.set(id, key);
      try {
        // Each tool has its own option type; the union is safe per id.
        (this.deps.tools[id] as A11yTool).apply(options as never, all);
      } catch (err) {
        console.error(`[SuperJargon] a11y ${id} apply failed:`, err instanceof Error ? err.message : err);
      }
      if (id === 'captions') this.syncCaptions(all.tiles.captions);
    }
  }

  /** Coalesce a burst of settings broadcasts (the ~30 Hz stream-window
   *  bounds storm) into one trailing sync() instead of one per event. */
  syncSoon(): void {
    if (this.disposed || this.syncTimer !== null) return;
    const st = this.deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.syncTimer = st(() => {
      this.syncTimer = null;
      this.sync();
    }, SYNC_COALESCE_MS);
  }

  /** A finished VAD utterance (PCM16 mono 16 kHz). Whole-utterance captions:
   *  transcription providers buffer, so lines arrive after the speaker stops. */
  pushUtterance(pcm: Buffer | Uint8Array, transcribedElsewhere = false): void {
    if (!this.captionsOn || this.disposed) return;
    const buf = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    if (buf.length === 0) return;
    if (transcribedElsewhere && this.deps.tools.captions.pushText) {
      // The always-on turn pipeline is already transcribing this exact buffer;
      // wait for its text (takeSharedTranscript) instead of paying twice.
      const now = Date.now();
      this.awaitingShared = this.awaitingShared.filter((p) => now - p.at < 60_000).slice(-7);
      this.awaitingShared.push({ pcm, at: now });
      return;
    }
    // Whole utterance in one transcription call: chunking it (and padding the
    // tail with silence) cut words and invited Whisper hallucinations.
    this.deps.tools.captions.pushUtterance(buf);
  }

  /** The always-on pipeline finished transcribing `pcm`. Returns true when the
   *  text was routed to the captions (i.e. it was waiting for this utterance). */
  takeSharedTranscript(pcm: Buffer | Uint8Array, text: string): boolean {
    const i = this.awaitingShared.findIndex((p) => p.pcm === pcm);
    if (i < 0) return false;
    this.awaitingShared.splice(i, 1);
    if (this.captionsOn && !this.disposed && text.trim()) this.deps.tools.captions.pushText?.(text);
    return true;
  }

  /** "Read screen now" — no-ops (returns '') while the tile is off. */
  readScreenNow(): Promise<string> {
    return this.deps.tools.screenReader.readNow();
  }

  /** Abort an in-flight read and cut the speech. */
  stopReading(): void {
    this.deps.tools.screenReader.stop?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.syncTimer !== null) {
      (this.deps.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)))(this.syncTimer);
      this.syncTimer = null;
    }
    this.awaitingShared = [];
    for (const id of TILES) {
      try {
        this.deps.tools[id].dispose();
      } catch (err) {
        console.error(`[SuperJargon] a11y ${id} dispose failed:`, err instanceof Error ? err.message : err);
      }
    }
    if (this.captionsOn) {
      this.captionsOn = false;
      this.deps.onCaptionsActive(false);
    }
  }

  private syncCaptions(o: CaptionsOptions): void {
    this.deps.onCaptionOptions(o);
    if (!o.enabled) {
      this.awaitingShared = [];
    }
    if (o.enabled !== this.captionsOn) {
      this.captionsOn = o.enabled;
      this.deps.onCaptionsActive(o.enabled);
    }
  }
}
