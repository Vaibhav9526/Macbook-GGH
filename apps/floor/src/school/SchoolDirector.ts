// SchoolDirector: decides what each school character does, and when.
//
// The lesson clock switches between class and break. Each role has its own
// plans (a short list of steps). A plan is replanned when it ends, when the
// clock switches, or when the host status changes.
//
//   students  class: sit at a classroom computer desk (type, or hand raised)
//             break: read in the library, chat in a corridor pair, drink at
//                    the water spot, or roam the corridors. Never the principal room.
//   teachers  class: stand at the chalkboard and teach; walk the aisles between desks
//             break: stand at the principal door and talk; or roam the corridors
//   principal sits at the red-room desk; now and then walks a round of the corridors
//   librarian reads at the reading desk, or walks the shelves
//
// Every move uses the walk grid (Character.walkToAndThen -> findPath).

import type { Character } from "@/scene/office/Character";
import type { AnimState, Direction } from "@/scene/office/CharacterSprite";
import { SCHOOL_SEATS, SCHOOL_SPOTS } from "./schoolMap";

export type SchoolRole = "principal" | "teacher" | "librarian" | "student";
type Cell = { x: number; y: number };
type Phase = "class" | "break";

type Step =
  | { k: "go"; to: Cell }
  | { k: "sit"; dir: Direction; anim: AnimState }
  | { k: "stand"; dir: Direction; anim: AnimState }
  | { k: "wait"; s: number }
  | { k: "say"; text: string; s: number };

export interface Actor {
  id: string;
  role: SchoolRole;
  character: Character;
  /** The host status right now. */
  status: () => string;
  /** The seat this actor owns (desk for students, spot for teachers, chair for librarian and principal). */
  seat: Cell;
}

interface Brain {
  actor: Actor;
  plan: Step[];
  cur: Step | null;
  /** Seconds left for a wait/say step. */
  t: number;
  /** Seconds left for a go step before it is skipped (no path, or blocked). */
  watchdog: number;
  arrived: boolean;
  /** Seconds before this actor starts (groups leave with small random delays). */
  delay: number;
  lastStatus: string;
  /** Cells reserved by this actor, released on replan. */
  reserved: string[];
}

const GO_TIMEOUT = 15;

const key = (c: Cell | [number, number]): string => (Array.isArray(c) ? `${c[0]},${c[1]}` : `${c.x},${c.y}`);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const between = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/** Lesson clock: class and break alternate. `clock=8` in the query gives 8 s per phase (for tests). */
export function lessonSecondsFromUrl(fallback = 60): number {
  const raw = new URLSearchParams(window.location.search).get("clock");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 2 ? n : fallback;
}

export class SchoolDirector {
  private phase: Phase = "class";
  private phaseLeft: number;
  private readonly phaseSeconds: number;
  private readonly brains = new Map<string, Brain>();
  private readonly reservedBy = new Map<string, string>();
  private readonly onPhase?: (phase: Phase) => void;

  constructor(opts: { phaseSeconds: number; onPhase?: (phase: Phase) => void }) {
    this.phaseSeconds = opts.phaseSeconds;
    this.phaseLeft = opts.phaseSeconds;
    this.onPhase = opts.onPhase;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  add(actor: Actor): void {
    if (this.brains.has(actor.id)) return;
    this.brains.set(actor.id, {
      actor,
      plan: [],
      cur: null,
      t: 0,
      watchdog: 0,
      arrived: false,
      delay: actor.role === "student" ? between(0, 3) : 0,
      lastStatus: actor.status(),
      reserved: [],
    });
  }

  remove(id: string): void {
    const b = this.brains.get(id);
    if (!b) return;
    this.release(b);
    this.brains.delete(id);
  }

  update(dt: number): void {
    this.phaseLeft -= dt;
    if (this.phaseLeft <= 0) {
      this.phase = this.phase === "class" ? "break" : "class";
      this.phaseLeft = this.phaseSeconds;
      for (const b of this.brains.values()) this.replan(b);
      this.onPhase?.(this.phase);
    }
    for (const b of this.brains.values()) this.tick(b, dt);
  }

  private tick(b: Brain, dt: number): void {
    const status = b.actor.status();
    if (status !== b.lastStatus) {
      b.lastStatus = status;
      this.replan(b);
    }
    if (b.delay > 0) {
      b.delay -= dt;
      return;
    }
    if (!b.cur) {
      if (b.plan.length === 0) b.plan = this.planFor(b);
      const next = b.plan.shift();
      if (!next) return;
      b.cur = next;
      this.start(b, next);
      return;
    }
    const s = b.cur;
    if (s.k === "go") {
      b.watchdog -= dt;
      if (b.arrived || b.watchdog <= 0) b.cur = null;
    } else if (s.k === "wait" || s.k === "say") {
      b.t -= dt;
      if (b.t <= 0) {
        if (s.k === "say") b.actor.character.hideThought();
        b.cur = null;
      }
    } else {
      b.cur = null;
    }
  }

  private start(b: Brain, s: Step): void {
    const c = b.actor.character;
    switch (s.k) {
      case "go": {
        b.arrived = false;
        b.watchdog = GO_TIMEOUT;
        const at = c.getTilePosition();
        if (at.x === s.to.x && at.y === s.to.y) {
          b.arrived = true;
          return;
        }
        c.walkToAndThen(s.to, () => {
          b.arrived = true;
        });
        return;
      }
      case "sit":
        c.sitInPlace(s.dir);
        c.sprite.setAnimation(s.anim, s.dir);
        return;
      case "stand":
        c.faceDirection(s.dir);
        c.sprite.setAnimation(s.anim, s.dir);
        return;
      case "wait":
        b.t = s.s;
        return;
      case "say":
        b.t = s.s;
        c.showThought(s.text);
        return;
    }
  }

  private replan(b: Brain): void {
    b.plan = [];
    b.cur = null;
    this.release(b);
    b.actor.character.hideThought();
  }

  private reserve(b: Brain, list: Cell[] | [number, number][]): Cell | null {
    const free = list
      .map((c) => (Array.isArray(c) ? { x: c[0], y: c[1] } : c))
      .filter((c) => {
        const owner = this.reservedBy.get(key(c));
        return !owner || owner === b.actor.id;
      });
    if (free.length === 0) return null;
    const cell = pick(free);
    this.reservedBy.set(key(cell), b.actor.id);
    b.reserved.push(key(cell));
    return cell;
  }

  private release(b: Brain): void {
    for (const k of b.reserved) if (this.reservedBy.get(k) === b.actor.id) this.reservedBy.delete(k);
    b.reserved = [];
  }

  private planFor(b: Brain): Step[] {
    const { role, status } = b.actor;
    const waiting = status() === "waiting";
    const working = status() === "working";
    const inClass = this.phase === "class";
    switch (role) {
      case "student":
        return inClass ? this.studentClass(b, working, waiting) : this.studentBreak(b, waiting);
      case "teacher":
        return inClass ? this.teacherClass(b, waiting) : this.teacherBreak(b, waiting);
      case "principal":
        return this.principalPlan(b, working, waiting);
      case "librarian":
        return this.librarianPlan(b, working, waiting);
    }
  }

  // ---- students --------------------------------------------------------------

  private studentClass(b: Brain, working: boolean, waiting: boolean): Step[] {
    const seat = b.actor.seat;
    // The class lasts until the clock turns. A long wait keeps the seated pose.
    return [
      { k: "go", to: seat },
      { k: "sit", dir: "up", anim: waiting ? "hand" : working ? "type" : "idle" },
      { k: "wait", s: 999 },
    ];
  }

  private studentBreak(b: Brain, waiting: boolean): Step[] {
    const hand: AnimState = waiting ? "hand" : "idle";
    const r = Math.random();
    if (r < 0.3) {
      // Library: sit at a reading place. Own library seat if free, else any reading cell.
      const spot = this.reserve(b, [...SCHOOL_SEATS.library]);
      if (spot)
        return [
          { k: "go", to: spot },
          { k: "sit", dir: "down", anim: waiting ? "hand" : "read" },
          { k: "wait", s: between(10, 16) },
        ];
    }
    if (r < 0.6) {
      // Chat in a corridor pair: stand in a pair cell and talk.
      const pair = pick(SCHOOL_SPOTS.pairs);
      const cell = this.reserve(b, pair);
      if (cell)
        return [
          { k: "go", to: cell },
          { k: "stand", dir: cell.x < 15 ? "right" : "left", anim: hand },
          {
            k: "say",
            text: pick(["Did you finish?", "Lunch later?", "Ha, really!", "See you after."]),
            s: between(5, 8),
          },
          { k: "wait", s: between(2, 4) },
        ];
    }
    if (r < 0.75) {
      // Drink at the water spot.
      const water = { x: SCHOOL_SPOTS.water[0], y: SCHOOL_SPOTS.water[1] };
      return [
        { k: "go", to: water },
        { k: "stand", dir: "up", anim: hand },
        { k: "wait", s: between(4, 6) },
      ];
    }
    // Roam the corridors (never the classroom or the principal room).
    const cell = this.reserve(b, SCHOOL_SPOTS.corridors);
    if (!cell) return [{ k: "wait", s: 2 }];
    return [
      { k: "go", to: cell },
      { k: "stand", dir: "down", anim: hand },
      { k: "wait", s: between(3, 6) },
    ];
  }

  // ---- teachers ----------------------------------------------------------------

  private teacherClass(b: Brain, waiting: boolean): Step[] {
    const spot = b.actor.seat;
    const teach: AnimState = waiting ? "hand" : "teach";
    const aisle = this.reserve(b, SCHOOL_SPOTS.aisles);
    const plan: Step[] = [
      { k: "go", to: spot },
      { k: "stand", dir: "down", anim: teach },
      { k: "wait", s: between(8, 12) },
    ];
    if (aisle)
      plan.push({ k: "go", to: aisle }, { k: "stand", dir: "down", anim: teach }, { k: "wait", s: between(5, 8) });
    return plan;
  }

  private teacherBreak(b: Brain, waiting: boolean): Step[] {
    const hand: AnimState = waiting ? "hand" : "idle";
    if (Math.random() < 0.5) {
      // Walk to the principal door, talk, come back.
      const door = { x: SCHOOL_SPOTS.principalDoor[0] - 1, y: SCHOOL_SPOTS.principalDoor[1] };
      const cell = this.reserve(b, [[door.x, door.y]]);
      if (cell)
        return [
          { k: "go", to: cell },
          { k: "stand", dir: "right", anim: hand },
          { k: "say", text: "Got a minute?", s: between(6, 9) },
          { k: "wait", s: 2 },
        ];
    }
    const cell = this.reserve(b, SCHOOL_SPOTS.corridors);
    if (!cell) return [{ k: "wait", s: 2 }];
    return [
      { k: "go", to: cell },
      { k: "stand", dir: "down", anim: hand },
      { k: "wait", s: between(4, 6) },
    ];
  }

  // ---- principal ----------------------------------------------------------------

  private principalPlan(b: Brain, working: boolean, waiting: boolean): Step[] {
    const seat = b.actor.seat;
    const seated: Step[] = [
      { k: "go", to: seat },
      { k: "sit", dir: "down", anim: waiting ? "hand" : working ? "type" : "idle" },
      { k: "wait", s: between(18, 26) },
    ];
    if (Math.random() < 0.6) return seated;
    // A round of the corridors: look into the classroom, then back to the desk.
    const round = SCHOOL_SPOTS.principalRound;
    const door = SCHOOL_SPOTS.classroomDoor;
    return [
      { k: "go", to: { x: round[0][0], y: round[0][1] } },
      { k: "go", to: { x: round[1][0], y: round[1][1] } },
      { k: "go", to: { x: door[0], y: door[1] } },
      { k: "stand", dir: "up", anim: "idle" },
      { k: "wait", s: between(3, 5) },
      { k: "go", to: { x: round[1][0], y: round[1][1] } },
      ...seated,
    ];
  }

  // ---- librarian ------------------------------------------------------------------

  private librarianPlan(b: Brain, working: boolean, waiting: boolean): Step[] {
    if (working || waiting || Math.random() < 0.5) {
      // Sit at the reading desk.
      return [
        { k: "go", to: b.actor.seat },
        { k: "sit", dir: "down", anim: waiting ? "hand" : "read" },
        { k: "wait", s: between(12, 16) },
      ];
    }
    // Shelve books: walk to a shelf, stand and work, then the next shelf.
    const shelf = this.reserve(b, SCHOOL_SPOTS.shelves);
    if (!shelf) return [{ k: "wait", s: 2 }];
    return [
      { k: "go", to: shelf },
      { k: "stand", dir: "up", anim: "type" },
      { k: "wait", s: between(3, 5) },
    ];
  }
}
