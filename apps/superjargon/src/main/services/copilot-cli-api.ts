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
 * Mind provider backed by the GitHub Copilot CLI (`copilot`) instead of an
 * HTTP API — same ride-the-local-login posture as claude-cli / devin-cli.
 *
 * Transport is ONE-SHOT: every call spawns `copilot -s -p <prompt>` and
 * streams stdout into onChunk. There is no warm session (the real
 * `copilot help` was not available when this was written, so nothing
 * fancier than the documented non-interactive mode is assumed). History is
 * replayed inside every prompt, and screenshots are NOT sent — tools are off,
 * so the CLI has no way to look at an image file.
 *
 * Reply engine only: no tool calls, file edits or shell commands. The child
 * runs in a fresh empty temp dir and NO auto-approve flag is ever passed
 * (see FORBIDDEN_FLAGS — enforced at runtime, not just by convention).
 *
 * Auth is whatever the user already has: their `copilot login` session or
 * COPILOT_GITHUB_TOKEN / GH_TOKEN inherited from the environment. Tokens are
 * never read, stored or logged here.
 *
 * Deliberately Electron-free so the plain-tsx smoke script can import it.
 */

// ── CLI contract: everything guessable about the copilot CLI lives here ──
// Once the real `copilot help` is known, adjust this block and nothing else.
/** Base args. `-s` = silent (answer text only, no usage/stats chrome). */
const COPILOT_BASE_ARGS: string[] = ['-s'];
/** Flag that carries the prompt in 'arg' mode. */
const COPILOT_PROMPT_FLAG = '-p';
/** How the prompt reaches the CLI: as the -p value, or piped on stdin. */
// stdin (verified live on 1.0.100: a piped prompt with no -p is answered, and
// newlines / % / quotes arrive intact). An argv prompt through the .cmd shim
// hit cmd.exe's 8191-char line limit, which left no room for history.
const COPILOT_PROMPT_VIA: 'arg' | 'stdin' = 'stdin';
/** Reply-engine hardening. A BARE --available-tools means "all tools" in copilot 1.0.100, so
 *  it must name a tool that doesn't exist: the model then gets none. --disallow-temp-dir drops
 *  the CLI's automatic temp-dir access (our cwd lives under os.tmpdir()). Verified live with
 *  COPILOT_ALLOW_ALL=1 set: no file created, no shell run, a %TEMP% file could not be read. */
const COPILOT_HARDENING_ARGS: string[] = [
  '--available-tools=__none__',
  '--disallow-temp-dir',
  '--disable-builtin-mcps',
  '--disable-client-telemetry',
];
/** Env vars that would auto-approve tools if inherited from the user's shell. */
const STRIPPED_ENV = ['COPILOT_ALLOW_ALL'];
/** Model override flag (only added when the caller passes a model). */
const COPILOT_MODEL_FLAG = '--model';
/** Probe used by the Test connection button. */
const COPILOT_VERSION_ARGS: string[] = ['--version'];
/** No arg may ever match one of these — approving tools defeats "reply engine only". */
const FORBIDDEN_FLAGS: RegExp[] = [
  /^--allow-all/i,
  /^--allow-tool/i,
  /^--allow-url/i,
  /^--allow-all-(tools|paths|urls)$/i,
  /^--yolo$/i,
  /^--no-ask-user$/i,
];
// ─────────────────────────────────────────────────────────────────────────

const CLI_TIMEOUT_MS = 240_000;
const TEST_TIMEOUT_MS = 15_000;
/** How many recent turns get replayed into each one-shot prompt. */
const HISTORY_TURNS = 20;
/** cmd.exe truncates a command line at 8191 chars; leave room for the shim. */
const MAX_CMD_PROMPT_CHARS = 7_000;
/** stderr is buffered only as error context; keep just the tail. */
const STDERR_TAIL_CHARS = 4_000;

const NOT_FOUND_MESSAGE =
  'GitHub Copilot CLI not found — install it or set its path in the Mind tab. ' +
  'Install with: npm install -g @github/copilot (Node 22+)';

const PREAMBLE =
  'you are the reply engine of a desktop voice companion; respond ONLY with ' +
  'the reply text, no tool narration, no tool calls, no file edits, no shell ' +
  'commands, no code unless asked. Screen captures are not available to you.';

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CopilotCliStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string, usage?: Usage) => void;
  onError: (error: Error) => void;
}

export interface CopilotCliChatOptions {
  /** Accepted for call-shape parity — the CLI owns its own effort. */
  reasoningDepth: ReasoningDepth;
  replyTone: ReplyTone;
  /** 'agent' swaps the talk persona for the computer-control prompt. */
  mode?: 'talk' | 'agent';
  /** Aborting mid-run is treated as a graceful interrupt, not an error. */
  signal?: AbortSignal;
  /** Absolute copilot binary path; missing/invalid falls back to PATH lookup. */
  binPath?: string;
  /** Accepted for parity; one-shot calls hold no session, so it is unused. */
  sessionKey?: string;
}

export interface CopilotCliTestResult {
  ok: boolean;
  message: string;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// PATH hits are cached; a miss is deliberately NOT cached so a copilot
// installed while the app runs is picked up next turn.
let cachedBin: string | undefined;

function resolveCopilotBin(binPath?: string): string | undefined {
  if (binPath && path.isAbsolute(binPath) && fileExists(binPath)) return binPath;
  if (cachedBin && fileExists(cachedBin)) return cachedBin;
  try {
    const out = execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['copilot'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    const hits = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // npm drops an extensionless sh script, a .cmd and a .ps1 side by side;
    // only .exe/.com/.cmd/.bat are spawnable on Windows, so never pick the
    // bare script just because `where` listed it first.
    const pick =
      process.platform === 'win32'
        ? hits.find((h) => /\.(exe|com)$/i.test(h)) ?? hits.find((h) => /\.(cmd|bat)$/i.test(h))
        : hits[0];
    if (pick) cachedBin = pick;
    return pick;
  } catch {
    return undefined;
  }
}

function isCmdShim(bin: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
}

/**
 * Node refuses to spawn a bare .cmd/.bat (EINVAL since the batch-file CVE
 * fix), so a script resolution detours through cmd.exe — same wrapper as
 * the claude-cli provider, kept self-contained for testability.
 */
function wrapForCmd(
  bin: string,
  args: string[],
): { cmd: string; argv: string[]; verbatim: boolean } {
  if (!isCmdShim(bin)) return { cmd: bin, argv: args, verbatim: false };
  const quote = (a: string) => `"${a}"`;
  const line = [bin, ...args].map(quote).join(' ');
  return { cmd: 'cmd.exe', argv: ['/d', '/s', '/c', `"${line}"`], verbatim: true };
}

/**
 * A prompt riding a cmd.exe command line can't hold newlines (they end the
 * command), double quotes (they close our quoting) or %vars% (cmd expands
 * them inside a shim's %*). Flatten those; lossy but safe.
 */
function sanitizeForCmd(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/"/g, "'")
    .replace(/%/g, ' percent')
    .replace(/[\0]/g, '')
    // A trailing backslash would escape the closing quote cmd.exe adds.
    .replace(/\\+$/, (m) => m + m);
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
        env: childEnv(),
      }),
    };
  } catch (err) {
    return { err: err as NodeJS.ErrnoException };
  }
}

/** The user's env (auth tokens included — never logged) minus anything that approves tools. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (STRIPPED_ENV.includes(k.toUpperCase())) delete env[k];
  }
  return env;
}

function spawnErrorMessage(e: NodeJS.ErrnoException): string {
  return e.code === 'ENOENT' ? NOT_FOUND_MESSAGE : `copilot CLI failed to start: ${e.message}`;
}

/** Throws if any arg would approve tools. The reply engine must never run them. */
function assertSafeArgs(args: string[]): void {
  for (const a of args) {
    if (FORBIDDEN_FLAGS.some((re) => re.test(a))) {
      throw new Error(`copilot CLI: refusing to pass unsafe flag ${a}`);
    }
  }
}

function killTree(proc: ChildProcess): void {
  if (process.platform === 'win32' && proc.pid) {
    try {
      execFile('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {});
    } catch { /* best-effort */ }
  }
  try { proc.kill(); } catch { /* already gone */ }
}

function rmDir(dir: string): void {
  fs.rm(dir, { recursive: true, force: true, maxRetries: 15, retryDelay: 1000 }, () => {});
}

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export class CopilotCliAPI {
  async streamChat(
    prompt: string,
    _screenshots: ScreenCapture[],
    history: ConversationTurn[],
    model: string,
    options: CopilotCliChatOptions,
    callbacks: CopilotCliStreamCallbacks,
  ): Promise<void> {
    const bin = resolveCopilotBin(options.binPath);
    if (!bin) {
      callbacks.onError(new Error(NOT_FOUND_MESSAGE));
      return;
    }
    const signal = options.signal;
    if (signal?.aborted) return;

    const systemPrompt = buildSystemPrompt(options.replyTone, {
      hasWebSearch: false,
      mode: options.mode,
    });
    const cmdShim = isCmdShim(bin);
    // Only an arg-carried prompt on a cmd shim is length/char constrained.
    const constrained = cmdShim && COPILOT_PROMPT_VIA === 'arg';
    let text = buildPrompt(prompt, systemPrompt, history, constrained ? MAX_CMD_PROMPT_CHARS : Infinity);
    if (constrained) text = sanitizeForCmd(text);

    const args = [...COPILOT_BASE_ARGS, ...COPILOT_HARDENING_ARGS];
    if (model) args.push(COPILOT_MODEL_FLAG, model);
    if (COPILOT_PROMPT_VIA === 'arg') args.push(COPILOT_PROMPT_FLAG, text);

    // Checked on the flags only: prompt text is data, not a flag.
    try {
      assertSafeArgs(args.slice(0, COPILOT_PROMPT_VIA === 'arg' ? -1 : undefined));
    } catch (err) {
      callbacks.onError(err as Error);
      return;
    }

    // Empty dir so a misbehaving CLI has nothing of the user's to read.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-copilot-'));
    const { cmd, argv, verbatim } = wrapForCmd(bin, args);
    const spawned = trySpawn(cmd, argv, cwd, verbatim);
    if (!spawned.proc) {
      rmDir(cwd);
      callbacks.onError(
        new Error(spawnErrorMessage(spawned.err ?? ({ code: 'ENOENT' } as NodeJS.ErrnoException))),
      );
      return;
    }
    const proc = spawned.proc;

    await new Promise<void>((resolve) => {
      let settled = false;
      let fullText = '';
      let stderrTail = '';

      const finish = (emit: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        rmDir(cwd);
        emit();
        resolve();
      };

      const timer = setTimeout(() => {
        // A wedged call gets the process killed AND reported — unlike a
        // user abort, which resolves quietly.
        killTree(proc);
        finish(() => callbacks.onError(new Error('Copilot CLI timed out')));
      }, CLI_TIMEOUT_MS);

      const onAbort = () => {
        // Graceful interrupt, same convention as the other providers: no onError.
        killTree(proc);
        finish(() => {});
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      proc.stdout!.setEncoding('utf-8');
      proc.stdout!.on('data', (d: string) => {
        if (settled) return;
        const t = d.replace(ANSI_REGEX, '');
        if (!t) return;
        fullText += t;
        callbacks.onChunk(t);
      });
      proc.stderr!.setEncoding('utf-8');
      proc.stderr!.on('data', (d: string) => {
        stderrTail = (stderrTail + d).slice(-STDERR_TAIL_CHARS);
      });
      proc.stdin?.on('error', () => { /* child exited before reading */ });

      proc.on('error', (e: NodeJS.ErrnoException) =>
        finish(() => callbacks.onError(new Error(spawnErrorMessage(e)))),
      );
      // 'close' (not 'exit') so every buffered stdout chunk has been delivered first.
      proc.on('close', (code) => {
        if (code === 0 && fullText.trim()) {
          finish(() => callbacks.onComplete(fullText));
          return;
        }
        const tail = stderrTail.trim().slice(-800);
        const why = code === 0 ? 'copilot CLI returned no output' : `copilot CLI exited (${code})`;
        finish(() => callbacks.onError(new Error(tail ? `${why}: ${tail}` : why)));
      });

      try {
        if (COPILOT_PROMPT_VIA === 'stdin') proc.stdin?.write(text);
        proc.stdin?.end();
      } catch { /* child already gone — 'close' reports it */ }
    });
  }
}

/**
 * Test-connection probe: resolve the binary and ask it for its version.
 * Says nothing about auth — a missing login only shows on a real turn.
 */
export function testCopilotCli(binPath?: string): Promise<CopilotCliTestResult> {
  return new Promise((resolve) => {
    const bin = resolveCopilotBin(binPath);
    if (!bin) {
      resolve({ ok: false, message: NOT_FOUND_MESSAGE });
      return;
    }
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-copilot-'));
    const { cmd, argv, verbatim } = wrapForCmd(bin, COPILOT_VERSION_ARGS);
    const spawned = trySpawn(cmd, argv, cwd, verbatim);
    if (!spawned.proc) {
      rmDir(cwd);
      resolve({
        ok: false,
        message: spawnErrorMessage(spawned.err ?? ({ code: 'ENOENT' } as NodeJS.ErrnoException)),
      });
      return;
    }
    const proc = spawned.proc;
    let out = '';
    let done = false;
    const end = (r: CopilotCliTestResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rmDir(cwd);
      resolve(r);
    };
    const timer = setTimeout(() => {
      killTree(proc);
      end({ ok: false, message: 'copilot --version timed out' });
    }, TEST_TIMEOUT_MS);
    proc.stdout!.setEncoding('utf-8');
    proc.stdout!.on('data', (d: string) => { out = (out + d).slice(-STDERR_TAIL_CHARS); });
    proc.stderr!.setEncoding('utf-8');
    proc.stderr!.on('data', (d: string) => { out = (out + d).slice(-STDERR_TAIL_CHARS); });
    proc.on('error', (e: NodeJS.ErrnoException) => end({ ok: false, message: spawnErrorMessage(e) }));
    proc.on('close', (code) => {
      const line = out.replace(ANSI_REGEX, '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
      end(
        code === 0
          ? { ok: true, message: line ? `Found: ${line}` : 'Found copilot CLI' }
          : { ok: false, message: `copilot exited (${code})${line ? `: ${line}` : ''}` },
      );
    });
    proc.stdin?.end();
  });
}

/**
 * One-shot prompt: nothing persists between calls, so persona + history ride
 * every time. When a char budget applies (cmd.exe line limit), the oldest
 * history turns are dropped first; the request itself is never cut.
 */
function buildPrompt(
  prompt: string,
  systemPrompt: string,
  history: ConversationTurn[],
  budget: number,
): string {
  const lines = history
    .slice(-HISTORY_TURNS)
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`);
  const assemble = (hist: string[]) => {
    const parts = [PREAMBLE, systemPrompt];
    if (hist.length > 0) parts.push('## Conversation so far\n' + hist.join('\n'));
    parts.push(`## Request\n${prompt}`);
    return parts.join('\n\n');
  };
  let text = assemble(lines);
  while (text.length > budget && lines.length > 0) {
    lines.shift();
    text = assemble(lines);
  }
  // Still over: the system prompt alone is large, so trim it, not the request.
  if (text.length > budget) {
    const over = text.length - budget;
    text = assemble(lines).replace(systemPrompt, systemPrompt.slice(0, Math.max(0, systemPrompt.length - over)));
  }
  return text;
}
