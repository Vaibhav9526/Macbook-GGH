/**
 * SuperJargon launcher (the teaching guide app).
 *
 * SuperJargon is a separate desktop program, installed per user under
 * %LOCALAPPDATA%\Programs\SuperJargon. It opens ONLY when the user clicks the
 * top-bar "Teaching guide" button -- nothing in this file runs at boot, and
 * there is deliberately no startup hook anywhere.
 *
 * This module is Electron-free so the path rule stays unit-testable. The app
 * IPC group in `ipc/app-handlers.ts` calls `openSuperJargon`.
 */
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SuperJargonResult } from "@jargon/contracts/ipc";

const EXE_NAME = "SuperJargon.exe";
const INSTALL_DIR = "SuperJargon";

/** Environment names are case-insensitive on Windows; a plain object is not. */
function envValue(env: NodeJS.ProcessEnv, name: string): string | null {
  const direct = env[name];
  if (typeof direct === "string" && direct.trim() !== "") return direct.trim();
  const lower = name.toLowerCase();
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() !== lower) continue;
    const value = env[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * Absolute path of the installed executable, or null when it cannot exist on
 * this platform / the per-user install root is unknown. Pure, so the path rule
 * is unit-testable without touching the disk.
 */
export function resolveSuperJargonPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== "win32") return null;
  const localAppData = envValue(env, "LOCALAPPDATA");
  if (!localAppData) return null;
  return join(localAppData, "Programs", INSTALL_DIR, EXE_NAME);
}

/** The process we started, so a second click in the same session reuses it. */
let tracked: ChildProcess | null = null;

function trackedAlive(): boolean {
  if (!tracked) return false;
  if (tracked.exitCode !== null || tracked.signalCode !== null) {
    tracked = null;
    return false;
  }
  return true;
}

/**
 * Is an instance already up? Our own child is authoritative; a copy started
 * outside Jargon is found through the Windows task list so we never launch a
 * second window on top of it.
 */
export function isSuperJargonRunning(): Promise<boolean> {
  if (trackedAlive()) return Promise.resolve(true);
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/FI", `IMAGENAME eq ${EXE_NAME}`, "/FO", "CSV", "/NH"],
      { windowsHide: true, timeout: 4000 },
      (error, stdout) => {
        if (error) return resolve(false);
        resolve(String(stdout).toLowerCase().includes(EXE_NAME.toLowerCase()));
      },
    );
  });
}

async function launch(): Promise<SuperJargonResult> {
  if (await isSuperJargonRunning()) return { ok: true, alreadyRunning: true };

  const exe = resolveSuperJargonPath();
  if (!exe) return { ok: false, error: "The teaching guide is only available on Windows." };
  if (!existsSync(exe)) {
    return { ok: false, error: "SuperJargon is not installed. Install it, then try again." };
  }

  try {
    // Detached + ignored stdio: the guide owns its own window and outlives us.
    const child = spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: false });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", reject);
    });
    child.unref();
    tracked = child;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** One in-flight launch at a time, so a double click cannot open two copies. */
let opening: Promise<SuperJargonResult> | null = null;

export function openSuperJargon(): Promise<SuperJargonResult> {
  opening ??= launch().finally(() => {
    opening = null;
  });
  return opening;
}
