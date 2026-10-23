// Legacy bridge — keeps the dashboard's wrapper tiles (voice, dictation,
// pointing, hands-free) and the spoken-reply speed in step with the features
// they stand for. Those tiles used to be inert flags: switching "Hands-free"
// on in the Dashboard stored `enabled: true` and nothing else happened.
//
// Electron free: every read and write is injected, so the smoke test drives
// it with fakes.
//
// Rules (per pair of {dashboard value, legacy value}):
//   - first pass: the legacy value is the truth (it is what the user is
//     actually running); the dashboard is corrected to match.
//   - afterwards, whichever side changed since the last pass wins and is
//     copied to the other. If both changed, the dashboard wins.
// The bridge records what it just wrote BEFORE writing, so the settings
// broadcast that the write triggers re-enters sync() and finds nothing to do.

import type { A11yUpdate } from '../../../shared/a11y-profiles';
import type { AccessibilitySettings } from '../../../shared/accessibility';

export type BridgedTile = 'voice' | 'dictation' | 'pointing' | 'handsFree';

export interface LegacyState {
  speakReplies: boolean;
  dictationEnabled: boolean;
  isClickyCursorEnabled: boolean;
  alwaysOnEnabled: boolean;
  voiceSpeed: number;
}

export interface LegacyBridgeDeps {
  getA11y(): AccessibilitySettings;
  getLegacy(): LegacyState;
  /** Dashboard-side write (settings-store.updateA11y); returns false if rejected. */
  updateA11y(update: A11yUpdate): boolean;
  setSpeakReplies(on: boolean): void;
  setDictation(on: boolean): void;
  setCursorVisible(on: boolean): void;
  setAlwaysOn(on: boolean): void;
  setVoiceSpeed(speed: number): void;
  /** Called once after a pass that changed anything, so windows re-read state. */
  notify?(): void;
}

const FLAG_PAIRS: ReadonlyArray<{ tile: BridgedTile; key: keyof LegacyState }> = [
  { tile: 'voice', key: 'speakReplies' },
  { tile: 'dictation', key: 'dictationEnabled' },
  { tile: 'pointing', key: 'isClickyCursorEnabled' },
  { tile: 'handsFree', key: 'alwaysOnEnabled' },
];

export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
const EPS = 0.001;

export function clampRate(n: number): number {
  return Math.min(RATE_MAX, Math.max(RATE_MIN, Number.isFinite(n) ? n : 1));
}

/**
 * voiceSpeed is a TTS-provider speed, not a Web Speech rate: ElevenLabs
 * accepts 0.7–1.2 and the Voice tab slider uses the same range. The
 * dashboard's voiceRate goes 0.5–2, so a 1.5 written through unclamped was
 * a value the provider rejects and the Voice tab can't display.
 */
export const SPEED_MIN = 0.7;
export const SPEED_MAX = 1.2;

export function clampSpeed(n: number): number {
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Number.isFinite(n) ? n : 1));
}

export class LegacyBridge {
  private lastTile = new Map<BridgedTile, boolean>();
  private lastLegacy = new Map<keyof LegacyState, boolean>();
  private lastRate: number | null = null;
  private lastSpeed: number | null = null;
  private running = false;

  constructor(private readonly deps: LegacyBridgeDeps) {}

  sync(): void {
    if (this.running) return;
    this.running = true;
    try {
      this.pass();
    } finally {
      this.running = false;
    }
  }

  private pass(): void {
    const a = this.deps.getA11y();
    const l = this.deps.getLegacy();
    const mirrorTiles: Partial<Record<BridgedTile, { enabled: boolean }>> = {};
    let mirrorRate: number | undefined;
    const writes: Array<() => void> = [];
    const first = this.lastRate === null;

    for (const { tile, key } of FLAG_PAIRS) {
      const t = a.tiles[tile].enabled;
      const v = l[key] as boolean;
      const tileChanged = !first && t !== this.lastTile.get(tile);
      const legChanged = !first && v !== this.lastLegacy.get(key);
      if (t !== v) {
        if (tileChanged) {
          this.lastTile.set(tile, t);
          this.lastLegacy.set(key, t);
          writes.push(() => this.writeFlag(tile, t));
          continue;
        }
        // first pass, or only the legacy side moved
        if (first || legChanged) {
          mirrorTiles[tile] = { enabled: v };
          this.lastTile.set(tile, v);
          this.lastLegacy.set(key, v);
          continue;
        }
      }
      this.lastTile.set(tile, t);
      this.lastLegacy.set(key, v);
    }

    // Spoken-reply speed: dashboard voiceRate <-> voiceSpeed.
    const rate = a.voiceRate;
    const speed = l.voiceSpeed;
    const differ = Math.abs(rate - speed) > EPS;
    const rateChanged = !first && Math.abs(rate - (this.lastRate ?? rate)) > EPS;
    const speedChanged = !first && Math.abs(speed - (this.lastSpeed ?? speed)) > EPS;
    if (differ && !first && rateChanged) {
      // Clamped to the provider range. The dashboard keeps its own value
      // (e.g. 1.5); lastSpeed records what we wrote so the clamped
      // difference doesn't read as a legacy-side change next pass.
      const next = clampSpeed(rate);
      this.lastRate = rate;
      this.lastSpeed = next;
      if (Math.abs(next - speed) > EPS) writes.push(() => this.deps.setVoiceSpeed(next));
    } else if (differ && (first || speedChanged)) {
      mirrorRate = clampRate(speed);
      this.lastRate = mirrorRate;
      this.lastSpeed = speed;
    } else {
      this.lastRate = rate;
      this.lastSpeed = speed;
    }

    let changed = writes.length > 0;
    if (Object.keys(mirrorTiles).length > 0 || mirrorRate !== undefined) {
      const update: A11yUpdate = {};
      if (Object.keys(mirrorTiles).length > 0) update.tiles = mirrorTiles;
      if (mirrorRate !== undefined) update.voiceRate = mirrorRate;
      if (this.deps.updateA11y(update)) changed = true;
    }
    for (const w of writes) w();
    if (changed) this.deps.notify?.();
  }

  private writeFlag(tile: BridgedTile, on: boolean): void {
    switch (tile) {
      case 'voice': this.deps.setSpeakReplies(on); break;
      case 'dictation': this.deps.setDictation(on); break;
      case 'pointing': this.deps.setCursorVisible(on); break;
      case 'handsFree': this.deps.setAlwaysOn(on); break;
    }
  }
}
