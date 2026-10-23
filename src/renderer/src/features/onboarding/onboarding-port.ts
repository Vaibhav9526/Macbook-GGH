import type { JargonDesktopApi } from "@jargon/contracts/ipc";

/**
 * What onboarding reaches in main: the saved setup, and the preview of an invite before the user
 * joins.
 */
export interface OnboardingPort {
  getSetupState: JargonDesktopApi["getSetupState"];
  saveSetup: JargonDesktopApi["saveSetup"];
  servers: Pick<JargonDesktopApi["servers"], "previewInvite">;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function onboardingPort(): OnboardingPort {
  return window.jargon;
}
