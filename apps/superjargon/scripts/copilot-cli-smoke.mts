/**
 * Smoke test for copilot-cli-api.ts — the Mind provider that runs a
 * ONE-SHOT `copilot -s -p <prompt>` per call.
 *
 *   bunx tsx scripts/copilot-cli-smoke.mts    (plain tsx — no electron imports)
 *
 * The CLI is faked: a temp dir holds `copilot.cmd` (a cmd shim onto node
 * running `fake-copilot.ts`), so no network, login or GitHub account is
 * involved. The fake records its argv, cwd and (listing of) cwd to files,
 * prints the canned reply in two stdout writes, and can be told to hang or
 * fail via marker files.
 *
 * Covers:
 *  a) stdout chunks stream and onComplete carries the full text
 *  b) the prompt carries persona + history + request, and the argv has the
 *     silent/prompt flags
 *  c) no dangerous flag (allow-all / allow-tool / yolo …) is ever passed
 *  d) the child runs in an empty temp dir, removed afterwards
 *  e) abort mid-flight resolves quietly (no onError, no onComplete)
 *  f) a non-zero exit surfaces onError carrying the stderr tail
 *  g) an unresolvable bin surfaces the install hint
 *  h) testCopilotCli: ok against the shim, not-found without one
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ConversationTurn } from '../src/shared/types';
import { buildSystemPrompt } from '../src/main/services/prompts';
import { CopilotCliAPI, testCopilotCli } from '../src/main/services/copilot-cli-api';

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-copilot-cli-'));
const FAKE = path.join(tmp, 'fake-copilot.ts');
const ARGV = path.join(tmp, 'captured-argv.json');
const CWD = path.join(tmp, 'captured-cwd.json');
const HANG = path.join(tmp, 'HANG');
const FAIL = path.join(tmp, 'FAIL');
const BIN = path.join(tmp, 'copilot.cmd');
const REPLY = 'Hello from the fake copilot CLI.\nSecond line of the reply.';

// dir comes from argv[1] (this script's own path) because the provider
// spawns the CLI from a temp cwd of its own.
fs.writeFileSync(
  FAKE,
  `const fs = require('node:fs');
const path = require('node:path');
const dir = path.dirname(process.argv[1]);
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('0.0.fake'); process.exit(0); }
fs.writeFileSync(path.join(dir, 'captured-argv.json'), JSON.stringify(args), 'utf8');
fs.writeFileSync(path.join(dir, 'captured-cwd.json'),
  JSON.stringify({ cwd: process.cwd(), entries: fs.readdirSync(process.cwd()) }), 'utf8');
// The provider pipes the prompt on stdin and closes it; reply only after EOF.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  fs.writeFileSync(path.join(dir, 'captured-stdin.txt'), input, 'utf8');
  if (fs.existsSync(path.join(dir, 'FAIL'))) { console.error('boom: not logged in'); process.exit(3); }
  if (fs.existsSync(path.join(dir, 'HANG'))) { setInterval(() => {}, 1000); return; }
  const REPLY = ${JSON.stringify(REPLY)};
  const half = Math.ceil(REPLY.length / 2);
  process.stdout.write(REPLY.slice(0, half));
  setTimeout(() => process.stdout.write(REPLY.slice(half)), 150);
});
`,
  'utf8',
);
// copilot.cmd is what an npm global install looks like on Windows, so this
// also exercises the provider's cmd.exe wrapping path.
fs.writeFileSync(BIN, `@node "%~dp0fake-copilot.ts" %*\r\n`, 'utf8');

const api = new CopilotCliAPI();

interface RunResult {
  chunks: string[];
  full: string | null;
  errors: Error[];
}

function run(
  prompt: string,
  history: ConversationTurn[],
  opts: { binPath?: string; signal?: AbortSignal },
): Promise<RunResult> {
  return new Promise<RunResult>((resolve) => {
    const res: RunResult = { chunks: [], full: null, errors: [] };
    const finish = () => resolve(res);
    void api
      .streamChat(prompt, [], history, '', {
        reasoningDepth: 'medium',
        replyTone: 'friendly',
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.binPath ? { binPath: opts.binPath } : {}),
      }, {
        onChunk: (t: string) => { res.chunks.push(t); },
        onComplete: (t: string) => { res.full = t; finish(); },
        onError: (e: Error) => { res.errors.push(e); finish(); },
      })
      .then(finish, (e: Error) => { res.errors.push(e); finish(); });
  });
}

const HISTORY: ConversationTurn[] = [
  { role: 'user', content: 'earlier question' },
  { role: 'assistant', content: 'earlier answer' },
];

const readJson = <T,>(p: string): T => JSON.parse(fs.readFileSync(p, 'utf8')) as T;

// Blank PATH so a missing explicit bin can't fall back to a real copilot.
async function withEmptyPath<T>(fn: () => Promise<T>): Promise<T> {
  const emptyPath = fs.mkdtempSync(path.join(os.tmpdir(), 'superjargon-empty-path-'));
  const prevPath = process.env.PATH;
  process.env.PATH = emptyPath;
  try {
    return await fn();
  } finally {
    if (prevPath === undefined) delete process.env.PATH;
    else process.env.PATH = prevPath;
    fs.rmSync(emptyPath, { recursive: true, force: true });
  }
}

try {
  // ── a/b/c/d) streaming, prompt, flags, cwd ───────────────────────────
  {
    const res = await run('what does the screen show?', HISTORY, { binPath: BIN });
    check(res.errors.length === 0, 'chat: fake CLI run reports no error', res.errors.map((e) => e.message));
    check(res.chunks.length === 2, 'chat: two streamed stdout chunks arrive', res.chunks.length);
    const joined = res.chunks.join('');
    check(
      joined.trimEnd() === REPLY && res.full?.trimEnd() === REPLY,
      'chat: chunks concatenate to the full text onComplete receives',
      { joined, full: res.full },
    );

    const argv = readJson<string[]>(ARGV);
    check(argv.includes('-s'), 'argv: silent flag -s present', argv);
    check(!argv.includes('-p'), 'argv: no -p — the prompt goes over stdin, not the command line', argv);
    const promptArg = fs.readFileSync(path.join(tmp, 'captured-stdin.txt'), 'utf8');
    // stdin is verbatim, so the whole system prompt arrives — newlines and all.
    const sys = buildSystemPrompt('friendly', { hasWebSearch: false, mode: 'talk' });
    check(promptArg.includes(sys), 'prompt: carries the full talk system prompt verbatim', sys.slice(0, 40));
    check(promptArg.includes('User: earlier question'), 'prompt: history user line present');
    check(promptArg.includes('Assistant: earlier answer'), 'prompt: history assistant line present');
    check(promptArg.includes('what does the screen show?'), 'prompt: request text present');

    const flags = argv;
    // `--disallow-*` narrows access, so it's the one "allow" spelling that's safe.
    const dangerous = flags.filter((a) => /allow|yolo|no-ask|trust/i.test(a) && !/^--disallow-/i.test(a));
    check(dangerous.length === 0, 'safety: no allow-all / allow-tool / yolo flag is passed', dangerous);
    check(
      flags.includes('--available-tools=__none__') && !flags.includes('--available-tools') && flags.includes('--disallow-temp-dir'),
      'safety: --available-tools names no real tool (a bare flag means ALL tools) and temp-dir access is off',
      flags,
    );

    const cwdInfo = readJson<{ cwd: string; entries: string[] }>(CWD);
    check(cwdInfo.entries.length === 0, 'cwd: the CLI starts in an empty directory', cwdInfo.entries);
    check(
      path.resolve(cwdInfo.cwd) !== path.resolve(process.cwd()) && cwdInfo.cwd.startsWith(os.tmpdir().replace(/\\/g, '\\')) ,
      'cwd: it is a temp dir, not the app cwd',
      cwdInfo.cwd,
    );
    await new Promise((r) => setTimeout(r, 300));
    check(!fs.existsSync(cwdInfo.cwd), 'cwd: the temp dir is removed after the run', cwdInfo.cwd);
  }

  // ── e) abort mid-flight is a quiet stop ──────────────────────────────
  {
    fs.rmSync(ARGV, { force: true });
    fs.writeFileSync(HANG, '1', 'utf8');
    const ctl = new AbortController();
    const p = run('this one gets interrupted', [], { binPath: BIN, signal: ctl.signal });
    for (let i = 0; i < 100 && !fs.existsSync(ARGV); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 150));
    ctl.abort();
    const res = await p;
    fs.rmSync(HANG, { force: true });
    check(res.errors.length === 0, 'abort: resolves with no onError', res.errors.map((e) => e.message));
    check(res.full === null, 'abort: no onComplete for the dead turn', res.full);
  }

  // ── f) non-zero exit → onError with stderr tail ──────────────────────
  {
    fs.writeFileSync(FAIL, '1', 'utf8');
    const res = await run('hello', [], { binPath: BIN });
    fs.rmSync(FAIL, { force: true });
    check(res.errors.length === 1, 'exit: exactly one onError', res.errors.map((e) => e.message));
    check(/not logged in/.test(res.errors[0]?.message ?? ''), 'exit: error carries the stderr tail', res.errors[0]?.message);
    check(res.full === null, 'exit: no onComplete');
  }

  // ── g) unresolvable binary ───────────────────────────────────────────
  {
    const res = await withEmptyPath(() =>
      run('hello', [], { binPath: path.join(tmp, 'no-such-copilot.exe') }),
    );
    check(res.errors.length === 1, 'missing bin: exactly one onError', res.errors.map((e) => e.message));
    check(
      /npm install -g @github\/copilot \(Node 22\+\)/.test(res.errors[0]?.message ?? ''),
      'missing bin: onError carries the install hint',
      res.errors[0]?.message,
    );
    check(res.full === null, 'missing bin: no onComplete');
  }

  // ── h) test-connection probe ─────────────────────────────────────────
  {
    const ok = await testCopilotCli(BIN);
    check(ok.ok && /0\.0\.fake/.test(ok.message), 'test: shim reports its version', ok);
    const bad = await withEmptyPath(() => testCopilotCli(path.join(tmp, 'nope.exe')));
    check(!bad.ok && /Install with/.test(bad.message), 'test: missing bin reports the install hint', bad);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed, 0 skipped`);
process.exit(fail > 0 ? 1 : 0);
