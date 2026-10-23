import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Bu Jargon, WebRTC erişimi için kaydedildi.",
  "status.host.identityUpdated": "Sunucu kimliği güncellendi.",
  "status.host.starting": "WebRTC ana makinesi başlatılıyor…",
  "status.host.ready": "Bu Jargon, WebRTC bağlantıları için hazır.",
  "status.host.stopping": "Bu Jargon özel yapılıyor…",
  "status.host.private": "Bu Jargon özel.",
} as const satisfies PartialTranslation<typeof source>;
