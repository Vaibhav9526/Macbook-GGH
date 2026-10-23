// The floor's Pixi texture code. The pure people live in @jargon/people.

import {
  type Custom,
  type Pose,
  portraitCanvas as peoplePortraitCanvas,
  recipeFor as peopleRecipeFor,
  type Recipe,
  type Role,
  renderSceneFrame,
  SCENE_H,
  SCENE_W,
  SHAPE_PEOPLE,
} from "@jargon/people";
import { Texture } from "pixi.js";

export {
  ALL_PEOPLE,
  customOf,
  FACIAL_STYLES,
  HAIR_STYLES,
  personIndex,
  SHAPE_PEOPLE,
  SKIN_TONES,
} from "@jargon/people";

/**
 * The floor recipe of an agent. The face (the person, skin, hair, facial hair and glasses) is the one
 * the agent's chat avatar draws, which is the 'worker' look. The role only changes the clothes, so a
 * boss, principal, librarian or student keeps the same face as the chat avatar.
 */
export function recipeFor(role: Role, shape: number, color: string, custom?: Custom): Recipe {
  const idx = ((shape % SHAPE_PEOPLE.length) + SHAPE_PEOPLE.length) % SHAPE_PEOPLE.length;
  const withPerson: Custom = { ...custom, person: custom?.person ?? SHAPE_PEOPLE[idx]! };
  const face = peopleRecipeFor("worker", shape, color, withPerson);
  const dressed = peopleRecipeFor(role, shape, color, withPerson);
  return {
    ...dressed,
    skin: face.skin,
    hair: face.hair,
    hairc: face.hairc,
    hairargs: face.hairargs,
    facial: face.facial,
    glasses: face.glasses,
  };
}
export type { BaseName, Custom, HairStyle, Pose, Recipe, Role } from "@jargon/people";
export { SCENE_H as FRAME_H, SCENE_W as FRAME_W };

/** Frame columns per direction. */
export const POSES: Pose[] = ["stand", "stepL", "stepR", "type1", "type2", "read1", "read2", "teach", "hand"];

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const cv = document.createElement("canvas");
  cv.width = SCENE_W;
  cv.height = SCENE_H;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(SCENE_W, SCENE_H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  const t = Texture.from(cv);
  t.source.scaleMode = "nearest";
  return t;
}

const cache = new Map<string, Texture[][]>();

/** Frames as Texture[row][col]: rows are down, up, right (left is the mirror of right); columns follow POSES.
 *  Down shows the face, up shows the back (seated agents face their desk), right reuses the front view. */
export function framesForRecipe(key: string, r: Recipe): Texture[][] {
  const hit = cache.get(key);
  if (hit) return hit;
  const front = POSES.map((p) => bufToTexture(renderSceneFrame(r, p, false)));
  const back = POSES.map((p) => bufToTexture(renderSceneFrame(r, p, true)));
  const rows = [front, back, front];
  cache.set(key, rows);
  return rows;
}

export function framesForAgent(role: Role, shape: number, color: string, custom?: Custom): Texture[][] {
  return framesForRecipe(
    `${role}:${shape}:${color}:${custom ? JSON.stringify(custom) : ""}`,
    recipeFor(role, shape, color, custom),
  );
}

/** An 18x28 portrait canvas of a person, for cards and the customiser. */
export function portraitCanvas(role: Role, shape: number, color: string, custom?: Custom): HTMLCanvasElement {
  return peoplePortraitCanvas({ role, person: shape, color, custom });
}
