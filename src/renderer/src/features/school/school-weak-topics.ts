import type { SchoolQuizGraded, SchoolQuizReport } from "@jargon/contracts/ipc";
import { isDynamicRecord } from "@jargon/contracts/runtime-values";
import { createSignal } from "solid-js";

/**
 * The topics a student got wrong in School quizzes. The Teacher's list is saved here, on this computer like
 * the other School choices, and the next quiz is told about it so it builds on these topics.
 */
export interface WeakTopic {
  concept: string;
  /** How many answers on this concept were wrong across all quizzes. */
  missed: number;
  updatedAt: number;
}

const KEY = "jargon:school-weak-topics";
const MAX_TOPICS = 30;
const MAX_NAME = 80;

function readStored(): WeakTopic[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): WeakTopic[] => {
      if (!isDynamicRecord(item) || typeof item.concept !== "string" || !item.concept.trim()) return [];
      return [
        {
          concept: item.concept.trim().slice(0, MAX_NAME),
          missed: typeof item.missed === "number" && item.missed > 0 ? Math.trunc(item.missed) : 1,
          updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
        },
      ];
    });
  } catch {
    return [];
  }
}

function writeStored(topics: WeakTopic[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(topics));
  } catch {
    /* storage is blocked: the list lasts until the window closes */
  }
}

const [topics, setTopics] = createSignal<WeakTopic[]>(readStored());

const sameConcept = (left: string, right: string): boolean => left.trim().toLowerCase() === right.trim().toLowerCase();

/** The saved weak topics, newest first. */
export const weakTopics = topics;

/** The concept names that the next quiz is told about. */
export function weakTopicNames(): string[] {
  return topics().map((topic) => topic.concept);
}

/** Forgets one saved topic. */
export function removeWeakTopic(concept: string): void {
  const next = topics().filter((topic) => !sameConcept(topic.concept, concept));
  writeStored(next);
  setTopics(next);
}

/**
 * Saves what a finished quiz shows. A concept answered wrong is added or counted again; the concepts the
 * Teacher names as weak are added too. A concept that the quiz asked and the student got fully right leaves the
 * list: it is no longer weak. Returns the concepts that this quiz saved, most missed first.
 */
export function recordQuizWeakTopics(graded: SchoolQuizGraded, report: SchoolQuizReport | null): string[] {
  const now = Date.now();
  let next = topics().map((topic) => ({ ...topic }));
  const asked = new Set(graded.items.map((item) => item.concept.trim().toLowerCase()));
  const missedNow = new Set(graded.weakConcepts.map((weak) => weak.concept.trim().toLowerCase()));
  // A concept that was asked and not missed is mastered for now.
  next = next.filter((topic) => {
    const key = topic.concept.toLowerCase();
    return !(asked.has(key) && !missedNow.has(key));
  });
  const saved: string[] = [];
  const add = (concept: string, missed: number): void => {
    const name = concept.trim().slice(0, MAX_NAME);
    if (!name) return;
    const found = next.find((topic) => sameConcept(topic.concept, name));
    if (found) {
      found.missed += missed;
      found.updatedAt = now;
    } else {
      next.push({ concept: name, missed, updatedAt: now });
    }
    if (!saved.some((item) => sameConcept(item, name))) saved.push(name);
  };
  for (const weak of graded.weakConcepts) add(weak.concept, weak.missed);
  for (const weak of report?.weakPoints ?? []) add(weak.concept, 1);
  next = next.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, MAX_TOPICS);
  writeStored(next);
  setTopics(next);
  return saved;
}
