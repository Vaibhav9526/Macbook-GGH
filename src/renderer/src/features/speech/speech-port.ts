import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What spoken replies reach in main: the speech model and settings, the synthesis, the finished
 * answer, and the recording a voice turn keeps with its message.
 */
export interface SpeechPort {
  voice: Pick<
    JargonDesktopApi["voice"],
    | "getSpeechSettings"
    | "getSpeechModelStatus"
    | "downloadSpeechModel"
    | "onSpeechModelStatus"
    | "speak"
    | "warmSpeech"
    | "keepRecording"
  >;
  agent: Pick<JargonDesktopApi["agent"], "readConversationPage" | "discardDraftAttachment">;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function speechPort(): SpeechPort {
  return window.jargon;
}
