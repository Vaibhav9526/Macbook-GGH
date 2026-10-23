// The School quiz: `@quiz` in a Teacher chat. Copied from IsCool (classroomIpc.ts: classroom:quiz and
// classroom:quizReport). The questions and the analysis come from the user's Claude login (one-shot, no tools).
// The score is computed here, never by the model, and the renderer's copy of the quiz is validated again.

import type {
  SchoolQuizReportInput,
  SchoolQuizReportResult,
  SchoolQuizStartInput,
  SchoolQuizStartResult,
} from "@jargon/contracts/ipc";
import type { AppTranslate } from "@jargon/i18n";
import { runClaudeOnce } from "../school/claude-once";
import {
  buildQuizPrompt,
  buildReportPrompt,
  gradeQuiz,
  parseQuiz,
  parseReport,
  reportToMarkdown,
} from "../school/quiz";
import { type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { isObject } from "./validation";

const MAX_DOUBT = 1500;
const MAX_CONTEXT = 8;
const MAX_CONTEXT_TEXT = 800;
const QUIZ_QUESTIONS = 5;
const MAX_WEAK_TOPICS = 8;
const MAX_WEAK_TOPIC_TEXT = 80;

export interface SchoolQuizIpcDependencies {
  translate: AppTranslate;
}

/** The quiz as the renderer sent it, checked with the same rules as the question step. */
function checkedQuiz(value: unknown): SchoolQuizReportInput["quiz"] {
  const parsed = parseQuiz(JSON.stringify(value ?? null));
  if (!parsed.ok) throw new Error("Invalid quiz.");
  return parsed.quiz;
}

/** The chat turns as the renderer sends them, after the shape check. */
function parseStart(value: unknown): SchoolQuizStartInput {
  if (!isObject(value)) throw new Error("Invalid quiz request.");
  const doubt = typeof value.doubt === "string" ? value.doubt.trim().slice(0, MAX_DOUBT) : "";
  const turns = Array.isArray(value.context) ? value.context.slice(-MAX_CONTEXT) : [];
  const context: SchoolQuizStartInput["context"] = [];
  for (const item of turns) {
    if (!isObject(item) || typeof item.text !== "string") continue;
    if (item.role === "user" || item.role === "agent") {
      context.push({ role: item.role, text: item.text.slice(0, MAX_CONTEXT_TEXT) });
    }
  }
  const weakTopics = (Array.isArray(value.weakTopics) ? value.weakTopics : [])
    .flatMap((topic) => (typeof topic === "string" && topic.trim() ? [topic.trim().slice(0, MAX_WEAK_TOPIC_TEXT)] : []))
    .slice(0, MAX_WEAK_TOPICS);
  return { doubt, context, weakTopics };
}

/**
 * The report request. The quiz is kept as sent: main parses it again with the same rules as the question
 * step, so a changed or broken copy from the renderer is refused.
 */
function parseReportInput(value: unknown): SchoolQuizReportInput {
  if (!isObject(value)) throw new Error("Invalid quiz report request.");
  const answers = Array.isArray(value.answers) ? value.answers : [];
  return {
    quiz: checkedQuiz(value.quiz),
    answers: answers.map((answer) => ({
      picked: isObject(answer) && typeof answer.picked === "number" ? answer.picked : null,
    })),
  };
}

export function schoolQuizIpcHandlers({ translate }: SchoolQuizIpcDependencies): Pick<IpcGroupHandlers, "schoolQuiz"> {
  return {
    schoolQuiz: {
      start: payloadHandler(parseStart, async (input): Promise<SchoolQuizStartResult> => {
        // With nothing typed after @quiz, the student's last question is the doubt.
        const lastUser = [...input.context].reverse().find((turn) => turn.role === "user")?.text ?? "";
        const weakTopics = input.weakTopics ?? [];
        // With no doubt at all, the quiz revises the topics the student got wrong before.
        const doubt = input.doubt || lastUser || (weakTopics.length ? weakTopics.join("; ") : "");
        if (!doubt) return { ok: false, error: translate("app.school.quiz.needDoubt") };
        for (let attempt = 0; attempt < 2; attempt++) {
          // One retry: models occasionally break the format.
          const response = await runClaudeOnce(buildQuizPrompt(doubt, input.context, QUIZ_QUESTIONS, weakTopics));
          if (!response.ok) return { ok: false, error: response.error };
          const parsed = parseQuiz(response.text);
          if (parsed.ok) return { ok: true, quiz: parsed.quiz };
        }
        return { ok: false, error: translate("app.school.quiz.createFailed") };
      }),
      report: payloadHandler(parseReportInput, async (input): Promise<SchoolQuizReportResult> => {
        const quiz = input.quiz;
        const answers = input.answers.slice(0, quiz.questions.length);
        const graded = gradeQuiz(quiz, answers);
        // The score is real even if the written analysis fails, so the score is returned either way.
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await runClaudeOnce(buildReportPrompt(quiz, graded, answers));
          if (!response.ok) break;
          const report = parseReport(response.text);
          if (report.ok) return { ok: true, graded, report: report.report };
        }
        return { ok: true, graded, report: null, error: translate("app.school.quiz.analysisFailed") };
      }),
    },
  };
}

/** The recap of a finished quiz, as plain text. Kept for the chat when the School stores one. */
export function schoolQuizRecap(
  quiz: Parameters<typeof reportToMarkdown>[0],
  graded: ReturnType<typeof gradeQuiz>,
  report: Parameters<typeof reportToMarkdown>[2],
): string {
  return reportToMarkdown(quiz, graded, report);
}
