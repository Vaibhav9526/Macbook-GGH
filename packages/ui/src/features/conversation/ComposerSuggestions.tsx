import { For, Show } from "solid-js";
import { useText } from "../../text";
import { type ComposerSuggestionItem, composerSuggestionName } from "./composer-suggestions";

interface ComposerSuggestionsProps {
  items: readonly ComposerSuggestionItem[];
  activeIndex: number;
  /** Where the popup's bottom edge sits, measured from the composer's top edge. */
  bottom: number;
  onHover: (index: number) => void;
  onPick: (item: ComposerSuggestionItem) => void;
}

/**
 * The list above the composer for `@` and `/`. The composer owns the keys and the caret; this only
 * shows the rows, with the active one marked, and reports a hover or a click.
 */
export function ComposerSuggestions(props: ComposerSuggestionsProps) {
  const { t } = useText();

  function description(item: ComposerSuggestionItem): string | undefined {
    if (item.kind === "command") return t(item.command.descriptionKey);
    // A short line only: the role title, or the first sentence of the description, never the whole prompt.
    const title = item.agent.title.trim();
    if (title) return title;
    const firstSentence = item.agent.description.trim().split(/(?<=[.!?])\s/)[0] ?? "";
    return firstSentence.length > 70 ? firstSentence.slice(0, 67) + "..." : firstSentence || undefined;
  }

  return (
    <div
      class="mention-picker composer-suggestions"
      role="listbox"
      aria-label={t("app.composer.suggest.label")}
      style={{
        "--mention-picker-bottom": `${props.bottom}px`,
        "--mention-picker-rows": props.items.length,
      }}
    >
      <For each={props.items}>
        {(item, index) => (
          <button
            type="button"
            role="option"
            aria-selected={index() === props.activeIndex ? "true" : "false"}
            class={["mention-picker-option", { "mention-picker-option-active": index() === props.activeIndex }]}
            onPointerDown={(event) => {
              // Keep the editor's focus and caret, as the mention picker does.
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseEnter={() => props.onHover(index())}
            onClick={() => props.onPick(item)}
          >
            <strong>{composerSuggestionName(item)}</strong>
            <Show when={description(item)}>{(text) => <span class="mention-picker-description">{text()}</span>}</Show>
          </button>
        )}
      </For>
    </div>
  );
}
