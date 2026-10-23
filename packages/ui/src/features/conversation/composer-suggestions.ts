import type { AppTextKey } from "@jargon/i18n";
import type { ComposerAgent } from "../../data";

export type ComposerSuggestionTrigger = "@" | "/";

/** The text the composer reads after a trigger, up to the caret. */
export interface ComposerSuggestionContext {
  trigger: ComposerSuggestionTrigger;
  query: string;
  /** Offset of the trigger character. */
  start: number;
  /** Offset of the caret, which ends the query. */
  end: number;
}

/** A command the composer offers. `command` is the text the app reads, with its `@`. */
export interface ComposerCommandSuggestion {
  command: `@${string}`;
  descriptionKey: AppTextKey;
}

export type ComposerSuggestionItem =
  | { kind: "command"; command: ComposerCommandSuggestion }
  | { kind: "agent"; agent: ComposerAgent };

/** The School commands. The app has no other slash commands, so `/` offers these too. */
export const SCHOOL_COMMAND_SUGGESTIONS: readonly ComposerCommandSuggestion[] = [
  { command: "@memory-notes", descriptionKey: "app.composer.suggest.memoryNotes" },
  { command: "@teach-me", descriptionKey: "app.composer.suggest.teachMe" },
  { command: "@quiz", descriptionKey: "app.composer.suggest.quiz" },
  { command: "@plan", descriptionKey: "app.composer.suggest.plan" },
  { command: "@convert", descriptionKey: "app.composer.suggest.convert" },
  { command: "@compress", descriptionKey: "app.composer.suggest.compress" },
];

/*
 * A trigger starts a word: it is the first character or follows a space. The query stops at a
 * space, a second trigger, or the attachment placeholder the editor writes for a chip.
 */
const SUGGESTION_BEFORE_CARET = /(?:^|\s)([@/])([^\s@/￼]{0,40})$/u;

/** The trigger and query that the caret is in, or null when no trigger starts the current word. */
export function composerSuggestionAtCaret(beforeCaret: string): ComposerSuggestionContext | null {
  const match = beforeCaret.match(SUGGESTION_BEFORE_CARET);
  if (!match) return null;
  const query = match[2] ?? "";
  return {
    trigger: match[1] === "/" ? "/" : "@",
    query,
    start: beforeCaret.length - query.length - 1,
    end: beforeCaret.length,
  };
}

/**
 * The commands that match the query, then the agents when the trigger is `@`. A name that starts
 * with the query ranks above one that only contains it. `/` lists commands only.
 */
export function filterComposerSuggestions(
  context: ComposerSuggestionContext,
  commands: readonly ComposerCommandSuggestion[],
  agents: readonly ComposerAgent[],
): ComposerSuggestionItem[] {
  const query = context.query.toLocaleLowerCase();
  const rank = (name: string): number | null => {
    const lower = name.toLocaleLowerCase();
    if (!query || lower.startsWith(query)) return 0;
    return lower.includes(query) ? 1 : null;
  };
  const ranked: { rank: number; item: ComposerSuggestionItem }[] = [];
  for (const command of commands) {
    const commandRank = rank(command.command.slice(1));
    if (commandRank !== null) ranked.push({ rank: commandRank, item: { kind: "command", command } });
  }
  if (context.trigger === "@") {
    for (const agent of agents) {
      const agentRank = rank(agent.name);
      if (agentRank !== null) ranked.push({ rank: agentRank + 2, item: { kind: "agent", agent } });
    }
  }
  // Array sort is stable, so items of one rank keep the order they were listed in.
  ranked.sort((left, right) => left.rank - right.rank);
  return ranked.map(({ item }) => item);
}

/** The bold name of an item: the command text, or the agent as an `@` mention. */
export function composerSuggestionName(item: ComposerSuggestionItem): string {
  return item.kind === "command" ? item.command.command : `@${item.agent.name}`;
}
