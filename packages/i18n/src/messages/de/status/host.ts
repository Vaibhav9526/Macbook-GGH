import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Dieser Jargon wurde für den WebRTC-Zugriff registriert.",
  "status.host.identityUpdated": "Serveridentität aktualisiert.",
  "status.host.starting": "WebRTC-Host wird gestartet…",
  "status.host.ready": "Dieser Jargon ist für WebRTC-Verbindungen bereit.",
  "status.host.stopping": "Dieser Jargon wird auf privat gesetzt…",
  "status.host.private": "Dieser Jargon ist privat.",
} as const satisfies PartialTranslation<typeof source>;
