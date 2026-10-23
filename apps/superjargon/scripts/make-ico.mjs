#!/usr/bin/env node
/**
 * SuperJargon asset generator — regenerates every icon the app ships from
 * the mascot at references/jargon.png (1200x1200, 8-bit RGBA, transparent
 * background). Self-contained: no native modules, no network. The pipeline
 * is decode (zlib inflate + scanline unfilter) → area-weighted downscale
 * with premultiplied alpha, so edge pixels keep their true color instead
 * of going muddy against the transparent corners → re-encode PNG and pack
 * the ICO/ICNS containers.
 *
 *   node scripts/make-ico.mjs
 *
 * Writes (paths match what src/main + package.json already reference):
 *   assets/superjargon-icon.svg  vector source of the mark (copied from
 *                                references/jargon.svg verbatim)
 *   assets/icon.ico              256/48/32/16 PNG-frame ICO (win tray + build.win.icon)
 *   assets/icons/<N>x<N>.png     16–512 set (tray fallback + build.linux.icon)
 *   assets/icon.png              512 master PNG
 *   assets/tray-icon.png         32px, assets/tray-icon@2x.png 64px
 *   assets/icon.icns             mac bundle icon (referenced by build.mac.icon)
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');
const REFERENCES = join(ROOT, 'references');
const MASCOT_PNG = join(REFERENCES, 'jargon.png');
const MASCOT_SVG = join(REFERENCES, 'jargon.svg');

// ── PNG decoder (8-bit RGBA, color type 6, non-interlaced) ───────────

/** Paeth predictor — PNG filter type 4's "best of left/up/up-left". */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Minimal PNG decoder: verifies the signature, walks chunks for IHDR +
 * the IDAT payload (skipping iTXt/gAMA/etc.), inflates the concatenated
 * stream, and reverses per-scanline filtering (types 0–4). Only the one
 * format the mascot ships in is supported — bail loudly on anything else
 * rather than silently decoding garbage.
 */
function decodePNG(buf) {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 8 || SIG.some((b, i) => buf[i] !== b)) {
    throw new Error('decodePNG: not a PNG file (bad signature)');
  }
  let width = 0;
  let height = 0;
  let ihdrSeen = false;
  const idat = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const compression = data[10];
      const filterMethod = data[11];
      const interlace = data[12];
      if (bitDepth !== 8 || colorType !== 6 || compression !== 0 || filterMethod !== 0 || interlace !== 0) {
        throw new Error(
          `decodePNG: unsupported format (bitDepth=${bitDepth} colorType=${colorType} ` +
            `interlace=${interlace}) — need 8-bit RGBA, non-interlaced`,
        );
      }
      ihdrSeen = true;
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 8 + len + 4; // len + type + payload + crc
  }
  if (!ihdrSeen) throw new Error('decodePNG: missing IHDR chunk');
  if (idat.length === 0) throw new Error('decodePNG: missing IDAT chunk(s)');

  const stride = width * 4;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) {
    throw new Error(
      `decodePNG: inflated data is ${raw.length} bytes, expected ${(stride + 1) * height}`,
    );
  }

  // Unfilter: each scanline leads with a filter byte, then `stride`
  // filtered bytes. Recon goes straight into `out` so left/up/up-left
  // references read already-decoded pixels.
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const filt = raw[src + x];
      const left = x >= 4 ? out[dst + x - 4] : 0;
      const up = y > 0 ? out[dst + x - stride] : 0;
      const upLeft = y > 0 && x >= 4 ? out[dst + x - stride - 4] : 0;
      let v;
      switch (f) {
        case 0: v = filt; break;                       // None
        case 1: v = filt + left; break;                // Sub
        case 2: v = filt + up; break;                  // Up
        case 3: v = filt + ((left + up) >> 1); break;  // Average
        case 4: v = filt + paeth(left, up, upLeft); break; // Paeth
        default:
          throw new Error(`decodePNG: unknown filter type ${f} on row ${y}`);
      }
      out[dst + x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

// ── Downscaler (area box filter, premultiplied alpha) ────────────────

/**
 * Shrink a square RGBA buffer to `size`×`size` by integrating every source
 * pixel's fractional coverage of each destination pixel. Color channels
 * accumulate premultiplied (a·r) and are divided by accumulated alpha at
 * the end — straight-alpha averaging would let fully transparent pixels
 * bleed their (meaningless) color into the visible edge, which is exactly
 * how a mascot on transparency ends up with a dark halo at 32px.
 */
function downscale(src, sw, sh, size) {
  const out = Buffer.alloc(size * size * 4);
  const xScale = sw / size;
  const yScale = sh / size;
  for (let dy = 0; dy < size; dy++) {
    const y0 = dy * yScale;
    const y1 = Math.min(sh, y0 + yScale);
    const sy0 = Math.floor(y0);
    const sy1 = Math.ceil(y1);
    for (let dx = 0; dx < size; dx++) {
      const x0 = dx * xScale;
      const x1 = Math.min(sw, x0 + xScale);
      const sx0 = Math.floor(x0);
      const sx1 = Math.ceil(x1);
      let wSum = 0;
      let aSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        if (wy <= 0) continue;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(sx + 1, x1) - Math.max(sx, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const i = (sy * sw + sx) * 4;
          const a = src[i + 3];
          wSum += w;
          aSum += w * a;
          rSum += w * a * src[i];
          gSum += w * a * src[i + 1];
          bSum += w * a * src[i + 2];
        }
      }
      const o = (dy * size + dx) * 4;
      out[o + 3] = Math.round(aSum / wSum);
      if (aSum > 0) {
        out[o] = Math.round(rSum / aSum);
        out[o + 1] = Math.round(gSum / aSum);
        out[o + 2] = Math.round(bSum / aSum);
      }
    }
  }
  return out;
}

// ── PNG encoder (8-bit RGBA, filter 0) ──────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ICO / ICNS containers ───────────────────────────────────────────

/** ICO with embedded PNG frames (Vista+). `frames`: [{size, png}]. */
function encodeICO(frames) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const entries = frames.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // 256 is encoded as 0
    e[1] = size >= 256 ? 0 : size;
    e[4] = 1; // planes (lo byte)
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([dir, ...entries, ...frames.map((f) => f.png)]);
}

/** ICNS: 'icns' magic + typed PNG chunks. */
function encodeICNS(pngsBySize) {
  const TYPES = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
  const chunks = Object.entries(pngsBySize).map(([size, png]) => {
    const head = Buffer.alloc(8);
    head.write(TYPES[size], 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const total = 8 + chunks.reduce((s, c) => s + c.length, 0);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

// ── Main ─────────────────────────────────────────────────────────────

const { data: mascot, width: MW, height: MH } = decodePNG(readFileSync(MASCOT_PNG));
// The mark ships square; if a future reference isn't, the box filter maps
// the rect onto the square target anyway (a stretch, not a crop).
if (MW !== MH) console.warn(`warning: mascot is ${MW}x${MH} (not square) — output will be stretched`);

const pngCache = new Map();
const png = (size) => {
  if (!pngCache.has(size)) pngCache.set(size, encodePNG(size, downscale(mascot, MW, MH, size)));
  return pngCache.get(size);
};

mkdirSync(join(ASSETS, 'icons'), { recursive: true });

copyFileSync(MASCOT_SVG, join(ASSETS, 'superjargon-icon.svg'));

for (const size of [16, 32, 48, 64, 128, 256, 512]) {
  writeFileSync(join(ASSETS, 'icons', `${size}x${size}.png`), png(size));
}
writeFileSync(join(ASSETS, 'icon.png'), png(512));
writeFileSync(join(ASSETS, 'tray-icon.png'), png(32));
writeFileSync(join(ASSETS, 'tray-icon@2x.png'), png(64));

writeFileSync(
  join(ASSETS, 'icon.ico'),
  encodeICO([256, 48, 32, 16].map((size) => ({ size, png: png(size) }))),
);

writeFileSync(
  join(ASSETS, 'icon.icns'),
  encodeICNS(Object.fromEntries([16, 32, 64, 128, 256, 512, 1024].map((s) => [s, png(s)]))),
);

console.log('SuperJargon assets written to', ASSETS);
for (const [k, v] of [...pngCache.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${k}x${k}  ${v.length} B`);
}
