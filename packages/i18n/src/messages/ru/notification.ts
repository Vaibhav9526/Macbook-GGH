import type { PartialTranslation } from "../../message";
import type { messages as source } from "../en/notification";

export const messages = {
  "notification.needsInput": "Нужен ваш ответ.",
  "notification.needsApproval": "Нужно ваше подтверждение.",
  "notification.needsBrowserStep": "Нужно, чтобы вы завершили шаг в браузере.",
  "notification.needsApprovalFor": "Нужно ваше подтверждение: {action}",
  "notification.finished": "Работа завершена.",
  "notification.failed": "Остановлено из-за ошибки.",
  "notification.channelTitle": "{agent} в канале {channel}",
  "notification.channelMessage": "Новое сообщение.",
  "notification.usageLimit.title": "Аккаунт {provider} достиг лимита",
  "notification.usageLimit.body": {
    one: "Ждёт {count} агент. Jargon попробует позже.",
    few: "Ждут {count} агента. Jargon попробует позже.",
    many: "Ждут {count} агентов. Jargon попробует позже.",
    other: "Ждут {count} агента. Jargon попробует позже.",
  },
  "notification.usageLimit.bodyResets": {
    one: "Ждёт {count} агент. Сброс {reset}.",
    few: "Ждут {count} агента. Сброс {reset}.",
    many: "Ждут {count} агентов. Сброс {reset}.",
    other: "Ждут {count} агента. Сброс {reset}.",
  },
  "notification.test": "Уведомления работают.",
  "notification.welcome": "Jargon сообщит здесь, когда вы понадобитесь агенту.",
  "notification.toast.region": "Уведомления",
  "notification.toast.close": "Закрыть уведомление",
} as const satisfies PartialTranslation<typeof source>;
