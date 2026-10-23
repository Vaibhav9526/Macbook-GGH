import type { AvatarHue } from "@jargon/contracts/ipc";
import { type Custom, customOf, type PersonLook, personIndex, portraitDataUrl, recipeFor } from "@jargon/people";
import { createSignal } from "solid-js";
import { FLOOR_SHAPE_ORDER, floorAvatarOf } from "../floor/floor-avatar";
import { type FloorCustom, parseFloorCustom } from "../floor/floor-custom";

/*
 * Every agent avatar is a human portrait (Munder Difflin art, @jargon/people). The stored avatar is
 * still the seed and the hue: the seed gives a silhouette index and a face index, which pick the
 * person (personIndex), and the hue gives the clothes colour. A look saved on the floor for the
 * agent id (`jargon:floor-custom:<agentId>`) is drawn on top, so the sidebar matches the floor.
 */

const FLOOR_CUSTOM_KEY_PREFIX = "jargon:floor-custom:";
const PORTRAIT_SCALE = 4;

const [customRevision, setCustomRevision] = createSignal(0);

/** Call after the saved floor look of an agent changes, so the avatars draw again. */
export function notifyFloorCustomChanged(): void {
  setCustomRevision((value) => value + 1);
}

function readSavedCustom(agentId: string): Custom | undefined {
  customRevision();
  try {
    const stored = window.localStorage.getItem(FLOOR_CUSTOM_KEY_PREFIX + agentId);
    return (stored === null ? null : parseFloorCustom(JSON.parse(stored))) ?? undefined;
  } catch {
    // Storage can be blocked, or the stored text is not JSON. The default look is used.
    return undefined;
  }
}

/** What to draw for an avatar seed and hue. `silhouette` overrides the seeded silhouette. */
export function personLookOf(
  seed: string,
  hue: AvatarHue | null,
  agentId?: string | undefined,
  silhouette?: string | undefined,
  /** A look to draw instead of the saved one, such as the draft in the create-agent form. */
  customOverride?: FloorCustom | null | undefined,
): PersonLook {
  const floor = floorAvatarOf(seed, hue);
  const shape = silhouette === undefined ? floor.shape : Math.max(0, FLOOR_SHAPE_ORDER.indexOf(silhouette));
  const custom =
    customOverride !== undefined ? (customOverride ?? undefined) : agentId ? readSavedCustom(agentId) : undefined;
  return { role: "worker", person: personIndex(shape, floor.face), color: floor.color, ...(custom ? { custom } : {}) };
}

/** The PNG data URL of the portrait of an avatar seed and hue. */
export function personPortraitUrl(
  seed: string,
  hue: AvatarHue | null,
  agentId?: string | undefined,
  silhouette?: string | undefined,
  customOverride?: FloorCustom | null | undefined,
): string {
  return portraitDataUrl(personLookOf(seed, hue, agentId, silhouette, customOverride), PORTRAIT_SCALE);
}

/** The editable fields of the look an avatar has now (the default person with `custom` on top). */
export function personEditableLook(seed: string, hue: AvatarHue | null, custom: FloorCustom | null | undefined) {
  const look = personLookOf(seed, hue, undefined, undefined, custom ?? null);
  return customOf(recipeFor(look.role ?? "worker", look.person, look.color, look.custom));
}
