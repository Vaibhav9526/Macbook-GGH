// Electron half of the screen reader's capture scopes.
//   window: the focused window (title from active-window.ts, pixels from
//           desktopCapturer 'window' sources); falls back to the display.
//   region: a pointer-centred rectangle of the display under the cursor.
// Images stay in memory; nothing is logged or written.

import { app, desktopCapturer, nativeImage, screen } from 'electron';
import type { ScreenCapture } from '../../../shared/types';
import type { ScreenReaderOptions } from '../../../shared/accessibility';
import { captureDisplays } from '../screen-capture';
import { foregroundWindowTitle } from '../active-window';
import { chooseTarget, isOwnOrShell, matchWindowSource, regionAroundPoint, toImageRect, type FgWindow } from './capture-region';

const JPEG_QUALITY = 82;
const MAX_WINDOW_EDGE = 1568;

/** Process names that mean "this is SuperJargon itself" (packaged / dev). */
const OWN_PROCESSES = ['SuperJargon', 'electron', app.getName()];
/** Last real app window seen before the user reached for the tray. */
let remembered: { fg: FgWindow; at: number } | null = null;

/** Call when the tray is about to be used (hover/click): the foreground is
 *  still the user's app at that moment, and won't be by the time they read. */
let lastProbeAt = 0;
export async function rememberForeground(): Promise<void> {
  // mouse-enter can fire repeatedly; each probe spawns PowerShell.
  if (Date.now() - lastProbeAt < 1500) return;
  lastProbeAt = Date.now();
  const fg = await foregroundWindowTitle({ fresh: true });
  if (fg && !isOwnOrShell(fg, OWN_PROCESSES)) remembered = { fg, at: Date.now() };
}

/**
 * Which window "the screen" means right now: the live foreground app, or the
 * one remembered when the user reached for the tray (by then the foreground
 * is the tray/panel). Shared by pixel capture and the UIA text reader so both
 * read the same window.
 */
export async function targetWindow(): Promise<FgWindow | null> {
  const live = await foregroundWindowTitle({ fresh: true });
  return chooseTarget(live, remembered, Date.now(), OWN_PROCESSES);
}

async function captureWindow(): Promise<ScreenCapture | null> {
  const fg = await targetWindow();
  if (!fg) return null;
  // Lookup without rendering any window (0x0 thumbnails are ids only), then
  const ids = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
  const found = matchWindowSource(ids, fg);
  if (!found) return null;
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: MAX_WINDOW_EDGE, height: MAX_WINDOW_EDGE },
  });
  const src = sources.find((s) => s.id === found.id);
  if (!src || src.thumbnail.isEmpty()) return null;
  const size = src.thumbnail.getSize();
  if (size.width < 2 || size.height < 2) return null;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return {
    dataBase64: src.thumbnail.toJPEG(JPEG_QUALITY).toString('base64'),
    displayId: display.id,
    imageWidth: size.width,
    imageHeight: size.height,
    displayBounds: display.bounds,
    isCursorScreen: true,
  };
}

async function captureRegion(): Promise<ScreenCapture | null> {
  const full = (await captureDisplays({ cursorOnly: true }))[0];
  if (!full) return null;
  const rect = toImageRect(
    regionAroundPoint(screen.getCursorScreenPoint(), full.displayBounds),
    full.displayBounds,
    full.imageWidth,
    full.imageHeight,
  );
  const img = nativeImage.createFromBuffer(Buffer.from(full.dataBase64, 'base64')).crop(rect);
  const size = img.getSize();
  return { ...full, dataBase64: img.toJPEG(JPEG_QUALITY).toString('base64'), imageWidth: size.width, imageHeight: size.height };
}

export async function captureForScope(scope: ScreenReaderOptions['scope']): Promise<ScreenCapture | null> {
  if (scope === 'region') return captureRegion();
  // window: fall back to the whole display when the window can't be captured
  // (minimised, elevated, or no title) so the user still hears something.
  return (await captureWindow()) ?? (await captureDisplays({ cursorOnly: true }))[0] ?? null;
}
