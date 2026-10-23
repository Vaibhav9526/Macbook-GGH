import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/messaging";

export const messages = {
  "status.messaging.working": "Pracuję nad tym…",
  "status.messaging.queued": "Oczekiwanie: Jargon pracuje nad innym żądaniem. Odpowiedź pojawi się tutaj.",
  "status.messaging.busy": "Czeka zbyt wiele żądań. Spróbuj ponownie później.",
  "status.messaging.failed": "Jargon nie mógł dokończyć tego żądania. Szczegóły są na hoście Jargon.",
  "status.messaging.noAnswer": "Jargon zakończył pracę bez odpowiedzi tekstowej.",
  "status.messaging.noAgent": "Żaden agent nie może tu jeszcze odpowiadać. Dodaj Slack Orchestrator w Jargon.",
  "status.messaging.delegated": "Członek zespołu nad tym pracuje. Odpowiedź pojawi się tutaj.",
  "status.messaging.stopped": "Zatrzymano.",
  "status.messaging.stop": "Zatrzymaj",
  "status.messaging.approvalTitle": "Jargon prosi o zatwierdzenie, aby kontynuować.",
  "status.messaging.approvalCommand": "Uruchomienie polecenia",
  "status.messaging.approvalFileChange": "Zmiana plików",
  "status.messaging.approvalPermissions": "Dodatkowe uprawnienia",
  "status.messaging.approve": "Zatwierdź",
  "status.messaging.deny": "Odrzuć",
  "status.messaging.approvedBy": "Zatwierdzone przez: {user}.",
  "status.messaging.deniedBy": "Odrzucone przez: {user}.",
  "status.messaging.answeredOnHost": "Odpowiedziano na hoście Jargon.",
  "status.messaging.requestInactive": "To żądanie nie jest już aktywne.",
  "status.messaging.onlyRequester": "Tylko {user} może to zrobić. Może też odpowiedzieć host Jargon.",
  "status.messaging.hostOnly": "Na to żądanie może odpowiedzieć tylko host Jargon.",
  "status.messaging.filesSkipped": "Niektóre pliki nie zostały wysłane: {names}.",
  "status.messaging.orchestratorName": "Slack Orchestrator",
  "status.messaging.orchestratorTitle": "Odpowiada w Slacku i pyta zespół",
  "status.messaging.discordNoAgent":
    "Żaden agent nie może tu jeszcze odpowiadać. Dodaj Discord Orchestrator w Jargon.",
  "status.messaging.discordOrchestratorName": "Discord Orchestrator",
  "status.messaging.discordOrchestratorTitle": "Odpowiada na Discordzie i pyta zespół",
  "status.messaging.integrationsSection": "Integracje",
  "status.messaging.signInReceived": "Jargon otrzymał instalację Slack. Możesz zamknąć tę kartę.",
  "status.messaging.signInUnknown": "Jargon nie rozpoczął tej instalacji Slack. Rozpocznij ją ponownie w Jargon.",
  "status.messaging.telegramNoAgent":
    "Żaden agent nie może tu jeszcze odpowiadać. Dodaj Telegram Orchestrator w Jargon.",
  "status.messaging.telegramLinked":
    "Jargon jest połączony z tym czatem. Oznacz {bot} lub odpowiedz na wiadomość Jargon, aby zapytać agentów.",
  "status.messaging.telegramOrchestratorName": "Telegram Orchestrator",
  "status.messaging.telegramOrchestratorTitle": "Odpowiada w Telegramie i pyta zespół",
} as const satisfies PartialTranslation<typeof source>;
