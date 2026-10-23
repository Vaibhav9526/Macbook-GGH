import type { JargonDesktopApi, ServerSummary } from "@jargon/contracts/ipc";

/**
 * What the servers domain reaches in main: the server list and selection, the account changes, the local host, the
 * settings of one server, the name, logo and update of a joined server's host, and the remote desktop
 * setup of a server.
 */
export interface ServersPort {
  agent: Pick<
    JargonDesktopApi["agent"],
    | "getStatus"
    | "listAgents"
    | "listConversationReads"
    | "listHiddenAgents"
    | "listMcpServers"
    | "listModels"
    | "removeMcpServer"
    | "saveMcpServer"
    | "setMcpServerEnabled"
    | "testMcpServer"
    | "signInMcpServer"
    | "mcpSignInPage"
    | "mcpSignInRelay"
    | "openMcpSignInRelay"
    | "completeMcpSignInRelay"
    | "cancelMcpSignIn"
    | "signOutMcpServer"
    | "listMcpSignIns"
    | "mcpSignInApp"
    | "saveMcpSignInApp"
    | "removeMcpSignInApp"
  >;
  events: JargonDesktopApi["events"];
  auth: Pick<JargonDesktopApi["auth"], "onEvent">;
  browser: Pick<JargonDesktopApi["browser"], "setVisible">;
  hostAdmin: Pick<
    JargonDesktopApi["hostAdmin"],
    "cancelUpdate" | "getUpdateStatus" | "startUpdate" | "updateIdentity"
  >;
  hostedServers: Pick<JargonDesktopApi["hostedServers"], "list" | "restart" | "wake">;
  host: Pick<
    JargonDesktopApi["host"],
    "configure" | "getStatus" | "onEvent" | "recheckScreenRecording" | "start" | "stop" | "updateIdentity"
  >;
  notifications: Pick<JargonDesktopApi["notifications"], "onOpened">;
  remoteDesktop: Pick<
    JargonDesktopApi["remoteDesktop"],
    "checkSetup" | "connect" | "disconnect" | "list" | "openSetup" | "test"
  >;
  servers: Pick<
    JargonDesktopApi["servers"],
    | "getPresence"
    | "join"
    | "list"
    | "onEvent"
    | "onPresence"
    | "refreshIdentity"
    | "remove"
    | "reorder"
    | "retryConnection"
    | "select"
    | "setMuted"
    | "setNotificationLevel"
  >;
}

/** Read on each call: tests and stories replace `window.jargon` per case. */
export function serversPort(): ServersPort {
  return window.jargon;
}

/**
 * The member and invite calls for one server. This computer answers them for the local server
 * through `host`; a remote server answers them through `servers`, addressed by its id.
 */
export type ServerAdminPort = Pick<
  JargonDesktopApi["host"],
  "getPresence" | "listMembers" | "listInvites" | "createInvite" | "updateMember" | "removeMember" | "revokeInvite"
>;

export function serverAdminPort(server: Pick<ServerSummary, "id" | "kind">): ServerAdminPort {
  if (server.kind === "local") return window.jargon.host;
  const serverId = server.id;
  return {
    getPresence: () => window.jargon.servers.getPresenceFor(serverId),
    listMembers: () => window.jargon.servers.listMembers(serverId),
    listInvites: () => window.jargon.servers.listInvites(serverId),
    createInvite: (input) => window.jargon.servers.createInvite(input, serverId),
    updateMember: (input) => window.jargon.servers.updateMember(input, serverId),
    removeMember: (memberId) => window.jargon.servers.removeMember(memberId, serverId),
    revokeInvite: (inviteId) => window.jargon.servers.revokeInvite(inviteId, serverId),
  };
}

/** The server main marks active. A test teardown can remove the bridge while a join is pending. */
export async function activeServerId(): Promise<string> {
  if (!window.jargon) return "local";
  return (await window.jargon.servers.list()).find((item) => item.active)?.id ?? "local";
}
