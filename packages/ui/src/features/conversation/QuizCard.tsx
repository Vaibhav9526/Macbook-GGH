// The School quiz card. Ported from IsCool (src/renderer/src/components/classroom/QuizCard.tsx): the same
// phases (loading, taking, grading, report) and the same grading data. It shows one question at a time with a
// progress bar, and ends with a summary: the score, the wrong answers, and the Teacher's weak topics.
// React became SolidJS, and the colours map to this app's tokens.
import type { SchoolQuizData, SchoolQuizGraded, SchoolQuizReport } from "@jargon/contracts/ipc";
import {
  BookOpen,
  Brain,
  Button,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  IconButton,
  Link,
  ListChecks,
  Minus,
  Progress,
  X,
  Zap,
} from "@jargon/ui";
import type { JSX } from "@solidjs/web";
import { createEffect, For, Show } from "solid-js";
import { QuizDiagram } from "./QuizDiagram";

export type QuizPhase = "loading" | "taking" | "grading" | "report";

export interface QuizResultView {
  graded: SchoolQuizGraded;
  report: SchoolQuizReport | null;
  /** Set when the score is real but the written analysis could not be produced. */
  analysisError?: string;
  /** The weak topics that this quiz saved, so the next quiz builds on them. */
  savedTopics: string[];
}

export interface QuizCardLabels {
  loading: string;
  title: (topic: string) => string;
  position: (current: number, total: number) => string;
  progress: string;
  close: string;
  back: string;
  next: string;
  unanswered: string;
  submit: string;
  grading: string;
  score: (correct: number, total: number, percent: number) => string;
  skipped: string;
  correctAnswer: string;
  yourAnswer: string;
  wrongTitle: string;
  allCorrect: string;
  diagram: (xLabel: string, yLabel: string) => string;
  focusTitle: string;
  focusNone: string;
  missed: (missed: number, of: number) => string;
  fix: string;
  strengths: string;
  learnMore: string;
  linksNote: string;
  onYoutube: string;
  savedTitle: string;
  savedNote: string;
  done: string;
  analysisError: string;
  jumpTo: (question: number) => string;
}

const LETTERS = ["A", "B", "C", "D"];

export function QuizCard(props: {
  phase: QuizPhase;
  quiz: SchoolQuizData | null;
  picks: Array<number | null>;
  /** The question on screen, from 0. */
  index: number;
  result: QuizResultView | null;
  error: string;
  onPick: (question: number, option: number) => void;
  onIndex: (question: number) => void;
  onSubmit: () => void;
  onClose: () => void;
  /** Opens a suggested resource in the browser. The search links are built in main. */
  onOpenLink?: (href: string) => void;
  labels: QuizCardLabels;
}) {
  const reviewing = () => props.phase === "report" && props.result !== null;
  let body: HTMLDivElement | undefined;
  // A new question, or the summary, starts at the top of the scrolling body.
  createEffect(
    () => [props.index, reviewing()],
    () => {
      if (body) body.scrollTop = 0;
    },
  );
  const locked = () => props.phase === "grading";

  return (
    <Show
      when={props.quiz}
      fallback={
        <div class="quiz-card quiz-card-loading" role="status">
          <ListChecks class="quiz-card-glyph" aria-hidden="true" />
          <span>{props.labels.loading}</span>
          <Progress class="quiz-card-progress" indeterminate aria-label={props.labels.loading} />
        </div>
      }
    >
      {(quizAccessor) => {
        const total = () => quizAccessor().questions.length;
        const answered = () => props.picks.filter((pick) => pick !== null).length;
        const last = () => props.index >= total() - 1;
        const question = () => quizAccessor().questions[props.index];
        const progress = () => (reviewing() ? 100 : ((props.index + 1) / Math.max(1, total())) * 100);
        return (
          <div class="quiz-card" data-quiz-phase={props.phase}>
            <header class="quiz-card-header">
              <strong class="quiz-card-title">
                <ListChecks class="quiz-card-glyph" aria-hidden="true" />
                {props.labels.title(quizAccessor().topic)}
              </strong>
              <Show when={!reviewing()}>
                <span class="quiz-card-count">{props.labels.position(props.index + 1, total())}</span>
              </Show>
              <IconButton variant="ghost" size="icon-sm" label={props.labels.close} onClick={() => props.onClose()}>
                <X aria-hidden="true" />
              </IconButton>
            </header>
            <Progress
              class="quiz-card-progress"
              value={props.phase === "grading" ? undefined : progress()}
              indeterminate={props.phase === "grading"}
              minValue={0}
              maxValue={100}
              aria-label={props.labels.progress}
            />

            <div class="quiz-card-body" ref={body}>
              <Show
                when={reviewing() ? props.result : null}
                fallback={
                  <Show when={question()}>
                    {(current) => (
                      <section class="quiz-question" aria-live="polite">
                        <h3 class="quiz-question-text">
                          {props.index + 1}. {current().q}
                        </h3>
                        <Show when={current().diagram}>
                          {(diagram) => (
                            <QuizDiagram
                              diagram={diagram()}
                              label={props.labels.diagram(diagram().xLabel, diagram().yLabel)}
                            />
                          )}
                        </Show>
                        <fieldset class="quiz-options" aria-label={current().q}>
                          <For each={current().options}>
                            {(option, optionIndex) => {
                              const picked = () => props.picks[props.index] === optionIndex();
                              return (
                                <button
                                  type="button"
                                  class="quiz-option"
                                  disabled={locked()}
                                  aria-pressed={picked() ? "true" : "false"}
                                  data-picked={picked() ? "true" : undefined}
                                  onClick={() => props.onPick(props.index, optionIndex())}
                                >
                                  <strong class="quiz-option-letter">{LETTERS[optionIndex()] ?? ""}</strong>
                                  <span class="quiz-option-text">{option}</span>
                                </button>
                              );
                            }}
                          </For>
                        </fieldset>
                      </section>
                    )}
                  </Show>
                }
              >
                {(resultAccessor) => (
                  <Summary
                    quiz={quizAccessor()}
                    picks={props.picks}
                    result={resultAccessor()}
                    labels={props.labels}
                    onOpenLink={props.onOpenLink}
                  />
                )}
              </Show>

              <Show when={props.error}>
                <p class="quiz-card-error" role="alert">
                  {props.error}
                </p>
              </Show>
            </div>

            <footer class="quiz-card-footer">
              <Show
                when={!reviewing()}
                fallback={
                  <Button variant="secondary" size="sm" onClick={() => props.onClose()}>
                    {props.labels.done}
                  </Button>
                }
              >
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={props.index === 0 || locked()}
                  onClick={() => props.onIndex(props.index - 1)}
                >
                  <ChevronLeft aria-hidden="true" />
                  {props.labels.back}
                </Button>
                <fieldset class="quiz-dots" aria-label={props.labels.progress}>
                  <For each={quizAccessor().questions}>
                    {(_, dotIndex) => (
                      <button
                        type="button"
                        class="quiz-dot"
                        disabled={locked()}
                        aria-label={props.labels.jumpTo(dotIndex() + 1)}
                        aria-current={dotIndex() === props.index ? "step" : undefined}
                        data-answered={
                          props.picks[dotIndex()] !== null && props.picks[dotIndex()] !== undefined ? "true" : undefined
                        }
                        onClick={() => props.onIndex(dotIndex())}
                      />
                    )}
                  </For>
                </fieldset>
                <Show
                  when={last()}
                  fallback={
                    <Button
                      variant="default"
                      size="sm"
                      disabled={locked()}
                      onClick={() => props.onIndex(props.index + 1)}
                    >
                      {props.labels.next}
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  }
                >
                  <Button
                    variant="default"
                    size="sm"
                    disabled={answered() === 0 || locked()}
                    loading={locked()}
                    loadingLabel={props.labels.grading}
                    onClick={() => props.onSubmit()}
                  >
                    {props.labels.submit}
                  </Button>
                </Show>
              </Show>
            </footer>
            <Show when={!reviewing() && last() && answered() > 0 && answered() < total()}>
              <p class="quiz-card-hint">{props.labels.unanswered}</p>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}

/** The end of the quiz: the score, the wrong answers with the right one, and the Teacher's weak topics. */
function Summary(props: {
  quiz: SchoolQuizData;
  picks: Array<number | null>;
  result: QuizResultView;
  labels: QuizCardLabels;
  onOpenLink?: ((href: string) => void) | undefined;
}) {
  const wrong = () =>
    props.result.graded.items.flatMap((item) => {
      const question = props.quiz.questions[item.index];
      return item.right || !question
        ? []
        : [{ number: item.index + 1, question, picked: props.picks[item.index] ?? null }];
    });
  const tone = (): "good" | "fair" | "poor" =>
    props.result.graded.percent >= 70 ? "good" : props.result.graded.percent >= 40 ? "fair" : "poor";
  const weakPoints = () => props.result.report?.weakPoints ?? [];
  const resources = () => props.result.report?.resources;

  return (
    <div class="quiz-summary">
      <div class="quiz-score" data-tone={tone()}>
        <div class="quiz-score-value">
          {props.labels.score(props.result.graded.correct, props.result.graded.total, props.result.graded.percent)}
        </div>
        <Show when={props.result.report?.summary}>
          <p class="quiz-score-note">{props.result.report?.summary}</p>
        </Show>
      </div>

      <Show when={props.result.analysisError}>
        <p class="quiz-card-error" role="alert">
          {props.labels.analysisError}
        </p>
      </Show>

      <section class="quiz-section">
        <h4 class="quiz-section-title">
          <X aria-hidden="true" />
          {props.labels.wrongTitle}
        </h4>
        <Show when={wrong().length > 0} fallback={<p class="quiz-section-empty">{props.labels.allCorrect}</p>}>
          <For each={wrong()}>
            {(entry) => (
              <article class="quiz-wrong">
                <p class="quiz-wrong-question">
                  {entry.number}. {entry.question.q}
                </p>
                <Show when={entry.question.diagram}>
                  {(diagram) => (
                    <QuizDiagram diagram={diagram()} label={props.labels.diagram(diagram().xLabel, diagram().yLabel)} />
                  )}
                </Show>
                <p class="quiz-wrong-line" data-kind="yours">
                  <span class="quiz-wrong-icon">
                    {entry.picked === null ? <Minus aria-hidden="true" /> : <X aria-hidden="true" />}
                  </span>
                  <span class="quiz-wrong-label">{props.labels.yourAnswer}:</span>{" "}
                  {entry.picked === null
                    ? props.labels.skipped
                    : `${LETTERS[entry.picked] ?? ""}. ${entry.question.options[entry.picked] ?? ""}`}
                </p>
                <p class="quiz-wrong-line" data-kind="right">
                  <span class="quiz-wrong-icon">
                    <Check aria-hidden="true" />
                  </span>
                  <span class="quiz-wrong-label">{props.labels.correctAnswer}:</span>{" "}
                  {LETTERS[entry.question.answer] ?? ""}. {entry.question.options[entry.question.answer]}
                </p>
                <p class="quiz-wrong-explanation">{entry.question.explanation}</p>
              </article>
            )}
          </For>
        </Show>
      </section>

      <section class="quiz-section">
        <h4 class="quiz-section-title">
          <Brain aria-hidden="true" />
          {props.labels.focusTitle}
        </h4>
        <For each={weakPoints()}>
          {(weak) => (
            <article class="quiz-weak">
              <strong>{weak.concept}</strong>
              <p>{weak.why}</p>
              <p>
                <em>{props.labels.fix}:</em> {weak.tip}
              </p>
            </article>
          )}
        </For>
        <Show
          when={props.result.graded.weakConcepts.length > 0}
          fallback={
            <Show when={weakPoints().length === 0}>
              <p class="quiz-section-empty">{props.labels.focusNone}</p>
            </Show>
          }
        >
          <ul class="quiz-focus-list">
            <For each={props.result.graded.weakConcepts}>
              {(item) => (
                <li>
                  {item.concept} — {props.labels.missed(item.missed, item.of)}
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.result.savedTopics.length > 0}>
          <div class="quiz-saved">
            <strong>{props.labels.savedTitle}</strong>
            <div class="quiz-saved-chips">
              <For each={props.result.savedTopics}>{(topic) => <span class="quiz-chip">{topic}</span>}</For>
            </div>
            <p>{props.labels.savedNote}</p>
          </div>
        </Show>
      </section>

      <Show when={(props.result.report?.strengths.length ?? 0) > 0}>
        <p class="quiz-strengths">
          <Zap aria-hidden="true" />
          <strong>{props.labels.strengths}:</strong> {props.result.report?.strengths.join(" · ")}
        </p>
      </Show>

      <Show when={hasResources(props.result.report)}>
        <section class="quiz-section">
          <h4 class="quiz-section-title">
            <BookOpen aria-hidden="true" />
            {props.labels.learnMore}
          </h4>
          <div class="quiz-resources">
            <For each={resources()?.youtube ?? []}>
              {(video) => (
                <ResourceButton href={video.url} onOpen={props.onOpenLink}>
                  <strong>{video.channel}</strong> {props.labels.onYoutube}
                  {video.why ? ` — ${video.why}` : ""}
                </ResourceButton>
              )}
            </For>
            <For each={resources()?.books ?? []}>
              {(book) => (
                <ResourceButton href={book.url} onOpen={props.onOpenLink}>
                  <strong>{book.title}</strong>
                  {book.author ? ` — ${book.author}` : ""}
                  {book.why ? ` · ${book.why}` : ""}
                </ResourceButton>
              )}
            </For>
            <For each={resources()?.other ?? []}>
              {(other) => (
                <ResourceButton href={other.url} onOpen={props.onOpenLink}>
                  <Link aria-hidden="true" /> <strong>{other.name}</strong>
                  {other.why ? ` — ${other.why}` : ""}
                </ResourceButton>
              )}
            </For>
          </div>
          <p class="quiz-section-empty">{props.labels.linksNote}</p>
        </section>
      </Show>
    </div>
  );
}

function hasResources(report: SchoolQuizReport | null | undefined): boolean {
  if (!report) return false;
  return report.resources.youtube.length > 0 || report.resources.books.length > 0 || report.resources.other.length > 0;
}

/** A search link. Clicking it opens the browser, as IsCool's LinkButton does. */
function ResourceButton(props: { href: string; onOpen?: ((href: string) => void) | undefined; children: JSX.Element }) {
  return (
    <button type="button" class="quiz-resource" onClick={() => props.onOpen?.(props.href)}>
      <span>{props.children}</span>
      <ExternalLink aria-hidden="true" />
    </button>
  );
}
