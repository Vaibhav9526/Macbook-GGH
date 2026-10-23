// Message protocol between the host app and the floor island.
//
// The floor never reads Jargon's store, IPC or terminals. The host sends a
// plain list of agents, and the floor sends back clicks and close requests.
//
//   host  -> floor   { type: 'jargon-floor:agents', agents: FloorAgent[] }
//   host  -> floor   { type: 'jargon-floor:mode', mode: 'office' | 'school', lockedMode?: 'office' | 'school' }   (optional; lockedMode hides the mode switch)
//   floor -> host    { type: 'jargon-floor:select', id: string, role?: FloorRole }
//   floor -> host    { type: 'jargon-floor:close' }
//   floor -> host    { type: 'jargon-floor:customize', id: string, custom: Custom | null }   (the user changed a look; the host saves it)
//   host  -> floor   { type: 'jargon-floor:customize-open', id: string }   (open the look panel for an agent)
//
// Each agent's `avatar` is the agent's own blob avatar: { shape, face, color }. `shape` is an index
// from 0 to 6 into the blob silhouette list, `face` an index from 0 to 15 into the blob face list
// (status/v2-E-avatar.md has both lists), and `color` a hex colour. A plain string `avatar` is an
// override from the host: a character key such as "jim". The floor draws the human from `look`
// and falls back to the key when there is none.

import { ALL_PEOPLE, type Custom, FACIAL_STYLES, HAIR_STYLES, SKIN_TONES } from "@/scene/office/spriteGen";

export type FloorStatus = "working" | "idle" | "waiting";
export type FloorMode = "office" | "school";
/** The role the floor gives an agent. The floor chooses it from the agent's place in the list. */
export type FloorRole = "boss" | "worker" | "teacher" | "student";

/** The blob look of an agent: silhouette index, face index and a hex colour. */
export interface FloorLook {
  shape: number;
  face: number;
  color: string;
}

export interface FloorAgent {
  /** Stable id from the host. Returned as-is in `select`. */
  id: string;
  name: string;
  status: FloorStatus;
  /** Character key, for example "jim" or "teacher". Empty when the agent is drawn from `look`. */
  avatar: string;
  /** The agent's blob look, or `null` when the host sent none or it was not valid. */
  look: FloorLook | null;
  /** One line of what the agent is doing. Shown in the thought bubble. */
  task: string;
  /** The saved look the user made for this agent on the floor, or null for the default look. */
  custom: Custom | null;
  /** The role the host gives this agent (a school persona). The floor uses it before the list order. */
  role: AgentRole | null;
}

/** Roles the host can send. */
export type AgentRole = "boss" | "worker" | "principal" | "teacher" | "librarian" | "student";
const AGENT_ROLES: ReadonlySet<string> = new Set(["boss", "worker", "principal", "teacher", "librarian", "student"]);

export const MSG_AGENTS = "jargon-floor:agents";
export const MSG_MODE = "jargon-floor:mode";
export const MSG_SELECT = "jargon-floor:select";
export const MSG_CLOSE = "jargon-floor:close";
export const MSG_CUSTOMIZE = "jargon-floor:customize";
export const MSG_CUSTOMIZE_OPEN = "jargon-floor:customize-open";

/** How many blob silhouettes and faces the floor accepts. Indexes run from 0 to the count minus 1. */
export const SHAPE_COUNT = 7;
export const FACE_COUNT = 16;

const MAX_AGENTS = 60;
const MAX_TEXT = 120;
const STATUSES: ReadonlySet<string> = new Set(["working", "idle", "waiting"]);
const ROLES: ReadonlySet<string> = new Set(["boss", "worker", "teacher", "student"]);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Checks a blob look. Returns null unless shape and face are whole indexes and the colour is hex. */
export function parseLook(value: unknown): FloorLook | null {
  if (!value || typeof value !== "object") return null;
  const look = value as { shape?: unknown; face?: unknown; color?: unknown };
  if (!isIndex(look.shape, SHAPE_COUNT) || !isIndex(look.face, FACE_COUNT)) return null;
  if (typeof look.color !== "string" || !HEX_COLOR.test(look.color)) return null;
  return { shape: look.shape, face: look.face, color: look.color };
}

function isIndex(value: unknown, count: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < count;
}

/** Reads a role. Anything the floor does not know is `null`. */
export function parseRole(value: unknown): FloorRole | null {
  return typeof value === "string" && ROLES.has(value) ? (value as FloorRole) : null;
}

/** Checks an untrusted message payload. Returns null when it is not an agents message. */
export function parseAgentsMessage(data: unknown): FloorAgent[] | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as { type?: unknown; agents?: unknown };
  if (msg.type !== MSG_AGENTS || !Array.isArray(msg.agents)) return null;
  const out: FloorAgent[] = [];
  for (const raw of msg.agents.slice(0, MAX_AGENTS)) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const id = clip(a.id, 120);
    if (!id) continue;
    const status = typeof a.status === "string" && STATUSES.has(a.status) ? (a.status as FloorStatus) : "idle";
    // An object avatar is the blob look. A string avatar is the host's override key.
    const blob = typeof a.avatar === "object" ? parseLook(a.avatar) : null;
    out.push({
      id,
      name: clip(a.name, 60) || id,
      status,
      avatar: typeof a.avatar === "string" ? clip(a.avatar, 60) : "",
      look: blob,
      task: clip(a.task, MAX_TEXT),
      custom: parseCustom(a.custom),
      role: typeof a.role === "string" && AGENT_ROLES.has(a.role) ? (a.role as AgentRole) : null,
    });
  }
  return out;
}

/** Reads a mode message. Returns null for anything else. */
export function parseModeMessage(data: unknown): FloorMode | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as { type?: unknown; mode?: unknown };
  if (msg.type !== MSG_MODE) return null;
  return msg.mode === "school" ? "school" : msg.mode === "office" ? "office" : null;
}

/**
 * Reads the mode the host fixed in a mode message (`lockedMode`). Returns null when the host sent no
 * fixed mode, so the floor keeps its mode switch.
 */
export function parseLockedMode(data: unknown): FloorMode | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as { type?: unknown; lockedMode?: unknown };
  if (msg.type !== MSG_MODE) return null;
  return msg.lockedMode === "school" ? "school" : msg.lockedMode === "office" ? "office" : null;
}

/** The select message for an agent the user clicked. `role` is the role the floor gave it. */
export function selectMessage(id: string, role: FloorRole | null): { type: string; id: string; role?: FloorRole } {
  return role ? { type: MSG_SELECT, id, role } : { type: MSG_SELECT, id };
}

/** Sends a message to the host. Works in an iframe (parent) and in the standalone page (no parent). */
export function sendToHost(message: Record<string, unknown>): void {
  const target = window.parent && window.parent !== window ? window.parent : window;
  target.postMessage(message, "*");
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexOrUndefined = (v: unknown): string | undefined => (typeof v === "string" && HEX.test(v) ? v : undefined);

/** Checks a saved look. Unknown or wrong fields are dropped. Returns null when nothing valid is left. */
export function parseCustom(value: unknown): Custom | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out: Custom = {};
  if (typeof v.person === "string" && (ALL_PEOPLE as readonly string[]).includes(v.person))
    out.person = v.person as Custom["person"];
  if (typeof v.skin === "string" && (SKIN_TONES as readonly string[]).includes(v.skin))
    out.skin = v.skin as Custom["skin"];
  if (typeof v.hair === "string" && (HAIR_STYLES as readonly string[]).includes(v.hair))
    out.hair = v.hair as Custom["hair"];
  const hairColor = hexOrUndefined(v.hairColor);
  if (hairColor) out.hairColor = hairColor;
  const clothes = hexOrUndefined(v.clothes);
  if (clothes) out.clothes = clothes;
  const tie = hexOrUndefined(v.tie);
  if (tie) out.tie = tie;
  if (typeof v.glasses === "boolean") out.glasses = v.glasses;
  if (typeof v.facial === "string" && (FACIAL_STYLES as readonly string[]).includes(v.facial))
    out.facial = v.facial as Custom["facial"];
  return Object.keys(out).length > 0 ? out : null;
}

/** The customize message for the host. A null custom means the user reset the look. */
export function customizeMessage(
  id: string,
  custom: Custom | null,
): { type: string; id: string; custom: Custom | null } {
  return { type: MSG_CUSTOMIZE, id, custom };
}

/** Reads a customize-open message. Returns the agent id, or null for anything else. */
export function parseCustomizeOpen(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as { type?: unknown; id?: unknown };
  return msg.type === MSG_CUSTOMIZE_OPEN && typeof msg.id === "string" ? msg.id : null;
}
