// The School quiz card. Ported from IsCool (src/renderer/src/components/classroom/QuizCard.tsx): the same
// phases (loading, taking, grading, report), the same grading view and the same sections. React became SolidJS,
// and the colours map to this app's tokens.
import type { SchoolQuizData, SchoolQuizGraded, SchoolQuizReport } from "@jargon/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

export type QuizPhase = "loading" | "taking" | "grading" | "report";

export interface QuizResultView {
  graded: SchoolQuizGraded;
  report: SchoolQuizReport | null;
  /** Set when the score is real but the written analysis could not be produced. */
  analysisError?: string;
}

export interface QuizCardLabels {
  loading: string;
  title: (topic: string) => string;
  answered: (answered: number, total: number) => string;
  close: string;
  unanswered: string;
  submit: string;
  grading: string;
  score: (correct: number, total: number, percent: number) => string;
  right: string;
  wrong: string;
  skipped: string;
  correctAnswer: string;
  yourAnswer: string;
  focusTitle: string;
  focusNone: string;
  missed: (missed: number, of: number) => string;
  advice: string;
  weakPoints: string;
  fix: string;
  strengths: string;
  learnMore: string;
  linksNote: string;
  onYoutube: string;
  done: string;
  analysisError: string;
}

const LETTERS = ["A", "B", "C", "D"];

const CARD: JSX.CSSProperties = {
  padding: "14px",
  "border-radius": "14px",
  background: "var(--jargon-bg-surface)",
  border: "1px solid var(--jargon-border)",
  color: "var(--jargon-text-primary)",
  display: "flex",
  "flex-direction": "column",
  gap: "12px",
};

// Icon paths, drawn for this card (16 x 16 grid, stroke only).
const ICON = {
  check: "M3 8.5 6.5 12 13 4.5",
  cross: "M4 4l8 8M12 4l-8 8",
  skip: "M3 8h10",
  target: "M8 2.5 13.5 8 8 13.5 2.5 8z",
  bolt: "M9 1 3 9h4l-1 6 6-8H8z",
  books: "M3 2h4v12H3zM9 2h4v12H9z",
  book: "M3 3h9v10H3z",
  link: "M6.5 9.5 9.5 6.5M5 8 3.5 9.5a2.5 2.5 0 0 0 3.5 3.5L8.5 11.5M11 8l1.5-1.5A2.5 2.5 0 0 0 9 3L7.5 4.5",
  quiz: "M3 3h10v10H3zM6 6h4M6 9h4",
} as const;

function Glyph(props: { d: string; size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={props.size ?? 14}
      height={props.size ?? 14}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      <path d={props.d} />
    </svg>
  );
}

export function QuizCard(props: {
  phase: QuizPhase;
  quiz: SchoolQuizData | null;
  picks: Array<number | null>;
  result: QuizResultView | null;
  error: string;
  onPick: (question: number, option: number) => void;
  onSubmit: () => void;
  onClose: () => void;
  /** Opens a suggested resource in the browser. The search links are built in main. */
  onOpenLink?: (href: string) => void;
  labels: QuizCardLabels;
}) {
  const answered = () => props.picks.filter((pick) => pick !== null).length;
  const reviewing = () => props.phase === "report" && props.result !== null;
  const locked = () => reviewing() || props.phase === "grading";

  return (
    <Show
      when={props.quiz}
      fallback={
        <div style={{ ...CARD, "flex-direction": "row", "align-items": "center", gap: "8px" }}>
          <Glyph d={ICON.quiz} size={18} /> {props.labels.loading}
        </div>
      }
    >
      {(quizAccessor) => (
        <div style={CARD} data-quiz-phase={props.phase}>
          <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
            <strong style={{ "font-size": "15px", display: "inline-flex", "align-items": "center", gap: "6px" }}>
              <Glyph d={ICON.quiz} size={18} /> {props.labels.title(quizAccessor().topic)}
            </strong>
            <span style={{ flex: "1" }} />
            <Show when={!reviewing()}>
              <span style={{ "font-size": "12px", color: "var(--jargon-text-muted)" }}>
                {props.labels.answered(answered(), quizAccessor().questions.length)}
              </span>
            </Show>
            <button
              type="button"
              onClick={() => props.onClose()}
              aria-label={props.labels.close}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--jargon-text-muted)",
                "font-size": "16px",
              }}
            >
              ×
            </button>
          </div>

          <Show when={reviewing() ? props.result : null}>
            {(resultAccessor) => {
              const tone = () =>
                resultAccessor().graded.percent >= 70
                  ? "var(--jargon-success-soft)"
                  : resultAccessor().graded.percent >= 40
                    ? "var(--jargon-bg-control)"
                    : "var(--jargon-danger-soft)";
              return (
                <div style={{ padding: "12px", "border-radius": "12px", background: tone() }}>
                  <div style={{ "font-size": "22px", "font-weight": "800" }}>
                    {props.labels.score(
                      resultAccessor().graded.correct,
                      resultAccessor().graded.total,
                      resultAccessor().graded.percent,
                    )}
                  </div>
                  <Show when={resultAccessor().report?.summary}>
                    <div style={{ "font-size": "14px", "margin-top": "4px", "line-height": "20px" }}>
                      {resultAccessor().report?.summary}
                    </div>
                  </Show>
                </div>
              );
            }}
          </Show>

          <For each={quizAccessor().questions}>
            {(question, questionIndex) => {
              const picked = () => props.picks[questionIndex()] ?? null;
              return (
                <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                  <div style={{ "font-size": "14px", "font-weight": "700", "line-height": "20px" }}>
                    {questionIndex() + 1}. {question.q}
                  </div>
                  <For each={question.options}>
                    {(option, optionIndex) => {
                      const isPicked = () => picked() === optionIndex();
                      const isRight = () => reviewing() && optionIndex() === question.answer;
                      const isWrongPick = () => reviewing() && isPicked() && optionIndex() !== question.answer;
                      return (
                        <button
                          type="button"
                          disabled={locked()}
                          onClick={() => props.onPick(questionIndex(), optionIndex())}
                          aria-pressed={isPicked() ? "true" : "false"}
                          style={{
                            display: "flex",
                            gap: "10px",
                            "align-items": "baseline",
                            "text-align": "left",
                            border: "none",
                            cursor: locked() ? "default" : "pointer",
                            padding: "7px 10px",
                            "border-radius": "10px",
                            "font-size": "14px",
                            "line-height": "19px",
                            color: "var(--jargon-text-primary)",
                            background: isRight()
                              ? "var(--jargon-success-soft)"
                              : isWrongPick()
                                ? "var(--jargon-danger-soft)"
                                : isPicked()
                                  ? "var(--jargon-accent-soft)"
                                  : "var(--jargon-bg-control)",
                            "box-shadow": `inset 0 0 0 ${isPicked() || isRight() ? 2 : 1}px ${
                              isRight()
                                ? "var(--jargon-success)"
                                : isWrongPick()
                                  ? "var(--jargon-danger)"
                                  : isPicked()
                                    ? "var(--jargon-accent)"
                                    : "var(--jargon-border)"
                            }`,
                          }}
                        >
                          <strong>{LETTERS[optionIndex()] ?? ""}</strong>
                          <span style={{ flex: "1" }}>{option}</span>
                          <Show when={isRight()}>
                            <Glyph d={ICON.check} size={16} label={props.labels.correctAnswer} />
                          </Show>
                          <Show when={isWrongPick()}>
                            <Glyph d={ICON.cross} size={16} label={props.labels.yourAnswer} />
                          </Show>
                        </button>
                      );
                    }}
                  </For>
                  <Show when={reviewing() ? props.result : null}>
                    {(resultAccessor) => {
                      const item = () => resultAccessor().graded.items[questionIndex()];
                      return (
                        <div
                          style={{
                            "font-size": "13px",
                            "line-height": "19px",
                            color: "var(--jargon-text-secondary)",
                            padding: "2px 4px",
                          }}
                        >
                          {item()?.right ? (
                            <Glyph d={ICON.check} />
                          ) : picked() === null ? (
                            <Glyph d={ICON.skip} />
                          ) : (
                            <Glyph d={ICON.cross} />
                          )}{" "}
                          {item()?.right
                            ? props.labels.right
                            : picked() === null
                              ? props.labels.skipped
                              : props.labels.wrong}{" "}
                          {question.explanation}
                        </div>
                      );
                    }}
                  </Show>
                </div>
              );
            }}
          </For>

          <Show when={!reviewing()}>
            <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
              <button
                type="button"
                onClick={() => props.onSubmit()}
                disabled={answered() === 0 || props.phase === "grading"}
                style={{
                  border: "none",
                  cursor: answered() === 0 || props.phase === "grading" ? "default" : "pointer",
                  padding: "8px 16px",
                  "border-radius": "10px",
                  "font-size": "14px",
                  "font-weight": "600",
                  background:
                    answered() === 0 || props.phase === "grading" ? "var(--jargon-bg-control)" : "var(--jargon-accent)",
                  color:
                    answered() === 0 || props.phase === "grading"
                      ? "var(--jargon-text-muted)"
                      : "var(--jargon-accent-text)",
                }}
              >
                {props.phase === "grading" ? props.labels.grading : props.labels.submit}
              </button>
              <Show when={answered() > 0 && answered() < quizAccessor().questions.length && props.phase !== "grading"}>
                <span style={{ "font-size": "12px", color: "var(--jargon-text-muted)" }}>
                  {props.labels.unanswered}
                </span>
              </Show>
            </div>
          </Show>

          <Show when={props.error}>
            <div role="alert" style={{ "font-size": "12px", color: "var(--jargon-danger-text)" }}>
              {props.error}
            </div>
          </Show>

          <Show when={reviewing() ? props.result : null}>
            {(resultAccessor) => (
              <>
                <Show when={resultAccessor().analysisError}>
                  <div role="alert" style={{ "font-size": "13px", color: "var(--jargon-danger-text)" }}>
                    {props.labels.analysisError}
                  </div>
                </Show>

                <Show when={(resultAccessor().report?.weakPoints.length ?? 0) > 0}>
                  <div>
                    <div
                      style={{
                        "font-size": "14px",
                        "font-weight": "800",
                        "margin-bottom": "6px",
                        display: "flex",
                        "align-items": "center",
                        gap: "6px",
                      }}
                    >
                      <Glyph d={ICON.target} size={18} /> {props.labels.weakPoints}
                    </div>
                    <For each={resultAccessor().report?.weakPoints ?? []}>
                      {(weak) => (
                        <div
                          style={{
                            padding: "8px 10px",
                            "border-radius": "10px",
                            background: "var(--jargon-danger-soft)",
                            "margin-bottom": "6px",
                            "font-size": "13px",
                            "line-height": "19px",
                          }}
                        >
                          <strong>{weak.concept}</strong>
                          <div>{weak.why}</div>
                          <div style={{ "margin-top": "2px" }}>
                            <em>{props.labels.fix}:</em> {weak.tip}
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={(resultAccessor().report?.strengths.length ?? 0) > 0}>
                  <div style={{ "font-size": "13px", "line-height": "19px" }}>
                    <strong>
                      <Glyph d={ICON.bolt} /> {props.labels.strengths}:
                    </strong>{" "}
                    {resultAccessor().report?.strengths.join(" · ")}
                  </div>
                </Show>

                <Show when={hasResources(resultAccessor().report)}>
                  <div>
                    <div
                      style={{
                        "font-size": "14px",
                        "font-weight": "800",
                        "margin-bottom": "6px",
                        display: "flex",
                        "align-items": "center",
                        gap: "6px",
                      }}
                    >
                      <Glyph d={ICON.books} size={18} /> {props.labels.learnMore}
                    </div>
                    <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
                      <For each={resultAccessor().report?.resources.youtube ?? []}>
                        {(video) => (
                          <ResourceButton href={video.url} onOpen={props.onOpenLink}>
                            ▶ <strong>{video.channel}</strong> {props.labels.onYoutube}
                            {video.why ? ` — ${video.why}` : ""}
                          </ResourceButton>
                        )}
                      </For>
                      <For each={resultAccessor().report?.resources.books ?? []}>
                        {(book) => (
                          <ResourceButton href={book.url} onOpen={props.onOpenLink}>
                            <Glyph d={ICON.book} /> <strong>{book.title}</strong>
                            {book.author ? ` — ${book.author}` : ""}
                            {book.why ? ` · ${book.why}` : ""}
                          </ResourceButton>
                        )}
                      </For>
                      <For each={resultAccessor().report?.resources.other ?? []}>
                        {(other) => (
                          <ResourceButton href={other.url} onOpen={props.onOpenLink}>
                            <Glyph d={ICON.link} /> <strong>{other.name}</strong>
                            {other.why ? ` — ${other.why}` : ""}
                          </ResourceButton>
                        )}
                      </For>
                    </div>
                    <div style={{ "font-size": "11px", color: "var(--jargon-text-muted)", "margin-top": "6px" }}>
                      {props.labels.linksNote}
                    </div>
                  </div>
                </Show>

                <FocusSection
                  focus={resultAccessor().graded.weakConcepts}
                  title={props.labels.focusTitle}
                  none={props.labels.focusNone}
                  missed={props.labels.missed}
                />

                <div>
                  <button
                    type="button"
                    onClick={() => props.onClose()}
                    style={{
                      border: "none",
                      cursor: "pointer",
                      padding: "7px 14px",
                      "border-radius": "10px",
                      background: "var(--jargon-bg-control)",
                      color: "var(--jargon-text-primary)",
                      "font-size": "13px",
                    }}
                  >
                    {props.labels.done}
                  </button>
                </div>
              </>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
}

function hasResources(report: SchoolQuizReport | null | undefined): boolean {
  if (!report) return false;
  return report.resources.youtube.length > 0 || report.resources.books.length > 0 || report.resources.other.length > 0;
}

/** What the student should practise next: the concepts they missed, most frequent first, and the teacher's advice. */
function FocusSection(props: {
  focus: SchoolQuizGraded["weakConcepts"];
  title: string;
  none: string;
  missed: (missed: number, of: number) => string;
}) {
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
      <strong>{props.title}</strong>
      <Show when={props.focus.length > 0} fallback={<p style={{ margin: "0", "font-size": "13px" }}>{props.none}</p>}>
        <For each={props.focus}>
          {(item) => (
            <p style={{ margin: "0", "font-size": "13px" }}>
              {item.concept} — {props.missed(item.missed, item.of)}
            </p>
          )}
        </For>
      </Show>
    </div>
  );
}

/** A search link. Clicking it opens the browser, as IsCool's LinkButton does. */
function ResourceButton(props: { href: string; onOpen?: (href: string) => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      onClick={() => props.onOpen?.(props.href)}
      style={{
        border: "none",
        cursor: "pointer",
        "text-align": "left",
        padding: "6px 10px",
        "border-radius": "10px",
        background: "var(--jargon-bg-control)",
        color: "var(--jargon-text-primary)",
        "font-size": "13px",
      }}
    >
      {props.children} <span aria-hidden="true">↗</span>
    </button>
  );
}
