/**
 * Preload bridge for the SuperJargon launcher. The orchestrator exposes the app
 * group as `window.jargon.openSuperJargon`, and the renderer only ever calls
 * it from the Teaching guide button.
 */
import type { SuperJargonResult } from "@jargon/contracts/ipc";
import { decodeRecord, requiredBoolean } from "@jargon/contracts/ipc-decoding";
import { isBoolean, isString } from "@jargon/contracts/runtime-values";

export function decodeSuperJargonResult(value: unknown): SuperJargonResult {
  const result = decodeRecord(value, "SuperJargon result");
  const { error, alreadyRunning } = result;
  if (error !== undefined && !isString(error)) throw new Error("Invalid SuperJargon error.");
  if (alreadyRunning !== undefined && !isBoolean(alreadyRunning)) {
    throw new Error("Invalid SuperJargon running state.");
  }
  return {
    ok: requiredBoolean(result, "ok"),
    ...(error === undefined ? {} : { error }),
    ...(alreadyRunning === undefined ? {} : { alreadyRunning }),
  };
}
