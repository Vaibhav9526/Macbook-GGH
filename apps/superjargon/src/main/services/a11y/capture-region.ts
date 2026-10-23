// Pure geometry for the screen reader's 'region' scope: a rectangle centred
// on the pointer, slid (never shrunk) to stay inside the display, mapped into
// the pixel space of a screenshot that spans that display.

export interface RectLike { x: number; y: number; width: number; height: number }

/** Region size in DIPs: roughly a paragraph-and-a-half of text around the pointer. */
export const REGION_WIDTH = 900;
export const REGION_HEIGHT = 560;

export function regionAroundPoint(
  point: { x: number; y: number },
  display: RectLike,
  w = REGION_WIDTH,
  h = REGION_HEIGHT,
): RectLike {
  const width = Math.min(w, display.width);
  const height = Math.min(h, display.height);
  const x = Math.min(display.x + display.width - width, Math.max(display.x, point.x - width / 2));
  const y = Math.min(display.y + display.height - height, Math.max(display.y, point.y - height / 2));
  return { x, y, width, height };
}

/** Map a DIP rect on `display` into a screenshot of `imageW` x `imageH` px
 *  that covers the whole display (screen-capture.ts guarantees that). */
export function toImageRect(rect: RectLike, display: RectLike, imageW: number, imageH: number): RectLike {
  const sx = imageW / display.width;
  const sy = imageH / display.height;
  const x = Math.max(0, Math.round((rect.x - display.x) * sx));
  const y = Math.max(0, Math.round((rect.y - display.y) * sy));
  return {
    x,
    y,
    width: Math.max(1, Math.min(imageW - x, Math.round(rect.width * sx))),
    height: Math.max(1, Math.min(imageH - y, Math.round(rect.height * sy))),
  };
}

/** Native handle in a desktopCapturer window source id ("window:<hwnd>:0"). */
export function hwndFromSourceId(id: string): number | null {
  const m = /^window:(\d+):/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Pick the desktopCapturer window source for the foreground window: by
 *  handle when known, else by an EXACT (case-insensitive) title. Substring
 *  matching picked the wrong window ("Notepad" vs "Notepad++"), so there is
 *  none; no match means the caller falls back to the display. */
export function matchWindowSource<T extends { id?: string; name: string }>(
  sources: T[],
  fg: string | { title: string; hwnd?: number },
): T | null {
  const { title, hwnd } = typeof fg === 'string' ? { title: fg, hwnd: undefined } : fg;
  if (hwnd !== undefined) {
    const byHandle = sources.find((s) => s.id !== undefined && hwndFromSourceId(s.id) === hwnd);
    if (byHandle) return byHandle;
  }
  const t = title.trim().toLowerCase();
  if (!t) return null;
  const exact = sources.filter((s) => s.name.trim().toLowerCase() === t);
  // Two windows with the same title: ambiguous, better the display than a guess.
  return exact.length === 1 ? exact[0] : null;
}

export interface FgWindow { title: string; processName: string; hwnd?: number }

/** SuperJargon's own windows and the taskbar/tray are never what the user
 *  wants read — they are only foreground because the tray was clicked. */
export function isOwnOrShell(fg: FgWindow | null, ownProcessNames: readonly string[]): boolean {
  if (!fg) return true;
  const p = fg.processName.toLowerCase().replace(/\.exe$/, '');
  if (ownProcessNames.some((n) => n.toLowerCase() === p)) return true;
  return !fg.title.trim(); // Shell_TrayWnd and friends have no title
}

/** Window to read: the live foreground one, or — when that is SuperJargon /
 *  the tray — the one remembered from before, if it is recent enough. */
export function chooseTarget(
  current: FgWindow | null,
  remembered: { fg: FgWindow; at: number } | null,
  now: number,
  ownProcessNames: readonly string[],
  maxAgeMs = 120_000,
): FgWindow | null {
  if (current && !isOwnOrShell(current, ownProcessNames)) return current;
  if (remembered && now - remembered.at <= maxAgeMs) return remembered.fg;
  return null;
}
