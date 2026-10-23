import { defineMessages } from "../../../message";

export const messages = defineMessages("status.messaging", {
  // Text that Jargon posts in a Slack conversation. Slack users read it. It names no agent: in
  // Slack, every answer comes from Jargon.
  "status.messaging.working": "Working on it…",
  "status.messaging.queued": "Waiting: Jargon is working on another request. The answer comes here.",
  "status.messaging.busy": "Too many requests are waiting. Try again later.",
  "status.messaging.failed": "Jargon could not finish this request. The Jargon host has the details.",
  "status.messaging.noAnswer": "Jargon finished without a written answer.",
  "status.messaging.noAgent": "No agent can answer here yet. Add the Slack Orchestrator in Jargon.",
  "status.messaging.delegated": "A teammate is working on it. The answer comes here.",
  "status.messaging.stopped": "Stopped.",
  "status.messaging.stop": "Stop",
  "status.messaging.approvalTitle": "Jargon asks for approval to continue.",
  "status.messaging.approvalCommand": "Run a command",
  "status.messaging.approvalFileChange": "Change files",
  "status.messaging.approvalPermissions": "Get more permissions",
  "status.messaging.approve": "Approve",
  "status.messaging.deny": "Deny",
  "status.messaging.approvedBy": "Approved by {user}.",
  "status.messaging.deniedBy": "Denied by {user}.",
  "status.messaging.answeredOnHost": "Answered on the Jargon host.",
  "status.messaging.requestInactive": "This request is no longer active.",
  "status.messaging.onlyRequester": "Only {user} can do this. The Jargon host can also answer.",
  "status.messaging.hostOnly": "Only the Jargon host can answer this request.",
  "status.messaging.filesSkipped": "Some files were not sent: {names}.",
  // The name and title of the agent that Jargon adds to answer in Slack. The user can rename it.
  "status.messaging.orchestratorName": "Slack Orchestrator",
  "status.messaging.orchestratorTitle": "Answers in Slack and asks the team",
  // The same texts for Discord. Discord users read the first one.
  "status.messaging.discordNoAgent": "No agent can answer here yet. Add the Discord Orchestrator in Jargon.",
  "status.messaging.discordOrchestratorName": "Discord Orchestrator",
  "status.messaging.discordOrchestratorTitle": "Answers in Discord and asks the team",
  // The sidebar section that Jargon puts the Slack Orchestrator in. The user can rename it.
  "status.messaging.integrationsSection": "Integrations",
  // The page a development Slack install ends on.
  "status.messaging.signInReceived": "Jargon received the Slack install. You can close this tab.",
  "status.messaging.signInUnknown": "Jargon did not start this Slack install. Start it again in Jargon.",
  // Text that Jargon posts in a Telegram chat, and the Telegram Orchestrator agent. Telegram users
  // read the posts. The user can rename the agent.
  "status.messaging.telegramNoAgent": "No agent can answer here yet. Add the Telegram Orchestrator in Jargon.",
  "status.messaging.telegramLinked":
    "Jargon is connected to this chat. Mention {bot} or reply to a message of Jargon to ask the agents.",
  "status.messaging.telegramOrchestratorName": "Telegram Orchestrator",
  "status.messaging.telegramOrchestratorTitle": "Answers in Telegram and asks the team",
});
