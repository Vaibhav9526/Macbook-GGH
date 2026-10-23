/**
 * Smoke test for devin-cli-api.ts — the Mind provider that talks to a
 * persistent `devin acp` server (JSON-RPC over stdio) instead of an HTTP API.
 *
 *   bunx tsx scripts/devin-cli-smoke.mts    (plain tsx — no electron imports)
 *
 * The CLI is faked: a temp dir holds `devin.cmd` (a cmd shim onto node running
 * `fake-devin.ts`) so no real network, login, or devin account is involved. The
 * fake is a real ACP responder — it answers initialize/session/new, replays a
 * canned reply as two agent_message_chunk notifications, and dumps every
 * prompt's text/image blocks to files so the test can inspect exactly what the
 * provider put on the wire.
 *
 * Covers:
 *  a) chunks stream and onComplete carries the full canned text
 *  b) a session's FIRST prompt carries buildSystemPrompt() + history +
 *     the request; later turns on the same sessionKey do NOT replay history
 *  c) a screenshot rides as an inline ACP image block (mimeType+base64)
 *  d) the warm path: two runs reuse one child and one session; a different
 *     sessionKey gets its own session — and its own bootstrap
 *  e) abort mid-flight resolves quietly — no onError, no onComplete
 *  f) an unresolvable bin surfaces onError 'not found'
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ConversationTurn, ScreenCapture } from '../src/shared/types';
import { buildSystemPrompt } from '../src/main/services/prompts';
import { DevinCliAPI } from '../src/main/services/devin-cli-api';

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(
      `FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`,
    );
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-devin-cli-'));
const FAKE = path.join(tmp, 'fake-devin.ts');
const CAPTURED = path.join(tmp, 'captured-prompt.txt');
const SHOTS = path.join(tmp, 'captured-shots.txt');
const SESS_COUNT = path.join(tmp, 'sessions-count.txt');
const HANG = path.join(tmp, 'HANG');
const BIN = path.join(tmp, 'devin.cmd');
const REPLY = 'Hello from the fake devin CLI.\nSecond line of the reply.';

// A line-delimited JSON-RPC ACP server. node strips TS types natively, so the
// shim needs no build step. `dir` comes from argv[1] (this script's own path)
// rather than cwd: the provider spawns the CLI from a temp dir of its own.
// Prompt text blocks land in captured-prompt.txt; image blocks land as
// "<base64Len>\t<mimeType>" rows in captured-shots.txt; sessions-count.txt is
// how the test proves the warm path reuses one session per sessionKey.
fs.writeFileSync(
  FAKE,
  `import('node:fs').then(async (fs) => {
  const path = await import('node:path');
  const readline = await import('node:readline');
  const dir = path.dirname(process.argv[1]);
  const REPLY = ${JSON.stringify(REPLY)};
  let pendingId = null;
  const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    let msg;
    try { msg = JSON.parse(t); } catch { return; }
    if (msg.method === 'session/cancel') {
      if (pendingId !== null) {
        send({ jsonrpc: '2.0', id: pendingId, result: { stopReason: 'cancelled' } });
        pendingId = null;
      }
      return;
    }
    if (typeof msg.id !== 'number') return;
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: { image: true, audio: false, embeddedContext: false },
          mcpCapabilities: { http: false, sse: false },
          sessionCapabilities: {},
          auth: {},
        },
      } });
      return;
    }
    if (msg.method === 'session/new') {
      const n = fs.existsSync(path.join(dir, 'sessions-count.txt'))
        ? Number(fs.readFileSync(path.join(dir, 'sessions-count.txt'), 'utf8'))
        : 0;
      fs.writeFileSync(path.join(dir, 'sessions-count.txt'), String(n + 1), 'utf8');
      send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 'fake-session-' + (n + 1) } });
      return;
    }
    if (msg.method === 'session/prompt') {
      const blocks = (msg.params && msg.params.prompt) || [];
      const texts = [];
      const shots = [];
      for (const b of blocks) {
        if (b.type === 'text') texts.push(b.text);
        if (b.type === 'image') shots.push(String((b.data || '').length) + '\\t' + (b.mimeType || ''));
      }
      fs.writeFileSync(path.join(dir, 'captured-prompt.txt'), texts.join('\\n'), 'utf8');
      fs.writeFileSync(path.join(dir, 'captured-shots.txt'), shots.join('\\n'), 'utf8');
      // HANG makes the fake hold the prompt forever (until session/cancel):
      // the abort case needs a turn that outlives the user's patience.
      if (fs.existsSync(path.join(dir, 'HANG'))) { pendingId = msg.id; return; }
      const half = Math.ceil(REPLY.length / 2);
      for (const part of [REPLY.slice(0, half), REPLY.slice(half)]) {
        send({ jsonrpc: '2.0', method: 'session/update', params: {
          sessionId: msg.params.sessionId,
          update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: part } },
        } });
      }
      send({ jsonrpc: '2.0', id: msg.id, result: {
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1 },
      } });
    }
  });
});
`,
  'utf8',
);

// devin.cmd is what a user's global install actually looks like on Windows, so
// this also exercises the provider's cmd.exe wrapping path.
fs.writeFileSync(BIN, `@node "%~dp0fake-devin.ts" %*\r\n`, 'utf8');

const api = new DevinCliAPI();

interface RunResult {
  chunks: string[];
  full: string | null;
  errors: Error[];
}

function run(
  prompt: string,
  screenshots: ScreenCapture[],
  history: ConversationTurn[],
  opts: { binPath?: string; signal?: AbortSignal; sessionKey?: string },
): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const res: RunResult = { chunks: [], full: null, errors: [] };
    const finish = () => resolve(res);
    void api
      .streamChat(
        prompt,
        screenshots,
        history,
        'devin-default',
        {
          reasoningDepth: 'medium',
          replyTone: 'friendly',
          ...(opts.signal ? { signal: opts.signal } : {}),
          ...(opts.binPath ? { binPath: opts.binPath } : {}),
          ...(opts.sessionKey ? { sessionKey: opts.sessionKey } : {}),
        },
        {
          onChunk: (t: string) => { res.chunks.push(t); },
          onComplete: (t: string) => { res.full = t; finish(); },
          onError: (e: Error) => { res.errors.push(e); finish(); },
        },
      )
      .then(finish, (e: Error) => { res.errors.push(e); finish(); });
  });
}

const shot: ScreenCapture = {
  dataBase64:
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  displayId: 1,
  imageWidth: 64,
  imageHeight: 48,
  displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  isCursorScreen: true,
};

const HISTORY: ConversationTurn[] = [
  { role: 'user', content: 'earlier question' },
  { role: 'assistant', content: 'earlier answer' },
];

function capturedPrompt(): string {
  return fs.existsSync(CAPTURED) ? fs.readFileSync(CAPTURED, 'utf8') : '';
}

function capturedShots(): string[] {
  return fs.existsSync(SHOTS)
    ? fs.readFileSync(SHOTS, 'utf8').split(/\r?\n/).filter(Boolean)
    : [];
}

function sessionsCreated(): number {
  return fs.existsSync(SESS_COUNT) ? Number(fs.readFileSync(SESS_COUNT, 'utf8')) : 0;
}

try {
  // ── a/b) streaming + session bootstrap on the FIRST prompt ───────────
  {
    const res = await run('what does the screen show?', [], HISTORY, {
      binPath: BIN,
      sessionKey: 'main:talk',
    });
    check(res.errors.length === 0, 'chat: fake CLI run reports no error', res.errors.map((e) => e.message));
    check(res.chunks.length === 2, 'chat: two streamed chunks arrive', res.chunks.length);
    const joined = res.chunks.join('').trimEnd();
    check(
      joined === REPLY && res.full?.trimEnd() === REPLY,
      'chat: chunks concatenate to the full text onComplete receives',
      { joined, full: res.full },
    );

    const captured = capturedPrompt();
    const sys = buildSystemPrompt('friendly', { hasWebSearch: false, mode: 'talk' });
    // Compare on a distinctive line rather than the whole prompt: the provider
    // is free to wrap or prepend its own framing around the system text.
    const sysFingerprint = sys.split('\n').find((l) => l.trim().length > 30)!.trim();
    check(captured.includes(sysFingerprint), 'prompt: carries the talk system prompt', sysFingerprint);
    check(captured.includes('User: earlier question'), 'prompt: history user line present');
    check(captured.includes('Assistant: earlier answer'), 'prompt: history assistant line present');
    check(captured.includes('what does the screen show?'), 'prompt: request text present');
  }

  // ── c/d) warm reuse: inline screenshot, no history replay, one session ─
  {
    const res = await run('describe this screen', [shot], [], {
      binPath: BIN,
      sessionKey: 'main:talk',
    });
    check(res.full?.trimEnd() === REPLY, 'shot: run with a screenshot completes', res.full);

    const rows = capturedShots();
    check(rows.length === 1, 'shot: one inline image block goes to the CLI', rows);
    // The provider ships dataBase64 verbatim as the ACP image payload — its
    // string length is the proof the decoded JPEG bytes travel inline rather
    // than as a temp-file path.
    check(
      Number(rows[0]?.split('\t')[0]) === shot.dataBase64.length,
      'shot: image block carries the base64 jpeg payload',
      rows,
    );
    check(rows[0]?.split('\t')[1] === 'image/jpeg', 'shot: image mimeType is jpeg', rows);
    const captured = capturedPrompt();
    check(
      captured.includes('[screen0] 64x48px. (active screen)'),
      'shot: the [screenN] label rides beside the image block',
      captured.slice(-200),
    );
    // Second turn on the same sessionKey must NOT replay the bootstrap —
    // the ACP session already carries that context (this is most of why the
    // warm path is fast).
    check(
      !captured.includes('earlier question'),
      'warm: history is not replayed on a booted session',
      captured.slice(0, 200),
    );
    check(
      sessionsCreated() === 1,
      'warm: two turns share one ACP session (one session/new call)',
      sessionsCreated(),
    );
  }

  // ── d) a different sessionKey gets its own session AND bootstrap ─────
  {
    const res = await run('scout turn', [], HISTORY, {
      binPath: BIN,
      sessionKey: 'scout:agent',
    });
    check(res.full?.trimEnd() === REPLY, 'sessions: second key completes', res.full);
    check(
      sessionsCreated() === 2,
      'sessions: a new sessionKey spawns a second ACP session',
      sessionsCreated(),
    );
    check(
      capturedPrompt().includes('User: earlier question'),
      'sessions: the new session gets its own bootstrap (history replayed once)',
    );
  }

  // ── e) abort mid-flight is a quiet stop, not a turn failure ───────────
  {
    fs.rmSync(CAPTURED, { force: true });
    fs.writeFileSync(HANG, '1', 'utf8');
    const ctl = new AbortController();
    const p = run('this one gets interrupted', [], [], {
      binPath: BIN,
      signal: ctl.signal,
      sessionKey: 'main:talk',
    });
    // Wait for the fake to actually hold a prompt before pulling the rug.
    for (let i = 0; i < 100 && !fs.existsSync(CAPTURED); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 150));
    ctl.abort();
    const res = await p;
    fs.rmSync(HANG, { force: true });
    check(res.errors.length === 0, 'abort: resolves with no onError', res.errors.map((e) => e.message));
    check(res.full === null, 'abort: no onComplete for the dead turn', res.full);
  }

  // ── f) an unresolvable binary is a reportable error, not a hang ───────
  {
    // A binPath that doesn't exist makes the provider fall back to a PATH
    // lookup — and this machine really does have a devin on PATH, which would
    // launch the real CLI. Blank PATH so the lookup misses instead.
    const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-empty-path-'));
    const prevPath = process.env.PATH;
    process.env.PATH = emptyPath;
    let res: RunResult;
    try {
      res = await run('hello', [], [], { binPath: path.join(tmp, 'no-such-devin.exe') });
    } finally {
      if (prevPath === undefined) delete process.env.PATH;
      else process.env.PATH = prevPath;
      fs.rmSync(emptyPath, { recursive: true, force: true });
    }
    check(res.errors.length === 1, 'missing bin: exactly one onError', res.errors.map((e) => e.message));
    check(
      /not found/i.test(res.errors[0]?.message ?? ''),
      'missing bin: onError says not found',
      res.errors[0]?.message,
    );
    check(res.full === null, 'missing bin: no onComplete');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed, 0 skipped`);
process.exit(fail > 0 ? 1 : 0);
