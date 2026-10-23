import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { writeFileAtomic } from './fs-util';
import {
  PANEL_OPACITY_MIN,
  PANEL_OPACITY_MAX,
  PANEL_OPACITY_DEFAULT,
  PANEL_COMPONENT_OPACITY_MIN,
  PANEL_COMPONENT_OPACITY_MAX,
  PANEL_COMPONENT_OPACITY_DEFAULT,
} from '../../shared/types';
import type {
  PanelComponentOpacity,
  ClaudeModel,
  OpenAIModel,
  MindProvider,
  GroqTranscriptionModel,
  TranscriptionLanguage,
  TranscriptionProviderType,
  ReasoningDepth,
  ReplyTone,
  StreamVisibility,
  StreamWindowBounds,
  LocalConnection,
  PttMode,
  TtsProvider,
  FishTtsModel,
  AgentProfile,
  Routine,
  AccessibilitySettings,
  A11yProfile,
} from '../../shared/types';
import {
  BUILTIN_A11Y_PROFILES,
  createDefaultAccessibility,
  normalizeA11yProfiles,
  normalizeAccessibility,
  profileFromSettings,
  resetAccessibilityFrom,
  settingsFromProfile,
  applyA11yUpdate,
  validateA11yUpdate,
} from '../../shared/a11y-profiles';
import type { A11yResult, A11yState } from '../../shared/a11y-profiles';
import { DEFAULT_A11Y_SHORTCUTS, normalizeA11yShortcuts, type A11yShortcuts } from '../../shared/a11y-shortcuts';

/**
 * Fish Audio model header values, in picker order: the free tier first,
 * because it is the one every BYOK install can actually afford.
 */
export const FISH_TTS_MODELS: readonly FishTtsModel[] = [
  's2.1-pro-free',
  's2.1-pro',
  's2-pro',
  's1',
] as const;

/**
 * The model we ask for unless the user picks otherwise. Fish Audio gates
 * `s2.1-pro` behind credit, and a $0 dev account gets 402 "insufficient
 * API credit" — which read as a broken key rather than a billing tier.
 * The free model is the same model on the free tier, so this is a
 * capability choice, not a downgrade.
 */
export const DEFAULT_FISH_TTS_MODEL: FishTtsModel = 's2.1-pro-free';

/**
 * Any value that isn't one of the four known models coerces to the free
 * default. This is the only coercion that matters for a header: a stale
 * or hand-edited string would otherwise be sent verbatim and come back
 * as an opaque 4xx from the provider.
 */
export function coerceFishTtsModel(value: unknown): FishTtsModel {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (FISH_TTS_MODELS as readonly string[]).includes(candidate)
    ? (candidate as FishTtsModel)
    : DEFAULT_FISH_TTS_MODEL;
}

/** Id of the always-present default agent. Never archivable. */
export const MAIN_AGENT_ID = 'main';

/**
 * The default profile, mirrored from `DEFAULT_SETTINGS.agents[0]` in the
 * contract. Duplicated rather than imported because the DEFAULTS literal
 * below needs a fresh object per load (mutation of one profile must not
 * leak into the next process start).
 */
const DEFAULT_AGENT_PROFILE: AgentProfile = {
  id: MAIN_AGENT_ID,
  name: 'SuperJargon',
  kaomoji: '(•‿•)',
  color: '#7b4dff',
  createdAt: 0,
  archived: false,
};

/**
 * Ensure the agent list is usable: an array, with 'main' present and
 * unarchived. Pre-multi-agent settings files have no `agents` key at all,
 * and a half-written one may be missing 'main' entirely — both cases
 * would otherwise leave voice turns pointing at a profile that doesn't
 * exist. Repairs in place and reports whether anything changed so the
 * caller can persist the migration.
 */
function normalizeAgents(input: unknown): { agents: AgentProfile[]; changed: boolean } {
  const raw = Array.isArray(input) ? (input as AgentProfile[]) : null;
  const changed = !raw;
  const agents: AgentProfile[] = raw
    ? raw
        .filter((a): a is AgentProfile => !!a && typeof a === 'object' && typeof a.id === 'string')
        .map((a) => ({
          ...a,
          name: typeof a.name === 'string' && a.name ? a.name : 'Agent',
          kaomoji: typeof a.kaomoji === 'string' ? a.kaomoji : '(•‿•)',
          color: typeof a.color === 'string' && a.color ? a.color : '#7b4dff',
          createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
          archived: a.archived === true,
        }))
    : [];

  const main = agents.find((a) => a.id === MAIN_AGENT_ID);
  if (!main) {
    // Pre-multi-agent install (or 'main' was archived by a bad write):
    // re-seed the default profile so voice turns always have a target.
    agents.unshift({ ...DEFAULT_AGENT_PROFILE });
    return { agents, changed: true };
  }
  // 'main' is load-bearing — un-archive it even if a file says otherwise.
  if (main.archived) {
    main.archived = false;
    return { agents, changed: true };
  }
  return { agents, changed };
}

/**
 * Coerce the persisted routines list into well-formed Routine objects.
 * Malformed entries (missing id/task, unknown kind) are dropped rather
 * than carried — a half-written file must not wedge the scheduler on a
 * NaN interval or empty task. Returns `changed` so the caller can
 * persist the repair, matching normalizeAgents' contract.
 */
function normalizeRoutines(input: unknown): { routines: Routine[]; changed: boolean } {
  const raw = Array.isArray(input) ? (input as Routine[]) : null;
  let changed = !raw;
  const routines: Routine[] = (raw ?? [])
    .filter((r): r is Routine => {
      const ok =
        !!r &&
        typeof r === 'object' &&
        typeof r.id === 'string' &&
        typeof r.task === 'string' &&
        (r.kind === 'interval' || r.kind === 'daily');
      if (!ok) changed = true;
      return ok;
    })
    .map((r) => {
      const next = {
        ...r,
        agentId: typeof r.agentId === 'string' && r.agentId ? r.agentId : MAIN_AGENT_ID,
        name: typeof r.name === 'string' ? r.name : '',
        // An interval routine without a positive interval can never be
        // due — store it disabled rather than dropping the user's entry.
        enabled:
          r.enabled === true &&
          (r.kind === 'daily' ||
            (typeof r.intervalMinutes === 'number' && r.intervalMinutes > 0)),
      } as Routine;
      if (next.enabled !== r.enabled) changed = true;
      return next;
    });
  return { routines, changed };
}

/**
 * Simple JSON-file settings store.
 * Avoids the ESM-only `electron-store` v10 compatibility issues.
 */

export interface StoredSettings {
  mindProvider: MindProvider;
  selectedModel: ClaudeModel;
  selectedOpenAIModel: OpenAIModel;
  reasoningDepth: ReasoningDepth;
  replyTone: ReplyTone;

  ttsProvider: TtsProvider;
  voiceId: string;
  fishVoiceId: string;
  /**
   * Which Fish Audio model the TTS request asks for, sent as the `model`
   * header. Free tier by default: the paid model answers 402
   * "insufficient API credit" on a $0 dev account, and every user with
   * only a free key was hitting that on their first spoken reply.
   */
  fishTtsModel: FishTtsModel;
  voiceSpeed: number;
  voiceStability: number;
  speakReplies: boolean;

  groqTranscriptionModel: GroqTranscriptionModel;
  transcriptionProvider: TranscriptionProviderType;
  transcriptionLanguage: TranscriptionLanguage;

  isClickyCursorEnabled: boolean;
  launchAtLogin: boolean;
  pushToTalkShortcut: string;
  pttMode: PttMode;
  autoTypeEnabled: boolean;
  streamVisibility: StreamVisibility;
  streamWindowBounds: StreamWindowBounds | null;
  panelOpacity: number;
  panelComponentOpacity: PanelComponentOpacity;

  alwaysOnEnabled: boolean;
  dictationEnabled: boolean;
  dictationShortcut: string;
  agentEnabled: boolean;
  /**
   * Dedicated agent hotkey. Held for a turn, the transcript is routed
   * straight to the agent loop — no "superjargon agent" prefix and no
   * looksLikeCommand guess, because the keypress IS the opt-in. Shares
   * `pttMode` hold/toggle semantics with the other two hotkeys.
   */
  agentPttShortcut: string;
  agentMaxSteps: number;
  customOpenAIModel: string;
  /** '' = api.openai.com; set to any OpenAI-compatible endpoint (clinepass, proxy). */
  openAIBaseUrl: string;
  /** '' = resolve `devin` from PATH; set only when the binary isn't on PATH. */
  devinCliPath: string;
  /** '' = omit --model so the devin CLI's own default model applies. */
  devinCliModel: string;
  /** '' = resolve `claude` from PATH; set only when the binary isn't on PATH. */
  claudeCliPath: string;
  /** '' = omit --model so the claude CLI's own default model applies. */
  claudeCliModel: string;
  /** '' = resolve `opencode` from PATH; set only when the binary isn't on PATH. */
  opencodeCliPath: string;
  copilotCliPath: string;
  /**
   * Named companion agents ("Clickys" model). 'main' is always present
   * and can never be archived — voice turns route there until Phase B's
   * orchestrator introduces per-agent runtimes.
   */
  agents: AgentProfile[];
  /** Scheduled routines owned by agents (interval/daily) — Phase D. */
  routines: Routine[];
  /** When true, routine completions stay silent (no TTS/overlay announce). */
  routinesMuted: boolean;

  /** Accessibility dashboard state; repaired field-by-field at load. */
  accessibility: AccessibilitySettings;
  /** User-saved accessibility profiles (built-ins live in code). */
  a11yProfiles: A11yProfile[];
  /** Global shortcut per accessibility action; '' = unbound. */
  a11yShortcuts: A11yShortcuts;

  localConnections: LocalConnection[];

  onboardingComplete: boolean;
}

const DEFAULTS: StoredSettings = {
  // ClinePass-first per the api-ui plan: new installs land on the
  // OpenAI-compatible provider so the shipped experience works with a
  // single key + endpoint.
  mindProvider: 'openai',
  selectedModel: 'claude-sonnet-4-6',
  selectedOpenAIModel: 'gpt-5',
  reasoningDepth: 'off',
  replyTone: 'friendly',

  voiceId: 'pMsXgVXv3BLzUgSXRplE',
  ttsProvider: 'fishaudio',
  fishVoiceId: '',
  fishTtsModel: DEFAULT_FISH_TTS_MODEL,
  voiceSpeed: 1.0,
  voiceStability: 0.5,
  speakReplies: true,

  groqTranscriptionModel: 'whisper-large-v3-turbo',
  transcriptionProvider: 'groq',
  transcriptionLanguage: 'en',

  isClickyCursorEnabled: true,
  launchAtLogin: false,
  pushToTalkShortcut: 'Ctrl+Alt+X',
  // Default to 'toggle' on macOS because Electron's globalShortcut on
  // darwin can't detect key-up; 'hold' would record forever there.
  pttMode: process.platform === 'darwin' ? 'toggle' : 'hold',
  autoTypeEnabled: false,
  streamVisibility: 'off',
  streamWindowBounds: null,
  panelOpacity: PANEL_OPACITY_DEFAULT,
  panelComponentOpacity: { ...PANEL_COMPONENT_OPACITY_DEFAULT },

  alwaysOnEnabled: false,
  dictationEnabled: false,
  dictationShortcut: 'Ctrl+Alt+D',
  // Distinct from Ctrl+Alt+X / Ctrl+Alt+D by the Shift: two bare Ctrl+Alt
  // chords in the same corner of the keyboard is a recipe for a misfire
  // that hands the mouse to the agent.
  agentPttShortcut: 'Ctrl+Shift+A',
  agentEnabled: true,
  agentMaxSteps: 15,
  customOpenAIModel: '',
  openAIBaseUrl: '',
  devinCliPath: '',
  devinCliModel: '',
  claudeCliPath: '',
  claudeCliModel: '',
  opencodeCliPath: '',
  copilotCliPath: '',
  agents: [{ ...DEFAULT_AGENT_PROFILE }],
  routines: [],
  routinesMuted: false,

  accessibility: createDefaultAccessibility(),
  a11yProfiles: [],
  a11yShortcuts: { ...DEFAULT_A11Y_SHORTCUTS },

  localConnections: [],

  onboardingComplete: false,
};

function getFilePath(): string {
  return path.join(app.getPath('userData'), 'superjargon-settings.json');
}

/**
 * In-memory cache. The settings file is the single source of truth across
 * runs, but within a run we own it — no external writers — so re-reading
 * disk on every `get`/`set` is wasted I/O. We hydrate once on first access
 * and keep the cache in sync with every `set`.
 */
let cache: StoredSettings | null = null;

function readDisk(): StoredSettings {
  try {
    const raw = fs.readFileSync(getFilePath(), 'utf-8');
    const merged = { ...DEFAULTS, ...JSON.parse(raw) } as StoredSettings;
    // Run the agent migration over whatever landed (including DEFAULTS,
    // whose agents array we must not alias into the cache).
    const { agents, changed } = normalizeAgents(merged.agents);
    merged.agents = agents;
    const routines = normalizeRoutines(merged.routines);
    merged.routines = routines.routines;
    merged.routinesMuted = merged.routinesMuted === true;
    // Pre-dashboard files have no accessibility key, and a hand edit can
    // leave one field out of range — normalize rebuilds a valid object
    // from defaults (which also keeps DEFAULTS' nested object un-aliased).
    const a11yNormalized = normalizeAccessibility(merged.accessibility);
    const a11yChanged = JSON.stringify(a11yNormalized) !== JSON.stringify(merged.accessibility);
    merged.accessibility = a11yNormalized;
    const a11yProfiles = normalizeA11yProfiles(merged.a11yProfiles);
    const a11yProfilesChanged = JSON.stringify(a11yProfiles) !== JSON.stringify(merged.a11yProfiles);
    merged.a11yProfiles = a11yProfiles;
    // Bad, missing or colliding accelerators are repaired against the three
    // talk shortcuts so a hand edit can't shadow them.
    const shortcuts = normalizeA11yShortcuts(merged.a11yShortcuts, [
      merged.pushToTalkShortcut, merged.dictationShortcut, merged.agentPttShortcut,
    ]);
    merged.a11yShortcuts = shortcuts.shortcuts;
    // Hand-edited or older settings files can carry out-of-range or
    // partial opacity values — coerce at load so the renderer never
    // receives an alpha outside what the CSS multipliers expect.
    merged.panelOpacity = clampUnit(merged.panelOpacity, PANEL_OPACITY_MIN, PANEL_OPACITY_MAX, PANEL_OPACITY_DEFAULT);
    merged.panelComponentOpacity = coerceComponentOpacity(merged.panelComponentOpacity);
    // The 'ollama'/local provider was removed from the picker, which now
    // offers anthropic / openai / devin-cli / claude-cli / opencode-cli: a value
    // persisted by an older build — or anything else outside the live
    // set — would strand turns on a provider with no UI. Coerce to
    // 'openai' at load so old installs can't strand.
    const providerStale =
      merged.mindProvider !== 'anthropic' &&
      merged.mindProvider !== 'openai' &&
      merged.mindProvider !== 'devin-cli' &&
      merged.mindProvider !== 'claude-cli' &&
      merged.mindProvider !== 'opencode-cli' &&
      merged.mindProvider !== 'copilot-cli';
    if (providerStale) merged.mindProvider = 'openai';
    // Same reasoning for the Fish model header: an unknown value is not
    // an error state, it is a 402 waiting to happen, so repair it to the
    // free tier at load.
    const fishModelStale = merged.fishTtsModel !== coerceFishTtsModel(merged.fishTtsModel);
    merged.fishTtsModel = coerceFishTtsModel(merged.fishTtsModel);
    if (changed || routines.changed || providerStale || fishModelStale || a11yChanged || a11yProfilesChanged || shortcuts.changed) {
      // Persist the seed immediately: otherwise the repair only lives in
      // memory and the next launch re-derives it (harmless, but the file
      // would keep claiming a pre-multi-agent shape).
      try {
        writeFileAtomic(getFilePath(), JSON.stringify(merged, null, 2));
      } catch (err) {
        console.warn('[SuperJargon] settings agent migration write failed:', err);
      }
    }
    return merged;
  } catch {
    return {
      ...DEFAULTS,
      agents: [{ ...DEFAULT_AGENT_PROFILE }],
      accessibility: createDefaultAccessibility(),
      a11yProfiles: [],
      a11yShortcuts: { ...DEFAULT_A11Y_SHORTCUTS },
    };
  }
}

function ensureLoaded(): StoredSettings {
  if (cache === null) cache = readDisk();
  return cache;
}

function write(data: StoredSettings): void {
  // A sync write supersedes any pending deferred one (same cache object).
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writeFileAtomic(getFilePath(), JSON.stringify(data, null, 2));
}

/** Coalescing window for the hot a11y path only. Slider drags and shortcut
 *  bursts used to pay a sync stringify + fsync + rename on the main thread
 *  per tick (visible lag); every reader goes through the in-memory cache, so
 *  only crash-durability waits on the file. Everything else stays sync. */
const WRITE_DEBOUNCE_MS = 250;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function writeSoon(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flushSettings, WRITE_DEBOUNCE_MS);
}

/** Write a pending deferred save now — will-quit calls this so the last
 *  change before quitting is never lost. */
export function flushSettings(): void {
  if (!writeTimer) return;
  clearTimeout(writeTimer);
  writeTimer = null;
  if (!cache) return;
  try {
    writeFileAtomic(getFilePath(), JSON.stringify(cache, null, 2));
  } catch (err) {
    // The cache keeps the new value for this session; next launch reverts.
    console.error('[SuperJargon] settings write failed:', err);
  }
}

export function get<K extends keyof StoredSettings>(key: K): StoredSettings[K] {
  return ensureLoaded()[key];
}

export function set<K extends keyof StoredSettings>(key: K, value: StoredSettings[K]): void {
  const data = ensureLoaded();
  data[key] = value;
  // Persist after mutating the cache. If the disk write fails we still
  // have the new value in memory for the rest of the session — the next
  // launch will revert, which matches the previous behavior.
  write(data);
}

/**
 * `set` for a value driven by a slider drag (voice speed, via the panel or
 * the a11y bridge): the cache updates now and the disk write rides the same
 * 250 ms writeSoon debounce as the a11y hot path, instead of a sync
 * stringify + fsync per tick.
 */
export function setDeferred<K extends keyof StoredSettings>(key: K, value: StoredSettings[K]): void {
  ensureLoaded()[key] = value;
  writeSoon();
}

export function getAll(): StoredSettings {
  // Shallow copy so callers can't mutate the cache through the returned ref.
  return { ...ensureLoaded() };
}

// ── Fish Audio TTS model ───────────────────────────────────────────────

/**
 * The model header to send right now. Coerces on read as well as on
 * write: `get('fishTtsModel')` is typed, but a settings file edited by
 * hand (or written by an older build) can hold anything, and the TTS
 * client must never put an unvalidated value on the wire.
 */
export function getFishTtsModel(): FishTtsModel {
  return coerceFishTtsModel(ensureLoaded().fishTtsModel);
}

/**
 * Persist the chosen Fish model and return the value that actually
 * landed, so the caller can push the corrected setting to the panel
 * rather than echoing back what was asked for.
 */
export function setFishTtsModel(value: unknown): FishTtsModel {
  const model = coerceFishTtsModel(value);
  set('fishTtsModel', model);
  return model;
}

// ── Agent profiles ──────────────────────────────────────────────────────

/** Every profile, archived included — the panel renders both sections. */
export function listAgents(): AgentProfile[] {
  // Copy the array (not the profiles) so callers can sort/filter freely.
  return [...ensureLoaded().agents];
}

function writeAgents(agents: AgentProfile[]): AgentProfile[] {
  const data = ensureLoaded();
  data.agents = agents;
  write(data);
  return agents;
}

/** Accent colours handed out round-robin so new agents stay distinct. */
const AGENT_COLORS = ['#7b4dff', '#00b8d9', '#ff6b6b', '#f5a623', '#2ecc71', '#e84393'];

export function createAgent(
  name: string,
  kaomoji?: string,
  color?: string,
): AgentProfile {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('agent name is required');
  const data = ensureLoaded();
  const profile: AgentProfile = {
    // Time+random rather than randomUUID: this store is dependency-free
    // by design, and the id only needs to be unique within this list.
    id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    kaomoji: kaomoji?.trim() || '(•‿•)',
    color: color?.trim() || AGENT_COLORS[data.agents.length % AGENT_COLORS.length],
    createdAt: Date.now(),
    archived: false,
  };
  writeAgents([...data.agents, profile]);
  return profile;
}

export function renameAgent(id: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const agents = ensureLoaded().agents;
  const target = agents.find((a) => a.id === id);
  if (!target) return false;
  target.name = trimmed;
  writeAgents([...agents]);
  return true;
}

/**
 * Archive (never delete) so a task's history and counters stay attached to
 * the profile. Refuses 'main' — the default agent is load-bearing for
 * voice turns and the overlay, and archiving it would strand the app with
 * no agent to route to.
 */
export function archiveAgent(id: string): boolean {
  if (id === MAIN_AGENT_ID) {
    console.warn('[SuperJargon] refusing to archive the main agent');
    return false;
  }
  const agents = ensureLoaded().agents;
  const target = agents.find((a) => a.id === id);
  if (!target) return false;
  target.archived = true;
  writeAgents([...agents]);
  return true;
}

// ── Routines ────────────────────────────────────────────────────────────

export function listRoutines(): Routine[] {
  return [...ensureLoaded().routines];
}

function writeRoutines(routines: Routine[]): void {
  const data = ensureLoaded();
  data.routines = routines;
  write(data);
}

/**
 * Create (id absent → generated) or update (id present → replace in
 * place) a routine. Unknown ids are treated as creates so the IPC layer
 * never has to branch.
 */
export function upsertRoutine(
  routine: Omit<Routine, 'id'> | Routine,
): Routine {
  const routines = ensureLoaded().routines;
  if ('id' in routine && routine.id) {
    const idx = routines.findIndex((r) => r.id === routine.id);
    const next: Routine = { ...(routine as Routine) };
    if (idx >= 0) {
      // lastRunAt is scheduler-owned state — a panel edit must not wipe
      // the schedule bookkeeping or the routine would fire immediately.
      next.lastRunAt = routines[idx].lastRunAt;
      const out = [...routines];
      out[idx] = next;
      writeRoutines(out);
      return next;
    }
    writeRoutines([...routines, next]);
    return next;
  }
  const created: Routine = {
    ...(routine as Omit<Routine, 'id'>),
    id: `routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  };
  writeRoutines([...routines, created]);
  return created;
}

export function deleteRoutine(id: string): boolean {
  const routines = ensureLoaded().routines;
  if (!routines.some((r) => r.id === id)) return false;
  writeRoutines(routines.filter((r) => r.id !== id));
  return true;
}

/** Scheduler-owned bookkeeping: stamp the run so the next due-time computes from it. */
export function markRoutineRun(id: string, ts: number): void {
  const routines = ensureLoaded().routines;
  const idx = routines.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const next = [...routines];
  next[idx] = { ...routines[idx], lastRunAt: ts };
  writeRoutines(next);
}

export function setRoutinesMuted(muted: boolean): void {
  set('routinesMuted', muted);
}

// ── Panel appearance ───────────────────────────────────────────────────

/** Numbers only, clamped — anything else falls back to the default. */
function clampUnit(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(hi, Math.max(lo, v))
    : fallback;
}

function coerceComponentOpacity(v: unknown): PanelComponentOpacity {
  const src = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const d = PANEL_COMPONENT_OPACITY_DEFAULT;
  return {
    sidebar: clampUnit(src.sidebar, PANEL_COMPONENT_OPACITY_MIN, PANEL_COMPONENT_OPACITY_MAX, d.sidebar),
    content: clampUnit(src.content, PANEL_COMPONENT_OPACITY_MIN, PANEL_COMPONENT_OPACITY_MAX, d.content),
    cards: clampUnit(src.cards, PANEL_COMPONENT_OPACITY_MIN, PANEL_COMPONENT_OPACITY_MAX, d.cards),
    borders: clampUnit(src.borders, PANEL_COMPONENT_OPACITY_MIN, PANEL_COMPONENT_OPACITY_MAX, d.borders),
  };
}

export function setPanelOpacity(v: number): void {
  set('panelOpacity', clampUnit(v, PANEL_OPACITY_MIN, PANEL_OPACITY_MAX, PANEL_OPACITY_DEFAULT));
}

/** Patch semantics: sliders send one key at a time, never the whole map. */
export function setPanelComponentOpacity(patch: Partial<PanelComponentOpacity>): void {
  set(
    'panelComponentOpacity',
    coerceComponentOpacity({ ...get('panelComponentOpacity'), ...patch }),
  );
}

// ── Accessibility dashboard ────────────────────────────────────────────

export function getA11yState(): A11yState {
  const data = ensureLoaded();
  return {
    settings: normalizeAccessibility(data.accessibility),
    profiles: [...BUILTIN_A11Y_PROFILES, ...data.a11yProfiles],
  };
}

function commitA11y(settings: AccessibilitySettings): A11yResult {
  set('accessibility', settings);
  return { ok: true, state: getA11yState() };
}

export function updateA11y(update: unknown): A11yResult {
  const v = validateA11yUpdate(update);
  if (!v.ok) return v;
  const current = getA11yState().settings;
  const next = applyA11yUpdate(current, v.value);
  // A manual edit leaves the active profile so the bar reads "Custom";
  // reordering alone is layout, not a different configuration.
  const reorderOnly = Object.keys(v.value).every((k) => k === 'tileOrder');
  if (!reorderOnly) next.profile = '';
  // The hot path (slider drags, shortcut bursts): cache now, disk shortly.
  ensureLoaded().accessibility = next;
  writeSoon();
  return { ok: true, state: getA11yState() };
}

export function applyA11yProfile(id: unknown): A11yResult {
  const state = getA11yState();
  const profile = state.profiles.find((p) => p.id === id);
  if (!profile) return { ok: false, error: 'unknown profile' };
  // A profile changes values, not arrangement — keep the user's tile order.
  // Bridged tiles (voice/dictation/pointing/hands-free) and voiceRate keep
  // their live values unless the profile names them.
  const next = settingsFromProfile(profile, state.settings);
  next.tileOrder = state.settings.tileOrder;
  return commitA11y(next);
}

export function saveA11yProfile(name: unknown): A11yResult {
  const label = typeof name === 'string' ? name.trim().slice(0, 40) : '';
  if (!label) return { ok: false, error: 'profile name is required' };
  if (BUILTIN_A11Y_PROFILES.some((p) => p.name.toLowerCase() === label.toLowerCase())) {
    return { ok: false, error: 'that name is used by a built-in profile' };
  }
  const data = ensureLoaded();
  // Same name overwrites rather than piling up duplicates.
  const existing = data.a11yProfiles.find((p) => p.name.toLowerCase() === label.toLowerCase());
  const id = existing?.id ?? `custom-${Date.now().toString(36)}`;
  const current = getA11yState().settings;
  const saved = profileFromSettings(id, label, current);
  set('a11yProfiles', [...data.a11yProfiles.filter((p) => p.id !== id), saved]);
  return commitA11y({ ...current, profile: id });
}

/** Current accessibility shortcut bindings (a copy). */
export function getA11yShortcuts(): A11yShortcuts {
  return { ...ensureLoaded().a11yShortcuts };
}

export function setA11yShortcuts(shortcuts: A11yShortcuts): void {
  set('a11yShortcuts', { ...shortcuts });
}

export function resetA11y(): A11yResult {
  // "Reset all" (button, shortcut, or voice) resets the dashboard's own
  // tools; the bridged tiles and reply speed stay as they are — resetting
  // hands-free by voice would cut off the voice that asked for it.
  return commitA11y(resetAccessibilityFrom(getA11yState().settings));
}
