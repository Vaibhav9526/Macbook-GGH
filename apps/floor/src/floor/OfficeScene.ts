// The Office floor: the legacy office map (green carpet, LimeZu tiles) and the lively office life.
//
// Status, for every agent:
//   working -> sits at its desk, the monitor is on, a thought bubble shows the task.
//   waiting -> sits at its desk with a raised hand and a thought bubble.
//   idle    -> does office life: wanders, rests at the desk, coffee runs, cafeteria breaks,
//              small errands (water the plants, window, dispenser, fridge, shelf, bin) and meetings.
// The boss (the character 'boss') sits in the corner office (desk-ceo) and runs the floor from there.
//
// This follows the reference project's OfficeFloor (MIT): seat pool, cafeteria director, coffee economy,
// errands and desk screens. Task boards, the hive and the message envelopes are left out.

import { type Container, Graphics } from "pixi.js";
import { Character, paintCup } from "@/scene/office/Character";
import { type BreakSpot, pickExchange, pickSoloLine } from "@/scene/office/cafeteriaLines";
import { hexToNumber, loadSpriteTexture } from "@/scene/office/cast";
import { DeskScreen } from "@/scene/office/DeskScreen";
import { TiledMapRenderer } from "@/scene/office/TiledMapRenderer";
import { loadTheme, resolveThemeMap, themeTilesetUrls } from "@/scene/office/themeLoader";
import type { ErrandKind, Facing, Tile } from "@/scene/office/themeRegistry";

import { framesFor, lookKey, lookOf, roleFor } from "./agentLook";
import type { FloorAgent } from "./protocol";
import type { SceneFactory } from "./sceneTypes";

// ─── per-agent state ─────────────────────────────────────────────────────────

/** A cafeteria chat: beats alternate, even = the one who sat down, odd = the table-mate. */
interface CafeChat {
  lines: readonly string[];
  partnerId: string;
  idx: number;
  beat: number;
}

interface CafeBreak {
  spotIdx: number;
  phase: "walking" | "lingering";
  timer: number;
  quipTimer: number;
  chat?: CafeChat;
  chattingWith?: string;
}

interface ErrandRun {
  phase: "walking" | "doing";
  timer: number;
  idx: number;
}

/** One leg of the coffee economy: take a mug, brew, wash, rack the mug again. */
interface CoffeeRun {
  phase: "toTray" | "taking" | "toMachine" | "brewing" | "toSink" | "washing" | "toTrayBack" | "placing";
  timer: number;
}

interface MeetingRun {
  phase: "walking" | "sitting";
  seatIdx: number;
}

interface Runtime {
  character: Character;
  /** Changes when the drawn person changes (a new look), so the sprite sheet is swapped. */
  lookKey: string;
  isBoss: boolean;
  seatIndex: number | null;
  status: FloorAgent["status"] | null;
  task: string;
  screen?: DeskScreen;
  brk?: CafeBreak;
  err?: ErrandRun;
  run?: CoffeeRun;
  meet?: MeetingRun;
  /** Walking a fresh coffee from the break room home to the desk. */
  cupCarryHome?: boolean;
  busySince?: number;
}

/** What an agent mutters at each errand. */
const ERRAND_THOUGHTS: Record<ErrandKind, readonly string[]> = {
  water: ["watering the plants", "this one looks thirsty", "green thumb time"],
  window: ["some fresh air", "is it warm in here?", "checking the weather"],
  dispenser: ["a cup of water", "stay hydrated", "water cooler break"],
  fridge: ["what is in the fridge?", "someone ate my lunch", "just looking"],
  shelf: ["browsing the shelf", "any good books here?", "looking for a folder"],
  bin: ["nothing but net", "recycling the draft", "tidying up"],
  smoke: [],
};

const CHEER_LINES = ["done!", "that went well", "one more checked off", "nice, finished", "on to the next"];
const MEETING_LINES = [
  "agenda first",
  "any blockers?",
  "good point",
  "let us decide",
  "notes are on the board",
  "quick sync",
];
const MEETING_MIN_BUSY_MS = 60_000;

/** Pick a random item. */
const choice = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

type Cell = Tile;

export const createOfficeScene: SceneFactory = async (ctx) => {
  const { app, world } = ctx;
  const runtimes = new Map<string, Runtime>();
  const pending = new Set<string>();
  const seatClaims = new Set<number>();

  // ─── map and theme: the legacy office ───────────────────────────────────────
  const theme = await loadTheme("office", "classic");
  app.renderer.background.color = theme.palette.background;
  const textures = await Promise.all(themeTilesetUrls(theme).map((u) => loadSpriteTexture(u)));
  if (!ctx.alive()) return null;
  const mapRenderer = new TiledMapRenderer(resolveThemeMap(theme), textures);
  world.addChild(mapRenderer.getContainer());
  const charLayer: Container = mapRenderer.getCharacterContainer();
  const ts = mapRenderer.tileSize;

  // The wall calendar in the corner office (decoration only here).
  const cal = new Graphics();
  cal.eventMode = "none";
  cal.position.set(theme.anchors.calendar.x * ts + 8, theme.anchors.calendar.y * ts + 5);
  cal.zIndex = 3 * ts;
  cal.rect(7, -2, 2, 2).fill(0x4a3b52);
  cal.rect(0, 0, 16, 20).fill(0x4a3b52);
  cal.rect(1, 1, 14, 18).fill(0xf2ead8);
  cal.rect(1, 1, 14, 4).fill(0xc94f4f);
  cal.rect(4, 0, 1, 2).fill(0xd8d3c4);
  cal.rect(11, 0, 1, 2).fill(0xd8d3c4);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) cal.rect(2 + c * 3, 7 + r * 4, 2, 2).fill(0xb8ab90);
  cal.rect(8, 11, 2, 2).fill(0xc94f4f);
  charLayer.addChild(cal);

  // ─── seats ─────────────────────────────────────────────────────────────────
  // Desks first (seat 0 is desk-ceo, kept for the boss), then the boardroom chairs as overflow.
  const seatTiles: Cell[] = [];
  const seatSeen = new Set<string>();
  const addSeat = (t?: Cell | null) => {
    if (!t) return;
    const k = `${t.x},${t.y}`;
    if (seatSeen.has(k)) return;
    seatSeen.add(k);
    seatTiles.push({ x: t.x, y: t.y });
  };
  for (const name of theme.primarySeatNames) addSeat(mapRenderer.getSpawnPoint(name));
  const deskSeatCount = seatTiles.length;
  /** Boardroom chairs: meetings use them first, overflow desks use them when the desks are full. */
  const boardroomSeats: Cell[] = [];
  const boardroom = mapRenderer.getZone("boardroom");
  if (boardroom) {
    for (let y = boardroom.y; y < boardroom.y + boardroom.height; y++) {
      for (let x = boardroom.x; x < boardroom.x + boardroom.width; x++) {
        if (mapRenderer.isWalkable(x, y)) boardroomSeats.push({ x, y });
      }
    }
  }
  const BOSS_SEAT = 0;
  const claimSeat = (isBoss: boolean): number | null => {
    if (isBoss) {
      seatClaims.add(BOSS_SEAT);
      return BOSS_SEAT;
    }
    for (let i = 1; i < deskSeatCount; i++)
      if (!seatClaims.has(i)) {
        seatClaims.add(i);
        return i;
      }
    return null;
  };

  const entrance: Cell = mapRenderer.getSpawnPoint("entrance") ?? {
    x: Math.floor(mapRenderer.width / 2),
    y: mapRenderer.height - 2,
  };

  // New agents arrive one after another, each from its own tile next to the door, so they do not stack.
  let arrivals = 0;
  const doorTile = (turn: number): Cell => {
    const spots: Cell[] = [
      entrance,
      { x: entrance.x - 1, y: entrance.y },
      { x: entrance.x + 1, y: entrance.y },
      { x: entrance.x - 2, y: entrance.y },
      { x: entrance.x + 2, y: entrance.y },
    ].filter((c) => mapRenderer.isWalkable(c.x, c.y));
    return spots.length > 0 ? spots[turn % spots.length]! : entrance;
  };

  /** Face a seated agent toward the desk: toward the first non-walkable neighbour. */
  const facingForSeat = (t: Cell): "up" | "down" | "left" | "right" => {
    if (!mapRenderer.isWalkable(t.x, t.y - 1)) return "up";
    if (!mapRenderer.isWalkable(t.x, t.y + 1)) return "down";
    if (!mapRenderer.isWalkable(t.x - 1, t.y)) return "left";
    if (!mapRenderer.isWalkable(t.x + 1, t.y)) return "right";
    return "up";
  };

  // ─── cafeteria ─────────────────────────────────────────────────────────────
  interface CafeSpot {
    tile: Cell;
    facing: Facing;
    spot: BreakSpot;
    seated: boolean;
    partner: number;
  }
  const cafeSpots: CafeSpot[] = [];
  const faceFurniture = (t: Cell): Facing => {
    if (!mapRenderer.isWalkable(t.x + 1, t.y)) return "right";
    if (!mapRenderer.isWalkable(t.x - 1, t.y)) return "left";
    if (!mapRenderer.isWalkable(t.x, t.y - 1)) return "up";
    return "down";
  };
  for (const name of theme.cafeSeatNames) {
    const p = mapRenderer.getSpawnPoint(name);
    if (p) cafeSpots.push({ tile: p, facing: facingForSeat(p), spot: "table", seated: true, partner: -1 });
  }
  // Two seats at one table (same column, two tiles apart) are partners.
  for (let i = 0; i < cafeSpots.length; i++) {
    for (let j = i + 1; j < cafeSpots.length; j++) {
      const a = cafeSpots[i].tile,
        b = cafeSpots[j].tile;
      if (a.x === b.x && Math.abs(a.y - b.y) === 2) {
        cafeSpots[i].partner = j;
        cafeSpots[j].partner = i;
      }
    }
  }
  for (const [name, spot] of theme.cafeStands) {
    const p = mapRenderer.getSpawnPoint(name);
    if (p) cafeSpots.push({ tile: p, facing: faceFurniture(p), spot, seated: false, partner: -1 });
  }
  const cafeTaken: (string | null)[] = new Array(cafeSpots.length).fill(null);

  // ─── coffee economy: sideboard -> machine -> desk -> sink -> sideboard ──────
  const TRAY_TILE = theme.coffee.trayTile;
  const TRAY_STAND = theme.coffee.trayStand;
  const MACHINE_STAND = theme.coffee.machineStand;
  const SINK_TILE = theme.coffee.sinkTile;
  const SINK_STAND = theme.coffee.sinkStand;
  const MAX_CUPS = theme.coffee.maxCups;
  let cleanCups = MAX_CUPS;

  const trayG = new Graphics();
  trayG.eventMode = "none";
  trayG.position.set(TRAY_TILE.x * ts, TRAY_TILE.y * ts);
  trayG.zIndex = (TRAY_TILE.y + 1) * ts;
  charLayer.addChild(trayG);
  const drawTray = (): void => {
    trayG.clear();
    const slots: Array<[number, number]> = [
      [2, 10],
      [9, 10],
      [2, 15],
      [9, 15],
    ];
    for (let i = 0; i < cleanCups && i < slots.length; i++) paintCup(trayG, slots[i][0], slots[i][1]);
  };
  drawTray();

  const sinkG = new Graphics();
  sinkG.eventMode = "none";
  sinkG.position.set(SINK_TILE.x * ts, SINK_TILE.y * ts);
  sinkG.zIndex = (SINK_TILE.y + 1) * ts;
  charLayer.addChild(sinkG);
  let sinkBusy = 0;
  const drawSink = (t: number): void => {
    sinkG.clear();
    sinkG.rect(2, 6, 12, 8).fill(0xb9c2c9);
    sinkG.rect(3, 7, 10, 6).fill(0x87939d);
    sinkG.rect(7, 9, 2, 2).fill(0x5d676f);
    sinkG.rect(7, 2, 2, 4).fill(0x6b7680);
    sinkG.rect(6, 2, 4, 1).fill(0x6b7680);
    if (sinkBusy > 0) {
      sinkG.rect(7, 6, 2, 4).fill({ color: 0x9fd6f0, alpha: 0.9 });
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.2 + i / 3) % 1;
        sinkG.circle(4 + i * 4, 7 - ph * 4, 1).fill({ color: 0xffffff, alpha: 0.7 * (1 - ph) });
      }
    }
  };
  drawSink(0);

  // Steam over the counter machine while brewing.
  const machineG = new Graphics();
  machineG.eventMode = "none";
  machineG.position.set(26 * ts, 17 * ts);
  machineG.zIndex = 19 * ts;
  charLayer.addChild(machineG);
  let machineBusy = 0;
  const drawMachine = (t: number): void => {
    machineG.clear();
    if (machineBusy <= 0) return;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.9 + i * 0.5) % 1;
      machineG.rect(6 + i * 3, 2 - Math.round(ph * 5), 1, 1).fill({ color: 0xffffff, alpha: 0.6 * (1 - ph) });
    }
  };

  const finishRun = (rt: Runtime): void => {
    rt.run = undefined;
    const c = rt.character;
    c.hideThought();
    if (c.isCarryingCup()) {
      rt.cupCarryHome = true; // a held cup always goes home
      c.sitAtDesk(false);
    } else {
      c.startWandering();
    }
  };

  const startRunLeg = (rt: Runtime, phase: "toTray" | "toMachine" | "toSink" | "toTrayBack"): void => {
    rt.run = { phase, timer: 0 };
    const c = rt.character;
    const dest = phase === "toMachine" ? MACHINE_STAND : phase === "toSink" ? SINK_STAND : TRAY_STAND;
    c.walkToAndThen(dest, () => {
      if (!rt.run || rt.run.phase !== phase) return;
      c.faceDirection("up"); // every station faces its counter to the north
      if (phase === "toTray") {
        if (cleanCups <= 0) {
          c.showThought("no clean mugs left");
          rt.run = { phase: "placing", timer: -1 };
          return;
        }
        cleanCups--;
        drawTray();
        c.setCarryingCup(true);
        rt.run = { phase: "taking", timer: 0 };
      } else if (phase === "toMachine") {
        c.showThought("brewing");
        machineBusy = 2.6;
        rt.run = { phase: "brewing", timer: 0 };
      } else if (phase === "toSink") {
        c.showThought("washing the mug");
        sinkBusy = 2.4;
        rt.run = { phase: "washing", timer: 0 };
      } else {
        c.setCarryingCup(false);
        cleanCups = Math.min(MAX_CUPS, cleanCups + 1);
        drawTray();
        rt.run = { phase: "placing", timer: 0 };
      }
    });
  };

  const releaseRun = (rt: Runtime): void => {
    if (!rt.run) return;
    rt.run = undefined;
    if (rt.character.isCarryingCup()) rt.cupCarryHome = true;
  };

  let fxClock = 0;
  const updateCoffeeRuns = (dt: number): void => {
    fxClock += dt;
    if (sinkBusy > 0) {
      sinkBusy -= dt;
      drawSink(fxClock);
    }
    if (machineBusy > 0) {
      machineBusy -= dt;
      drawMachine(fxClock);
    }
    for (const rt of runtimes.values()) {
      const run = rt.run;
      if (!run) continue;
      run.timer += dt;
      switch (run.phase) {
        case "toTray":
        case "toMachine":
        case "toSink":
        case "toTrayBack":
          if (run.timer > 20) finishRun(rt); // never arrived: give up
          break;
        case "taking":
          if (run.timer >= 0.8) startRunLeg(rt, "toMachine");
          break;
        case "brewing":
          if (run.timer >= 2.6) finishRun(rt);
          break;
        case "washing":
          if (run.timer >= 2.4) startRunLeg(rt, "toTrayBack");
          break;
        case "placing":
          if (run.timer >= 0.6) finishRun(rt);
          break;
      }
    }
  };

  // ─── cafeteria director ────────────────────────────────────────────────────
  const emitQuip = (rt: Runtime, spotIdx: number): void => {
    rt.character.showThought(
      pickSoloLine(rt.isBoss ? "boss" : "worker_1", cafeSpots[spotIdx].spot, Math.floor(Math.random() * 1e6)),
    );
  };

  const maybePairChat = (id: string, rt: Runtime, spotIdx: number): boolean => {
    const spot = cafeSpots[spotIdx];
    if (spot.partner < 0 || !rt.brk) return false;
    const partnerId = cafeTaken[spot.partner];
    if (!partnerId) return false;
    const prt = runtimes.get(partnerId);
    if (!prt?.brk || prt.brk.phase !== "lingering") return false;
    if (rt.brk.chat || rt.brk.chattingWith || prt.brk.chat || prt.brk.chattingWith) return false;
    rt.brk.chat = {
      lines: pickExchange(rt.isBoss ? "boss" : "worker_1", Math.floor(Math.random() * 1e6)),
      partnerId,
      idx: 0,
      beat: 0,
    };
    prt.brk.chattingWith = id;
    return true;
  };

  const releaseBreak = (rt: Runtime): void => {
    if (!rt.brk) return;
    if (rt.brk.chat) {
      const p = runtimes.get(rt.brk.chat.partnerId);
      if (p?.brk) p.brk.chattingWith = undefined;
    }
    if (rt.brk.chattingWith) {
      const o = runtimes.get(rt.brk.chattingWith);
      if (o?.brk) o.brk.chat = undefined;
    }
    cafeTaken[rt.brk.spotIdx] = null;
    rt.brk = undefined;
  };

  /** End a break: free the seat, then settle the coffee question (refill, wash, or fetch a clean mug). */
  const endBreak = (rt: Runtime): void => {
    const arrived = rt.brk?.phase === "lingering";
    releaseBreak(rt);
    const c = rt.character;
    c.hideThought();
    if (!arrived) {
      if (c.isCarryingCup()) {
        rt.cupCarryHome = true;
        c.sitAtDesk(false);
      } else c.startWandering();
      return;
    }
    if (c.isCarryingCup()) {
      if (Math.random() < 0.6) startRunLeg(rt, "toMachine");
      else startRunLeg(rt, "toSink");
    } else if (!c.hasCupOnDesk() && Math.random() < 0.75) {
      startRunLeg(rt, "toTray");
    } else {
      c.startWandering();
    }
  };

  const startBreak = (id: string, rt: Runtime): void => {
    const free: number[] = [];
    const social: number[] = [];
    for (let i = 0; i < cafeSpots.length; i++) {
      if (cafeTaken[i]) continue;
      free.push(i);
      const p = cafeSpots[i].partner;
      if (p >= 0 && cafeTaken[p]) social.push(i);
    }
    if (free.length === 0) return;
    const pool = social.length && Math.random() < 0.55 ? social : free;
    const idx = choice(pool);
    const spot = cafeSpots[idx];
    cafeTaken[idx] = id;
    rt.brk = { spotIdx: idx, phase: "walking", timer: 0, quipTimer: 0 };
    const c = rt.character;
    // A mug parked on the desk comes along; it is refilled or washed when the break ends.
    if (c.hasCupOnDesk()) {
      c.setCupOnDesk(false);
      c.setCarryingCup(true);
    }
    c.walkToAndThen(spot.tile, () => {
      if (!rt.brk || rt.brk.spotIdx !== idx) return;
      if (spot.seated) c.sitInPlace(spot.facing);
      else {
        c.setIdle();
        c.faceDirection(spot.facing);
      }
      rt.brk.phase = "lingering";
      rt.brk.timer = 8 + Math.random() * 8;
      rt.brk.quipTimer = 4 + Math.random() * 4;
      if (!maybePairChat(id, rt, idx)) emitQuip(rt, idx);
    });
  };

  /** Free to be sent on a break, errand or meeting: idle, away from a desk and doing nothing else. */
  const lifeEligible = (rt: Runtime): boolean => {
    if (rt.isBoss || rt.brk || rt.err || rt.run || rt.meet || rt.cupCarryHome) return false;
    if (rt.status !== "idle") return false;
    return !rt.character.isSitting();
  };

  let cafeCooldown = 5;
  const updateCafeteria = (dt: number): void => {
    for (const rt of runtimes.values()) {
      const b = rt.brk;
      if (!b) continue;
      if (b.phase === "walking") {
        b.timer += dt;
        if (b.timer > 20) endBreak(rt);
        continue;
      }
      if (b.chat) {
        b.chat.beat -= dt;
        if (b.chat.beat <= 0) {
          if (b.chat.idx < b.chat.lines.length) {
            const speaker = b.chat.idx % 2 === 0 ? rt : runtimes.get(b.chat.partnerId);
            speaker?.character.showThought(b.chat.lines[b.chat.idx]);
            b.chat.idx++;
            b.chat.beat = 2.4;
            b.timer = Math.max(b.timer, 3.5);
            const prt = runtimes.get(b.chat.partnerId);
            if (prt?.brk) prt.brk.timer = Math.max(prt.brk.timer, 3.5);
          } else {
            const prt = runtimes.get(b.chat.partnerId);
            if (prt?.brk) prt.brk.chattingWith = undefined;
            b.chat = undefined;
          }
        }
      } else if (!b.chattingWith) {
        b.quipTimer -= dt;
        if (b.quipTimer <= 0) {
          b.quipTimer = 4 + Math.random() * 4;
          emitQuip(rt, b.spotIdx);
        } else if (Math.random() < 0.004) {
          for (const [id, r] of runtimes) if (r === rt) maybePairChat(id, rt, b.spotIdx);
        }
      }
      b.timer -= dt;
      if (b.timer <= 0) endBreak(rt);
    }

    cafeCooldown -= dt;
    if (cafeCooldown > 0) return;
    cafeCooldown = 6 + Math.random() * 6;
    if (cafeTaken.filter(Boolean).length >= 4) return;
    if (Math.random() >= 0.7) return;
    const candidates = [...runtimes.entries()].filter(([, rt]) => lifeEligible(rt));
    if (candidates.length === 0) return;
    const [id, rt] = choice(candidates);
    startBreak(id, rt);
  };

  // ─── idle errands ──────────────────────────────────────────────────────────
  // Plants, windows, dispensers (the water cooler), the fridge, a shelf and the bins. The boss's cigar
  // errand is left out.
  const errandSpots = theme.errandSpots.filter((s) => s.kind !== "smoke" && !s.godOnly);
  const errandTaken: (string | null)[] = new Array(errandSpots.length).fill(null);
  const errandFx = new Map<number, Graphics>();
  const fxFor = (idx: number): Graphics => {
    let g = errandFx.get(idx);
    if (!g) {
      const spot = errandSpots[idx];
      g = new Graphics();
      g.eventMode = "none";
      g.position.set(spot.fx.x * ts, spot.fx.y * ts);
      g.zIndex = (spot.fx.y + 1) * ts;
      charLayer.addChild(g);
      errandFx.set(idx, g);
    }
    return g;
  };

  /** One frame of an errand's ambient animation, in local coordinates on its fx tile. */
  const drawErrandFx = (kind: ErrandKind, g: Graphics, t: number): void => {
    g.clear();
    if (kind === "window") {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.7 + i / 3) % 1;
        g.rect(2 + i * 9 - ph * 5, 26 + ph * 16, 7, 1).fill({ color: 0xd8f1f7, alpha: 0.55 * (1 - ph) });
      }
    } else if (kind === "dispenser") {
      const ph = (t * 1.6) % 1;
      g.rect(7, 18 + ph * 6, 1, 3).fill({ color: 0x9fd6f0, alpha: 0.9 * (1 - ph) });
      const bp = (t * 0.9) % 1;
      g.circle(8, 12 - bp * 6, 1).fill({ color: 0xffffff, alpha: 0.6 * (1 - bp) });
    } else if (kind === "fridge") {
      const a = 0.16 + 0.05 * Math.sin(t * 5);
      g.poly([3, 12, 13, 12, 16, 30, 0, 30]).fill({ color: 0xfff2b8, alpha: a });
    } else if (kind === "shelf") {
      const ph = (t * 0.5) % 1;
      g.rect(2 + ph * 24, 4 + (Math.floor(t * 0.5) % 3) * 9, 2, 2).fill({
        color: 0xfff7c8,
        alpha: 0.8 * Math.sin(ph * Math.PI),
      });
    } else if (kind === "bin") {
      const ph = t % 1;
      if (ph < 0.45) {
        const p = ph / 0.45;
        const x = 18 + (8 - 18) * p;
        const y = 2 - Math.sin(p * Math.PI) * 9;
        g.rect(Math.round(x), Math.round(y), 2, 2).fill({ color: 0xf5f1e6, alpha: 0.95 });
      }
    }
    // 'water' draws nothing here: the droplets ride on the character.
  };

  const releaseErrand = (rt: Runtime): void => {
    if (!rt.err) return;
    errandTaken[rt.err.idx] = null;
    errandFx.get(rt.err.idx)?.clear();
    rt.err = undefined;
    rt.character.stopWatering();
  };

  let errCooldown = 12;
  const updateErrands = (dt: number): void => {
    for (const rt of runtimes.values()) {
      const err = rt.err;
      if (!err) continue;
      err.timer += dt;
      const spot = errandSpots[err.idx];
      if (err.phase === "walking") {
        if (err.timer > 20) {
          releaseErrand(rt);
          rt.character.startWandering();
        }
        continue;
      }
      drawErrandFx(spot.kind, fxFor(err.idx), err.timer);
      if (spot.kind !== "water" && err.timer >= spot.duration) {
        releaseErrand(rt);
        rt.character.hideThought();
        rt.character.startWandering();
      }
    }
    errCooldown -= dt;
    if (errCooldown > 0) return;
    errCooldown = 8 + Math.random() * 12;
    if (Math.random() >= 0.75) return;
    const free = errandSpots.map((_, i) => i).filter((i) => !errandTaken[i]);
    if (free.length === 0) return;
    const candidates = [...runtimes.entries()].filter(([, rt]) => lifeEligible(rt));
    if (candidates.length === 0) return;
    const idx = choice(free);
    const spot = errandSpots[idx];
    const [id, rt] = choice(candidates);
    const c = rt.character;
    errandTaken[idx] = id;
    rt.err = { phase: "walking", timer: 0, idx };
    c.walkToAndThen(spot.stand, () => {
      if (!rt.err || rt.err.idx !== idx) return;
      rt.err.phase = "doing";
      rt.err.timer = 0;
      c.faceDirection(spot.facing);
      c.showThought(choice(ERRAND_THOUGHTS[spot.kind]));
      if (spot.kind === "water") {
        c.startWatering(spot.duration, () => {
          releaseErrand(rt);
          c.hideThought();
          c.startWandering();
        });
      }
    });
  };

  // ─── meetings at the boardroom table ───────────────────────────────────────
  // A few idle agents walk to the meeting room, sit around the table, trade short lines, then go back.
  const meetSeatTaken: (string | null)[] = new Array(boardroomSeats.length).fill(null);
  let meetingTimer = 0;
  let meetingCooldown = 20;
  let meetingGroup: string[] = [];

  const releaseMeeting = (rt: Runtime): void => {
    if (!rt.meet) return;
    meetSeatTaken[rt.meet.seatIdx] = null;
    rt.meet = undefined;
  };

  const endMeeting = (): void => {
    for (const id of meetingGroup) {
      const rt = runtimes.get(id);
      if (!rt?.meet) continue;
      releaseMeeting(rt);
      rt.character.hideThought();
      if (rt.status === "idle") rt.character.startWandering();
    }
    meetingGroup = [];
    meetingTimer = 0;
  };

  const updateMeetings = (dt: number): void => {
    if (meetingGroup.length > 0) {
      meetingTimer -= dt;
      const seated = meetingGroup.filter((id) => runtimes.get(id)?.meet?.phase === "sitting");
      // Now and then one of the seated agents speaks.
      if (seated.length > 0 && Math.random() < dt * 0.45) {
        runtimes.get(choice(seated))?.character.showThought(choice(MEETING_LINES));
      }
      // The meeting ends on its timer, or when everyone was pulled back to work.
      if (meetingTimer <= 0 || meetingGroup.every((id) => !runtimes.get(id)?.meet)) endMeeting();
      return;
    }
    meetingCooldown -= dt;
    if (meetingCooldown > 0 || boardroomSeats.length < 2) return;
    meetingCooldown = 40 + Math.random() * 40;
    const candidates = [...runtimes.entries()].filter(([, rt]) => lifeEligible(rt));
    if (candidates.length < 3) return;
    const group = candidates.sort(() => Math.random() - 0.5).slice(0, Math.min(4, boardroomSeats.length));
    meetingGroup = [];
    group.forEach(([id, rt], n) => {
      const seatIdx = meetSeatTaken.findIndex((s, i) => !s && i >= 0) + 0;
      if (seatIdx < 0) return;
      meetSeatTaken[seatIdx] = id;
      rt.meet = { phase: "walking", seatIdx };
      meetingGroup.push(id);
      const seat = boardroomSeats[seatIdx];
      rt.character.walkToAndThen(seat, () => {
        if (!rt.meet || rt.meet.seatIdx !== seatIdx) return;
        rt.character.sitInPlace(facingForSeat(seat));
        rt.meet.phase = "sitting";
        if (n === 0) rt.character.showThought("let us start");
      });
    });
    meetingTimer = 16 + Math.random() * 8;
  };

  // ─── desk life: carried coffee goes home, monitors follow the chair ─────────
  const updateDeskLife = (dt: number): void => {
    for (const rt of runtimes.values()) {
      if (rt.cupCarryHome && rt.character.isSittingAtDesk()) {
        rt.cupCarryHome = false;
        rt.character.setCarryingCup(false);
        rt.character.setCupOnDesk(true);
        if (!rt.isBoss && rt.status === "idle") rt.character.startWandering();
      }
      if (rt.screen) {
        rt.screen.setOn(rt.character.isSittingAtDesk());
        rt.screen.update(dt);
      }
    }
  };

  // ─── agents ────────────────────────────────────────────────────────────────
  /** Real work cancels any break, errand, coffee run or meeting. */
  const cancelLife = (rt: Runtime): void => {
    releaseBreak(rt);
    releaseErrand(rt);
    releaseRun(rt);
    releaseMeeting(rt);
  };

  /** Host status -> what the character does. */
  const applyStatus = (agent: FloorAgent, rt: Runtime): void => {
    if (rt.status === agent.status && rt.task === agent.task) return;
    const c = rt.character;
    const wasBusy = rt.status === "working";
    const prevStatus = rt.status;
    rt.status = agent.status;
    rt.task = agent.task;
    if (agent.status === "working" && !wasBusy) rt.busySince = Date.now();
    const finishedWork =
      prevStatus === "working" &&
      agent.status === "idle" &&
      !rt.isBoss &&
      rt.busySince !== undefined &&
      Date.now() - rt.busySince >= MEETING_MIN_BUSY_MS;
    if (agent.status !== "working") rt.busySince = undefined;
    c.sprite.setPose(null);

    // While on a break, errand or coffee run, an idle refresh leaves the avatar alone.
    if (agent.status === "idle" && (rt.brk || rt.err || rt.run || rt.meet)) return;
    cancelLife(rt);

    if (agent.status === "working") {
      c.setStatusGlyph("none");
      c.sitAtDesk(true);
      c.showThought(agent.task);
    } else if (agent.status === "waiting") {
      c.setStatusGlyph("hand");
      c.sitAtDesk(false);
      c.showThought(agent.task);
    } else {
      c.setStatusGlyph("none");
      if (rt.isBoss) {
        // The boss runs the floor from the corner office.
        c.sitAtDesk(true);
        c.showThought(agent.task || "running the floor");
      } else {
        c.startWandering();
        if (finishedWork) {
          c.cheer();
          c.showThought(choice(CHEER_LINES));
        } else {
          c.hideThought();
        }
      }
    }
  };

  const addAgent = async (agent: FloorAgent, index: number): Promise<void> => {
    if (pending.has(agent.id) || runtimes.has(agent.id)) return;
    pending.add(agent.id);
    let seatIndex: number | null = null;
    const turn = arrivals++;
    try {
      // Stagger the arrivals: each waits a little longer than the one before (capped at 3 seconds).
      await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(turn, 6) * 500));
      if (!ctx.alive()) return;
      // The top agent is the boss; everyone else is a worker. The person comes from the agent's look.
      const role = roleFor("office", index, agent);
      const isBoss = role === "boss";
      seatIndex = claimSeat(isBoss);
      // Desks are full: the agent still appears, at the door, and uses the open floor.
      const seatTile: Cell = (seatIndex !== null ? seatTiles[seatIndex] : undefined) ?? entrance;
      if (!ctx.alive()) return;
      const live = ctx.agents().find((a) => a.id === agent.id);
      if (!live) return;
      const frames = framesFor(live, role);
      const character = new Character({
        agentId: agent.id,
        displayName: live.name,
        mapRenderer,
        frames,
        seatTile,
        seatDirection: facingForSeat(seatTile),
        spawnTile: doorTile(turn), // walk in from the office door, one tile per arrival
        glowColor: hexToNumber(lookOf(live).color),
        onClick: (id) => ctx.onSelect(id),
      });
      character.show(charLayer);
      const rt: Runtime = { character, lookKey: lookKey(live, role), isBoss, seatIndex, status: null, task: "" };
      // Standard desks paint the 2x2 monitor two rows above the seat: give it a screen and a cup spot.
      if (mapRenderer.gidAt("furniture-above", seatTile.x, seatTile.y - 2) === theme.monitor.offTopLeftGid) {
        const top = { x: seatTile.x, y: seatTile.y - 2 };
        rt.screen = new DeskScreen(mapRenderer, top, theme.monitor);
        charLayer.addChild(rt.screen.container);
        character.setCupSpot({ x: top.x * ts + 18, y: top.y * ts + 23 });
      }
      runtimes.set(agent.id, rt);
      applyStatus(live, rt);
    } finally {
      pending.delete(agent.id);
      if (seatIndex !== null && !runtimes.has(agent.id)) seatClaims.delete(seatIndex);
    }
  };

  const removeAgent = (id: string): void => {
    const rt = runtimes.get(id);
    if (!rt) return;
    cancelLife(rt);
    // An abandoned mug goes back to the sideboard, so the stock never leaks.
    if (rt.character.isCarryingCup() || rt.character.hasCupOnDesk()) {
      cleanCups = Math.min(MAX_CUPS, cleanCups + 1);
      drawTray();
    }
    if (rt.seatIndex !== null) seatClaims.delete(rt.seatIndex);
    rt.screen?.destroy();
    rt.character.hide(0);
    setTimeout(() => rt.character.destroy(), 700);
    runtimes.delete(id);
  };

  return {
    worldW: mapRenderer.width * ts,
    worldH: mapRenderer.height * ts,
    sync() {
      const list = ctx.agents();
      const wanted = new Set(list.map((a) => a.id));
      for (const id of [...runtimes.keys()]) if (!wanted.has(id)) removeAgent(id);
      list.forEach((agent, index) => {
        const rt = runtimes.get(agent.id);
        if (!rt) void addAgent(agent, index);
        else {
          rt.character.setName(agent.name);
          // A changed look (the user customised the person) redraws the sprite in place.
          const key = lookKey(agent, roleFor("office", index, agent));
          if (key !== rt.lookKey) {
            rt.lookKey = key;
            rt.character.sprite.setFrames(framesFor(agent, roleFor("office", index, agent)));
          }
          applyStatus(agent, rt);
        }
      });
    },
    update(dt, zoom) {
      for (const rt of runtimes.values()) {
        rt.character.setBubbleZoom(zoom);
        rt.character.update(dt);
      }
      updateCoffeeRuns(dt);
      updateCafeteria(dt);
      updateErrands(dt);
      updateMeetings(dt);
      updateDeskLife(dt);
    },
    destroy() {
      runtimes.clear();
    },
  };
};
