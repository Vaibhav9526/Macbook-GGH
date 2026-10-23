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
 * Mind provider backed by the local `claude` (Claude Code) CLI instead of
 * an HTTP API — the same ride-the-local-login posture as devin-cli.
 *
 * Transport is `-p --input-format stream-json --output-format stream-json`:
 * one persistent child per logical conversation (sessionKey), fed user
 * messages as JSON lines on stdin and answering with stream_json events on
 * stdout. Measured on this machine: first turn ~3 s including spawn+init,
 * warm turns ~1.8 s — vs re-running `claude -p` one-shot every turn, which
 * pays the whole process boot each time.
 *
 * Unlike devin acp (one process, many sessions), a stream-json claude
 * process IS the conversation — so this provider holds a small map of
 * sessionKey → child. Each is spawned lazily and kept for the app run.
 *
 * Deliberately Electron-free (os/fs/path/child_process only) so the
 * plain-tsx smoke script can import this module.
 */

const CLI_TIMEOUT_MS = 240_000;
/** How many recent turns get replayed when a session is bootstrapped. */
const HISTORY_TURNS = 20;
/** stderr is buffered only as error context; keep just the tail. */
const STDERR_TAIL_CHARS = 4_000;

const NOT_FOUND_MESSAGE =
  'Claude Code CLI not found — install claude or set its path in the Mind tab';

const PREAMBLE =
  'you are the reply engine of a desktop voice companion; respond ONLY with ' +
  'the reply text, no tool narration, no tool calls, no file edits, no code.';

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ClaudeCliStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string, usage?: Usage) => void;
  onError: (error: Error) => void;
}

export interface ClaudeCliChatOptions {
  /** Accepted for call-shape parity — the CLI owns its own effort. */
  reasoningDepth: ReasoningDepth;
  replyTone: ReplyTone;
  /** 'agent' swaps the talk persona for the computer-control prompt. */
  mode?: 'talk' | 'agent';
  /** Aborting mid-run is treated as a graceful interrupt, not an error. */
  signal?: AbortSignal;
  /** Absolute claude binary path; missing/invalid falls back to PATH lookup. */
  binPath?: string;
  /**
   * Which conversation this turn belongs to ('main:talk', 'scout:agent',
   * 'suggestions', …). Each key maps to its own child process, so two
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
// cached so a claude installed while the app runs is picked up next turn.
let cachedBin: string | undefined;

function resolveClaudeBin(binPath?: string): string | undefined {
  if (binPath && path.isAbsolute(binPath) && fileExists(binPath)) return binPath;
  if (cachedBin) return cachedBin;
  try {
    const out = execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['claude'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    // `where` can list several hits (a native .exe, an npm .cmd shim…);
    // prefer a real executable so we skip the cmd.exe wrap entirely.
    const hits = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const pick = hits.find((h) => /\.(exe|com)$/i.test(h)) ?? hits[0];
    if (pick) cachedBin = pick;
    return pick;
  } catch {
    return undefined;
  }
}

/**
 * Node refuses to spawn a bare .cmd/.bat (EINVAL since the batch-file CVE
 * fix), so a script resolution detours through cmd.exe — identical to the
 * devin-cli provider's wrapper, kept self-contained for testability. See
 * devin-cli-api.ts for why the outer quote pair and verbatim flag matter.
 */
function wrapForCmd(
  bin: string,
  args: string[],
): { cmd: string; argv: string[]; verbatim: boolean } {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(bin)) {
    return { cmd: bin, argv: args, verbatim: false };
  }
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
        windowsVerbatimArguments: verbatim,
      }),
    };
  } catch (err) {
    return { err: err as NodeJS.ErrnoException };
  }
}

function spawnErrorMessage(e: NodeJS.ErrnoException): string {
  return e.code === 'ENOENT' ? NOT_FOUND_MESSAGE : `claude CLI failed to start: ${e.message}`;
}

/** The turn a session is currently streaming. Events aren't request-tagged;
 *  turns serialize per session so whatever arrives belongs to this. */
interface PendingTurn {
  fullText: string;
  /** Append a delta and forward it (dropped once settled). */
  chunk: (t: string) => void;
  /** End quietly with no callback — abort and intentional-kill paths. */
  finish: (emit: () => void) => void;
  succeed: (usage?: Usage) => void;
  fail: (err: Error) => void;
}

/** One live `claude` stream-json conversation. */
interface CliSession {
  id: string;
  proc: ChildProcess;
  /** bin+model identity — a settings change forces a respawn. */
  key: string;
  /** Temp cwd the session runs in; removed when the session dies. */
  cwd: string;
  /** Line buffer for stdout. */
  recvBuf: string;
  stderrTail: string;
  turn: PendingTurn | null;
  /** Serializes user messages — stdin order is conversation order. */
  queue: Promise<unknown>;
  /** False until the first prompt has carried the bootstrap payload. */
  booted: boolean;
  /** Distinguishes an abort/respawn kill from a crash — only the crash
   *  turns an in-flight turn into an onError. */
  diedIntentionally: boolean;
}

export class ClaudeCliAPI {
  private sessions = new Map<string, CliSession>();

  async streamChat(
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    model: string,
    options: ClaudeCliChatOptions,
    callbacks: ClaudeCliStreamCallbacks,
  ): Promise<void> {
    const bin = resolveClaudeBin(options.binPath);
    if (!bin) {
      callbacks.onError(new Error(NOT_FOUND_MESSAGE));
      return;
    }
    if (options.signal?.aborted) return;

    const sessionKey = options.sessionKey ?? 'main';
    try {
      const session = this.ensureSession(sessionKey, bin, model);
      // Turns on one conversation must not interleave on stdin.
      const run = session.queue.then(() =>
        this.promptTurn(session, prompt, screenshots, history, options, callbacks),
      );
      session.queue = run.catch(() => {});
      await run;
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // ── session lifecycle ────────────────────────────────────────────────

  /**
   * End one conversation's child. For one-shot callers (the screen reader
   * uses a fresh key per read) — without it each key's process lived for
   * the rest of the app run. No-op for an unknown key.
   */
  disposeSession(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    session.diedIntentionally = true;
    this.killSession(session);
  }

  /** Lazily spawn (or respawn after death/model change) the child that
   *  owns this conversation. */
  private ensureSession(sessionKey: string, bin: string, model: string): CliSession {
    const ident = `${bin}${model}`;
    const existing = this.sessions.get(sessionKey);
    if (
      existing &&
      existing.key === ident &&
      existing.proc.exitCode === null &&
      !existing.proc.killed
    ) {
      return existing;
    }
    if (existing) this.killSession(existing);

    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-claude-'));
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      // Deltas arrive as stream_event → real onChunk streaming.
      '--include-partial-messages',
      // Anything that would block on a permission dialog is auto-denied —
      // the reply engine never needs tools (text out, the app acts).
      '--permission-prompts', 'none',
    ];
    // --model is omitted when unset so the CLI keeps its own configured
    // default instead of receiving an empty value.
    if (model) args.push('--model', model);

    const { cmd, argv, verbatim } = wrapForCmd(bin, args);
    const spawned = trySpawn(cmd, argv, cwd, verbatim);
    if (!spawned.proc) {
      fs.rm(cwd, { recursive: true, force: true }, () => {});
      throw new Error(
        spawnErrorMessage(spawned.err ?? ({ code: 'ENOENT' } as NodeJS.ErrnoException)),
      );
    }

    const session: CliSession = {
      id: sessionKey,
      proc: spawned.proc,
      key: ident,
      cwd,
      recvBuf: '',
      stderrTail: '',
      turn: null,
      queue: Promise.resolve(),
      booted: false,
      diedIntentionally: false,
    };
    const proc = spawned.proc;

    proc.stdout!.setEncoding('utf-8');
    proc.stdout!.on('data', (d: string) => this.onStdout(sessionKey, d));
    proc.stderr!.setEncoding('utf-8');
    proc.stderr!.on('data', (d: string) => {
      session.stderrTail = (session.stderrTail + d).slice(-STDERR_TAIL_CHARS);
    });
    const onDead = () => this.onSessionDead(sessionKey);
    proc.on('error', onDead);
    proc.on('exit', onDead);
    proc.on('close', onDead);

    this.sessions.set(sessionKey, session);
    return session;
  }

  private onSessionDead(sessionKey: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    this.sessions.delete(sessionKey);
    const tail = session.stderrTail.trim();
    // An abort-killed session resolves its turn quietly; only an
    // unexpected exit turns it into an onError.
    const turn = session.turn;
    session.turn = null;
    if (turn && !session.diedIntentionally) {
      turn.fail(new Error(tail ? `claude CLI exited: ${tail.slice(-800)}` : 'claude CLI exited'));
    } else {
      turn?.finish(() => {});
    }
    fs.rm(session.cwd, { recursive: true, force: true, maxRetries: 15, retryDelay: 1000 }, () => {});
  }

  private killSession(session: CliSession): void {
    if (this.sessions.get(session.id) === session) this.sessions.delete(session.id);
    if (process.platform === 'win32' && session.proc.pid) {
      try {
        execFile('taskkill', ['/pid', String(session.proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
      } catch { /* best-effort */ }
    }
    try { session.proc.kill(); } catch { /* already gone */ }
    fs.rm(session.cwd, { recursive: true, force: true, maxRetries: 15, retryDelay: 1000 }, () => {});
  }

  // ── one turn ─────────────────────────────────────────────────────────

  private promptTurn(
    session: CliSession,
    prompt: string,
    screenshots: ScreenCapture[],
    history: ConversationTurn[],
    options: ClaudeCliChatOptions,
    callbacks: ClaudeCliStreamCallbacks,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const signal = options.signal;
      if (signal?.aborted || session.proc.exitCode !== null) {
        resolve();
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        // A wedged model call gets the process killed AND reported —
        // unlike a user abort, which resolves quietly.
        this.killSession(session);
        finish(() => callbacks.onError(new Error('Claude CLI timed out')));
      }, CLI_TIMEOUT_MS);

      const finish = (emit: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (session.turn === turn) session.turn = null;
        emit();
        resolve();
      };

      const onAbort = () => {
        // Abort mirrors ollama-api's convention: graceful interrupt, no
        // onError. stream-json input has no mid-turn cancel verb, so the
        // child is killed — the next turn respawns (and re-bootstraps).
        session.diedIntentionally = true;
        this.killSession(session);
        finish(() => {});
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      // The session carries its own context after bootstrap, so history
      // is replayed only on a session's first prompt — steady-state turns
      // stay a small user message (and the prefix is token-cached).
      const systemPrompt = buildSystemPrompt(options.replyTone, {
        hasWebSearch: false,
        mode: options.mode,
      });
      const text = session.booted
        ? `${PREAMBLE}\n\n${systemPrompt}\n\n## Request\n${prompt}`
        : bootstrapPrompt(prompt, systemPrompt, history);
      session.booted = true;

      const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
      // Image blocks ride inline in the user message — Anthropic's native
      // shape — so no temp files and no Read-tool round trip.
      for (let i = 0; i < screenshots.length; i++) {
        const sc = screenshots[i];
        content.push({
          type: 'text',
          text: `[screen${i}] ${sc.imageWidth}x${sc.imageHeight}px.${sc.isCursorScreen ? ' (active screen)' : ''}`,
        });
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: sc.dataBase64 },
        });
      }

      const turn: PendingTurn = {
        fullText: '',
        chunk: (t) => {
          if (settled) return;
          turn.fullText += t;
          callbacks.onChunk(t);
        },
        finish,
        succeed: (usage) => {
          const text = turn.fullText;
          finish(() => callbacks.onComplete(text, usage));
        },
        fail: (err) => finish(() => callbacks.onError(err)),
      };
      session.turn = turn;

      this.write(session, {
        type: 'user',
        message: { role: 'user', content },
      });
    });
  }

  private write(session: CliSession, msg: Record<string, unknown>): void {
    try {
      session.proc.stdin?.write(JSON.stringify(msg) + '\n');
    } catch { /* child already gone — turn hears it via 'exit' */ }
  }

  // ── stream_json plumbing ─────────────────────────────────────────────

  private onStdout(sessionKey: string, data: string): void {
    const session = this.sessions.get(sessionKey);
    if (!session) return;
    session.recvBuf += data;
    let idx: number;
    while ((idx = session.recvBuf.indexOf('\n')) >= 0) {
      const line = session.recvBuf.slice(0, idx).trim();
      session.recvBuf = session.recvBuf.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // non-JSON noise — be tolerant
      }
      this.onEvent(session, msg);
    }
  }

  private onEvent(session: CliSession, msg: Record<string, unknown>): void {
    const type = msg.type as string | undefined;
    const turn = session.turn;
    if (!turn) return;

    if (type === 'stream_event') {
      // Anthropic streaming events: only text deltas become chunks.
      const ev = msg.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        turn.chunk(ev.delta.text);
      }
      return;
    }

    if (type === 'result') {
      const isErr =
        (msg.is_error as boolean | undefined) === true ||
        ((msg.subtype as string | undefined) ?? 'success') !== 'success';
      if (isErr) {
        const errs = msg.errors as string[] | undefined;
        turn.fail(new Error(errs?.join('; ') || 'claude CLI turn failed'));
        return;
      }
      const u = msg.usage as {
        input_tokens?: number;
        output_tokens?: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      } | undefined;
      turn.succeed(
        u
          ? {
              inputTokens:
                (u.input_tokens ?? 0) +
                (u.cache_creation_input_tokens ?? 0) +
                (u.cache_read_input_tokens ?? 0),
              outputTokens: u.output_tokens ?? 0,
            }
          : undefined,
      );
      return;
    }

    // system/init/status, assistant/user echoes, rate_limit_event,
    // stream_event non-text — narration we never surface as answer text.
  }
}

function bootstrapPrompt(
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
