import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/** What the Voice tab reaches in main: the dictation models and the dictation settings. */
export interface VoicePort {
  voice: JargonDesktopApi["voice"];
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function voicePort(): VoicePort {
  return window.jargon;
}
