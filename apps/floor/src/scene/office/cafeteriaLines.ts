// Break-room small talk for the Office floor.
//
// Two kinds of line:
//   solo  - one quip above a single agent at a break spot
//   pair  - a short exchange between two agents at the same table
//
// Lines are short so they fit the thought bubble. The reference project (MIT) wrote lines for its TV-show
// cast; this floor has a generic cast (boss, workers), so these lines are about plain office life.

import type { OfficeCharacterName } from "./cast";

/** Where an agent is lingering. This picks a pool of lines. */
export type BreakSpot = "coffee" | "vending" | "snack" | "table";

const pick = <T>(arr: readonly T[], seed: number): T => arr[((seed % arr.length) + arr.length) % arr.length];

// ─── solo lines, by spot ─────────────────────────────────────────────────────

const COFFEE: readonly string[] = [
  "is this decaf? who did this",
  "we are out of beans again",
  "first cup of the day. and the fifth.",
  "the coffee here is basically a hug",
  "who took my mug?",
  "brewing. please hold.",
];

const VENDING: readonly string[] = [
  "the machine ate my dollar",
  "B4, please be the pretzels",
  "it is stuck. classic.",
  "shaking it. gently. respectfully.",
  "one emotional-support snack",
  "A1 again. living dangerously.",
];

const SNACK: readonly string[] = [
  "who finished the chips?",
  "just a little treat",
  "second breakfast",
  "these are for everyone, right?",
  "a snack before the next task",
];

const TABLE: readonly string[] = [
  "big day. lots of meetings.",
  "just five more minutes",
  "did you see the standup notes?",
  "pretending to read my notes",
  "I needed this break, honestly",
  "do not tell the boss I am in here",
];

const SPOT_POOL: Record<BreakSpot, readonly string[]> = {
  coffee: COFFEE,
  vending: VENDING,
  snack: SNACK,
  table: TABLE,
};

// ─── character flavour, used now and then instead of the spot pool ───────────

const BY_CHARACTER: Partial<Record<OfficeCharacterName, readonly string[]>> = {
  boss: [
    "no meetings before coffee. that is the rule.",
    "who is running the floor? me. from here.",
    "great work, everyone. keep going.",
  ],
  worker_1: ["one more commit, then lunch", "tests are green. suspicious."],
  worker_2: ["I have a plan for that bug", "sketching the next screen"],
  worker_3: ["my desk plant needs water", "quiet focus time, please"],
  worker_4: ["did you hear the news?", "sharing notes with the team"],
  worker_5: ["the numbers look good today", "checking the budget. again."],
  worker_6: ["who has the meeting room at three?", "reviewing the backlog"],
};

/** A solo break-room line. Character flavour about 60% of the time, else a line for the spot. */
export function pickSoloLine(character: OfficeCharacterName, spot: BreakSpot, seed: number): string {
  const flavour = BY_CHARACTER[character];
  if (flavour && seed % 5 < 3) return pick(flavour, Math.floor(seed / 5));
  return pick(SPOT_POOL[spot], seed);
}

// ─── paired exchanges (two agents at one table) ──────────────────────────────
//
// Beats alternate between the two agents: beat 0 is the one who sat down, beat 1 the table-mate, beat 2
// the first again, and so on. The floor plays them one beat at a time.

type Exchange = readonly string[];

const EXCHANGES: readonly Exchange[] = [
  ["standup ran 40 minutes.", "could have been an email."],
  ["is the build green yet?", "do not look."],
  ["who reply-all-ed everyone?", "we do not talk about it."],
  ["what do we sell again?", "paper.", "sure, yes."],
  ["did you read the spec?", "the first page.", "that is the page that matters."],
  ["I found the bug.", "where was it?", "in my own code.", "classic."],
  ["lunch plans?", "the usual.", "the usual it is."],
  ["how is the project going?", "it is going.", "that is the best word for it."],
  ["coffee is better today.", "someone cleaned the machine.", "a hero."],
  ["I have a meeting at three.", "about what?", "about the meeting at four."],
  ["nice chair.", "it squeaks.", "it squeaks nicely."],
  ["can you review my notes?", "sure, send them over.", "sent. be gentle."],
  ["the printer is jammed.", "again?", "it is a long-term relationship."],
  ["quiet today.", "too quiet.", "enjoy it."],
  ["should we reorganize the board?", "next week.", "you said that last week."],
  ["I have a great idea.", "does it involve a meeting?", "it involves two."],
];

const KEYED_EXCHANGES: Partial<Record<OfficeCharacterName, Exchange>> = {
  boss: ["status check, team.", "all green, boss.", "excellent. carry on."],
  worker_1: ["quick question.", "yes?", "never mind, found it."],
  worker_4: ["okay, do not panic, but", "I am already panicking."],
};

/** A multi-beat exchange for two agents sharing a table. Index 0 is `speaker`, 1 the table-mate, and so on. */
export function pickExchange(speaker: OfficeCharacterName, seed: number): Exchange {
  const keyed = KEYED_EXCHANGES[speaker];
  if (keyed && seed % 4 === 0) return keyed;
  return pick(EXCHANGES, seed);
}
