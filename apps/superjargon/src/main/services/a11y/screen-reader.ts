import type { AccessibilitySettings, A11yTool, ScreenReaderOptions } from '../../../shared/accessibility';
import type { ScreenCapture } from '../../../shared/types';
import { providerSeesImages } from '../../../shared/a11y-vision';

/**
 * Screen reader with two back ends:
 *
 *  1. Windows UI Automation text (`readText`) — the same accessibility tree
 *     NVDA and Narrator use. Fast, free, exact control names/states, works
 *     with any Mind provider (including Copilot, which cannot see images).
 *  2. Vision fallback (`capture` + `describe`) for apps that expose little or
 *     nothing through UIA (canvas/game/custom-drawn UIs).
 *
 * This ordering is deliberate: the old implementation was vision-only, so a
 * fresh install with Copilot heard "I can't see a screenshot right now" and
 * nothing else. Native text is also what makes "read the screen" usable as a
 * screen reader rather than a once-a-minute image description.
 *
 * Screenshots stay in memory only — never logged, never persisted.
 */

export interface ScreenReaderDeps {
  /** Grab the pixels for the scope; null = nothing to read (no window). */
  capture: (scope: ScreenReaderOptions['scope']) => Promise<ScreenCapture | null>;
  /** Mind call: screenshot → plain-text transcript in reading order. */
  describe: (shot: ScreenCapture, signal: AbortSignal) => Promise<string>;
  /** Speak `text` at `rate` (0.5–2); resolves when speech ends. */
  speak: (text: string, rate: number) => Promise<void> | void;
  /** Cut off any speech in flight. */
  stopSpeaking?: () => void;
  /** Native accessibility text for the scope; null when the app exposes none.
   *  Runs before any screenshot so a non-vision Mind still works. */
  readText?: (scope: ScreenReaderOptions['scope']) => Promise<string | null>;
  /** Whether the configured Mind can take a screenshot. Defaults to true. */
  visionAvailable?: () => boolean;
  /** Spoken when neither native text nor vision is available. */
  noVisionMessage?: string;
  /** A read has begun: lets the host give immediate "working on it" feedback. */
  onStart?: () => void;
  /** Every failure branch lands here (never silent). */
  onError?: (message: string) => void;
  /** Override the describe timeout (tests). */
  describeTimeoutMs?: number;
  /** Override the native-text timeout (tests). */
  readTextTimeoutMs?: number;
}

/** A vision call that never answers must not leave the user in silence. */
export const DESCRIBE_TIMEOUT_MS = 60_000;
/** UIA is local; if it hangs, fall through to vision rather than blocking. */
export const READ_TEXT_TIMEOUT_MS = 8_000;

/** Prompt the injected `describe` should send alongside the screenshot. */
export const SCREEN_READER_PROMPT =
  'You are a screen reader. Read this screenshot aloud in natural reading order ' +
  '(top-left to bottom-right, headings first). Name each control with its role and state, ' +
  'e.g. "button: Save, disabled". Plain sentences only — no markdown, no coordinates, ' +
  'no commentary about the image itself.';

const MAX_SPOKEN_CHARS = 4000;

/**
 * Rough wall-clock length of OS-voice speech. The overlay's speechSynthesis
 * reports no end event back to main, so main holds voice state 'responding'
 * for this long (the always-on mic would otherwise hear the reader and wake
 * on its own words). ~155 wpm at rate 1, plus a tail for engine start-up;
 * capped so a bad estimate can't deafen hands-free listening for long.
 */
export function estimateSpeechMs(text: string, rate: number): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const r = clamp(rate, 0.5, 2);
  return Math.min(5 * 60_000, Math.round((words / (2.6 * r)) * 1000) + 1200);
}

export { providerSeesImages };

/** Spoken instead of a model call when the Mind provider takes no screenshots. */
export const NO_VISION_MESSAGE =
  'The screen reader could not read this app through Windows accessibility, and the ' +
  'Mind provider cannot see images. Switch Mind to Claude, OpenAI or Ollama with a ' +
  'vision model in the Mind tab, or use an app that exposes accessibility text.';

export class ScreenReader implements A11yTool<'screenReader'> {
  readonly id = 'screenReader' as const;
  private opts: ScreenReaderOptions = { enabled: false, scope: 'window', rate: 1 };
  private inflight: AbortController | null = null;
  private gen = 0;

  constructor(private readonly deps: ScreenReaderDeps) {}

  apply(options: AccessibilitySettings['tiles']['screenReader']): void {
    const wasEnabled = this.opts.enabled;
    this.opts = { ...options, rate: clamp(options.rate, 0.5, 2) };
    if (wasEnabled && !options.enabled) this.stop();
  }

  /**
   * Read the current scope aloud. Returns the transcript spoken, or ''
   * when disabled / nothing to read / superseded by a newer call.
   */
  async readNow(): Promise<string> {
    if (!this.opts.enabled) return '';
    this.stop();
    const gen = this.gen;
    const ctrl = new AbortController();
    this.inflight = ctrl;
    const fail = (message: string): string => {
      // A superseded read (stop / newer read) is an interrupt, not a failure.
      if (gen === this.gen) this.deps.onError?.(message);
      return '';
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      this.deps.onStart?.();

      // 1) Native accessibility text. A slow or broken UIA call is not a
      // failure: it just means this app has no usable tree, so try pixels.
      if (this.deps.readText) {
        let direct: string | null = null;
        try {
          direct = await raceTimeout(
            this.deps.readText(this.opts.scope),
            this.deps.readTextTimeoutMs ?? READ_TEXT_TIMEOUT_MS,
          );
        } catch {
          direct = null;
        }
        if (gen !== this.gen) return '';
        const native = direct ? tidy(direct) : '';
        if (native) {
          await this.deps.speak(native, this.opts.rate);
          return native;
        }
      }

      // 2) Vision, when the configured Mind can actually take an image.
      if (this.deps.visionAvailable && !this.deps.visionAvailable()) {
        return fail(this.deps.noVisionMessage ?? NO_VISION_MESSAGE);
      }
      const shot = await this.deps.capture(this.opts.scope);
      if (gen !== this.gen) return '';
      if (!shot) return fail('Nothing to read: no window could be captured.');
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error('The Mind provider took too long to describe the screen.'));
        }, this.deps.describeTimeoutMs ?? DESCRIBE_TIMEOUT_MS);
      });
      const raw = await Promise.race([this.deps.describe(shot, ctrl.signal), timeout]);
      if (gen !== this.gen) return '';
      const text = tidy(raw);
      if (!text) return fail('The Mind provider returned no description of the screen.');
      await this.deps.speak(text, this.opts.rate);
      return text;
    } catch (err) {
      return fail(err instanceof Error && err.message ? err.message : 'Could not read the screen.');
    } finally {
      if (timer) clearTimeout(timer);
      if (this.inflight === ctrl) this.inflight = null;
    }
  }

  /** Abort any capture/describe in flight and silence speech. */
  stop(): void {
    this.gen++;
    this.inflight?.abort();
    this.inflight = null;
    this.deps.stopSpeaking?.();
  }

  dispose(): void {
    this.opts = { ...this.opts, enabled: false };
    this.stop();
  }
}

/** Race `promise` against a timer; the timer does not abort the work. */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    timer.unref?.();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Strip markdown noise a TTS engine would read out literally. */
function tidy(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPOKEN_CHARS);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : 1));
}
