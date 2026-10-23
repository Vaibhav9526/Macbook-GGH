import type { A11yReadingAidsPayload } from '../shared/accessibility';

/**
 * Applies the reading-aids tile to this window: classes on <body>, CSS
 * variables on :root, the generated stylesheet, and the reading ruler.
 * Called once from each renderer entry (panel, stream, overlay); main
 * re-sends the current payload whenever a window finishes loading, so a
 * lazily created stream window still picks it up.
 *
 * The ruler is a pointer-events:none band with two viewport-tall dim panes
 * attached above and below it. Overlay windows are click-through but forward
 * mousemove, so the same code works there and dims the whole display.
 * Tracking costs one transform write per frame: no layout, no repaint, and
 * no giant box-shadow layer (a 100vmax spread rasterized a ~4x-viewport
 * texture that moved with every mousemove).
 */

const STYLE_ID = 'a11y-reading-aids-style';
const RULER_ID = 'a11y-reading-ruler';

let appliedClasses: string[] = [];
let appliedVars: string[] = [];
let rulerEl: HTMLDivElement | null = null;
let rulerHeight = 48;
let lastY: number | null = null;
let frame = 0;
let lastKey = '';

function placeRuler(): void {
  frame = 0;
  if (!rulerEl || lastY === null) return;
  rulerEl.style.transform = `translateY(${Math.round(lastY - rulerHeight / 2)}px)`;
  rulerEl.style.display = 'block';
}

/** mousemove fires faster than frames; coalesce to one placement per frame. */
function schedulePlace(): void {
  if (!frame) frame = requestAnimationFrame(placeRuler);
}

function cancelPlace(): void {
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

function onMove(e: MouseEvent): void {
  lastY = e.clientY;
  schedulePlace();
}

/** The overlay is click-through with forwarded mouse events; Chromium then
 *  fires mouseleave right after every forwarded mousemove, which hid the ruler
 *  the instant it appeared (observed live). Interactive windows keep the hide. */
const CLICK_THROUGH = typeof location !== 'undefined' && /overlay\.html/.test(location.pathname);

function onLeave(): void {
  if (CLICK_THROUGH) return;
  lastY = null;
  cancelPlace();
  if (rulerEl) rulerEl.style.display = 'none';
}

function setRuler(ruler: A11yReadingAidsPayload['ruler'], on: boolean): void {
  if (!on || !ruler.enabled) {
    if (rulerEl) {
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      cancelPlace();
      rulerEl.remove();
      rulerEl = null;
    }
    return;
  }
  rulerHeight = ruler.height;
  if (!rulerEl) {
    rulerEl = document.createElement('div');
    rulerEl.id = RULER_ID;
    rulerEl.setAttribute('aria-hidden', 'true');
    for (const side of ['top', 'bottom'] as const) {
      const pane = document.createElement('div');
      pane.dataset.side = side;
      rulerEl.appendChild(pane);
    }
    document.body.appendChild(rulerEl);
    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
  }
  Object.assign(rulerEl.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: `${ruler.height}px`,
    display: lastY === null ? 'none' : 'block',
    pointerEvents: 'none',
    zIndex: '2147483647',
    borderTop: `2px solid ${ruler.color}`,
    borderBottom: `2px solid ${ruler.color}`,
    boxSizing: 'border-box',
    willChange: 'transform',
  });
  // The panes sit outside the band: styled once per descriptor, never per move.
  const dim = `rgba(0,0,0,${ruler.dim})`;
  for (const pane of Array.from(rulerEl.children) as HTMLDivElement[]) {
    Object.assign(pane.style, {
      position: 'absolute',
      left: '-2px',
      width: 'calc(100% + 4px)',
      height: '100vh',
      background: dim,
      pointerEvents: 'none',
      // 100% is the padding box; +2px clears the band's own border.
      [pane.dataset.side === 'top' ? 'bottom' : 'top']: 'calc(100% + 2px)',
    });
  }
  placeRuler();
}

export function applyReadingAids(p: A11yReadingAidsPayload): void {
  // main re-sends the payload on every load and settings change; an identical
  // descriptor must not restyle the document or reparse the stylesheet.
  const key = JSON.stringify(p);
  if (key === lastKey) return;
  lastKey = key;

  const root = document.documentElement;
  const body = document.body;
  body.classList.remove(...appliedClasses);
  for (const k of appliedVars) root.style.removeProperty(k);
  appliedClasses = p.enabled ? p.classes : [];
  appliedVars = p.enabled ? Object.keys(p.cssVars) : [];
  body.classList.add(...appliedClasses);
  for (const k of appliedVars) root.style.setProperty(k, p.cssVars[k]);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = p.enabled ? p.css : '';
  setRuler(p.ruler, p.enabled);
}

/** Subscribe this window to reading-aids updates from main. */
export function installReadingAids(): void {
  window.flicky.onA11yReadingAids(applyReadingAids);
  // Overlays are click-through, so they never see the pointer leave: main says
  // when it moves to another display, and the band is dropped here.
  window.flicky.onA11yRulerActive?.((active) => {
    if (active) return; // the next mousemove on this display shows it again
    lastY = null;
    cancelPlace();
    if (rulerEl) rulerEl.style.display = 'none';
  });
}
