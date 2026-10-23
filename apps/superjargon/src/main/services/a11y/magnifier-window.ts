// Magnifier window adapter: the only Electron-touching half of the magnifier.
// Owns one frameless, click-through, never-focused window covering the display
// under the pointer. The renderer holds ONE live capture stream of that display
// and shows it through a GPU-composited CSS transform, so per-tick traffic is
// three numbers (no screenshots, PNGs or data URLs). Core math: magnifier.ts.
//
// The window is excluded from capture (setContentProtection ->
// WDA_EXCLUDEFROMCAPTURE), so the stream never contains the magnified view and
// there is no infinite-mirror feedback. Frames are never logged or written.

import { app, BrowserWindow, desktopCapturer, ipcMain, screen, type Display } from 'electron';
import path from 'path';
import { createMagnifier, TICK_MS, type DisplayGeom, type LensFrame, type LensSurface, type Point } from './magnifier';
import type { A11yTool } from '../../../shared/accessibility';

const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER === '1';
const FRAME_CH = 'a11y:lens-frame';
const SOURCE_CH = 'a11y:lens-source';
const READY_CH = 'a11y:lens-ready';
/** A hidden lens window is kept warm (instant re-enable) this long, then destroyed. */
const WARM_MS = 60_000;

function createLensWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../../../preload/lens.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.setContentProtection(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (isDev) win.loadURL('http://localhost:5173/lens.html');
  else win.loadFile(path.join(__dirname, '../../../../renderer/lens.html'));
  return win;
}

function geom(d: Display): DisplayGeom {
  return { id: d.id, bounds: { ...d.bounds }, scaleFactor: d.scaleFactor || 1 };
}

export function createLensSurface(): LensSurface {
  let win: BrowserWindow | null = null;
  let loaded = false;
  let wanted = false; // magnifier is on
  let shownId: number | null = null; // display the visible window currently covers
  let pendingId: number | null = null; // display whose stream is starting
  let lastKey = '';
  let latest: LensFrame | null = null;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;
  let readyListener: ((e: Electron.IpcMainEvent, displayId: number) => void) | null = null;

  function onReady(e: Electron.IpcMainEvent, displayId: number): void {
    if (!win || win.isDestroyed() || e.sender !== win.webContents || !wanted) return;
    const d = screen.getAllDisplays().find((x) => x.id === displayId);
    if (!d) return;
    win.setBounds(d.bounds); // moved only once its stream has a frame: no flash
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver'); // stay above topmost apps after a show
    shownId = displayId;
    if (pendingId === displayId) pendingId = null;
    // The pointer may have idled during stream start (core only reports changes).
    lastKey = '';
    if (latest && latest.display.id === displayId) push(latest);
  }

  async function startStream(frame: LensFrame): Promise<void> {
    const d = frame.display;
    pendingId = d.id;
    try {
      // 0x0 thumbnails: only the source id is needed, never any pixels.
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!win || win.isDestroyed() || pendingId !== d.id || !wanted) return;
      const idx = screen.getAllDisplays().findIndex((x) => x.id === d.id);
      const src = sources.find((x) => x.display_id === String(d.id)) ?? sources[idx] ?? sources[0];
      if (!src) { pendingId = null; return; }
      win.webContents.send(SOURCE_CH, {
        sourceId: src.id,
        displayId: d.id,
        init: { x: frame.point.x, y: frame.point.y, zoom: frame.zoom, smoothing: frame.smoothing, live: frame.followsCursor },
        pixelWidth: Math.round(d.bounds.width * d.scaleFactor),
        pixelHeight: Math.round(d.bounds.height * d.scaleFactor),
      });
    } catch {
      pendingId = null; // retried on the next frame
    }
  }

  function push(frame: LensFrame): void {
    if (!win || win.isDestroyed() || !loaded || !wanted) return;
    const id = frame.display.id;
    if (id !== shownId) {
      if (id !== pendingId) void startStream(frame);
      return; // frames for a display that is not showing yet are meaningless
    }
    const key = `${frame.point.x},${frame.point.y},${frame.zoom},${frame.smoothing},${frame.followsCursor}`;
    if (key === lastKey) return;
    lastKey = key;
    win.webContents.send(FRAME_CH, {
      x: frame.point.x, y: frame.point.y, zoom: frame.zoom, smoothing: frame.smoothing, live: frame.followsCursor,
    });
  }

  function destroyWindow(): void {
    if (warmTimer) { clearTimeout(warmTimer); warmTimer = null; }
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
    loaded = false;
    shownId = null;
    pendingId = null;
  }

  return {
    show(): void {
      wanted = true;
      if (warmTimer) { clearTimeout(warmTimer); warmTimer = null; }
      if (!readyListener) { readyListener = onReady; ipcMain.on(READY_CH, readyListener); }
      if (!win || win.isDestroyed()) {
        win = createLensWindow();
        loaded = false;
        win.webContents.once('did-finish-load', () => { loaded = true; lastKey = ''; if (latest) push(latest); });
      }
      shownId = null;
      pendingId = null;
      lastKey = '';
      latest = null;
    },
    update(frame: LensFrame): void {
      latest = frame;
      push(frame);
    },
    hide(): void {
      wanted = false;
      shownId = null;
      pendingId = null;
      lastKey = '';
      if (win && !win.isDestroyed()) {
        win.hide();
        // A live desktop capture costs CPU/GPU even when nothing is visible.
        win.webContents.send(SOURCE_CH, null);
        if (warmTimer) clearTimeout(warmTimer);
        warmTimer = setTimeout(destroyWindow, WARM_MS);
        warmTimer.unref?.();
      }
    },
    dispose(): void {
      wanted = false;
      if (readyListener) { ipcMain.removeListener(READY_CH, readyListener); readyListener = null; }
      destroyWindow();
    },
  };
}

/** Production wiring: real cursor, displays and timers. `getFocusPoint` is
 *  injected because focus tracking (caret/UIA) is outside this module. */
export function createElectronMagnifier(
  getFocusPoint: () => Point | null = () => null,
): A11yTool<'magnifier'> {
  return createMagnifier({
    surface: createLensSurface(),
    getCursor: () => screen.getCursorScreenPoint(),
    getFocusPoint,
    displayAt: (p) => geom(screen.getDisplayNearestPoint({ x: Math.round(p.x), y: Math.round(p.y) })),
    setInterval: (fn, ms) => setInterval(fn, Math.max(ms, TICK_MS)),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  });
}
