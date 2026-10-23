// The school floor as a grid. The picture (school-map.png) is drawn as-is.
// This module only answers "can I stand here" and gives the seats. World
// coordinates are the picture's own pixels (1600 x 900), so a tile is 50 px.

import layoutJson from "./layout.json";

export interface GridPoint {
  x: number;
  y: number;
}
export type Rect = [number, number, number, number];

interface Layout {
  image: string;
  tile: number;
  width: number;
  height: number;
  walkable: Rect[];
  blocked: Rect[];
  entrance: [number, number];
  spots: {
    aisles: [number, number][];
    corridors: [number, number][];
    pairs: [[number, number], [number, number]][];
    water: [number, number];
    shelves: [number, number][];
    principalRound: [number, number][];
    classroomDoor: [number, number];
    principalDoor: [number, number];
  };
  seats: {
    students: [number, number][];
    teachers: [number, number][];
    library: [number, number][];
    principal: [number, number];
  };
}

const layout = layoutJson as unknown as Layout;

export const SCHOOL_IMAGE = layout.image;
export const SCHOOL_TILE = layout.tile;
export const SCHOOL_W = layout.width * layout.tile;
export const SCHOOL_H = layout.height * layout.tile;
export const SCHOOL_SEATS = layout.seats;
export const SCHOOL_SPOTS = layout.spots;
export const SCHOOL_ENTRANCE: GridPoint = { x: layout.entrance[0], y: layout.entrance[1] };

const inRect = ([x, y, w, h]: Rect, cx: number, cy: number): boolean => cx >= x && cx < x + w && cy >= y && cy < y + h;

const walk: boolean[][] = Array.from({ length: layout.height }, (_, y) =>
  Array.from(
    { length: layout.width },
    (_, x) => layout.walkable.some((r) => inRect(r, x, y)) && !layout.blocked.some((r) => inRect(r, x, y)),
  ),
);

/** Grid adapter with the method names the character code uses. */
export const schoolMap = {
  tileSize: SCHOOL_TILE,
  width: layout.width,
  height: layout.height,
  isWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= layout.width || ty >= layout.height) return false;
    return walk[ty][tx];
  },
  tileToPixel(tx: number, ty: number): { x: number; y: number } {
    return { x: tx * SCHOOL_TILE, y: ty * SCHOOL_TILE };
  },
  pixelToTile(px: number, py: number): GridPoint {
    return { x: Math.floor(px / SCHOOL_TILE), y: Math.floor(py / SCHOOL_TILE) };
  },
  getSpawnPoint(name: string): GridPoint | undefined {
    return name === "entrance" ? SCHOOL_ENTRANCE : undefined;
  },
};

export type SchoolMapAdapter = typeof schoolMap;
