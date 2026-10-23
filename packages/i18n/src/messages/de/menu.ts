import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/menu";

export const messages = {
  "menu.stopAllAgents": "Alle Agenten stoppen",
  "menu.checkForUpdates": "Nach Updates suchen…",
  "menu.preferences": "Einstellungen…",
  "menu.actualSize": "Originalgröße",
  "menu.zoomIn": "Vergrößern",
  "menu.zoomOut": "Verkleinern",
  "menu.copyLink": "Link kopieren",
  "menu.trayOpen": "Jargon öffnen",
  "menu.trayQuit": "Jargon beenden",
  "menu.trayTooltip": "Jargon",
} as const satisfies PartialTranslation<typeof source>;
