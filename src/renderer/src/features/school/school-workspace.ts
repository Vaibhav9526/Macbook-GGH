import { createSignal } from "solid-js";
import type { SchoolPersonaId } from "./school-personas";

/**
 * The School workspace.
 *
 * A second server is not possible in this architecture: this computer has one local server, with one
 * database, one agent service and one account, and every other server is a separate host that people
 * join. So the School is a workspace of the local server. It has its own agent list: an agent made from a
 * school persona is marked here, the School shows only marked agents, and the Local workspace hides them.
 * The marks live in this computer's browser storage, like the other per-computer view choices.
 */
export type Workspace = "local" | "school";

const WORKSPACE_KEY = "jargon:workspace";
const AGENTS_KEY = "jargon:school-agents";
const SEEDED_KEY = "jargon:school-seeded";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage is blocked: the choice lasts until the window closes */
  }
}

const PERSONA_IDS: readonly SchoolPersonaId[] = ["principal", "teacher", "topper", "smartguy", "librarian", "planner"];

function isPersonaId(value: unknown): value is SchoolPersonaId {
  return PERSONA_IDS.some((id) => id === value);
}

/** Agent id -> the persona it was made from. Unknown persona names are dropped. */
function readMarks(): Readonly<Record<string, SchoolPersonaId>> {
  try {
    const parsed = JSON.parse(read(AGENTS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, SchoolPersonaId> = {};
    for (const [id, persona] of Object.entries(parsed)) {
      if (isPersonaId(persona)) out[id] = persona;
    }
    return out;
  } catch {
    return {};
  }
}

const [workspace, setWorkspaceSignal] = createSignal<Workspace>(read(WORKSPACE_KEY) === "school" ? "school" : "local");
const [marks, setMarks] = createSignal<Record<string, SchoolPersonaId>>(readMarks());

export const currentWorkspace = workspace;
export const schoolActive = (): boolean => workspace() === "school";

export function setWorkspace(next: Workspace): void {
  write(WORKSPACE_KEY, next);
  setWorkspaceSignal(next);
}

/** The hosted classroom that `@teach-me` opens. Jargon only opens the page; it sends no API request. */
export const TEACH_ME_URL = "https://open.maic.chat/";

const TEACH_ME_COMMAND = /(^|\s)@teach-me(?=$|[\s.,:;!?)\]}"'])/i;

/** True when a School message holds the `@teach-me` command. */
export function wantsTeachMe(text: string): boolean {
  return TEACH_ME_COMMAND.test(text);
}

/** The text after the `@teach-me` command, trimmed. Empty when the command has no topic. */
export function teachMeTopic(text: string): string {
  const match = TEACH_ME_COMMAND.exec(text);
  return match ? text.slice(match.index + match[0].length).trim() : "";
}

const FILE_TOOL_COMMAND = /(^|\s)@(convert|compress)(?=$|[\s.,:;!?)\]}"'])/i;

/** True when a message holds `@convert` or `@compress`. Main parses the command again and runs the tool. */
export function wantsFileTool(text: string): boolean {
  return FILE_TOOL_COMMAND.test(text);
}

/** The persona an agent was made from, or undefined for an agent of the Local workspace. */
export function schoolPersonaOf(agentId: string): SchoolPersonaId | undefined {
  return marks()[agentId];
}

export function markSchoolAgent(agentId: string, persona: SchoolPersonaId): void {
  const next = { ...marks(), [agentId]: persona };
  write(AGENTS_KEY, JSON.stringify(next));
  setMarks(next);
}

/** The first agent made from a persona, or undefined when there is none. */
export function schoolAgentIdOf(persona: SchoolPersonaId): string | undefined {
  return Object.entries(marks()).find(([, mark]) => mark === persona)?.[0];
}

/** The agents that this workspace shows: the marked ones in the School, the others in the Local workspace. */
export function inWorkspace<T extends { id: string }>(agents: readonly T[]): T[] {
  const school = schoolActive();
  const current = marks();
  return agents.filter((agent) => agent.id in current === school);
}

/**
 * A persona added after the School first opened is made once for a School that is seeded already: the Planner.
 * The mark stays after the student deletes that agent, so it does not come back.
 */
const EXTRA_SEEDED_KEY = "jargon:school-seeded-extra";

export function extraPersonaSeeded(persona: SchoolPersonaId): boolean {
  return (read(EXTRA_SEEDED_KEY) ?? "").split(",").includes(persona);
}

export function setExtraPersonaSeeded(persona: SchoolPersonaId): void {
  const current = (read(EXTRA_SEEDED_KEY) ?? "").split(",").filter(Boolean);
  if (!current.includes(persona)) write(EXTRA_SEEDED_KEY, [...current, persona].join(","));
}

export function schoolSeeded(): boolean {
  return read(SEEDED_KEY) === "1";
}

export function setSchoolSeeded(): void {
  write(SEEDED_KEY, "1");
}

export function clearSchoolSeeded(): void {
  try {
    localStorage.removeItem(SEEDED_KEY);
  } catch {
    /* storage is blocked */
  }
}
