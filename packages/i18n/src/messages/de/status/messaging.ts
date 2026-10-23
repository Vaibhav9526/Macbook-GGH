import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/messaging";

export const messages = {
  "status.messaging.working": "Wird bearbeitet…",
  "status.messaging.queued": "Wartet: Jargon bearbeitet eine andere Anfrage. Die Antwort erscheint hier.",
  "status.messaging.busy": "Zu viele Anfragen warten. Versuche es später erneut.",
  "status.messaging.failed": "Jargon konnte diese Anfrage nicht abschließen. Der Jargon-Host hat die Details.",
  "status.messaging.noAnswer": "Jargon wurde ohne schriftliche Antwort fertig.",
  "status.messaging.noAgent": "Hier kann noch kein Agent antworten. Füge den Slack Orchestrator in Jargon hinzu.",
  "status.messaging.delegated": "Ein Teamkollege arbeitet daran. Die Antwort erscheint hier.",
  "status.messaging.stopped": "Gestoppt.",
  "status.messaging.stop": "Stoppen",
  "status.messaging.approvalTitle": "Jargon bittet um Genehmigung, um fortzufahren.",
  "status.messaging.approvalCommand": "Einen Befehl ausführen",
  "status.messaging.approvalFileChange": "Dateien ändern",
  "status.messaging.approvalPermissions": "Weitere Berechtigungen erhalten",
  "status.messaging.approve": "Genehmigen",
  "status.messaging.deny": "Ablehnen",
  "status.messaging.approvedBy": "Von {user} genehmigt.",
  "status.messaging.deniedBy": "Von {user} abgelehnt.",
  "status.messaging.answeredOnHost": "Auf dem Jargon-Host beantwortet.",
  "status.messaging.requestInactive": "Diese Anfrage ist nicht mehr aktiv.",
  "status.messaging.onlyRequester": "Nur {user} kann dies tun. Der Jargon-Host kann ebenfalls antworten.",
  "status.messaging.hostOnly": "Nur der Jargon-Host kann diese Anfrage beantworten.",
  "status.messaging.filesSkipped": "Einige Dateien wurden nicht gesendet: {names}.",
  "status.messaging.orchestratorName": "Slack Orchestrator",
  "status.messaging.orchestratorTitle": "Antwortet in Slack und fragt das Team",
  "status.messaging.discordNoAgent":
    "Hier kann noch kein Agent antworten. Füge den Discord Orchestrator in Jargon hinzu.",
  "status.messaging.discordOrchestratorName": "Discord Orchestrator",
  "status.messaging.discordOrchestratorTitle": "Antwortet in Discord und fragt das Team",
  "status.messaging.integrationsSection": "Integrationen",
  "status.messaging.signInReceived": "Jargon hat die Slack-Installation empfangen. Du kannst diesen Tab schließen.",
  "status.messaging.signInUnknown":
    "Jargon hat diese Slack-Installation nicht gestartet. Starte sie erneut in Jargon.",
  "status.messaging.telegramNoAgent":
    "Hier kann noch kein Agent antworten. Füge den Telegram-Orchestrator in Jargon hinzu.",
  "status.messaging.telegramLinked":
    "Jargon ist mit diesem Chat verbunden. Erwähne {bot} oder antworte auf eine Nachricht von Jargon, um die Agenten zu fragen.",
  "status.messaging.telegramOrchestratorName": "Telegram-Orchestrator",
  "status.messaging.telegramOrchestratorTitle": "Antwortet in Telegram und fragt das Team",
} as const satisfies PartialTranslation<typeof source>;
