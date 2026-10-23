import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Se registró este Jargon para el acceso WebRTC.",
  "status.host.identityUpdated": "Identidad del servidor actualizada.",
  "status.host.starting": "Iniciando el host WebRTC…",
  "status.host.ready": "Este Jargon está listo para conexiones WebRTC.",
  "status.host.stopping": "Haciendo privado este Jargon…",
  "status.host.private": "Este Jargon es privado.",
} as const satisfies PartialTranslation<typeof source>;
