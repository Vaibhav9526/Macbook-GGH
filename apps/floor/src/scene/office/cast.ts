// Character roster and sprite loading for the floor.
//
// Frames are drawn in code (spriteGen.ts); no sprite images are loaded.

import { Texture } from "pixi.js";

export type OfficeCharacterName =
  | "boss"
  | "worker_1"
  | "worker_2"
  | "worker_3"
  | "worker_4"
  | "worker_5"
  | "worker_6"
  | "principal"
  | "librarian"
  | "male_teacher"
  | "female_teacher"
  | "student_1"
  | "student_2"
  | "student_3"
  | "student_4";

export interface CastMember {
  name: OfficeCharacterName;
  displayName: string;
  /** Accent colour (hex), used for the selection glow. */
  shirt: string;
}

export const OFFICE_CAST: CastMember[] = [
  { name: "boss", displayName: "Boss", shirt: "#b5544a" },
  { name: "worker_1", displayName: "Worker 1", shirt: "#6fa8dc" },
  { name: "worker_2", displayName: "Worker 2", shirt: "#b5544a" },
  { name: "worker_3", displayName: "Worker 3", shirt: "#6b7a4b" },
  { name: "worker_4", displayName: "Worker 4", shirt: "#b08bbf" },
  { name: "worker_5", displayName: "Worker 5", shirt: "#4a7ab5" },
  { name: "worker_6", displayName: "Worker 6", shirt: "#9a8c5a" },
];

export const SCHOOL_CAST: CastMember[] = [
  { name: "principal", displayName: "Principal", shirt: "#2b394f" },
  { name: "librarian", displayName: "Librarian", shirt: "#365846" },
  { name: "male_teacher", displayName: "Male teacher", shirt: "#2f5f9e" },
  { name: "female_teacher", displayName: "Female teacher", shirt: "#d16ba5" },
  { name: "student_1", displayName: "Student 1", shirt: "#b5544a" },
  { name: "student_2", displayName: "Student 2", shirt: "#2f5f9e" },
  { name: "student_3", displayName: "Student 3", shirt: "#2b5341" },
  { name: "student_4", displayName: "Student 4", shirt: "#9a8c5a" },
];

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> = Object.fromEntries(
  [...OFFICE_CAST, ...SCHOOL_CAST].map((c) => [c.name, c]),
) as Record<OfficeCharacterName, CastMember>;

export const DEFAULT_CHARACTER: OfficeCharacterName = "worker_1";

export function castForTheme(theme: string): CastMember[] {
  return theme === "staffroom" ? SCHOOL_CAST : OFFICE_CAST;
}

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

// ---- sprites (drawn in code by spriteGen.ts) -------------------------------------

import { framesForAgent, type Role } from "./spriteGen";

const NAMED: Record<OfficeCharacterName, { role: Role; shape: number; color: string }> = {
  boss: { role: "boss", shape: 8, color: "#c0392b" },
  worker_1: { role: "worker", shape: 0, color: "#f2f2f2" },
  worker_2: { role: "worker", shape: 2, color: "#f4f0ee" },
  worker_3: { role: "worker", shape: 1, color: "#6b7a4b" },
  worker_4: { role: "worker", shape: 3, color: "#d49aa8" },
  worker_5: { role: "worker", shape: 4, color: "#3f78c4" },
  worker_6: { role: "worker", shape: 5, color: "#f2f2f2" },
  principal: { role: "principal", shape: 8, color: "#c0392b" },
  librarian: { role: "librarian", shape: 6, color: "#3f7a4e" },
  male_teacher: { role: "teacher", shape: 1, color: "#2f5f9e" },
  female_teacher: { role: "teacher", shape: 2, color: "#d16ba5" },
  student_1: { role: "student", shape: 11, color: "#c8332f" },
  student_2: { role: "student", shape: 4, color: "#243b7a" },
  student_3: { role: "student", shape: 3, color: "#c8332f" },
  student_4: { role: "student", shape: 5, color: "#4a8a4f" },
};

/** Frames as Texture[row][col]: rows are down, up, right; columns are the poses in spriteGen.POSES. */
export async function getCastFrames(name: OfficeCharacterName): Promise<Texture[][]> {
  const n = NAMED[name];
  return framesForAgent(n.role, n.shape, n.color);
}

/** Frames for an agent from its avatar: the shape picks the person, the colour picks the clothes. */
export function getAgentFrames(role: Role, shape: number, color: string): Texture[][] {
  return framesForAgent(role, shape, color);
}

/** Held poses are not used any more: seated typing and reading are animations. */
export async function getCastPoses(_name: OfficeCharacterName): Promise<Record<string, Texture>> {
  return {};
}

const textureCache = new Map<string, Promise<Texture>>();

/** Loads one PNG as a pixel-crisp texture. Cached by URL. */
export function loadSpriteTexture(url: string): Promise<Texture> {
  let p = textureCache.get(url);
  if (!p) {
    p = new Promise<Texture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const tex = Texture.from(img);
        tex.source.scaleMode = "nearest";
        resolve(tex);
      };
      img.onerror = () => reject(new Error("failed to load " + url));
      img.src = url;
    });
    textureCache.set(url, p);
  }
  return p;
}
