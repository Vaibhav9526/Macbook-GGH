import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Este Jargon foi registrado para acesso por WebRTC.",
  "status.host.identityUpdated": "Identidade do servidor atualizada.",
  "status.host.starting": "Iniciando o computador anfitrião WebRTC…",
  "status.host.ready": "Este Jargon está pronto para conexões WebRTC.",
  "status.host.stopping": "Tornando este Jargon privado…",
  "status.host.private": "Este Jargon é privado.",
} as const satisfies PartialTranslation<typeof source>;
