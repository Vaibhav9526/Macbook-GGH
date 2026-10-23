import type { ScreenCapture } from '../shared/types';
import { IPC } from '../shared/types';
import type { A11yReadingAidsPayload, CaptionsOptions } from '../shared/accessibility';
import { A11yManager } from './a11y-manager';
import { LiveCaptions } from './services/a11y/live-captions';
import { createElectronMagnifier } from './services/a11y/magnifier-window';
import { createReadingAids, descriptorToCss } from './services/a11y/reading-aids';
import { ScreenReader, SCREEN_READER_PROMPT, providerSeesImages } from './services/a11y/screen-reader';
import { readUiText } from './services/a11y/uia-reader';
import { captureForScope } from './services/a11y/scope-capture';
import { LegacyBridge, type LegacyBridgeDeps } from './services/a11y/legacy-bridge';
import { transcribeWith } from './services/transcription';
import * as settingsStore from './services/settings-store';

/**
 * Production deps for A11yManager: the only place the a11y tools meet
 * Electron-side services. Everything a tool needs (Mind vision call, OS
 * voice, windows) arrives through `host` so index.ts keeps owning window
 * routing and nothing here imports its module state.
 *
 * Voice input/output routing is untouched: captions reuse the user's
 * transcription provider and the screen reader speaks through the existing
 * OS-voice channel (SPEAK_TEXT) — neither touches the Copilot provider.
 */

export interface A11yHost {
  /** Active Mind provider describes one screenshot (companion.describeScreenshot). */
  describe(prompt: string, shot: ScreenCapture, signal: AbortSignal): Promise<string>;
  /** Fan a channel out to the windows that apply it. */
  sendToAll(channel: string, ...args: unknown[]): void;
  sendToStream(channel: string, ...args: unknown[]): void;
  /** Overlay OS-voice speech (rate is a Web Speech rate, 0.5–2 here) and its cancel. */
  speak(text: string, rate: number): void;
  stopSpeaking(): void;
  /** Captions went on/off: arm the mic, pin the stream window. */
  setCaptionsActive(active: boolean): void;
  reportError(message: string): void;
  /** Screen reader only: a short spoken cue that a read began / failed, so the
   *  hotkey never feels dead (reportError alone is visual). */
  readStarted?(): void;
  readFailed?(message: string): void;
  /** Dashboard wrapper tiles (voice, dictation, pointing, hands-free) drive
   *  these existing features; see services/a11y/legacy-bridge.ts. */
  legacy: Omit<LegacyBridgeDeps, 'getA11y' | 'updateA11y'>;
}

export interface A11yRuntime {
  manager: A11yManager;
  /** Re-send current state to a window that just finished loading. */
  replayTo(send: (channel: string, ...args: unknown[]) => void, isStream: boolean): void;
}

export function createA11yRuntime(host: A11yHost): A11yRuntime {
  let readingAids: A11yReadingAidsPayload | null = null;
  let captionOptions: CaptionsOptions | null = null;

  const bridge = new LegacyBridge({
    ...host.legacy,
    getA11y: () => settingsStore.getA11yState().settings,
    updateA11y: (u) => settingsStore.updateA11y(u).ok,
  });
  // Provider/network failures repeat once per utterance; say each distinct
  // one at most every 30 s instead of spamming the panel (or only the console).
  const lastCaptionError = new Map<string, number>();
  const captionError = (message: string): void => {
    console.warn('[SuperJargon] captions:', message);
    const now = Date.now();
    if (now - (lastCaptionError.get(message) ?? 0) < 30_000) return;
    lastCaptionError.set(message, now);
    host.reportError(`Live captions: ${message}`);
  };

  const manager = new A11yManager({
    getSettings: () => settingsStore.getA11yState().settings,
    beforeSync: () => bridge.sync(),
    onCaptionOptions: (o) => {
      captionOptions = o;
      host.sendToStream(IPC.A11Y_CAPTION_OPTIONS, o);
    },
    onCaptionsActive: (active) => host.setCaptionsActive(active),
    tools: {
      screenReader: new ScreenReader({
        // Native Windows accessibility text first (the tree NVDA/Narrator
        // use); vision is the fallback for apps that expose nothing.
        readText: (scope) => readUiText(scope),
        visionAvailable: () => providerSeesImages(settingsStore.get('mindProvider')),
        // 'window' = the focused window, 'region' = a rectangle around the
        // pointer (no drag-select overlay).
        capture: (scope) => captureForScope(scope),
        describe: (shot, signal) => host.describe(SCREEN_READER_PROMPT, shot, signal),
        speak: (text, rate) => host.speak(text, rate),
        stopSpeaking: () => host.stopSpeaking(),
        onStart: () => host.readStarted?.(),
        onError: (message) => {
          console.warn('[SuperJargon] screen reader failed:', message);
          host.reportError(`Screen reader: ${message}`);
          host.readFailed?.(message);
        },
      }),
      captions: new LiveCaptions({
        transcribe: (pcm) => transcribeWith(settingsStore.get('transcriptionProvider'), pcm),
        emit: (line) => host.sendToStream(IPC.A11Y_CAPTION, line),
        // Provider errors can echo request details; surface only the message.
        onError: captionError,
      }),
      magnifier: createElectronMagnifier(),
      readingAids: createReadingAids({
        publish: (d) => {
          readingAids = {
            enabled: d.enabled,
            classes: d.classes,
            cssVars: d.cssVars,
            css: descriptorToCss(d),
            ruler: d.ruler,
          };
          host.sendToAll(IPC.A11Y_READING_AIDS, readingAids);
        },
      }),
    },
  });

  return {
    manager,
    replayTo(send, isStream) {
      if (readingAids) send(IPC.A11Y_READING_AIDS, readingAids);
      if (isStream && captionOptions) send(IPC.A11Y_CAPTION_OPTIONS, captionOptions);
    },
  };
}
