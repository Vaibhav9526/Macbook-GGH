/**
 * Per-turn stage timing for the voice → action path. Electron-free so a
 * smoke can drive it. Records named marks per turnId and logs ONE summary
 * line when the turn finishes — durations only, never transcripts,
 * screenshots, or keys.
 *
 * First mark of a name wins: streamed TTS fires "tts-request-start" once
 * per sentence, but only the first one says how long the user waited.
 */

export type TurnMarkName =
  | 'speech-end'
  | 'transcript-ready'
  | 'capture-done'
  | 'first-model-chunk'
  | 'reply-complete'
  | 'tts-request-start'
  | 'tts-first-audio'
  | 'playback-start';

const ORDER: TurnMarkName[] = [
  'speech-end',
  'transcript-ready',
  'capture-done',
  'first-model-chunk',
  'reply-complete',
  'tts-request-start',
  'tts-first-audio',
  'playback-start',
];

// A turn that never reaches finishTurn (agent route, dictation, early
// return) must not leak: only the newest few records are kept.
const MAX_TRACKED = 4;

const turns = new Map<number, Partial<Record<TurnMarkName, number>>>();

export function markTurn(turnId: number, name: TurnMarkName, now: number = Date.now()): void {
  let rec = turns.get(turnId);
  if (!rec) {
    rec = {};
    turns.set(turnId, rec);
    while (turns.size > MAX_TRACKED) {
      const oldest = turns.keys().next().value as number;
      turns.delete(oldest);
    }
  }
  if (rec[name] === undefined) rec[name] = now;
}

/** Format the summary without logging or discarding (used by the smoke). */
export function summarizeTurn(turnId: number): string | null {
  const rec = turns.get(turnId);
  if (!rec) return null;
  // Offsets are measured from the earliest mark we have: speech-end for
  // voice turns, the first later stage for typed ones.
  const marks = ORDER.filter((n) => rec[n] !== undefined);
  if (marks.length === 0) return null;
  const t0 = rec[marks[0]] as number;
  const parts = marks.map((n) => `${n}=+${(rec[n] as number) - t0}ms`);
  const last = rec[marks[marks.length - 1]] as number;
  return `[SuperJargon] turn ${turnId} timing: ${parts.join(' ')} total=${last - t0}ms`;
}

/** Log the one summary line for the turn and forget it. */
export function finishTurn(turnId: number): void {
  const line = summarizeTurn(turnId);
  turns.delete(turnId);
  if (line) console.log(line);
}

export function resetTurnTiming(): void {
  turns.clear();
}
