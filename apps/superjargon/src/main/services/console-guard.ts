/**
 * Console guard — the single boundary fix for dead-pipe crashes in main.
 *
 * The main process can outlive the stdout/stderr pipe it was spawned
 * with (a packaged app launched from a terminal that later closes, a
 * `bun run start` parent killed while Electron lives on). The next
 * console.* call then throws a synchronous `write EPIPE` out of the
 * stream — the crash that surfaced as "A JavaScript error occurred in
 * the main process" with a stack inside CompanionManager. Any console.*
 * call can hit it, so the fix lives here at the boundary rather than at
 * each call site: every wrapped method swallows a synchronous write
 * failure and otherwise behaves identically.
 *
 * Pure module, no Electron deps — it stays smoke-testable. A bare
 * import installs the guard (see bottom); index.ts wires that import.
 */

type GuardedConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const GUARDED_METHODS: readonly GuardedConsoleMethod[] = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
];

/**
 * Wraps the five console methods that write to stdout/stderr so a
 * synchronous stream-write throw — EPIPE or anything else — is
 * swallowed instead of escaping as an uncaught exception.
 *
 * Deliberately not guarded by an installed flag: re-wrapping just
 * nests another try/catch around the current method, so a second
 * install can neither un-guard a method nor double-fault it.
 */
export function installConsoleGuard(): void {
  for (const method of GUARDED_METHODS) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]): void => {
      try {
        original(...args);
      } catch {
        /* a dead pipe must not take the process down with it */
      }
    };
  }
}

installConsoleGuard();
