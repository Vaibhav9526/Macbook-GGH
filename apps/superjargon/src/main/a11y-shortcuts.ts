import {
  A11Y_PALETTE_CYCLE,
  A11Y_SHORTCUT_ACTIONS,
  A11Y_SHORTCUT_LABELS,
  DEFAULT_A11Y_SHORTCUTS,
  canonicalAccelerator,
  shortcutConflicts,
  type A11yShortcutAction,
  type A11yShortcuts,
} from '../shared/a11y-shortcuts';
import { BUILTIN_A11Y_PROFILES, type A11yResult, type A11yUpdate } from '../shared/a11y-profiles';
import type { AccessibilitySettings } from '../shared/accessibility';

/**
 * Global shortcuts for the accessibility features. Electron-free: the real
 * globalShortcut, settings-store and speech arrive as deps (wired in
 * index.ts), so the smoke test drives it with fakes.
 *
 * Every toggle goes through the same store functions as the dashboard
 * (update / applyProfile / reset), so SETTINGS_CHANGED and the tile
 * services' own sync fire exactly as for a mouse click.
 */

export interface A11yShortcutDeps {
  /** globalShortcut.register — false when another app owns the accelerator. */
  register(accelerator: string, handler: () => void): boolean;
  unregister(accelerator: string): void;
  getBindings(): A11yShortcuts;
  saveBindings(bindings: A11yShortcuts): void;
  /** The talk shortcuts (PTT / dictation / agent) — never to be shadowed. */
  reserved(): string[];
  getState(): AccessibilitySettings;
  update(u: A11yUpdate): A11yResult;
  applyProfile(id: string): A11yResult;
  reset(): A11yResult;
  readScreen(): void;
  stopReading(): void;
  openDashboard(): void;
  /** Short spoken confirmation. `error` marks a failure, the only case that
   *  may also earn a visual toast; successes are voice-only. */
  say(text: string, opts?: { error?: boolean }): void;
  /** Clock override (tests). */
  now?(): number;
  /** A store write succeeded: re-broadcast settings to the windows. */
  changed(): void;
}

export type ShortcutSetResult =
  | { ok: true; bindings: A11yShortcuts; failed: A11yShortcutAction[] }
  | { ok: false; error: string; bindings: A11yShortcuts; failed: A11yShortcutAction[] };

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
/** Same action re-fired inside this window is key auto-repeat, not a new press. */
const REPEAT_GUARD_MS = 600;
/** Identical spoken confirmations closer together than this are dropped. */
const SAY_DEDUPE_MS = 1500;
/** Rapid steps (zoom) are announced once, this long after the last one. */
const SAY_COALESCE_MS = 350;
/** Actions where a held key legitimately repeats (zoom steps; the voice is coalesced). */
const REPEATABLE: ReadonlySet<A11yShortcutAction> = new Set(['magnifierZoomIn', 'magnifierZoomOut']);

const PROFILE_FOR: Partial<Record<A11yShortcutAction, string>> = {
  profileLowVision: 'low-vision',
  profileDeaf: 'deaf-hoh',
  profileDyslexia: 'dyslexia',
  profileMotor: 'motor',
};

export class A11yShortcutController {
  private active = new Map<string, A11yShortcutAction>();
  private failed = new Set<A11yShortcutAction>();
  private suspended = false;
  private lastFired = new Map<A11yShortcutAction, number>();
  private lastSaid = new Map<string, number>();
  private coalesce: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;
  /** Counters for the live test / debugging: how often each channel fired. */
  readonly stats = { fired: 0, repeatsDropped: 0, said: 0, saidDropped: 0 };

  constructor(private readonly deps: A11yShortcutDeps) {}

  /** Actions whose accelerator the OS refused at the last registration. */
  failedActions(): A11yShortcutAction[] {
    return A11Y_SHORTCUT_ACTIONS.filter((a) => this.failed.has(a));
  }

  /** (Re)register every binding. One refusal never stops the others. */
  registerAll(): A11yShortcutAction[] {
    this.unregisterAll();
    this.failed.clear();
    if (this.suspended) return [];
    const bindings = this.deps.getBindings();
    const reserved = this.deps.reserved().map(canonicalAccelerator);
    for (const action of A11Y_SHORTCUT_ACTIONS) {
      const accel = bindings[action];
      if (!accel) continue;
      const key = canonicalAccelerator(accel);
      if (!key || reserved.includes(key) || this.active.has(key)) {
        this.failed.add(action);
        continue;
      }
      let ok = false;
      try {
        ok = this.deps.register(accel, () => this.fire(action));
      } catch {
        ok = false;
      }
      if (ok) this.active.set(key, action);
      else this.failed.add(action);
    }
    return this.failedActions();
  }

  /** Shortcut capture is open: free every key so the editor can see them. */
  suspend(): void {
    this.suspended = true;
    this.unregisterAll();
  }

  resume(): void {
    this.suspended = false;
    this.registerAll();
  }

  /** Rebind one action ('' = unbind). Rolls back if the OS refuses it. */
  setBinding(action: unknown, accelerator: unknown): ShortcutSetResult {
    const current = this.deps.getBindings();
    if (typeof action !== 'string' || !(A11Y_SHORTCUT_ACTIONS as readonly string[]).includes(action)) {
      return this.fail('unknown action', current);
    }
    const act = action as A11yShortcutAction;
    const accel = accelerator === '' ? '' : canonicalAccelerator(accelerator);
    if (accelerator !== '' && !accel) {
      return this.fail('Use at least one modifier (Ctrl, Alt, Shift) plus one key', current);
    }
    if (accel) {
      const c = shortcutConflicts(accel, current, this.deps.reserved(), act);
      if (c.reserved) return this.fail('That is one of the talk shortcuts', current);
      if (c.actions.length) return this.fail(`Already used by "${A11Y_SHORTCUT_LABELS[c.actions[0]]}"`, current);
    }
    const next = { ...current, [act]: accel };
    this.deps.saveBindings(next);
    this.registerAll();
    if (accel && this.failed.has(act)) {
      // Convention shared with the talk shortcuts: refused → restore the old one.
      this.deps.saveBindings(current);
      this.registerAll();
      return this.fail('Another app is using that shortcut', current);
    }
    this.deps.changed();
    return { ok: true, bindings: next, failed: this.failedActions() };
  }

  resetBindings(): ShortcutSetResult {
    const next = { ...DEFAULT_A11Y_SHORTCUTS };
    // A default may collide with a talk shortcut the user rebound: unbind it
    // instead of shadowing.
    for (const a of A11Y_SHORTCUT_ACTIONS) {
      if (shortcutConflicts(next[a], { ...next, [a]: '' }, this.deps.reserved()).reserved) next[a] = '';
    }
    this.deps.saveBindings(next);
    this.registerAll();
    this.deps.changed();
    return { ok: true, bindings: next, failed: this.failedActions() };
  }

  /**
   * The registered global-shortcut handler. A held key makes Windows deliver
   * WM_HOTKEY on every auto-repeat, which used to toggle the tile on/off/on...
   * and queue one toast + one utterance per repeat (the "notification loop").
   * Repeats of the same action inside the guard window are dropped; every
   * repeat — dropped or not — re-arms the window, so a held key stays one press.
   */
  private fire(action: A11yShortcutAction): void {
    const t = this.now();
    const prev = this.lastFired.get(action);
    this.lastFired.set(action, t);
    if (!REPEATABLE.has(action) && prev !== undefined && t - prev < REPEAT_GUARD_MS) {
      this.stats.repeatsDropped++;
      return;
    }
    this.stats.fired++;
    this.run(action);
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** Speak `text` unless the same line was just spoken. */
  private say(text: string, error = false): void {
    const t = this.now();
    const prev = this.lastSaid.get(text);
    this.lastSaid.set(text, t);
    if (prev !== undefined && t - prev < SAY_DEDUPE_MS) {
      this.stats.saidDropped++;
      return;
    }
    this.stats.said++;
    this.deps.say(text, error ? { error: true } : undefined);
  }

  /** Run an action as if its shortcut fired. Never throws. */
  run(action: A11yShortcutAction): void {
    try {
      this.dispatch(action);
    } catch (err) {
      console.error(`[SuperJargon] a11y shortcut ${action} failed:`, err instanceof Error ? err.message : err);
    }
  }

  dispose(): void {
    this.unregisterAll();
    if (this.coalesce) clearTimeout(this.coalesce.timer);
    this.coalesce = null;
  }

  private fail(error: string, bindings: A11yShortcuts): ShortcutSetResult {
    return { ok: false, error, bindings, failed: this.failedActions() };
  }

  private unregisterAll(): void {
    for (const accel of this.active.keys()) {
      try {
        this.deps.unregister(accel);
      } catch { /* already gone */ }
    }
    this.active.clear();
  }

  /**
   * Apply a store result: confirm on success, say the error otherwise.
   * `coalesceKey`: rapid repeats of the same step announce only the last one.
   * `onlyIfChanged`: a no-op (profile already applied, already default) is silent.
   */
  private commit(
    r: A11yResult,
    confirmation: string,
    opts: { coalesceKey?: string; onlyIfChanged?: AccessibilitySettings } = {},
  ): void {
    if (!r.ok) {
      this.say(r.error, true);
      return;
    }
    if (opts.onlyIfChanged && JSON.stringify(r.state.settings) === JSON.stringify(opts.onlyIfChanged)) return;
    this.deps.changed();
    if (!opts.coalesceKey) {
      this.say(confirmation);
      return;
    }
    if (this.coalesce) clearTimeout(this.coalesce.timer);
    const timer = setTimeout(() => {
      this.coalesce = null;
      this.say(confirmation);
    }, SAY_COALESCE_MS);
    timer.unref?.();
    this.coalesce = { key: opts.coalesceKey, timer };
  }

  private dispatch(action: A11yShortcutAction): void {
    const tiles = this.deps.getState().tiles;
    const onOff = (on: boolean) => (on ? 'on' : 'off');
    const toggleTile = (id: 'screenReader' | 'magnifier' | 'captions' | 'readingAids', name: string) => {
      const on = !tiles[id].enabled;
      this.commit(this.deps.update({ tiles: { [id]: { enabled: on } } } as A11yUpdate), `${name} ${onOff(on)}`);
    };
    const toggleAid = (key: 'dyslexiaFont' | 'readingRuler' | 'reducedMotion', name: string) => {
      const on = !tiles.readingAids[key];
      // Turning an aid on also turns the tile on, or nothing would change.
      const patch = on ? { enabled: true, [key]: true } : { [key]: false };
      this.commit(this.deps.update({ tiles: { readingAids: patch } } as A11yUpdate), `${name} ${onOff(on)}`);
    };

    switch (action) {
      case 'readScreen':
        // readScreenNow itself says so when the tile is off.
        this.deps.readScreen();
        return;
      case 'stopReading':
        this.deps.stopReading();
        return;
      case 'toggleScreenReader': return toggleTile('screenReader', 'Screen reader');
      case 'toggleMagnifier': return toggleTile('magnifier', 'Magnifier');
      case 'toggleCaptions': return toggleTile('captions', 'Captions');
      case 'toggleReadingAids': return toggleTile('readingAids', 'Reading aids');
      case 'magnifierZoomIn':
      case 'magnifierZoomOut': {
        const dir = action === 'magnifierZoomIn' ? 1 : -1;
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, tiles.magnifier.zoom + dir * ZOOM_STEP));
        if (zoom === tiles.magnifier.zoom) {
          this.say(dir > 0 ? 'Already at maximum zoom' : 'Already at minimum zoom');
          return;
        }
        const on = tiles.magnifier.enabled ? '' : ', magnifier is off';
        this.commit(this.deps.update({ tiles: { magnifier: { zoom } } }), `Zoom ${zoom} times${on}`, { coalesceKey: 'zoom' });
        return;
      }
      case 'cycleColourPalette': {
        const i = A11Y_PALETTE_CYCLE.indexOf(tiles.readingAids.palette as (typeof A11Y_PALETTE_CYCLE)[number]);
        const palette = A11Y_PALETTE_CYCLE[(i + 1) % A11Y_PALETTE_CYCLE.length];
        this.commit(
          this.deps.update({ tiles: { readingAids: { enabled: true, palette } } }),
          `${palette === 'default' ? 'Default' : palette.replace('-', ' ')} palette`,
        );
        return;
      }
      case 'toggleDyslexiaFont': return toggleAid('dyslexiaFont', 'Dyslexia font');
      case 'toggleReadingRuler': return toggleAid('readingRuler', 'Reading ruler');
      case 'toggleReducedMotion': return toggleAid('reducedMotion', 'Reduced motion');
      case 'profileLowVision':
      case 'profileDeaf':
      case 'profileDyslexia':
      case 'profileMotor': {
        const id = PROFILE_FOR[action] as string;
        const name = BUILTIN_A11Y_PROFILES.find((p) => p.id === id)?.name ?? id;
        // Snapshot before applying: the store now holds the new state, so
        // comparing against a fresh read would always look unchanged.
        const before = this.deps.getState();
        this.commit(this.deps.applyProfile(id), `${name} profile applied`, { onlyIfChanged: before });
        return;
      }
      case 'resetA11y': {
        const before = this.deps.getState();
        this.commit(this.deps.reset(), 'Accessibility settings reset', { onlyIfChanged: before });
        return;
      }
      case 'openDashboard':
        this.deps.openDashboard();
        return;
    }
  }
}
