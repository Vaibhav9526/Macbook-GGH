/**
 * Smoke test for claude-cli-api.ts — the Mind provider that talks to a
 * persistent `claude -p --input-format stream-json --output-format
 * stream-json` child per conversation.
 *
 *   bunx tsx scripts/claude-cli-smoke.mts    (plain tsx — no electron imports)
 *
 * The CLI is faked: a temp dir holds `claude.cmd` (a cmd shim onto node
 * running `fake-claude.ts`) so no real network, login, or claude account is
 * involved. The fake answers each `{"type":"user"}` stdin line with two
 * text_delta stream_events and a result event, and dumps every message's
 * text/image blocks to files so the test can inspect exactly what the
 * provider put on the wire.
 *
 * Covers:
 *  a) deltas stream and onComplete carries the full canned text + usage
 *  b) a session's FIRST prompt carries buildSystemPrompt() + history +
 *     the request; later turns on the same sessionKey do NOT replay history
 *  c) a screenshot rides as an inline Anthropic image block
 *     (source.base64) beside its [screenN] label
 *  d) the warm path: two runs reuse one child; a different sessionKey gets
 *     its own process — and its own bootstrap
 *  e) abort mid-flight resolves quietly — no onError, no onComplete
 *  f) an unresolvable bin surfaces onError 'not found'
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ConversationTurn, ScreenCapture } from '../src/shared/types';
import { buildSystemPrompt } from '../src/main/services/prompts';
import { ClaudeCliAPI } from '../src/main/services/claude-cli-api';

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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-claude-cli-'));
const FAKE = path.join(tmp, 'fake-claude.ts');
const CAPTURED = path.join(tmp, 'captured-prompt.txt');
const SHOTS = path.join(tmp, 'captured-shots.txt');
const PROCS = path.join(tmp, 'procs-count.txt');
const HANG = path.join(tmp, 'HANG');
const BIN = path.join(tmp, 'claude.cmd');
const REPLY = 'Hello from the fake claude CLI.\nSecond line of the reply.';

// A stream_json claude stand-in: one process = one conversation. It bumps
// procs-count.txt on every spawn (how the warm-path assertions prove the
// provider reuses the child), then answers each user line with stream_event
// deltas + a result. `dir` comes from argv[1] (this script's own path)
// rather than cwd: the provider spawns the CLI from a temp dir of its own.
fs.writeFileSync(
  FAKE,
  `import('node:fs').then(async (fs) => {
  const path = await import('node:path');
  const readline = await import('node:readline');
  const dir = path.dirname(process.argv[1]);
  const REPLY = ${JSON.stringify(REPLY)};
  const n = fs.existsSync(path.join(dir, 'procs-count.txt'))
    ? Number(fs.readFileSync(path.join(dir, 'procs-count.txt'), 'utf8'))
    : 0;
  fs.writeFileSync(path.join(dir, 'procs-count.txt'), String(n + 1), 'utf8');
  const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  send({ type: 'system', subtype: 'init', session_id: 'fake-session', cwd: dir, tools: [] });
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const t = line.trim();
    if (!t) return;
    let msg;
    try { msg = JSON.parse(t); } catch { return; }
    if (msg.type !== 'user') return;
    const blocks = (msg.message && msg.message.content) || [];
    const texts = [];
    const shots = [];
    for (const b of blocks) {
      if (b.type === 'text') texts.push(b.text);
      if (b.type === 'image') {
        const src = b.source || {};
        shots.push(String((src.data || '').length) + '\\t' + (src.media_type || ''));
      }
    }
    fs.writeFileSync(path.join(dir, 'captured-prompt.txt'), texts.join('\\n'), 'utf8');
    fs.writeFileSync(path.join(dir, 'captured-shots.txt'), shots.join('\\n'), 'utf8');
    // HANG makes the fake hold the turn forever: the abort case needs a
    // turn that outlives the user's patience.
    if (fs.existsSync(path.join(dir, 'HANG'))) return;
    const half = Math.ceil(REPLY.length / 2);
    for (const part of [REPLY.slice(0, half), REPLY.slice(half)]) {
      send({ type: 'stream_event', event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: part },
      } });
    }
    send({ type: 'result', subtype: 'success', is_error: false, usage: {
      input_tokens: 10,
      cache_read_input_tokens: 90,
      output_tokens: 5,
    } });
  });
});
`,
  'utf8',
);

// claude.cmd is what an npm global install actually looks like on Windows, so
// this also exercises the provider's cmd.exe wrapping path.
fs.writeFileSync(BIN, `@node "%~dp0fake-claude.ts" %*\r\n`, 'utf8');

const api = new ClaudeCliAPI();

interface RunResult {
  chunks: string[];
  full: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  errors: Error[];
}

function run(
  prompt: string,
  screenshots: ScreenCapture[],
  history: ConversationTurn[],
  opts: { binPath?: string; signal?: AbortSignal; sessionKey?: string },
): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const res: RunResult = { chunks: [], full: null, usage: null, errors: [] };
    const finish = () => resolve(res);
    void api
      .streamChat(
        prompt,
        screenshots,
        history,
        'claude-default',
        {
          reasoningDepth: 'medium',
          replyTone: 'friendly',
          ...(opts.signal ? { signal: opts.signal } : {}),
          ...(opts.binPath ? { binPath: opts.binPath } : {}),
          ...(opts.sessionKey ? { sessionKey: opts.sessionKey } : {}),
        },
        {
          onChunk: (t: string) => { res.chunks.push(t); },
          onComplete: (t: string, u?: { inputTokens: number; outputTokens: number }) => {
            res.full = t;
            res.usage = u ?? null;
            finish();
          },
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

function procsSpawned(): number {
  return fs.existsSync(PROCS) ? Number(fs.readFileSync(PROCS, 'utf8')) : 0;
}

try {
  // ── a/b) streaming + bootstrap on the FIRST prompt ───────────────────
  {
    const res = await run('what does the screen show?', [], HISTORY, {
      binPath: BIN,
      sessionKey: 'main:talk',
    });
    check(res.errors.length === 0, 'chat: fake CLI run reports no error', res.errors.map((e) => e.message));
    check(res.chunks.length === 2, 'chat: two streamed deltas arrive', res.chunks.length);
    const joined = res.chunks.join('').trimEnd();
    check(
      joined === REPLY && res.full?.trimEnd() === REPLY,
      'chat: chunks concatenate to the full text onComplete receives',
      { joined, full: res.full },
    );
    check(
      res.usage?.inputTokens === 100 && res.usage?.outputTokens === 5,
      'chat: usage maps input+cache_read → inputTokens, output → outputTokens',
      res.usage,
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

  // ── c/d) warm reuse: inline screenshot, no replay, same child ────────
  {
    const res = await run('describe this screen', [shot], [], {
      binPath: BIN,
      sessionKey: 'main:talk',
    });
    check(res.full?.trimEnd() === REPLY, 'shot: run with a screenshot completes', res.full);

    const rows = capturedShots();
    check(rows.length === 1, 'shot: one inline image block goes to the CLI', rows);
    // The provider ships dataBase64 verbatim inside source.base64 — its
    // string length is the proof the jpeg payload travels inline.
    check(
      Number(rows[0]?.split('\t')[0]) === shot.dataBase64.length,
      'shot: image block carries the base64 jpeg payload',
      rows,
    );
    check(rows[0]?.split('\t')[1] === 'image/jpeg', 'shot: image media_type is jpeg', rows);
    const captured = capturedPrompt();
    check(
      captured.includes('[screen0] 64x48px. (active screen)'),
      'shot: the [screenN] label rides beside the image block',
      captured.slice(-200),
    );
    // Second turn on the same sessionKey must NOT replay the bootstrap —
    // the conversation already carries that context (this is most of why
    // the warm path is fast).
    check(
      !captured.includes('earlier question'),
      'warm: history is not replayed on a booted session',
      captured.slice(0, 200),
    );
    check(
      procsSpawned() === 1,
      'warm: two turns share one claude child (one spawn)',
      procsSpawned(),
    );
  }

  // ── d) a different sessionKey gets its own process AND bootstrap ─────
  {
    const res = await run('scout turn', [], HISTORY, {
      binPath: BIN,
      sessionKey: 'scout:agent',
    });
    check(res.full?.trimEnd() === REPLY, 'sessions: second key completes', res.full);
    check(
      procsSpawned() === 2,
      'sessions: a new sessionKey spawns a second claude child',
      procsSpawned(),
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
    // Wait for the fake to actually hold a turn before pulling the rug.
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
    // lookup — and this machine really does have a claude on PATH, which
    // would launch the real CLI. Blank PATH so the lookup misses instead.
    const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-empty-path-'));
    const prevPath = process.env.PATH;
    process.env.PATH = emptyPath;
    let res: RunResult;
    try {
      res = await run('hello', [], [], { binPath: path.join(tmp, 'no-such-claude.exe') });
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
