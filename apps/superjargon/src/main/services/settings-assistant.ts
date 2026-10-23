// Settings assistant — spoken control of the accessibility dashboard.
// Pure and injectable (no Electron): companion-manager supplies the Mind
// completion, the voice, and the settings-store functions, so the smoke can
// drive every branch with fakes. See docs/SETTINGS-PATCH.md.
//
// Flow per utterance: cheap local gate (regex, no model call) → on a hit one
// Mind completion asking for a JSON patch → extract → validateA11yPatch →
// apply through the store → spoken confirmation + undo entry. Nothing the
// model says reaches the store without passing validateA11yPatch.

import type { A11yPatch, A11yTileId, AccessibilitySettings } from '../../shared/accessibility';
import {
  A11Y_TILE_LABELS,
  BUILTIN_A11Y_PROFILES,
  a11yPatchToUpdate,
  validateA11yPatch,
} from '../../shared/a11y-profiles';
import type { A11yResult, A11yState } from '../../shared/a11y-profiles';
import { buildSettingsAssistantPrompt } from './prompts';
import { WAKE_NAME, extractAgentTask } from './element-detector';

/** Undo depth. In memory only — a restart forgets, which is the point. */
export const UNDO_LIMIT = 20;
/** A "which profile suits me?" suggestion stays answerable with yes/no this long. */
export const PENDING_TTL_MS = 60_000;
/** Longer utterances are conversation, not commands — skip the gate. */
export const GATE_MAX_WORDS = 25;

export type SettingsIntent =
  | { kind: 'undo' }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'suggest-profile' }
  | { kind: 'explain'; tile: A11yTileId | null }
  | { kind: 'apply-profile'; id: string }
  | { kind: 'patch' };

/** Lowercase, flatten punctuation, collapse spaces, drop an optional wake lead. */
export function normalizeUtterance(text: string, wakePattern?: string): string {
  let body = text
    .toLowerCase()
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (wakePattern) {
    body = body.replace(new RegExp(`^(?:hey |okay |ok |please )?${wakePattern}\\s+`, 'i'), '').trim();
  }
  return body;
}

const UNDO_RE = /^(?:please )?(?:undo|revert)(?: (?:that|it|this|the last (?:change|setting)|my last change))?(?: please)?$|^(?:please )?(?:go|put it) back$/;
const YES_RE = /^(?:yes|yeah|yep|yup|sure|ok|okay|do it|apply it|go ahead|please do|yes please|apply)$/;
const NO_RE = /^(?:no|nope|nah|no thanks|don't|dont|cancel|never mind|nevermind|leave it)$/;
const SUGGEST_RE = /\b(?:which|what) (?:accessibility )?profile (?:suits|fits|is (?:best|right)|would suit|should i)|\bprofile (?:suits|fits) me\b|\brecommend (?:me )?a profile\b/;
const EXPLAIN_RE = /^(?:explain|describe|what(?:'s| is| does)|tell me about)\b.*\btile\b|^explain (?:the )?(?:magnifier|captions?|screen reader|reading aids?|reading ruler|dictation|pointing|hands.?free)\b/;
const PROFILE_WORD_RE = /\bprofile\b/;
// Keyword gate, in two tiers. Nouns that only ever mean an accessibility
// feature hit on their own (a false hit costs one model call that answers
// NONE and falls through). Words that are common in ordinary speech —
// "zoom" (the meeting app, "zoom into the map"), "profile", "contrast",
// "accessibility" — also need a settings verb, so "send me the zoom link"
// never costs a model call or a delay.
const KEYWORD_RE = /\b(?:magnif\w*|caption\w*|subtitle\w*|screen reader|dyslex\w*|reading ruler|reading aids?|colou?r ?blind\w*|protanopia|deuteranopia|tritanopia|reduced motion|reduce motion|high contrast)\b/;
const WEAK_KEYWORD_RE = /\b(?:zoom\w*|contrast|accessibility|profile)\b/;
const SETTINGS_VERB_RE = /\b(?:turn (?:it |the \w+ )?(?:on|off|up|down)|switch (?:it )?(?:on|off|to)|set|make|increase|decrease|raise|lower|reduce|magnify|enable|disable|apply|activate|deactivate)\b|^(?:please )?zoom (?:way |all the way )?(?:in|out)\b/;
// An explicit agent trigger ("superjargon agent zoom into the map", "agent,
// open the map") is a task for the agent loop, never a settings command —
// checked after the wake lead is stripped, so a bare "superjargon, turn on
// captions" (which extractAgentTask also accepts) still reaches us.
const AGENT_LEAD_RE = /^agent\b/;

const TILE_KEYWORDS: Array<[RegExp, A11yTileId]> = [
  [/screen reader/, 'screenReader'],
  [/magnif|zoom/, 'magnifier'],
  [/caption|subtitle/, 'captions'],
  [/reading aid|reading ruler|ruler|dyslex|contrast|palette|motion/, 'readingAids'],
  [/dictat/, 'dictation'],
  [/pointing|pointer/, 'pointing'],
  [/hands.?free/, 'handsFree'],
  [/\bvoice\b/, 'voice'],
];

export function tileFromText(body: string): A11yTileId | null {
  for (const [re, id] of TILE_KEYWORDS) if (re.test(body)) return id;
  return null;
}

/** Find a profile the utterance names ("apply the low vision profile"). */
export function profileFromText(
  body: string,
  profiles: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  if (!PROFILE_WORD_RE.test(body)) return null;
  // Longest name first so "deaf / hard of hearing" can't lose to a shorter prefix.
  const sorted = [...profiles].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const names = [p.name.toLowerCase(), p.id.replace(/-/g, ' ')];
    if (p.id === 'deaf-hoh') names.push('deaf', 'hard of hearing');
    if (names.some((n) => body.includes(n))) return p.id;
  }
  return null;
}

/** True when the utterance is an explicit agent-mode trigger (see AGENT_LEAD_RE). */
export function isAgentTrigger(text: string, wakePattern?: string): boolean {
  const body = normalizeUtterance(text, wakePattern ?? WAKE_NAME);
  return AGENT_LEAD_RE.test(body) && extractAgentTask(text) !== null;
}

/**
 * The cheap local gate. Returns null for ordinary speech (no model call, the
 * turn continues down the normal pipeline). `hasPending` lets a bare "yes"
 * answer an outstanding profile suggestion; `canUndo` (default true) lets a
 * bare "undo" through only when there is something of ours to undo — with an
 * empty stack it is the user's word for their own app (dictation, an agent
 * task), not ours to swallow.
 */
export function decideIntent(
  text: string,
  opts?: {
    wakePattern?: string;
    hasPending?: boolean;
    canUndo?: boolean;
    profiles?: ReadonlyArray<{ id: string; name: string }>;
  },
): SettingsIntent | null {
  // Agent tasks route to the agent loop first, whatever words they contain.
  if (isAgentTrigger(text, opts?.wakePattern)) return null;
  const body = normalizeUtterance(text, opts?.wakePattern);
  if (!body) return null;
  if (opts?.hasPending) {
    if (YES_RE.test(body)) return { kind: 'yes' };
    if (NO_RE.test(body)) return { kind: 'no' };
  }
  if (UNDO_RE.test(body)) return opts?.canUndo === false ? null : { kind: 'undo' };
  if (body.split(' ').length > GATE_MAX_WORDS) return null;
  if (SUGGEST_RE.test(body)) return { kind: 'suggest-profile' };
  if (EXPLAIN_RE.test(body)) return { kind: 'explain', tile: tileFromText(body) };
  const profileId = profileFromText(body, opts?.profiles ?? BUILTIN_A11Y_PROFILES);
  if (profileId && /\b(?:apply|switch|use|load|set|activate|turn on|enable)\b/.test(body)) {
    return { kind: 'apply-profile', id: profileId };
  }
  if (KEYWORD_RE.test(body)) return { kind: 'patch' };
  if (WEAK_KEYWORD_RE.test(body) && SETTINGS_VERB_RE.test(body)) return { kind: 'patch' };
  return null;
}

/**
 * Pull the first JSON object out of a model reply: tolerates ```json fences,
 * prose around the object, and braces inside strings. Returns the parsed
 * value, or null when there is no parseable object — callers must then
 * change nothing.
 */
export function extractJsonObject(raw: string): unknown | null {
  const text = raw.replace(/```[a-zA-Z]*/g, ' ');
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const v: unknown = JSON.parse(text.slice(start, i + 1));
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v;
        } catch {
          // Not valid JSON from this brace; try the next one.
        }
        break;
      }
    }
  }
  return null;
}

/** Bounded in-memory undo stack of full accessibility snapshots. */
export class UndoStack {
  private items: AccessibilitySettings[] = [];
  constructor(private readonly limit = UNDO_LIMIT) {}
  push(s: AccessibilitySettings): void {
    this.items.push(structuredClone(s));
    if (this.items.length > this.limit) this.items.shift();
  }
  pop(): AccessibilitySettings | undefined {
    return this.items.pop();
  }
  get size(): number {
    return this.items.length;
  }
}

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Spoken summary of a validated patch, e.g. "Magnifier set to 2.5x". */
export function describePatch(patch: A11yPatch): string {
  const parts: string[] = [];
  if (patch.tile) {
    const label = A11Y_TILE_LABELS[patch.tile];
    const bits: string[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'tile' || k === 'voice_rate') continue;
      if (k === 'enabled') bits.push(v ? 'on' : 'off');
      else if (k === 'zoom') bits.push(`set to ${fmtNum(v as number)}x`);
      else if (typeof v === 'boolean') bits.push(`${k} ${v ? 'on' : 'off'}`);
      else bits.push(`${k} ${String(v)}`);
    }
    parts.push(`${label} ${bits.join(', ')}`.trim());
  }
  if (patch.voice_rate !== undefined) parts.push(`Voice speed ${fmtNum(patch.voice_rate)}x`);
  return parts.join('. ');
}

export interface SettingsAssistantDeps {
  getState: () => A11yState;
  updateA11y: (update: unknown) => A11yResult;
  applyProfile: (id: string) => A11yResult;
  /** One Mind completion. Must reject on provider failure. */
  complete: (prompt: string, signal: AbortSignal) => Promise<string>;
  /** Regex source for the wake name, stripped from the utterance lead. */
  wakePattern?: string;
  now?: () => number;
}

export interface HandleContext {
  signal: AbortSignal;
  /** Turn gate: false once a newer turn started — then nothing may be applied. */
  isCurrent: () => boolean;
  /** Spoken (and shown) line; the caller binds its isCurrent gate. */
  speak: (line: string) => Promise<void>;
}

export class SettingsAssistant {
  readonly undo = new UndoStack();
  private pending: { profileId: string; expires: number } | null = null;

  constructor(private readonly deps: SettingsAssistantDeps) {}

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  private pendingLive(): boolean {
    return this.pending !== null && this.pending.expires > this.now();
  }

  /**
   * Handle one utterance. Resolves true when the assistant consumed the turn
   * (it spoke), false when the caller should continue down the pipeline.
   */
  async handle(text: string, ctx: HandleContext): Promise<boolean> {
    const hasPending = this.pendingLive();
    const state = this.deps.getState();
    const intent = decideIntent(text, {
      wakePattern: this.deps.wakePattern,
      hasPending,
      canUndo: this.undo.size > 0,
      profiles: state.profiles,
    });
    const pending = hasPending ? this.pending : null;
    // Any utterance other than a yes answers (or abandons) the suggestion.
    if (intent?.kind !== 'yes') this.pending = null;
    if (!intent) return false;

    switch (intent.kind) {
      case 'undo':
        return this.doUndo(ctx);
      case 'yes':
        if (!pending) return false;
        // Answered: without this clear, any yes/ok/sure in the next 60 s
        // (to anything at all) re-applied the profile.
        this.pending = null;
        return this.doApplyProfile(pending.profileId, ctx);
      case 'no':
        await ctx.speak('Okay, leaving it as is.');
        return true;
      case 'apply-profile':
        return this.doApplyProfile(intent.id, ctx);
      case 'suggest-profile':
        return this.doSuggestProfile(text, state, ctx);
      case 'explain':
        return this.doExplain(text, intent.tile, state, ctx);
      case 'patch':
        return this.doPatch(text, state, ctx);
    }
  }

  private async doPatch(text: string, state: A11yState, ctx: HandleContext): Promise<boolean> {
    const raw = await this.ask('patch', text, state, ctx);
    if (raw === null) return true;
    if (/^\s*NONE\s*$/i.test(raw)) return false; // not a settings request after all
    const parsed = extractJsonObject(raw);
    if (parsed === null) {
      await ctx.speak("I couldn't turn that into a setting, so nothing changed.");
      return true;
    }
    const v = validateA11yPatch(parsed);
    if (!v.ok) {
      await ctx.speak(`I can't do that, nothing changed. ${v.error.slice(0, 100)}.`);
      return true;
    }
    // A newer turn may have started while the model thought.
    if (!ctx.isCurrent()) return true;
    const before = this.deps.getState().settings;
    const res = this.deps.updateA11y(a11yPatchToUpdate(v.value));
    if (!res.ok) {
      await ctx.speak(`I couldn't apply that. ${res.error.slice(0, 100)}.`);
      return true;
    }
    this.undo.push(before);
    await ctx.speak(`${describePatch(v.value)}.`);
    return true;
  }

  private async doApplyProfile(id: string, ctx: HandleContext): Promise<boolean> {
    const before = this.deps.getState();
    const res = this.deps.applyProfile(id);
    if (!res.ok) {
      await ctx.speak(`I couldn't apply that profile. ${res.error.slice(0, 100)}.`);
      return true;
    }
    this.undo.push(before.settings);
    const name = before.profiles.find((p) => p.id === id)?.name ?? id;
    await ctx.speak(`${name} profile applied.`);
    return true;
  }

  private async doUndo(ctx: HandleContext): Promise<boolean> {
    const snap = this.undo.pop();
    if (!snap) {
      await ctx.speak('There is nothing to undo.');
      return true;
    }
    const restored = this.restore(snap);
    await ctx.speak(restored ? 'Undone.' : "I couldn't undo that.");
    return true;
  }

  /** Put a snapshot back through the store (tile order is layout, left alone). */
  private restore(snap: AccessibilitySettings): boolean {
    const full = { tiles: snap.tiles, voiceRate: snap.voiceRate };
    if (snap.profile) {
      // Re-applying the profile restores the "active profile" label too, but
      // only if the profile still means what the snapshot held.
      const res = this.deps.applyProfile(snap.profile);
      if (res.ok) {
        const same =
          JSON.stringify(res.state.settings.tiles) === JSON.stringify(snap.tiles) &&
          res.state.settings.voiceRate === snap.voiceRate;
        if (same) return true;
      }
    }
    return this.deps.updateA11y(full).ok;
  }

  private async doSuggestProfile(text: string, state: A11yState, ctx: HandleContext): Promise<boolean> {
    const raw = await this.ask('profile', text, state, ctx);
    if (raw === null) return true;
    const m = /PROFILE:\s*([a-z0-9-]+)/i.exec(raw);
    const profile = m ? state.profiles.find((p) => p.id === m[1].toLowerCase()) : undefined;
    if (!profile) {
      await ctx.speak("I couldn't pick a profile for that, nothing changed.");
      return true;
    }
    const why = raw
      .replace(/PROFILE:[^\n]*/i, '')
      .replace(/[`*#{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
    if (!ctx.isCurrent()) return true;
    this.pending = { profileId: profile.id, expires: this.now() + PENDING_TTL_MS };
    await ctx.speak(`${why ? `${why} ` : ''}I'd suggest the ${profile.name} profile. Want me to apply it?`);
    return true;
  }

  private async doExplain(
    text: string,
    tile: A11yTileId | null,
    state: A11yState,
    ctx: HandleContext,
  ): Promise<boolean> {
    if (!tile) {
      await ctx.speak('Which tile? For example, the magnifier or captions.');
      return true;
    }
    const raw = await this.ask('explain', text, state, ctx, { tileLabel: A11Y_TILE_LABELS[tile] });
    if (raw === null) return true;
    const spoken = raw.replace(/[`*#{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!spoken) {
      await ctx.speak("I don't have an explanation for that right now.");
      return true;
    }
    if (!ctx.isCurrent()) return true;
    await ctx.speak(spoken);
    return true;
  }

  /**
   * One Mind call. Returns the reply, or null when the turn was superseded or
   * the provider failed (a failure is spoken here, nothing is applied), so
   * callers just `return true` on null.
   */
  private async ask(
    task: 'patch' | 'profile' | 'explain',
    text: string,
    state: A11yState,
    ctx: HandleContext,
    extra?: { tileLabel?: string },
  ): Promise<string | null> {
    const stateJson = JSON.stringify({
      profile: state.settings.profile,
      tiles: state.settings.tiles,
      voice_rate: state.settings.voiceRate,
    });
    const prompt = buildSettingsAssistantPrompt(task, text, stateJson, {
      profiles: state.profiles.map((p) => ({ id: p.id, name: p.name })),
      tileLabel: extra?.tileLabel,
    });
    let raw: string;
    try {
      raw = await this.deps.complete(prompt, ctx.signal);
    } catch {
      if (!ctx.isCurrent() || ctx.signal.aborted) return null;
      await ctx.speak("I couldn't reach the settings assistant, so nothing changed.");
      return null;
    }
    if (!ctx.isCurrent() || ctx.signal.aborted) return null;
    return raw;
  }
}

