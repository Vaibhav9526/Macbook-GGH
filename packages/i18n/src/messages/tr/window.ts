import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/window";

export const messages = {
  "window.localHostTitle": "Jargon Yerel Ana Makine",
  "window.localClientTitle": "Jargon Yerel İstemci",
  "window.computerUsePermissionTitle": "Bilgisayar Kullanımını aç",
} as const satisfies PartialTranslation<typeof source>;
