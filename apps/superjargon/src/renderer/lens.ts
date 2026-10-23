// Lens renderer: one live capture stream of the display under the pointer,
// shown full-window through a CSS transform (GPU-composited, no canvas copy).
// Main sends only {x, y, zoom} per change; there is no per-frame image IPC.
//
// Mapping: the content under the pointer stays under the pointer, i.e.
//   screen = p + (content - p) * zoom  ->  translate(p * (1 - zoom)) scale(zoom)
// which is edge-clamped by construction and keeps click-through accurate.

interface LensFrame { x: number; y: number; zoom: number; smoothing: number; live: boolean }
interface LensSource { sourceId: string; displayId: number; pixelWidth: number; pixelHeight: number; init: LensFrame }
interface LensBridge {
  onFrame(cb: (f: LensFrame) => void): void;
  onSource(cb: (s: LensSource | null) => void): void;
  ready(displayId: number): void;
}

const bridge = (window as unknown as { lens?: LensBridge }).lens;
const slots = [document.getElementById('a'), document.getElementById('b')] as HTMLVideoElement[];

let front = 0; // slot currently visible
let token = 0; // bumps on every source change; stale async work bails out
let px = 0;
let py = 0;
let pxTarget = 0;
let pyTarget = 0;
let smoothing = 0; // 0 = snap to pointer, 1 = glide
let zoom = 1; // animated value
let zoomTarget = 1;
let raf = 0;
let lastT = 0;

function apply(): void {
  const k = 1 - zoom;
  const t = `translate3d(${px * k}px, ${py * k}px, 0) scale(${zoom})`;
  for (const v of slots) v.style.transform = t;
}

function step(now: number): void {
  raf = 0;
  const dt = Math.min(64, lastT ? now - lastT : 16);
  lastT = now;
  if (zoom !== zoomTarget) {
    // Critically-damped-ish ease, ~90 ms time constant: zoom steps glide.
    zoom += (zoomTarget - zoom) * (1 - Math.exp(-dt / 90));
    if (Math.abs(zoomTarget - zoom) < 0.002) zoom = zoomTarget;
  }
  if (px !== pxTarget || py !== pyTarget) {
    // Smoothing is the pan lag the panel's slider promises: 0 snaps, 1 trails
    // the pointer by ~200 ms. Zoom is eased separately so steps stay crisp.
    const tau = 8 + smoothing * 200;
    const k = 1 - Math.exp(-dt / tau);
    px += (pxTarget - px) * k;
    py += (pyTarget - py) * k;
    if (Math.abs(pxTarget - px) < 0.25) px = pxTarget;
    if (Math.abs(pyTarget - py) < 0.25) py = pyTarget;
  }
  apply();
  if (zoom !== zoomTarget || px !== pxTarget || py !== pyTarget) raf = requestAnimationFrame(step);
  else lastT = 0;
}

function schedule(): void {
  if (!raf) raf = requestAnimationFrame(step);
}

function release(v: HTMLVideoElement): void {
  const s = v.srcObject as MediaStream | null;
  s?.getTracks().forEach((t) => t.stop());
  v.srcObject = null;
  v.classList.remove('live');
}

function stopAll(): void {
  token++;
  slots.forEach(release);
}

async function startStream(next: LensSource): Promise<void> {
  const my = ++token;
  const back = slots[1 - front];
  release(back);
  try {
    // Electron's desktop-capture constraint dialect (not in lib.dom types).
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: next.sourceId,
          maxWidth: next.pixelWidth,
          maxHeight: next.pixelHeight,
          maxFrameRate: 60,
        },
      },
    } as unknown as MediaStreamConstraints);
    if (my !== token) { stream.getTracks().forEach((t) => t.stop()); return; }
    // Start exactly at the current view: no 1x flash and no zoom-in glide on show.
    px = pxTarget = next.init.x; py = pyTarget = next.init.y;
    zoom = zoomTarget = next.init.zoom;
    smoothing = next.init.smoothing;
    back.srcObject = stream;
    await back.play();
    if (my !== token) return;
    // Wait for a real decoded frame so we never reveal a black first frame.
    await new Promise<void>((resolve) => {
      if ('requestVideoFrameCallback' in back) back.requestVideoFrameCallback(() => resolve());
      else setTimeout(resolve, 100);
    });
    if (my !== token) return;
    const old = slots[front];
    back.classList.add('live');
    front = 1 - front;
    release(old);
    apply();
    bridge?.ready(next.displayId);
  } catch {
    // No stream: the window stays hidden (main only shows it on ready).
  }
}

bridge?.onSource((s) => {
  if (s) void startStream(s);
  else stopAll();
});
bridge?.onFrame((f) => {
  pxTarget = f.x;
  pyTarget = f.y;
  smoothing = f.smoothing;
  zoomTarget = f.zoom;
  schedule();
});
