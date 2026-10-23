// The School quiz state, per Teacher chat. A quiz is started by `@quiz` (see composer-actions.ts), asked of main,
// answered by clicking, and graded in main. Ported from IsCool's classroom quiz state (ClassroomChat.tsx), kept in
// memory: a finished quiz is gone when the app restarts.

import type { SchoolQuizData } from "@jargon/contracts/ipc";
import type { QuizPhase, QuizResultView } from "@jargon/ui/features/conversation/QuizCard";
import { createSignal } from "solid-js";
import { recordQuizWeakTopics, weakTopicNames } from "./school-weak-topics";

export interface SchoolQuizState {
  phase: QuizPhase;
  quiz: SchoolQuizData | null;
  picks: Array<number | null>;
  /** The question on screen, from 0. */
  index: number;
  result: QuizResultView | null;
  error: string;
}

const [quizzes, setQuizzes] = createSignal<Record<string, SchoolQuizState | undefined>>({});

function update(agentId: string, patch: Partial<SchoolQuizState>): void {
  setQuizzes((current) => {
    const state = current[agentId];
    if (!state) return current;
    return { ...current, [agentId]: { ...state, ...patch } };
  });
}

function put(agentId: string, state: SchoolQuizState | undefined): void {
  setQuizzes((current) => ({ ...current, [agentId]: state }));
}

/** The quiz of one chat, or undefined when none is open there. */
export function schoolQuizOf(agentId: string): SchoolQuizState | undefined {
  return quizzes()[agentId];
}

export function closeSchoolQuiz(agentId: string): void {
  put(agentId, undefined);
}

export function pickSchoolQuizAnswer(agentId: string, question: number, option: number): void {
  const state = schoolQuizOf(agentId);
  if (state?.phase !== "taking") return;
  const picks = state.picks.map((value, index) => (index === question ? option : value));
  update(agentId, { picks });
}

/** Moves to another question of the open quiz. */
export function setSchoolQuizIndex(agentId: string, index: number): void {
  const state = schoolQuizOf(agentId);
  if (!state?.quiz || state.phase !== "taking") return;
  update(agentId, { index: Math.min(Math.max(0, index), state.quiz.questions.length - 1) });
}

/** Asks main for a quiz about the student's doubt. The chat context is sent too, so the quiz tests the chat. */
export async function startSchoolQuiz(
  agentId: string,
  input: { doubt: string; context: Array<{ role: "user" | "agent"; text: string }> },
): Promise<void> {
  if (schoolQuizOf(agentId)?.phase === "loading") return;
  put(agentId, { phase: "loading", quiz: null, picks: [], index: 0, result: null, error: "" });
  try {
    // The weak topics of earlier quizzes go with the request, so this quiz builds on them.
    const response = await window.jargon.schoolQuiz.start({ ...input, weakTopics: weakTopicNames() });
    if (response.ok) {
      put(agentId, {
        phase: "taking",
        quiz: response.quiz,
        picks: response.quiz.questions.map(() => null),
        index: 0,
        result: null,
        error: "",
      });
    } else {
      // No quiz: the card shows the reason in its place.
      put(agentId, { phase: "taking", quiz: null, picks: [], index: 0, result: null, error: response.error });
    }
  } catch (error) {
    put(agentId, {
      phase: "taking",
      quiz: null,
      picks: [],
      index: 0,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Sends the answers to main, which grades them and asks for the analysis. */
export async function submitSchoolQuiz(agentId: string): Promise<void> {
  const state = schoolQuizOf(agentId);
  if (!state?.quiz || state.phase !== "taking") return;
  const quiz = state.quiz;
  const picks = [...state.picks];
  update(agentId, { phase: "grading", error: "" });
  try {
    const response = await window.jargon.schoolQuiz.report({
      quiz,
      answers: picks.map((picked) => ({ picked })),
    });
    if (!response.ok) {
      update(agentId, { phase: "taking", error: response.error });
      return;
    }
    // The Teacher's weak topics are saved, so later quizzes build on them.
    const savedTopics = recordQuizWeakTopics(response.graded, response.report);
    update(agentId, {
      phase: "report",
      result: {
        graded: response.graded,
        report: response.report,
        savedTopics,
        ...(response.error && !response.report ? { analysisError: response.error } : {}),
      },
    });
  } catch (error) {
    update(agentId, { phase: "taking", error: error instanceof Error ? error.message : String(error) });
  }
}
