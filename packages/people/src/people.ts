// The pure floor people: Munder Difflin's own characters. The avatar shape picks the person, the avatar
// colour picks the clothes. A saved `Custom` look overrides any part.
import { type BaseName, HAIR_STYLES, type HairStyle, RECIPES, type Recipe, SKIN } from "./portraitArt";

export type { BaseName, HairStyle, Recipe };
export { HAIR_STYLES };

export type Role = "boss" | "worker" | "principal" | "teacher" | "librarian" | "student";

/** The people an avatar shape can pick, in shape order (12 shapes in the avatar picker). */
export const SHAPE_PEOPLE: BaseName[] = [
  "jim",
  "pam",
  "dwight",
  "kevin",
  "angela",
  "oscar",
  "stanley",
  "phyllis",
  "andy",
  "kelly",
  "ryan",
  "toby",
];
/** Every person the customiser offers. */
export const ALL_PEOPLE: BaseName[] = [
  "michael",
  "jim",
  "pam",
  "dwight",
  "kevin",
  "angela",
  "oscar",
  "stanley",
  "phyllis",
  "andy",
  "kelly",
  "ryan",
  "toby",
  "creed",
  "meredith",
];
export const SKIN_TONES = Object.keys(SKIN) as Array<"light" | "tan" | "brown" | "dark">;
export const FACIAL_STYLES = ["none", "mustache", "mustacheSm", "stubble", "goatee"] as const;

/** A saved customisation. Every field is optional; a missing field keeps the default. */
export interface Custom {
  person?: BaseName;
  skin?: (typeof SKIN_TONES)[number];
  hair?: HairStyle;
  hairColor?: string; // #rrggbb
  clothes?: string; // #rrggbb
  tie?: string; // #rrggbb
  glasses?: boolean;
  facial?: (typeof FACIAL_STYLES)[number];
}

type RGB = [number, number, number];
const rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex = (c: RGB): string => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

/** The recipe for one agent: role look from the avatar colour, then the saved customisation on top. */
export function recipeFor(role: Role, shape: number, color: string, custom?: Custom): Recipe {
  const idx = ((shape % SHAPE_PEOPLE.length) + SHAPE_PEOPLE.length) % SHAPE_PEOPLE.length;
  const accent = rgb(color);
  const dark = (c: RGB, f: number): RGB => [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f)];
  let base: BaseName = custom?.person ?? SHAPE_PEOPLE[idx]!;
  if (!custom?.person) {
    if (role === "boss") base = "michael";
    else if (role === "principal") base = "creed";
    else if (role === "librarian") base = "angela";
  }
  const r: Recipe = { ...RECIPES[base] };
  const female = !!r.lashes;
  if (role === "boss") Object.assign(r, { cloth: "suit", c1: [58, 63, 74], tie: accent });
  else if (role === "principal")
    Object.assign(r, { cloth: "suit", c1: [45, 47, 58], tie: accent, glasses: true, facial: undefined });
  else if (role === "librarian")
    Object.assign(r, { cloth: "cardigan", c1: accent, c2: [235, 233, 226], glasses: true });
  else if (role === "teacher") {
    if (female) Object.assign(r, { cloth: "blouse", c1: accent, pants: [60, 52, 70] });
    else Object.assign(r, { cloth: "dressshirt", c1: [236, 236, 240], tie: accent, pants: [42, 44, 56] });
  } else if (role === "student") {
    // school uniform: white shirt with the avatar colour as the tie, navy bottoms, no beards, full hair
    Object.assign(r, {
      cloth: "dressshirt",
      c1: [240, 240, 244],
      tie: accent,
      pants: [40, 52, 110],
      facial: undefined,
      heavy: false,
    });
    if (r.hair === "styleBald" || r.hair === "styleRecede") r.hair = "styleShort";
    r.hairargs = { ...(r.hairargs ?? {}), recede: 0 };
  } else {
    if (r.cloth === "suit") r.cloth = "dressshirt";
    r.c1 = accent;
    if (r.c2) r.c2 = dark(accent, 0.85);
  }
  if (custom) {
    if (custom.skin) r.skin = custom.skin;
    if (custom.hair) r.hair = custom.hair;
    if (custom.hairColor) r.hairc = rgb(custom.hairColor);
    if (custom.clothes) {
      r.c1 = rgb(custom.clothes);
      if (r.c2 && role !== "student") r.c2 = dark(r.c1, 0.85);
    }
    if (custom.tie) r.tie = rgb(custom.tie);
    if (custom.glasses !== undefined) r.glasses = custom.glasses;
    if (custom.facial) r.facial = custom.facial === "none" ? undefined : custom.facial;
  }
  return r;
}

/** The look a person has right now as editable fields (for the customiser's starting values). */
export function customOf(
  r: Recipe,
): Required<Pick<Custom, "skin" | "hair" | "hairColor" | "clothes" | "glasses" | "facial">> & { tie: string } {
  return {
    skin: r.skin as Custom["skin"] & string,
    hair: r.hair,
    hairColor: hex(r.hairc),
    clothes: hex(r.c1),
    tie: hex(r.tie ?? [120, 130, 150]),
    glasses: !!r.glasses,
    facial: (r.facial ?? "none") as (typeof FACIAL_STYLES)[number],
  };
}

/** One index into SHAPE_PEOPLE from the blob's silhouette (0-6) and face (0-15), so 112 blobs spread over the 12 people. */
export function personIndex(shape: number, face: number): number {
  return (Math.abs(shape) * 5 + Math.abs(face)) % SHAPE_PEOPLE.length;
}
