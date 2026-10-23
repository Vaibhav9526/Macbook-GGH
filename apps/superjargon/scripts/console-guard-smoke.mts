/**
 * Smoke test for console-guard.ts — the boundary fix that keeps a dead
 * stdout/stderr pipe (EPIPE) from crashing the main process.
 *
 *   bunx tsx scripts/console-guard-smoke.mts   (pure node/bun — no Electron)
 *
 * Covers:
 *  a) bare import installs the guard: a synchronous EPIPE throw inside
 *     the stream write must not escape log/info/warn/error/debug
 *  b) the guard is not errno-specific — a generic sync throw is swallowed too
 *  c) re-installing over throwing methods silences them — proof the
 *     try/catch lives in the wrapper, not in the runtime's console
 *  d) passthrough: once the pipe works again, output still reaches it
 *
 * Results are collected and reported at the end: while the streams are
 * stubbed to throw, even PASS lines would vanish into the guard.
 */

// The module installs the guard at top level — importing it IS test (a).
import { installConsoleGuard } from '../src/main/services/console-guard';

const METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
type Method = (typeof METHODS)[number];
type Write = typeof process.stdout.write;

const realOut: Write = process.stdout.write;
const realErr: Write = process.stderr.write;

const epipe = (): Error => Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
const generic = (): Error => new Error('stream exploded');

const stubWrites = (make: () => Error): void => {
  const w = (() => {
    throw make();
  }) as unknown as Write;
  process.stdout.write = w;
  process.stderr.write = w;
};
const restoreWrites = (): void => {
  process.stdout.write = realOut;
  process.stderr.write = realErr;
};

// Capability probe: Node's console.log writes via process.stdout.write,
// but a runtime with a native console may bypass the JS stream. Detect
// it once so a swallowed call isn't mistaken for an unreached stub.
let probeSeen = '';
process.stdout.write = ((chunk: unknown) => {
  probeSeen += String(chunk);
  return true;
}) as unknown as Write;
const PROBE = 'console-guard-smoke-probe';
console.log(PROBE);
restoreWrites();
const consoleViaStream = probeSeen.includes(PROBE);

const results: Array<{ state: 'pass' | 'fail' | 'skip'; name: string; extra?: unknown }> = [];
const record = (ok: boolean, name: string, extra?: unknown): void => {
  results.push({ state: ok ? 'pass' : 'fail', name, extra });
};
const skip = (name: string): void => {
  results.push({ state: 'skip', name });
};

// The saved methods are the import-time wrappers — restoring them keeps
// the guard on for the reporting pass.
const savedMethods = METHODS.map((m) => [m, console[m]] as const);
const restoreMethods = (): void => {
  for (const [m, fn] of savedMethods) console[m] = fn;
};

try {
  // ── a/b) dead-pipe and generic sync throws are swallowed ──────────
  for (const [label, make] of [
    ['epipe', epipe],
    ['generic', generic],
  ] as const) {
    stubWrites(make);
    try {
      for (const m of METHODS) {
        let threw: unknown = null;
        try {
          console[m](`console-guard-smoke ${label} ${m}`);
        } catch (e) {
          threw = e;
        }
        if (consoleViaStream) {
          record(threw === null, `${label}: console.${m} swallows a sync stream throw`, threw);
        } else {
          // The stub was never reached, so "no throw" proves nothing.
          skip(`${label}: console.${m} swallows a sync stream throw (console bypasses process.stdout.write)`);
        }
      }
    } finally {
      restoreWrites();
    }
  }

  // ── c) the wrapper itself carries the try/catch ────────────────────
  // Independent of how the runtime's console reaches the stream: give
  // each method a body that throws synchronously, re-install, and the
  // guarded call must both swallow and still invoke the inner function.
  {
    let hits = 0;
    for (const m of METHODS) {
      console[m] = (() => {
        hits++;
        throw epipe();
      }) as unknown as Console[Method];
    }
    try {
      installConsoleGuard();
      for (const m of METHODS) {
        let threw: unknown = null;
        try {
          console[m]('x');
        } catch (e) {
          threw = e;
        }
        record(threw === null, `wrap: console.${m} guards a throwing inner function`, threw);
      }
      record(
        hits === METHODS.length,
        'wrap: guarded methods still invoke the original',
        hits,
      );
    } finally {
      restoreMethods();
    }
  }

  // ── d) passthrough: a working stream still receives the output ────
  {
    const MARKER = 'console-guard-smoke-passthrough';
    let captured = '';
    process.stdout.write = ((chunk: unknown) => {
      captured += String(chunk);
      return true;
    }) as unknown as Write;
    try {
      console.log(MARKER);
    } finally {
      restoreWrites();
    }
    if (consoleViaStream) {
      record(captured.includes(MARKER), 'passthrough: guarded console.log still writes', captured);
    } else {
      skip('passthrough: guarded console.log still writes (console bypasses process.stdout.write)');
    }
  }
} finally {
  restoreWrites();
  restoreMethods();
}

let pass = 0;
let fail = 0;
let skipped = 0;
for (const r of results) {
  if (r.state === 'skip') {
    skipped++;
    console.log(`SKIP ${r.name}`);
  } else if (r.state === 'pass') {
    pass++;
    console.log(`PASS ${r.name}`);
  } else {
    fail++;
    console.log(`FAIL ${r.name}${r.extra !== undefined ? ` :: ${JSON.stringify(r.extra)}` : ''}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`);
process.exit(fail > 0 ? 1 : 0);
