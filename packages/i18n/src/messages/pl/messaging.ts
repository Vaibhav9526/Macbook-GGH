import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/messaging";

export const messages = {
  "messaging.help.invalid_token":
    "Slack nie akceptuje już Jargon w tym obszarze roboczym. Mógł zostać odinstalowany. Połącz obszar roboczy ponownie.",
  "messaging.help.secret_storage_unavailable":
    "Jargon nie może odczytać zapisanych tokenów na tym komputerze. Rozłącz obszar roboczy, a potem połącz go ponownie.",
  "messaging.help.relay_unavailable":
    "Jargon nie może odbierać zdarzeń Slack na tym komputerze. Zaloguj się, nadaj temu komputerowi nazwę w ustawieniach serwera i nie zamykaj Jargon.",
  "messaging.discordHelp.invalid_token":
    "Discord nie akceptuje już Jargon na tym serwerze Discord. Mógł zostać usunięty. Połącz serwer Discord ponownie.",
  "messaging.discordHelp.secret_storage_unavailable":
    "Jargon nie może odczytać zapisanych tokenów na tym komputerze. Rozłącz serwer Discord, a potem połącz go ponownie.",
  "messaging.discordHelp.relay_unavailable":
    "Jargon nie może odbierać zdarzeń Discord na tym komputerze. Zaloguj się, nadaj temu komputerowi nazwę w ustawieniach serwera i nie zamykaj Jargon.",
} as const satisfies PartialTranslation<typeof source>;
