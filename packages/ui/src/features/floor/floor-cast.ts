/*
 * The floor's modes and the roles it gives each agent. The floor decides the role from the order of
 * the agents in the list (apps/floor/src/floor/avatarMap.ts). The app only shows the role it is sent.
 */

export type FloorMode = "office" | "school";

/** The role label the floor gives an agent. */
export type FloorRole = "boss" | "worker" | "teacher" | "student";

const FLOOR_ROLES: readonly FloorRole[] = ["boss", "worker", "teacher", "student"];

/** Reads a role from a message. Anything the app does not know is `null`, so no label is shown. */
export function parseFloorRole(value: unknown): FloorRole | null {
  return typeof value === "string" && (FLOOR_ROLES as readonly string[]).includes(value) ? (value as FloorRole) : null;
}
