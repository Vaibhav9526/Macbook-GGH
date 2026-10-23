import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/menu";

export const messages = {
  "menu.stopAllAgents": "Detener todos los agentes",
  "menu.checkForUpdates": "Buscar actualizaciones…",
  "menu.preferences": "Ajustes…",
  "menu.actualSize": "Tamaño real",
  "menu.zoomIn": "Ampliar",
  "menu.zoomOut": "Reducir",
  "menu.copyLink": "Copiar enlace",
  "menu.trayOpen": "Abrir Jargon",
  "menu.trayQuit": "Salir de Jargon",
  "menu.trayTooltip": "Jargon",
} as const satisfies PartialTranslation<typeof source>;
