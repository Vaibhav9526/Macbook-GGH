// How the floor draws one agent: the role it gets, the person and the saved custom look.
// Both scenes use this, so the Office and the School draw the same person for the same agent.

import type { Texture } from "pixi.js";
import { type Custom, framesForAgent, personIndex, type Role } from "@/scene/office/spriteGen";
import type { FloorAgent, FloorMode } from "./protocol";

const SCHOOL_ROLES: ReadonlySet<string> = new Set(["principal", "teacher", "librarian", "student"]);
const OFFICE_ROLES: ReadonlySet<string> = new Set(["boss", "worker"]);

/**
 * The role an agent gets. A role from the host (a school persona) comes first, when this floor draws it.
 * Otherwise the agent gets a role from its place in the host list.
 */
export function roleFor(mode: FloorMode, index: number, agent?: FloorAgent): Role {
  const given = agent?.role;
  if (given && (mode === "school" ? SCHOOL_ROLES : OFFICE_ROLES).has(given)) return given;
  if (mode === "school") {
    if (index === 0) return "principal";
    if (index === 1 || index === 2) return "teacher";
    if (index === 3) return "librarian";
    return "student";
  }
  return index === 0 ? "boss" : "worker";
}

const FALLBACK_COLORS = ["#e0482f", "#2f7de0", "#8a3fd6", "#2fa35b", "#e0a02f", "#d6408f", "#2f9fb5"];

/** A small stable number from the agent id, for agents that arrive without a blob look. */
function hashOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The look inputs of an agent: the person index and the clothes colour. */
export function lookOf(agent: FloorAgent): { person: number; color: string } {
  if (agent.look) return { person: personIndex(agent.look.shape, agent.look.face), color: agent.look.color };
  const h = hashOf(agent.id);
  return { person: personIndex(h % 7, (h >> 3) % 16), color: FALLBACK_COLORS[h % FALLBACK_COLORS.length] };
}

/** The sprite frames for an agent: Munder's person, in the agent's colour, with the saved custom look on top. */
export function framesFor(agent: FloorAgent, role: Role): Texture[][] {
  const { person, color } = lookOf(agent);
  return framesForAgent(role, person, color, agent.custom ?? undefined);
}

/** A key that changes when the drawn person changes. */
export function lookKey(agent: FloorAgent, role: Role): string {
  const { person, color } = lookOf(agent);
  return `${role}:${person}:${color}:${agent.custom ? JSON.stringify(agent.custom) : ""}`;
}

export type { Custom };
