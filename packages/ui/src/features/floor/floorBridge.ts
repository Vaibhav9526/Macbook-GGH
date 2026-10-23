import type { AvatarHue } from "@jargon/contracts/ipc";
import { type Accessor, createEffect, onCleanup } from "solid-js";
import type { SidebarAgentState } from "../sidebar/sidebar-types";
import { type FloorAvatar, floorAvatarOf } from "./floor-avatar";
import { type FloorMode, parseFloorRole } from "./floor-cast";
import { type FloorCustom, parseCustomizeMessage } from "./floor-custom";

/*
 * The message bridge between the app and the floor iframe (apps/floor).
 *
 * The floor is a separate web app, so the only way it learns about agents is a plain JSON message.
 * The app posts the whole agent list on every change and whenever the iframe loads. The floor sends
 * back a select (the user clicked an avatar, with the role the floor gave it) or a close (the user
 * pressed the floor's own close control). Nothing else crosses this boundary: no tokens, no paths,
 * no transcripts.
 */

/** What the floor shows for an agent. The floor draws one state per avatar. */
export type FloorStatus = "working" | "idle" | "waiting";

/** One agent as the floor receives it. */
export interface FloorAgent {
  id: string;
  name: string;
  status: FloorStatus;
  /** The agent's blob shape and colour. A string is an override from the host, read as a character key. */
  avatar: FloorAvatar | string;
  /** What the agent is doing now, or `null` when it has nothing to show. */
  task: string | null;
  /** The saved look of the person on the floor, or `null` for the default look. */
  custom: FloorCustom | null;
  /** The role the floor draws, when the agent has one (a school persona). Absent: the floor uses the list order. */
  role?: FloorAgentRole;
}

/** The roles the floor knows. A school persona carries its role; other agents have none. */
export type FloorAgentRole = "boss" | "worker" | "principal" | "teacher" | "librarian" | "student";

/** An agent as the app knows it. `state` is the sidebar badge from `computeSidebarAgentStates`. */
export interface FloorSourceAgent {
  id: string;
  name: string;
  /** The agent's own avatar seed and hue. They give the blob shape and colour. */
  avatarSeed: string;
  avatarHue: AvatarHue | null;
  /** Optional. When set, the floor gets this string as `avatar` instead of the blob. */
  avatarOverride?: string;
  task: string | null;
  state: SidebarAgentState | undefined;
  /** The saved look of the person on the floor. Absent or `null` means the default look. */
  custom?: FloorCustom | null;
  /** The role the floor draws for this agent, from its school persona. */
  role?: FloorAgentRole | undefined;
}

export interface FloorBridgeOptions {
  agents: Accessor<readonly FloorSourceAgent[]>;
  /** Called on a click. `role` is the role the floor gave the agent, or `null` when it sent none. */
  onSelectAgent: (agentId: string, role: ReturnType<typeof parseFloorRole>) => void;
  /** Called when the user changes the look of a person in the floor's customiser. `null` resets it. */
  onCustomize: (agentId: string, custom: FloorCustom | null) => void;
  onClose: () => void;
  /** Office or school. The floor draws that scene. Absent means office. */
  mode?: Accessor<FloorMode>;
  /** When true, the mode is fixed: the floor hides its mode switch (the message sends `lockedMode`). */
  lockMode?: boolean;
}

export interface FloorBridge {
  /** Connects the bridge to an iframe. Call it with `undefined` when the iframe is removed. */
  attach: (frame: HTMLIFrameElement | undefined) => void;
  /** Asks the floor to open its customiser for one agent. The floor must be open. */
  openCustomizer: (agentId: string) => void;
}

/**
 * The sidebar badge, reduced to the three states the floor draws.
 *
 * A question, an approval or a plan limit means the agent waits for the user. A running or queued
 * turn or routine means it works. Everything else, including unread replies, is idle.
 */
export function floorStatus(state: SidebarAgentState | undefined): FloorStatus {
  if (state?.kind === "waiting" || state?.kind === "limited") return "waiting";
  if (state?.kind === "working") return "working";
  if (state?.kind === "routine" && (state.phase === "running" || state.phase === "queued")) return "working";
  return "idle";
}

/** The agent list in the shape the floor reads. */
export function toFloorAgents(agents: readonly FloorSourceAgent[]): FloorAgent[] {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: floorStatus(agent.state),
    avatar: agent.avatarOverride ?? floorAvatarOf(agent.avatarSeed, agent.avatarHue),
    task: agent.task,
    custom: agent.custom ?? null,
    ...(agent.role ? { role: agent.role } : {}),
  }));
}

/** The origin the messages are posted to. `*` only when the frame has no http origin, as for file URLs. */
function targetOrigin(frame: HTMLIFrameElement): string {
  try {
    const origin = new URL(frame.src).origin;
    return origin && origin !== "null" ? origin : "*";
  } catch {
    return "*";
  }
}

/** The fields of a message from the floor. Each one is checked before use. */
interface FloorMessage {
  readonly type?: unknown;
  readonly id?: unknown;
  readonly role?: unknown;
}

function isRecord(value: unknown): value is FloorMessage {
  return typeof value === "object" && value !== null;
}

/**
 * Creates the bridge. It posts the agent list to the attached iframe on every change and when the
 * iframe loads, and it reads the floor's select and close messages. Only messages from the attached
 * iframe's own window are accepted.
 */
export function createFloorBridge(options: FloorBridgeOptions): FloorBridge {
  let frame: HTMLIFrameElement | undefined;

  const post = () => {
    if (!frame?.contentWindow) return;
    const target = targetOrigin(frame);
    const mode = options.mode?.() ?? "office";
    frame.contentWindow.postMessage(
      { type: "jargon-floor:mode", mode, ...(options.lockMode ? { lockedMode: mode } : {}) },
      target,
    );
    frame.contentWindow.postMessage({ type: "jargon-floor:agents", agents: toFloorAgents(options.agents()) }, target);
  };

  // The floor starts its message listener after its scripts run, which can be after the load event.
  // The same message is safe to send again, so it goes out a few more times just after load.
  const postWithRetries = () => {
    post();
    for (const delay of [300, 1000, 2500]) setTimeout(post, delay);
  };

  const onMessage = (event: MessageEvent) => {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!isRecord(data)) return;
    if (data.type === "jargon-floor:select" && typeof data.id === "string") {
      options.onSelectAgent(data.id, parseFloorRole(data.role));
    } else if (data.type === "jargon-floor:close") {
      options.onClose();
    } else if (data.type === "jargon-floor:customize") {
      // The whole message is checked here: the id must be a string and the look is kept only if valid.
      const message = parseCustomizeMessage(data);
      if (message) options.onCustomize(message.id, message.custom);
    }
  };

  const openCustomizer = (agentId: string) => {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type: "jargon-floor:customize-open", id: agentId }, targetOrigin(frame));
  };

  // Every change of the agent list reaches the floor. The effect reads `options.agents()`, so it
  // runs again on each change, and `post` does nothing while no iframe is attached.
  // Solid 2 effects take a compute function (tracked) and an effect function (not tracked).
  createEffect(
    () => [options.agents(), options.mode?.()],
    () => post(),
  );

  window.addEventListener("message", onMessage);
  onCleanup(() => window.removeEventListener("message", onMessage));

  return {
    openCustomizer,
    attach(next) {
      if (frame) frame.removeEventListener("load", postWithRetries);
      frame = next;
      // A new iframe starts empty, so the list goes out again once it has loaded.
      frame?.addEventListener("load", postWithRetries);
      post();
    },
  };
}
