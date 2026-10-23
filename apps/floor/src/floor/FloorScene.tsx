// The floor as a standalone Pixi scene: the Pixi app, the camera, resize and context-loss handling.
// What is drawn and how agents behave lives in the two scenes:
//   OfficeScene.ts  (the Office floor)
//   SchoolScene.ts  (the School floor)
// This file only starts one of them for the current mode and forwards agent updates to it.

import { Application, Container, type Ticker } from "pixi.js";
import { useEffect, useRef, useState } from "react";
// Pixi uses new Function() internally. This patches it for strict-CSP hosts.
import "pixi.js/unsafe-eval";
import { Camera } from "@/scene/office/Camera";
import { installContextLossRecovery } from "@/scene/office/glRecovery";
import { createOfficeScene } from "./OfficeScene";
import type { FloorAgent, FloorMode } from "./protocol";
import { createSchoolScene } from "./SchoolScene";
import type { SceneHandle } from "./sceneTypes";

export interface FloorSceneProps {
  mode: FloorMode;
  agents: FloorAgent[];
  onSelect: (id: string) => void;
}

function destroyApp(app: Application) {
  try {
    app.ticker?.stop();
  } catch {
    /* already stopped */
  }
  try {
    app.destroy(true, { children: true });
  } catch {
    /* already gone */
  }
}

export function FloorScene({ mode, agents, onSelect }: FloorSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState<string>("Loading floor");
  const agentsRef = useRef(agents);
  const onSelectRef = useRef(onSelect);
  const syncRef = useRef<(() => void) | null>(null);
  agentsRef.current = agents;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);

    let alive = true;
    const app = new Application();
    let scene: SceneHandle | null = null;
    let ticker: ((t: Ticker) => void) | null = null;
    let resize: ResizeObserver | null = null;
    let uninstallRecovery: (() => void) | null = null;

    const init = async () => {
      await app.init({
        background: 0x1a1a1a,
        antialias: false,
        roundPixels: true,
        resolution: Math.max(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        width: host.clientWidth || 800,
        height: host.clientHeight || 600,
      });
      if (!alive) {
        destroyApp(app);
        return;
      }
      host.appendChild(app.canvas);

      uninstallRecovery = installContextLossRecovery(app.canvas, {
        onRebuild: () => {
          if (alive) setGeneration((n) => n + 1);
        },
        onGiveUp: () => {
          if (alive) setStatus("The floor could not start the graphics context.");
        },
      });

      const world = new Container();
      app.stage.addChild(world);

      const factory = mode === "school" ? createSchoolScene : createOfficeScene;
      scene = await factory({
        app,
        world,
        agents: () => agentsRef.current,
        onSelect: (id) => onSelectRef.current(id),
        alive: () => alive,
      });
      if (!scene || !alive) {
        destroyApp(app);
        return;
      }

      const camera = new Camera(world);
      camera.setMapSize(scene.worldW, scene.worldH);
      camera.setViewSize(app.screen.width, app.screen.height);
      camera.fitToScreen();

      const active = scene;
      syncRef.current = () => active.sync();
      active.sync();

      ticker = (t: Ticker) => {
        const dt = t.deltaMS / 1000;
        camera.update(dt);
        active.update(dt, world.scale.x);
      };
      app.ticker.add(ticker);

      resize = new ResizeObserver((entries) => {
        for (const e of entries) {
          const { width, height } = e.contentRect;
          if (width === 0 || height === 0) continue;
          app.renderer?.resize(width, height);
          camera.setViewSize(width, height);
        }
      });
      resize.observe(host);
      setStatus("");
    };

    init().catch((err) => {
      if (!alive) return;
      console.error("[floor] scene failed to start", err);
      setStatus("The floor could not start. Reload the page.");
    });

    return () => {
      alive = false;
      syncRef.current = null;
      resize?.disconnect();
      uninstallRecovery?.();
      if (ticker) app.ticker?.remove(ticker);
      scene?.destroy();
      destroyApp(app);
    };
  }, [mode, generation]);

  useEffect(() => {
    syncRef.current?.();
  }, [agents]);

  // The host div is owned by the scene. React draws the status text beside it.
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      {status && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#b9b9b9",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
