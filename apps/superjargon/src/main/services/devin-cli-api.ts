import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  ConversationTurn,
  ReasoningDepth,
  ReplyTone,
  ScreenCapture,
} from '../../shared/types';
import { buildSystemPrompt } from './prompts';

/**
 * Mind provider backed by the local `devin` CLI instead of an HTTP API.
 *
 * Uses `devin acp` — a persistent Agent Client Protocol server on stdio —
 * rather than `devin -p` per turn. Measured on a real turn: a cold `-p`
 * call costs ~7 s of process/session boot every single time (and agent
 * mode multiplies that per step), while a warm ACP session answers in
 * ~3.6 s with the conversation context already token-cached. One child
 * serves every caller; sessions are keyed per logical conversation so a
 * background Clicky's agent loop can't bleed into the user's talk
 * history.
 *
 * Deliberately Electron-free (os/fs/path/child_process only) so the
 * plain-tsx smoke script can import this module.
 */

const CLI_TIMEOUT_MS = 240_000;
/** initialize + session/new get their own shorter budget — a hang there
 * means the CLI itself is wedged, not the model. */
const HANDSHAKE_TIMEOUT_MS = 30_000;
/** How many recent turns get replayed when a session is bootstrapped. */
const HISTORY_TURNS = 20;
/** stderr is buffered only as error context; keep just the tail. */
const STDERR_TAIL_CHARS = 4_000;

/**
 * Any CLI that serves ACP via `<bin> acp` can ride this class — devin and
 * opencode do. Only naming and the --model capability differ.
 */
export interface AcpCliSpec {
  /** Binary name resolved on PATH, also used in log/error text. */
  bin: string;
  /** Display name for user-facing errors. */
  label: string;
  /** false → `acp` rejects --model (opencode), so the model setting is ignored. */
  supportsModelFlag: boolean;
}

export const DEVIN_SPEC: AcpCliSpec = { bin: 'devin', label: 'Devin', supportsModelFlag: true };
export const OPENCODE_SPEC: AcpCliSpec = { bin: 'opencode', label: 'OpenCode', supportsModelFlag: false };

function notFoundMessage(spec: AcpCliSpec): string {
  return `${spec.label} CLI not found — install ${spec.bin} or set its path in the Mind tab`;
}

const PREAMBLE =
  'you are the reply engine of a desktop voice companion; respond ONLY with ' +
  'the reply text, no tool narration, no tool calls, no file edits, no code.';

interface PendingRpc {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

/** A session/prompt turn in flight on a session. */
interface PendingPrompt {
  sessionId: string;
  fullText: string;
  onChunk: (text: string) => void;
}

export interface DevinCliStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string, usage?: { inputTokens: number; outputTokens: number }) => void;
  onError: (error: Error) => void;
}

export interface DevinCliChatOptions {
  /** Accepted for call-shape parity — the CLI owns its own effort. */
  reasoningDepth: ReasoningDepth;
  replyTone: ReplyTone;
  /** 'agent' swaps the talk persona for the computer-control prompt. */
  mode?: 'talk' | 'agent';
  /** Aborting mid-run is treated as a graceful interrupt, not an error. */
  signal?: AbortSignal;
  /** Absolute devin binary path; missing/invalid falls back to PATH lookup. */
  binPath?: string;
  /**
   * Which conversation this turn belongs to ('main:talk', 'scout:agent',
   * 'suggestions', …). Each key maps to its own ACP session, so two
   * agents never share a history. Absent → 'main'.
   */
  sessionKey?: string;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// PATH hits are cached — `where`/`which` spawn a process per call and a
// resolved binary doesn't move mid-session. A miss is deliberately NOT
// cached so a devin installed while the app runs is picked up next turn.
const cachedBins = new Map<string, string>();

function resolveBin(spec: AcpCliSpec, binPath?: string): string | undefined {
  if (binPath && path.isAbsolute(binPath) && fileExists(binPath)) return binPath;
  const cachedBin = cachedBins.get(spec.bin);
  if (cachedBin) return cachedBin;
  try {
    const out = execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      [spec.bin],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    // `where` can list several hits; the first is what PATH would launch.
    const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first) cachedBins.set(spec.bin, first);
    return first;
  } catch {
    return undefined;
  }
}

/**
 * Node refuses to spawn a bare .cmd/.bat (EINVAL since the batch-file CVE
 * fix), so a script resolution detours through cmd.exe. Two traps are
 * baked in: cmd does NOT understand Node's \" escaping (it tried to run a
 * literal `\"C:\…\devin.cmd\"` — 'not recognized'), so argv goes verbatim
 * and we quote it ourselves; and cmd's /c + /s rule strips the first and
 * last quote of the remainder, which is why the payload is wrapped in one
 * extra outer pair — `cmd /s /c ""prog" "arg"…"` — the classic pattern
 * that survives paths containing spaces.
 */
function wrapForCmd(
  bin: string,
  args: string[],
): { cmd: string; argv: string[]; verbatim: boolean } {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(bin)) {
    return { cmd: bin, argv: args, verbatim: false };
  }
  // Our argv never contains '"' (paths and flags only — '"' is illegal in
  // a Windows filename), so a straight wrap is sufficient.
  const quote = (a: string) => `"${a}"`;
  const line = [bin, ...args].map(quote).join(' ');
  return { cmd: 'cmd.exe', argv: ['/d', '/s', '/c', `"${line}"`], verbatim: true };
}

function trySpawn(
  cmd: string,
  argv: string[],
  cwd: string,
  verbatim: boolean,
): { proc?: ChildProcess; err?: NodeJS.ErrnoException } {
  try {
    return {
      proc: spawn(cmd, argv, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        // Verbatim only for the cmd.exe wrap: Node's own quoting would
        // re-escape our pre-quoted payload with \" sequences cmd can't read.
        windowsVerbatimArguments: verbatim,
      }),
    };
  } catch (err) {
    return { err: err as NodeJS.ErrnoException };
  }
}

function spawnErrorMessage(spec: AcpCliSpec, e: NodeJS.ErrnoException): string {
  return e.code === 'ENOENT' ? notFoundMessage(spec) : `${spec.bin} CLI failed to start: ${e.message}`;
}

export class DevinCliAPI {
  constructor(private readonly spec: AcpCliSpec = DEVIN_SPEC) {}

  private child: ChildProcess | null = null;
  /** bin+model identity the running child was spawned with — a settings
   * change (different binary or --model) forces a respawn. */
  private childKey = '';
  /** The spawned process's cwd — also the session/new workspace. Temp
   * dir keeps the agent out of the user's repo; it lives as long as the
   * child does so anything the agent writes there stays valid. */
  private childCwd: string | null = null;
  private stderrTail = '';
  private recvBuf = '';
  private nextId = 0;
  private pending = new Map<number, PendingRpc>();
  /** The single init handshake in flight, if any. */
  private initPromise: Promise<void> | null = null;
  /** sessionKey → ACP sessionId on the live child. */
  private sessions = new Map<string, string>();
  /** sessionKeys that already received the full preamble+history
   * bootstrap — later turns send only the new request text. */
  private sessionBooted = new Set<string>();
  /** sessionKey → tail promise, serializing prompts per conversation. */
  private queues = new Map<string, Promise<unknown>>();
  /** ACP sessionId → the prompt turn currently streaming on it. */
  private prompts = new Map<string, PendingPrompt>();

  async streamChat(
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    model: string,
    options: DevinCliChatOptions,
    callbacks: DevinCliStreamCallbacks,
  ): Promise<void> {
    const bin = resolveBin(this.spec, options.binPath);
    if (!bin) {
      callbacks.onError(new Error(notFoundMessage(this.spec)));
      return;
    }
    if (options.signal?.aborted) return;

    const sessionKey = options.sessionKey ?? 'main';
    try {
      await this.ensureServer(bin, model);
      const sessionId = await this.ensureSession(sessionKey);
      // Two turns on one conversation must not interleave on the wire —
      // devin answers prompts serially per session but overlapping
      // session/prompt calls would race chunks, so queue locally.
      const prev = this.queues.get(sessionKey) ?? Promise.resolve();
      const run = prev.then(() =>
        this.promptTurn(sessionId, sessionKey, prompt, screenshots, history, options, callbacks),
      );
      this.queues.set(sessionKey, run.catch(() => {}));
      await run;
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Forget one conversation (one-shot callers such as the screen reader,
   * which uses a fresh key per read): the next streamChat on that key opens
   * a new ACP session instead of appending to the old one. ACP has no
   * session/close, so the server-side session is simply never prompted
   * again. No-op for an unknown key.
   */
  disposeSession(sessionKey: string): void {
    this.sessions.delete(sessionKey);
    this.sessionBooted.delete(sessionKey);
    this.queues.delete(sessionKey);
  }

  // ── process lifecycle ────────────────────────────────────────────────

  /**
   * Lazily spawn `devin acp` and complete the initialize handshake.
   * Concurrent first calls share one initPromise so only one child boots.
   */
  private ensureServer(bin: string, model: string): Promise<void> {
    const key = `${bin}${model}`;
    if (this.child && this.childKey === key && this.initPromise) {
      return this.initPromise;
    }
    this.killChild();
    this.childKey = key;
    this.childCwd = fs.mkdtempSync(path.join(os.tmpdir(), `superjargon-${this.spec.bin}-`));

    const args = ['acp'];
    // --model is omitted when unset so the CLI keeps its own configured
    // default instead of receiving an empty value.
    if (model && this.spec.supportsModelFlag) args.push('--model', model);
    const { cmd, argv, verbatim } = wrapForCmd(bin, args);
    const spawned = trySpawn(cmd, argv, this.childCwd, verbatim);
    if (!spawned.proc) {
      // childCwd is only useful to a live child — don't leak the dir on a
      // spawn miss, since ensureServer will retry with a fresh one.
      fs.rm(this.childCwd, { recursive: true, force: true }, () => {});
      this.childCwd = null;
      this.initPromise = Promise.reject(
        new Error(spawnErrorMessage(this.spec, spawned.err ?? ({ code: 'ENOENT' } as NodeJS.ErrnoException))),
      );
      this.initPromise.catch(() => {});
      return this.initPromise;
    }
    const proc = spawned.proc;
    this.child = proc;

    proc.stdout!.setEncoding('utf-8');
    proc.stdout!.on('data', (d: string) => this.onStdout(d));
    proc.stderr!.setEncoding('utf-8');
    proc.stderr!.on('data', (d: string) => {
      this.stderrTail = (this.stderrTail + d).slice(-STDERR_TAIL_CHARS);
    });
    proc.on('error', () => this.onChildDead());
    proc.on('exit', () => this.onChildDead());
    proc.on('close', () => this.onChildDead());

    const rpc = this.callAsync('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: 'superjargon', version: '1.0.0' },
    });
    // A failed handshake kills the child so the next call respawns clean
    // instead of re-returning the same rejected promise forever.
    this.initPromise = withTimeout(rpc, HANDSHAKE_TIMEOUT_MS, `${this.spec.bin} acp initialize timed out`).then(
      () => undefined,
    );
    this.initPromise.catch(() => { if (this.child === proc) this.killChild(); });
    return this.initPromise;
  }

  private async ensureSession(sessionKey: string): Promise<string> {
    const existing = this.sessions.get(sessionKey);
    if (existing) return existing;
    const res = (await withTimeout(
      this.callAsync('session/new', { cwd: this.childCwd, mcpServers: [] }),
      HANDSHAKE_TIMEOUT_MS,
      `${this.spec.bin} acp session/new timed out`,
    )) as { sessionId?: string };
    if (!res?.sessionId) throw new Error(`${this.spec.bin} acp session/new returned no sessionId`);
    this.sessions.set(sessionKey, res.sessionId);
    return res.sessionId;
  }

  // ── one turn on a session ────────────────────────────────────────────

  private promptTurn(
    sessionId: string,
    sessionKey: string,
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    options: DevinCliChatOptions,
    callbacks: DevinCliStreamCallbacks,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const signal = options.signal;
      if (signal?.aborted || !this.child) {
        resolve();
        return;
      }

      let settled = false;
      let rpcId = -1;
      const timer = setTimeout(() => {
        // A wedged model call gets cancelled on the wire AND reported —
        // unlike a user abort, which resolves quietly.
        this.cancelSession(sessionId);
        finish(() => callbacks.onError(new Error(`${this.spec.label} CLI timed out`)));
      }, CLI_TIMEOUT_MS);

      const finish = (emit: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(rpcId);
        this.prompts.delete(sessionId);
        emit();
        resolve();
      };

      const onAbort = () => {
        // Abort mirrors ollama-api's convention: a graceful interrupt —
        // cancel on the wire so the model stops burning tokens, resolve
        // quietly, no onError.
        this.cancelSession(sessionId);
        finish(() => {});
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      // The session carries its own context after bootstrap, so history
      // is replayed only on a session's first prompt — app restarts get
      // backfill, steady-state turns stay a small prompt (that's most of
      // why warm turns are fast: the prefix is token-cached).
      const bootstrapped = this.sessionBooted.has(sessionKey);
      const systemPrompt = buildSystemPrompt(options.replyTone, {
        hasWebSearch: false,
        mode: options.mode,
      });
      const text = bootstrapped
        ? `${PREAMBLE}\n\n${systemPrompt}\n\n## Request\n${prompt}`
        : this.bootstrapPrompt(prompt, systemPrompt, history);
      this.sessionBooted.add(sessionKey);

      const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
      // promptCapabilities.image is true on this CLI — screenshots ride
      // inline as image blocks, so no temp files and no Read-tool round
      // trip (which also means the permission answer below can always be
      // 'deny' — this pipeline never needs tools).
      for (let i = 0; i < screenshots.length; i++) {
        const sc = screenshots[i];
        content.push({
          type: 'text',
          text: `[screen${i}] ${sc.imageWidth}x${sc.imageHeight}px.${sc.isCursorScreen ? ' (active screen)' : ''}`,
        });
        content.push({ type: 'image', data: sc.dataBase64, mimeType: 'image/jpeg' });
      }

      const pending: PendingPrompt = {
        sessionId,
        fullText: '',
        onChunk: (t) => {
          if (!settled) callbacks.onChunk(t);
        },
      };
      this.prompts.set(sessionId, pending);

      rpcId = this.call(
        'session/prompt',
        { sessionId, prompt: content },
        {
          onResult: (result) => {
            const r = result as {
              stopReason?: string;
              usage?: { inputTokens?: number; outputTokens?: number };
            };
            if (r?.stopReason === 'cancelled' || signal?.aborted) {
              finish(() => {});
              return;
            }
            finish(() =>
              callbacks.onComplete(
                pending.fullText,
                r?.usage
                  ? {
                      inputTokens: r.usage.inputTokens ?? 0,
                      outputTokens: r.usage.outputTokens ?? 0,
                    }
                  : undefined,
              ),
            );
          },
          onError: (err) => finish(() => callbacks.onError(err)),
        },
      );
    });
  }

  private bootstrapPrompt(
    prompt: string,
    systemPrompt: string,
    history: ConversationTurn[],
  ): string {
    const parts = [PREAMBLE, systemPrompt];
    const recent = history.slice(-HISTORY_TURNS);
    if (recent.length > 0) {
      parts.push(
        '## Conversation so far\n' +
          recent
            .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
            .join('\n'),
      );
    }
    parts.push(`## Request\n${prompt}`);
    return parts.join('\n\n');
  }

  private cancelSession(sessionId: string): void {
    this.notify('session/cancel', { sessionId });
  }

  // ── JSON-RPC plumbing ────────────────────────────────────────────────

  private write(msg: Record<string, unknown>): void {
    try {
      this.child?.stdin?.write(JSON.stringify(msg) + '\n');
    } catch { /* child already gone — pending rejects on 'exit' */ }
  }

  private call(
    method: string,
    params: unknown,
    opts?: {
      onResult?: (result: unknown) => void;
      onError?: (err: Error) => void;
    },
  ): number {
    const id = ++this.nextId;
    if (opts) {
      this.pending.set(id, {
        resolve: (r) => opts.onResult?.(r),
        reject: (e) => opts.onError?.(e),
      });
    } else {
      this.pending.set(id, {
        resolve: () => {},
        reject: () => {},
      });
    }
    this.write({ jsonrpc: '2.0', id, method, params });
    return id;
  }

  private callAsync(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private onStdout(data: string): void {
    this.recvBuf += data;
    let idx: number;
    while ((idx = this.recvBuf.indexOf('\n')) >= 0) {
      const line = this.recvBuf.slice(0, idx).trim();
      this.recvBuf = this.recvBuf.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // non-JSON noise — devin logs go to stderr, but be tolerant
      }
      this.onMessage(msg);
    }
  }

  private onMessage(msg: Record<string, unknown>): void {
    const id = msg.id as number | undefined;
    const method = msg.method as string | undefined;

    // Response to one of ours.
    if (id !== undefined && method === undefined) {
      const p = this.pending.get(id);
      this.pending.delete(id);
      if (!p) return;
      if (msg.error) {
        const e = msg.error as { message?: string };
        p.reject(new Error(`${this.spec.bin} acp ${e.message ?? 'error'}`));
      } else {
        p.resolve(msg.result);
      }
      return;
    }

    // Agent → client request. Permission prompts get an unconditional deny:
    // the reply engine must never act on the user's machine — its output
    // is text the app itself executes ([ACT:*] via nut-js), and devin
    // acting too would double-actuate.
    if (id !== undefined && method) {
      if (method === 'session/request_permission') {
        this.write({ jsonrpc: '2.0', id, result: { outcome: { outcome: 'cancelled' } } });
      } else {
        this.write({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `unsupported request ${method}` },
        });
      }
      return;
    }

    // Notifications.
    if (method !== 'session/update') return;
    const params = msg.params as { sessionId?: string; update?: Record<string, unknown> };
    const update = params?.update;
    const sessionId = params?.sessionId;
    if (!update || !sessionId) return;
    if (update.sessionUpdate === 'agent_message_chunk') {
      const content = update.content as { type?: string; text?: string } | undefined;
      if (content?.type === 'text' && typeof content.text === 'string') {
        const pending = this.prompts.get(sessionId);
        if (pending) {
          pending.fullText += content.text;
          pending.onChunk(content.text);
        }
      }
    }
    // agent_thought_chunk / tool_call* / plan / usage_update — the reply
    // is the message stream only; everything else is narration we never
    // surface as answer text.
  }

  private onChildDead(): void {
    if (!this.child) return; // already reaped
    this.child = null;
    this.initPromise = null;
    // Session ids die with the process — a fresh child re-creates them.
    this.sessions.clear();
    this.sessionBooted.clear();
    const tail = this.stderrTail.trim();
    const err = new Error(
      tail ? `${this.spec.bin} CLI exited: ${tail.slice(-800)}` : `${this.spec.bin} CLI exited`,
    );
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
    // In-flight prompt turns hear the failure through their rpc reject —
    // prompts map entries resolve via finish() inside onError.
    this.prompts.clear();
    if (this.childCwd) {
      fs.rm(this.childCwd, { recursive: true, force: true, maxRetries: 15, retryDelay: 1000 }, () => {});
      this.childCwd = null;
    }
  }

  private killChild(): void {
    const proc = this.child;
    this.child = null;
    if (!proc) return;
    if (process.platform === 'win32' && proc.pid) {
      try {
        execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
      } catch { /* best-effort */ }
    }
    try { proc.kill(); } catch { /* already gone */ }
    this.onChildDead();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
