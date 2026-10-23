/*
 * The saved look of a person on the floor. The floor app (apps/floor) draws the people. The app keeps
 * the user's choices and sends them back on each agents message. This file holds the host copy of the
 * lists the floor accepts. Keep them in step with apps/floor/src/scene/office/spriteGen.ts and
 * portraitArt.ts (ALL_PEOPLE, SKIN_TONES, FACIAL_STYLES, HAIR_STYLES).
 */

export const FLOOR_PEOPLE = [
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
] as const;
export const FLOOR_SKIN_TONES = ["light", "tan", "brown", "dark"] as const;
export const FLOOR_HAIR_STYLES = [
  "styleShort",
  "styleFloppy",
  "styleFrame",
  "styleBun",
  "styleCurly",
  "styleMessy",
  "styleRecede",
  "styleSpiky",
  "styleBald",
] as const;
export const FLOOR_FACIAL_STYLES = ["none", "mustache", "mustacheSm", "stubble", "goatee"] as const;

/** A saved customisation. Every field is optional; a missing field keeps the default. */
export interface FloorCustom {
  person?: (typeof FLOOR_PEOPLE)[number];
  skin?: (typeof FLOOR_SKIN_TONES)[number];
  hair?: (typeof FLOOR_HAIR_STYLES)[number];
  /** `#rrggbb` */
  hairColor?: string;
  /** `#rrggbb` */
  clothes?: string;
  /** `#rrggbb` */
  tie?: string;
  glasses?: boolean;
  facial?: (typeof FLOOR_FACIAL_STYLES)[number];
}

const HEX = /^#[0-9a-f]{6}$/i;

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * Keeps only the known fields with valid values. Unknown keys and bad values are dropped, so a
 * message can never store more than the customiser offers. Returns `null` when nothing is left.
 */
export function parseFloorCustom(value: unknown): FloorCustom | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const out: FloorCustom = {};
  if (oneOf(FLOOR_PEOPLE, raw.person)) out.person = raw.person;
  if (oneOf(FLOOR_SKIN_TONES, raw.skin)) out.skin = raw.skin;
  if (oneOf(FLOOR_HAIR_STYLES, raw.hair)) out.hair = raw.hair;
  if (typeof raw.hairColor === "string" && HEX.test(raw.hairColor)) out.hairColor = raw.hairColor;
  if (typeof raw.clothes === "string" && HEX.test(raw.clothes)) out.clothes = raw.clothes;
  if (typeof raw.tie === "string" && HEX.test(raw.tie)) out.tie = raw.tie;
  if (typeof raw.glasses === "boolean") out.glasses = raw.glasses;
  if (oneOf(FLOOR_FACIAL_STYLES, raw.facial)) out.facial = raw.facial;
  return Object.keys(out).length > 0 ? out : null;
}

/** A customise message from the floor: the agent id and the new look, or `null` to reset it. */
export interface FloorCustomizeMessage {
  id: string;
  custom: FloorCustom | null;
}

/** Reads a `jargon-floor:customize` message. Returns `null` for anything else. */
export function parseCustomizeMessage(data: unknown): FloorCustomizeMessage | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as { type?: unknown; id?: unknown; custom?: unknown };
  if (raw.type !== "jargon-floor:customize" || typeof raw.id !== "string" || raw.id.length === 0) return null;
  return { id: raw.id, custom: parseFloorCustom(raw.custom) };
}
