/*
 * The custom look of each person on the floor, kept per agent id. The normal app keeps its own avatars,
 * so this look is only for the floor. It is a local preference, kept in this computer's storage. It is
 * checked again on every read, so a bad or edited value is dropped instead of being sent to the floor.
 */
import { notifyFloorCustomChanged } from "@jargon/ui/features/agents/person-look";
import { type FloorCustom, parseFloorCustom } from "@jargon/ui/features/floor/floor-custom";

const KEY_PREFIX = "jargon:floor-custom:";

export function readFloorCustom(agentId: string): FloorCustom | null {
  try {
    const stored = window.localStorage.getItem(KEY_PREFIX + agentId);
    return stored === null ? null : parseFloorCustom(JSON.parse(stored));
  } catch {
    // Storage can be blocked, or the stored text is not JSON. The default look is used.
    return null;
  }
}

export function writeFloorCustom(agentId: string, custom: FloorCustom | null): void {
  try {
    if (custom) window.localStorage.setItem(KEY_PREFIX + agentId, JSON.stringify(custom));
    else window.localStorage.removeItem(KEY_PREFIX + agentId);
  } catch {
    // Storage can be blocked. The choice then lasts only until the app restarts.
  }
  notifyFloorCustomChanged();
}
