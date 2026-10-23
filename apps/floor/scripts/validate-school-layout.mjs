// Checks src/school/layout.json against the school map.
//
// 1. Builds the walkable grid: walkable rects, minus blocked rects.
// 2. Checks that every seat is walkable and reachable from the entrance (4-way BFS).
// 3. Writes a report and an overlay PNG to .jargon-build/ (repo root, git ignored).
//
// Exit code 1 if any seat is unreachable or blocked.
//
// Usage (from apps/floor): node scripts/validate-school-layout.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../../package.json", import.meta.url));
const sharp = require("sharp");

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_BUILD = resolve(APP, "..", "..", ".jargon-build");
const layout = JSON.parse(await readFile(join(APP, "src", "school", "layout.json"), "utf8"));
const { width: W, height: H, tile: T } = layout;

const walk = Array.from({ length: H }, () => Array(W).fill(false));
const inRect = ([x, y, w, h], cx, cy) => cx >= x && cx < x + w && cy >= y && cy < y + h;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const open = layout.walkable.some((r) => inRect(r, x, y));
    const shut = layout.blocked.some((r) => inRect(r, x, y));
    walk[y][x] = open && !shut;
  }

// BFS from the entrance
const [ex, ey] = layout.entrance;
const dist = Array.from({ length: H }, () => Array(W).fill(-1));
const queue = [];
if (walk[ey][ex]) {
  dist[ey][ex] = 0;
  queue.push([ex, ey]);
}
for (let i = 0; i < queue.length; i++) {
  const [x, y] = queue[i];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx,
      ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (!walk[ny][nx] || dist[ny][nx] >= 0) continue;
    dist[ny][nx] = dist[y][x] + 1;
    queue.push([nx, ny]);
  }
}

const seats = [];
for (const [group, list] of Object.entries(layout.seats)) {
  // a single cell is [x, y]; a list of cells is [[x, y], ...]
  const cells = typeof list[0] === "number" ? [list] : list;
  cells.forEach(([x, y], i) => seats.push({ group, index: i, x, y }));
}
const results = seats.map((s) => ({
  ...s,
  walkable: walk[s.y][s.x],
  reachable: dist[s.y][s.x] >= 0,
  steps: dist[s.y][s.x],
}));
const failed = results.filter((r) => !r.walkable || !r.reachable);

const report = {
  map: layout.image,
  grid: { width: W, height: H, tile: T },
  walkableCells: walk.flat().filter(Boolean).length,
  entrance: layout.entrance,
  entranceWalkable: walk[ey][ex],
  seats: results,
  ok: failed.length === 0,
};
await mkdir(REPO_BUILD, { recursive: true });
await writeFile(join(REPO_BUILD, "school-layout-report.json"), JSON.stringify(report, null, 2) + "\n");

// Overlay: walkable green, blocked red, seats yellow, entrance blue.
const parts = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const fill = walk[y][x] ? "#2ecc71" : "#e74c3c";
    parts.push(`<rect x="${x * T}" y="${y * T}" width="${T}" height="${T}" fill="${fill}" fill-opacity="0.28"/>`);
  }
for (const r of results) {
  const col = r.reachable && r.walkable ? "#f1c40f" : "#ff00ff";
  parts.push(
    `<rect x="${r.x * T + 6}" y="${r.y * T + 6}" width="${T - 12}" height="${T - 12}" fill="${col}" fill-opacity="0.85"/>`,
  );
}
parts.push(`<rect x="${ex * T + 4}" y="${ey * T + 4}" width="${T - 8}" height="${T - 8}" fill="#3498db"/>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * T}" height="${H * T}">${parts.join("")}</svg>`;
await sharp(join(APP, "art-source", layout.image))
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png()
  .toFile(join(REPO_BUILD, "school-layout-overlay.png"));

console.log(`walkable cells: ${report.walkableCells}, seats: ${results.length}, unreachable/blocked: ${failed.length}`);
for (const f of failed)
  console.log("FAIL", f.group, f.index, `(${f.x},${f.y})`, "walkable", f.walkable, "reachable", f.reachable);
if (failed.length) process.exit(1);
