import { type Custom, type Role, recipeFor } from "./people";
import { PORTRAIT_H, PORTRAIT_W, type Recipe, renderPortrait } from "./portraitArt";

/** What to draw: the role look, the person index, the clothes colour and an optional saved customisation. */
export interface PersonLook {
  role?: Role;
  /** Index into the 12 shape people (use `personIndex(shape, face)`). */
  person: number;
  /** Clothes colour as #rrggbb. */
  color: string;
  custom?: Custom;
}

function drawPortrait(recipe: Recipe): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = PORTRAIT_W;
  cv.height = PORTRAIT_H;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(PORTRAIT_W, PORTRAIT_H);
  img.data.set(renderPortrait(recipe));
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** An 18x28 portrait canvas of a person. */
export function portraitCanvas(look: PersonLook): HTMLCanvasElement {
  return drawPortrait(recipeFor(look.role ?? "worker", look.person, look.color, look.custom));
}

const cache = new Map<string, string>();

/** A PNG data URL of the portrait, scaled with nearest-neighbour. Cached by look and scale. */
export function portraitDataUrl(look: PersonLook, scale = 4): string {
  const key = `${look.role ?? "worker"}:${look.person}:${look.color}:${look.custom ? JSON.stringify(look.custom) : ""}:${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = portraitCanvas(look);
  const out = document.createElement("canvas");
  out.width = PORTRAIT_W * scale;
  out.height = PORTRAIT_H * scale;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
