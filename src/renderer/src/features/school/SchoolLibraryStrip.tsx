import type { SchoolLibraryBook, SchoolLibraryFailureCode } from "@jargon/contracts/ipc";
import { Button, IconButton } from "@jargon/ui";
import { useText } from "@jargon/ui/text";
import { createEffect, createStore, For, Show } from "solid-js";
import { schoolActive } from "./school-workspace";

interface ShelfState {
  books: SchoolLibraryBook[];
  busy: boolean;
  error: string;
}

const FAILURE_KEY = {
  unsupported: "library.error.unsupported",
  tooLarge: "library.error.tooLarge",
  invalidDocx: "library.error.invalidDocx",
  noText: "library.error.noText",
  failed: "library.error.failed",
} as const satisfies Record<SchoolLibraryFailureCode, string>;

// The icons are inline SVG, as the School design asks, so the shelf needs no icon package.
const ICON_PROPS = {
  viewBox: "0 0 20 20",
  width: "16",
  height: "16",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.6",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "aria-hidden": "true",
} as const;

function BookIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M3 4.5c2.2-1 4.4-1 7 .6 2.6-1.6 4.8-1.6 7-.6v11c-2.2-1-4.4-1-7 .6-2.6-1.6-4.8-1.6-7-.6v-11Z" />
      <path d="M10 5.1v11" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M10 13V3.8" />
      <path d="m6.4 7.2 3.6-3.6 3.6 3.6" />
      <path d="M3.5 12.5v3.2c0 .6.5 1 1 1h11c.6 0 1-.5 1-1v-3.2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="m5.2 5.2 9.6 9.6" />
      <path d="m14.8 5.2-9.6 9.6" />
    </svg>
  );
}

/**
 * The Librarian's shelf, shown in the School sidebar. It lists the books the Librarian can answer from, with
 * the number of parts each one has. The user adds files with the file picker and removes a book with its x.
 * Main reads the files and keeps the shelf; this strip only shows what main answers.
 */
export function SchoolLibraryStrip() {
  const { t } = useText();
  const [state, setState] = createStore<ShelfState>({ books: [], busy: false, error: "" });

  async function loadShelf() {
    try {
      const books = await window.jargon.schoolLibrary.list();
      setState((draft) => {
        draft.books = books;
      });
    } catch {
      setState((draft) => {
        draft.error = t("library.error.load");
      });
    }
  }

  // The shelf is read each time the School workspace opens, so a book added in a chat shows here too.
  createEffect(
    () => schoolActive(),
    (active) => {
      if (active) void loadShelf();
    },
  );

  async function addFiles() {
    setState((draft) => {
      draft.busy = true;
      draft.error = "";
    });
    try {
      const result = await window.jargon.schoolLibrary.add();
      const failures = result.failed.map((item) => t(FAILURE_KEY[item.code], { file: item.file })).join(" ");
      setState((draft) => {
        draft.books = [...result.added, ...draft.books];
        draft.error = failures;
      });
    } catch {
      setState((draft) => {
        draft.error = t("library.error.load");
      });
    } finally {
      setState((draft) => {
        draft.busy = false;
      });
    }
  }

  async function removeBook(id: string) {
    setState((draft) => {
      draft.error = "";
    });
    try {
      if (await window.jargon.schoolLibrary.remove(id)) {
        setState((draft) => {
          draft.books = draft.books.filter((book) => book.id !== id);
        });
      }
    } catch {
      setState((draft) => {
        draft.error = t("library.error.load");
      });
    }
  }

  return (
    <Show when={schoolActive()}>
      <section
        class="school-library-strip"
        aria-label={t("library.shelf.label")}
        style={{
          margin: "8px",
          padding: "12px",
          display: "flex",
          "flex-direction": "column",
          gap: "8px",
          "border-radius": "12px",
          background: "var(--jargon-bg-sidebar)",
        }}
      >
        <strong style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <BookIcon />
          {t("library.title")}
          <span style={{ opacity: "0.7", "font-size": "12px", "font-weight": "normal" }}>
            {t("library.count", { count: state.books.length })}
          </span>
        </strong>
        <Show
          when={state.books.length > 0}
          fallback={<span style={{ opacity: "0.7", "font-size": "12px" }}>{t("library.empty")}</span>}
        >
          <ul style={{ margin: "0", padding: "0", "list-style": "none", "max-height": "160px", overflow: "auto" }}>
            <For each={state.books}>
              {(book) => (
                <li style={{ display: "flex", "align-items": "center", gap: "6px", padding: "2px 0" }}>
                  <span
                    style={{
                      flex: "1",
                      "min-width": "0",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                      "font-size": "13px",
                    }}
                    title={book.name}
                  >
                    {book.name}
                  </span>
                  <span style={{ opacity: "0.6", "font-size": "11px", "white-space": "nowrap" }}>
                    {t("library.chunks", { count: book.chunks })}
                  </span>
                  <IconButton
                    label={t("library.remove", { name: book.name })}
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => void removeBook(book.id)}
                  >
                    <CloseIcon />
                  </IconButton>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={state.error}>
          <span role="alert" style={{ "font-size": "12px", color: "var(--jargon-danger-text)" }}>
            {state.error}
          </span>
        </Show>
        <Button type="button" variant="outline" size="sm" disabled={state.busy} onClick={() => void addFiles()}>
          <UploadIcon />
          {state.busy ? t("library.adding") : t("library.add")}
        </Button>
      </section>
    </Show>
  );
}
