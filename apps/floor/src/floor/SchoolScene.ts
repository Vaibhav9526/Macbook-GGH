// The School floor: school-map.png as the background, walked on the grid in src/school/layout.json.
// The SchoolDirector decides what each character does (see src/school/SchoolDirector.ts).
// This file only builds the characters and passes them to the director.

import { Container, Sprite } from "pixi.js";
import { Character } from "@/scene/office/Character";
import { hexToNumber, loadSpriteTexture, type OfficeCharacterName } from "@/scene/office/cast";
import type { Custom, Role } from "@/scene/office/spriteGen";
import type { TiledMapRenderer } from "@/scene/office/TiledMapRenderer";
import { lessonSecondsFromUrl, SchoolDirector, type SchoolRole } from "@/school/SchoolDirector";
import { SCHOOL_ENTRANCE, SCHOOL_H, SCHOOL_SEATS, SCHOOL_W, schoolMap } from "@/school/schoolMap";
import schoolMapUrl from "../../art-source/school-map.png?url";
import { framesFor, lookOf } from "./agentLook";
import { characterFor, characterForRole } from "./avatarMap";
import type { FloorAgent } from "./protocol";
import type { SceneFactory } from "./sceneTypes";

type Cell = { x: number; y: number };

/** The customised look saved for an agent, if the host sent one. */
function customOf(agent: FloorAgent): Custom | undefined {
  return (agent as FloorAgent & { custom?: Custom | null }).custom ?? undefined;
}

/** Munder characters (18 x 32) drawn at this scale on the school map. */
const SCHOOL_SPRITE_SCALE = 2.5;

/** Clothes colour when the host sent no look. */
const ROLE_COLOR: Record<Role, string> = {
  boss: "#5a6b8c",
  worker: "#6fa8dc",
  principal: "#2b394f",
  teacher: "#2f5f9e",
  librarian: "#365846",
  student: "#b5544a",
};

/** Role of a cast member on the school floor. */
function roleOf(name: OfficeCharacterName): SchoolRole {
  if (name === "principal") return "principal";
  if (name === "male_teacher" || name === "female_teacher") return "teacher";
  if (name === "librarian") return "librarian";
  return "student";
}

/** School seats by role. Agents past their role take a free seat from the overflow list. */
function schoolSeatFor(name: OfficeCharacterName, free: Set<string>): Cell | null {
  const key = (t: [number, number]) => `${t[0]},${t[1]}`;
  const preferred: Partial<Record<OfficeCharacterName, [number, number]>> = {
    principal: SCHOOL_SEATS.principal,
    male_teacher: SCHOOL_SEATS.teachers[0],
    female_teacher: SCHOOL_SEATS.teachers[1],
    librarian: SCHOOL_SEATS.library[0],
    student_1: SCHOOL_SEATS.students[0],
    student_2: SCHOOL_SEATS.students[1],
    student_3: SCHOOL_SEATS.students[2],
    student_4: SCHOOL_SEATS.students[3],
  };
  const want = preferred[name];
  if (want && free.has(key(want))) {
    free.delete(key(want));
    return { x: want[0], y: want[1] };
  }
  const overflow = [...SCHOOL_SEATS.students, ...SCHOOL_SEATS.library, ...SCHOOL_SEATS.teachers];
  for (const t of overflow) {
    if (free.has(key(t))) {
      free.delete(key(t));
      return { x: t[0], y: t[1] };
    }
  }
  return null;
}

/** The way a seated agent faces: toward the open side of its seat. */
function facingForSeat(map: { isWalkable(x: number, y: number): boolean }, t: Cell): "up" | "down" | "left" | "right" {
  if (!map.isWalkable(t.x, t.y - 1)) return "up";
  if (!map.isWalkable(t.x, t.y + 1)) return "down";
  if (!map.isWalkable(t.x - 1, t.y)) return "left";
  if (!map.isWalkable(t.x + 1, t.y)) return "right";
  return "down";
}

export const createSchoolScene: SceneFactory = async (ctx) => {
  const { world } = ctx;
  const characters = new Map<string, Character>();
  const pending = new Set<string>();

  const bgTex = await loadSpriteTexture(schoolMapUrl);
  if (!ctx.alive()) return null;
  const bg = new Sprite(bgTex);
  bg.width = SCHOOL_W;
  bg.height = SCHOOL_H;
  world.addChild(bg);
  const charLayer = new Container();
  world.addChild(charLayer);
  const map = schoolMap;
  const entrance: Cell = SCHOOL_ENTRANCE;
  // Waiting spots: the walkable tiles around the entrance, nearest first. An agent with no seat waits here
  // and never joins the lesson, so it does not stand in a corridor or at a wall.
  const waitTiles: Cell[] = [];
  for (let radius = 0; radius <= 6 && waitTiles.length < 12; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = entrance.x + dx;
        const y = entrance.y + dy;
        if (map.isWalkable(x, y) && !waitTiles.some((t) => t.x === x && t.y === y)) waitTiles.push({ x, y });
      }
    }
  }
  const waitTileFor = (n: number): Cell => (waitTiles.length > 0 ? waitTiles[n % waitTiles.length] : entrance);

  const director = new SchoolDirector({ phaseSeconds: lessonSecondsFromUrl(60) });

  const key = (t: [number, number]) => `${t[0]},${t[1]}`;
  const freeSchoolSeats = new Set<string>([
    ...SCHOOL_SEATS.students.map((t) => key(t)),
    ...SCHOOL_SEATS.library.map((t) => key(t)),
    ...SCHOOL_SEATS.teachers.map((t) => key(t)),
    key(SCHOOL_SEATS.principal),
  ]);

  const statusOf = (id: string): string => ctx.agents().find((a) => a.id === id)?.status ?? "idle";

  const addAgent = async (id: string, index: number, avatar: string, name: string) => {
    if (pending.has(id) || characters.has(id)) return;
    pending.add(id);
    try {
      // The role comes from the agent's school persona (sent by the host). An agent without one is a student:
      // the place in the list must never give the principal's room to anyone.
      const all = ctx.agents();
      const given = all.find((x) => x.id === id)?.role ?? null;
      const ordinal = all
        .slice(
          0,
          Math.max(
            0,
            all.findIndex((x) => x.id === id),
          ),
        )
        .filter((x) => x.role === given).length;
      const role = characterForRole(given ?? "student", ordinal) ?? "student_1";
      const seatTile = schoolSeatFor(role, freeSchoolSeats);
      // No seat left: the agent waits at the entrance, outside the lesson.
      const waiting = seatTile === null;
      const homeTile: Cell = seatTile ?? waitTileFor(characters.size);
      const live = ctx.agents().find((a) => a.id === id);
      if (!live || !ctx.alive()) return;
      const r = roleOf(role);
      // The same person, colour and saved look as the agent's chat avatar (see agentLook.ts).
      const color = lookOf(live).color;
      const frames = framesFor(live, r);
      const character = new Character({
        agentId: id,
        displayName: name,
        mapRenderer: map as unknown as TiledMapRenderer,
        frames,
        seatTile: homeTile,
        seatDirection: facingForSeat(map, homeTile),
        spawnTile: entrance,
        glowColor: hexToNumber(color),
        onClick: (clicked) => ctx.onSelect(clicked),
      });
      // The School map is drawn larger than the office map, so the people are scaled up to match it.
      character.sprite.setDisplayScale(SCHOOL_SPRITE_SCALE);
      character.show(charLayer);
      // The waiting agent stands on its entrance tile (no director moves it).
      if (waiting) character.repositionTo(homeTile.x, homeTile.y);
      characters.set(id, character);
      if (!waiting && seatTile)
        director.add({ id, role: roleOf(role), character, status: () => statusOf(id), seat: seatTile });
    } finally {
      pending.delete(id);
    }
  };

  const removeAgent = (id: string) => {
    const c = characters.get(id);
    if (!c) return;
    director.remove(id);
    c.hide(0);
    setTimeout(() => c.destroy(), 700);
    characters.delete(id);
  };

  return {
    worldW: SCHOOL_W,
    worldH: SCHOOL_H,
    sync() {
      const list = ctx.agents();
      const wanted = new Set(list.map((a) => a.id));
      for (const id of [...characters.keys()]) if (!wanted.has(id)) removeAgent(id);
      list.forEach((agent, index) => {
        if (!characters.has(agent.id)) void addAgent(agent.id, index, agent.avatar, agent.name);
      });
    },
    update(dt, zoom) {
      director.update(dt);
      for (const c of characters.values()) {
        c.setBubbleZoom(zoom);
        c.update(dt);
      }
    },
    destroy() {
      characters.clear();
    },
  };
};
