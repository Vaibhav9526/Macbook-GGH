// Preload for the magnifier lens window only. Kept separate from
// preload/index.ts so the lens gets a minimal surface: two receive channels
// and one "first frame is ready" signal.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lens', {
  /** Per-tick view: pointer position (display-relative DIPs) and zoom. */
  onFrame: (cb: (f: { x: number; y: number; zoom: number; smoothing: number; live: boolean }) => void) => {
    ipcRenderer.on('a11y:lens-frame', (_e, f) => cb(f));
  },
  /** Which display to capture; null = drop the stream (lens hidden). */
  onSource: (cb: (s: {
    sourceId: string;
    displayId: number;
    pixelWidth: number;
    pixelHeight: number;
    init: { x: number; y: number; zoom: number; smoothing: number; live: boolean };
  } | null) => void) => {
    ipcRenderer.on('a11y:lens-source', (_e, s) => cb(s));
  },
  /** The stream for displayId is delivering frames; main may show the window. */
  ready: (displayId: number) => ipcRenderer.send('a11y:lens-ready', displayId),
});
