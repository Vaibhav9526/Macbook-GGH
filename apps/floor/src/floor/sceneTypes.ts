// The contract between FloorScene.tsx (Pixi app, camera, host messages) and one scene (Office or School).
import type { Application, Container } from "pixi.js";
import type { FloorAgent } from "./protocol";

export interface SceneContext {
  app: Application;
  /** The container the camera moves. A scene adds its map and characters here. */
  world: Container;
  /** The latest agent list from the host. Read it on every sync. */
  agents: () => FloorAgent[];
  onSelect: (id: string) => void;
  /** False once the floor was torn down. Check it after every await. */
  alive: () => boolean;
}

export interface SceneHandle {
  /** World size in pixels, for the camera. */
  worldW: number;
  worldH: number;
  /** Called when the agent list changed. */
  sync: () => void;
  /** Called on every frame. `zoom` is the camera zoom, for bubble sizes. */
  update: (dt: number, zoom: number) => void;
  destroy: () => void;
}

/** Returns null when the floor was torn down while the scene was loading. */
export type SceneFactory = (ctx: SceneContext) => Promise<SceneHandle | null>;
