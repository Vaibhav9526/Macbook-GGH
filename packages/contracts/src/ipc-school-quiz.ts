import { isDynamicRecord } from "./runtime-values";

// The School quiz: the Teacher's @quiz. Copied from IsCool (src/main/quiz.ts, classroomIpc.ts). Main asks the
// user's Claude login for the questions, grades the answers itself, and asks once more for the analysis.

/**
 * A small diagram that a question shows, as data. The renderer draws it as SVG, so a model never sends markup.
 * `graph` is a line graph with labelled axes, for example a velocity-time graph.
 */
export interface SchoolQuizDiagram {
  kind: "graph";
  xLabel: string;
  yLabel: string;
  lines: Array<{ label: string; points: Array<[number, number]> }>;
  /** Labelled points on the graph, such as the peak of a curve. */
  marks: Array<{ x: number; y: number; label: string }>;
}

export interface SchoolQuizQuestion {
  q: string;
  diagram?: SchoolQuizDiagram;
  options: [string, string, string, string];
  /** 0 to 3: the index of the correct option. */
  answer: number;
  explanation: string;
  concept: string;
}

export interface SchoolQuizData {
  topic: string;
  questions: SchoolQuizQuestion[];
}

export interface SchoolQuizGraded {
  correct: number;
  total: number;
  percent: number;
  items: Array<{ index: number; picked: number | null; right: boolean; concept: string }>;
  weakConcepts: Array<{ concept: string; missed: number; of: number }>;
}

export interface SchoolQuizReport {
  summary: string;
  weakPoints: Array<{ concept: string; why: string; tip: string }>;
  strengths: string[];
  resources: {
    youtube: Array<{ channel: string; why: string; query: string; url: string }>;
    books: Array<{ title: string; author: string; why: string; url: string }>;
    other: Array<{ name: string; why: string; url: string }>;
  };
}

export interface SchoolQuizStartInput {
  /** What the student typed after @quiz. Empty means their last question. */
  doubt: string;
  /** The last messages of the chat, oldest first, so the quiz tests what was discussed. */
  context: Array<{ role: "user" | "agent"; text: string }>;
  /** Concepts the student got wrong in earlier quizzes, so this quiz builds on them. */
  weakTopics?: string[];
}

export type SchoolQuizStartResult = { ok: true; quiz: SchoolQuizData } | { ok: false; error: string };

export interface SchoolQuizReportInput {
  quiz: SchoolQuizData;
  answers: Array<{ picked: number | null }>;
}

/** The score is always real when `ok`. `report` is null when the written analysis could not be made. */
export type SchoolQuizReportResult =
  | { ok: true; graded: SchoolQuizGraded; report: SchoolQuizReport | null; error?: string }
  | { ok: false; error: string };

export function isSchoolQuizStartResult(value: unknown): value is SchoolQuizStartResult {
  if (!isDynamicRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return isDynamicRecord(value.quiz) && Array.isArray(value.quiz.questions);
  return typeof value.error === "string";
}

export function isSchoolQuizReportResult(value: unknown): value is SchoolQuizReportResult {
  if (!isDynamicRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return isDynamicRecord(value.graded) && typeof value.graded.correct === "number";
  return typeof value.error === "string";
}
