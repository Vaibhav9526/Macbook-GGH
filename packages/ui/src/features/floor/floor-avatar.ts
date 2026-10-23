import type { AvatarHue } from "@jargon/contracts/ipc";
import { EXPRESSIONS, SHAPES } from "@norbert_bodziony/bloub";
import { avatarHeadColor, bloubAvatarProfile } from "../../bloub-avatar";

/*
 * The floor human of an agent comes from the agent's own blob avatar. A blob has a silhouette, a
 * face (expression) and a colour. All three come from the agent's avatar seed and hue (see the brand
 * package, bloub-avatar.ts). The create-agent picker's faces differ by face, and the silhouettes repeat.
 *
 * The floor gets the index of the silhouette, the index of the face and the hex colour. The index
 * lists below are the library order, with the unsupported silhouette "goutte" left out. They are the
 * same for every agent, so an index always means the same look.
 */

/** The blob silhouettes the floor can draw, in index order (0 to 6). */
export const FLOOR_SHAPE_ORDER: readonly string[] = SHAPES.map((option) => option.id).filter((id) => id !== "goutte");

/** The blob faces (expressions) the floor can draw, in index order (0 to 15). */
export const FLOOR_FACE_ORDER: readonly string[] = EXPRESSIONS.map((option) => option.id);

/** The blob look of an agent as the floor reads it. */
export interface FloorAvatar {
  /** Index into FLOOR_SHAPE_ORDER. */
  shape: number;
  /** Index into FLOOR_FACE_ORDER. */
  face: number;
  /** The blob colour as a hex value, such as `#e0482f`. */
  color: string;
}

/** The floor avatar of the agent with this seed and hue. */
export function floorAvatarOf(seed: string, hue: AvatarHue | null): FloorAvatar {
  const profile = bloubAvatarProfile(seed, hue);
  return {
    shape: FLOOR_SHAPE_ORDER.indexOf(profile.shape),
    face: FLOOR_FACE_ORDER.indexOf(profile.expression),
    color: avatarHeadColor(seed, hue),
  };
}
