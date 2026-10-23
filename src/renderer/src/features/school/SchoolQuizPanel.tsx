import { QuizCard, type QuizCardLabels } from "@jargon/ui/features/conversation/QuizCard";
import { useText } from "@jargon/ui/text";
import { Show } from "solid-js";
import { appPort } from "../../app-port";
import { useAgents } from "../agents/agents-context";
import {
  closeSchoolQuiz,
  pickSchoolQuizAnswer,
  schoolQuizOf,
  setSchoolQuizIndex,
  submitSchoolQuiz,
} from "./school-quiz-state";

/** The quiz card of the open Teacher chat, shown above the composer while a quiz is open there. */
export function SchoolQuizPanel() {
  const { t } = useText();
  const { activeAgent } = useAgents();
  const agentId = () => activeAgent()?.id ?? "";
  const labels = (): QuizCardLabels => ({
    loading: t("app.quiz.loading"),
    title: (topic) => t("app.quiz.title", { topic }),
    position: (current, total) => t("app.quiz.position", { current, total }),
    progress: t("app.quiz.progress"),
    close: t("app.quiz.close"),
    back: t("app.quiz.back"),
    next: t("app.quiz.next"),
    unanswered: t("app.quiz.unanswered"),
    submit: t("app.quiz.submit"),
    grading: t("app.quiz.grading"),
    score: (correct, total, percent) => t("app.quiz.score", { correct, total, percent }),
    skipped: t("app.quiz.skipped"),
    correctAnswer: t("app.quiz.correctAnswer"),
    yourAnswer: t("app.quiz.yourAnswer"),
    wrongTitle: t("app.quiz.wrongTitle"),
    allCorrect: t("app.quiz.allCorrect"),
    diagram: (x, y) => t("app.quiz.diagram", { x, y }),
    focusTitle: t("app.quiz.focusTitle"),
    focusNone: t("app.quiz.focusEmpty"),
    missed: (missed, of) => t("app.quiz.missed", { missed, of }),
    fix: t("app.quiz.fix"),
    strengths: t("app.quiz.strengths"),
    learnMore: t("app.quiz.learnMore"),
    linksNote: t("app.quiz.linksNote"),
    onYoutube: t("app.quiz.onYoutube"),
    savedTitle: t("app.quiz.savedTitle"),
    savedNote: t("app.quiz.savedNote"),
    done: t("app.quiz.done"),
    analysisError: t("app.school.quiz.analysisFailed"),
    jumpTo: (number) => t("app.quiz.jumpTo", { number }),
  });

  return (
    <Show when={agentId() ? schoolQuizOf(agentId()) : undefined}>
      {(state) => (
        <Show
          when={state().quiz || state().phase === "loading" || !state().error}
          fallback={
            <div role="alert" style={{ "font-size": "13px", color: "var(--jargon-danger-text)", padding: "8px 0" }}>
              {state().error}
            </div>
          }
        >
          <QuizCard
            phase={state().phase}
            quiz={state().quiz}
            picks={state().picks}
            index={state().index}
            result={state().result}
            error={state().error}
            labels={labels()}
            onPick={(question, option) => pickSchoolQuizAnswer(agentId(), question, option)}
            onIndex={(question) => setSchoolQuizIndex(agentId(), question)}
            onSubmit={() => void submitSchoolQuiz(agentId())}
            onClose={() => closeSchoolQuiz(agentId())}
            onOpenLink={(href) => void appPort().openUrl(href)}
          />
        </Show>
      )}
    </Show>
  );
}
