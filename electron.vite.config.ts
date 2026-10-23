import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";

const rendererPort = readRendererPort(process.env.JARGON_DEV_RENDERER_PORT);

export default defineConfig({
  main: {
    // Workspace sources ship as TypeScript and must be bundled for the packaged app.
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          "@jargon/brand",
          "@jargon/contracts",
          "@jargon/i18n",
          "@jargon/logging",
          "@jargon/team-client",
          "@jargon/telemetry",
          "@jargon/user-errors",
        ],
      }),
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          // The database host is its own process. Only node:* and the installed Effect package
          // are runtime imports; the unpacked host must not load the main process bundle.
          "agent-database-host": resolve("src/backend/agent-data/agent-database-host.ts"),
          // The voice hosts are their own processes too. They import only node:* and load the
          // sherpa-onnx addon by path.
          "voice-transcription-host": resolve("src/main/voice-transcription-host.ts"),
          "voice-speech-host": resolve("src/main/voice-speech-host.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ["@jargon/contracts"] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          teamWebrtc: resolve("src/preload/team-webrtc.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [solidPlugin(), tailwindcss({ optimize: false }), floorHostPlugin()],
    optimizeDeps: {
      include: ["@norbert_bodziony/bloub"],
    },
    resolve: {
      dedupe: ["solid-js", "@solidjs/web"],
    },
    ...(rendererPort ? { server: { port: rendererPort, strictPort: true } } : {}),
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/renderer/index.html"),
          helper: resolve("src/renderer/helper.html"),
          browserPip: resolve("src/renderer/browser-pip.html"),
          browserPipControls: resolve("src/renderer/browser-pip-controls.html"),
          teamWebrtc: resolve("src/renderer/team-webrtc.html"),
        },
      },
    },
  },
});

function readRendererPort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("JARGON_DEV_RENDERER_PORT must be an integer from 1024 to 65535.");
  }
  return port;
}

const FLOOR_DIST = resolve("apps/floor/dist");
const FLOOR_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * The agents floor is its own small app (apps/floor, built with "bun run floor:build"). The overlay shows it
 * in an iframe at /floor/index.html on the renderer's own origin, so the page CSP (frame-src 'self') needs no
 * change. In development this serves the built folder; in a build it copies the folder next to the renderer.
 */
function floorHostPlugin(): Plugin {
  let outDir = "";
  return {
    name: "jargon-floor-host",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/floor", (req, res, next) => {
        const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        const file = normalize(join(FLOOR_DIST, path === "/" ? "index.html" : path));
        if (!file.startsWith(FLOOR_DIST) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", FLOOR_TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(FLOOR_DIST) && outDir) cpSync(FLOOR_DIST, join(outDir, "floor"), { recursive: true });
    },
  };
}
