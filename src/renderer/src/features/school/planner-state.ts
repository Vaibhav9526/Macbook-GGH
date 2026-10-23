import { isDynamicRecord } from "@jargon/contracts/runtime-values";
import { createSignal } from "solid-js";
import {
  buildTimetable,
  busyOf,
  type PlannerBlock,
  type PlanRequest,
  parsePlanRequest,
  parsePlanRequests,
} from "./planner-schedule";
import { isPlannerExam, type PlannerExam, plannerTopicById, topicsNamedIn } from "./planner-syllabus";

/**
 * The Planner's state: the exam the student prepares for, the study blocks they accepted (these show in the
 * calendar), and the one timetable waiting for a decision. It lives on this computer, like the other School
 * choices, so a restart keeps the exam and the plan.
 */
export interface PlannerProposal {
  /** What the student asked for, in their words, with each change they asked for after it. */
  request: string;
  topicIds: string[];
  blocks: PlannerBlock[];
  /** Set when the topics did not fit the requested days. */
  stretchedToDays: number | null;
}

interface Stored {
  exam: PlannerExam | null;
  accepted: PlannerBlock[];
  proposal: PlannerProposal | null;
}

const KEY = "jargon:planner";
/** A proposal keeps the first request and each change on their own lines, so a later change overrides an earlier one. */
export const REQUEST_SEPARATOR = "\n";

function isBlock(value: unknown): value is PlannerBlock {
  return (
    isDynamicRecord(value) &&
    typeof value.id === "string" &&
    typeof value.topicId === "string" &&
    typeof value.title === "string" &&
    typeof value.subject === "string" &&
    typeof value.unit === "string" &&
    typeof value.start === "string" &&
    Number.isFinite(Date.parse(value.start)) &&
    typeof value.durationMin === "number"
  );
}

function readStored(): Stored {
  const empty: Stored = { exam: null, accepted: [], proposal: null };
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!isDynamicRecord(parsed)) return empty;
    const proposal = parsed.proposal;
    return {
      exam: isPlannerExam(parsed.exam) ? parsed.exam : null,
      accepted: Array.isArray(parsed.accepted) ? parsed.accepted.filter(isBlock) : [],
      proposal:
        isDynamicRecord(proposal) &&
        typeof proposal.request === "string" &&
        Array.isArray(proposal.topicIds) &&
        Array.isArray(proposal.blocks)
          ? {
              request: proposal.request,
              topicIds: proposal.topicIds.filter((id): id is string => typeof id === "string"),
              blocks: proposal.blocks.filter(isBlock),
              stretchedToDays: typeof proposal.stretchedToDays === "number" ? proposal.stretchedToDays : null,
            }
          : null,
    };
  } catch {
    return empty;
  }
}

/*
 * Signals batch their writes: a read right after a write still gives the old value. So the truth is this plain
 * snapshot, which every action reads and writes at once, and the signals only tell the screen what changed.
 */
let store: Stored = readStored();
let chosen: string[] = [];
const [exam, setExamSignal] = createSignal<PlannerExam | null>(store.exam);
const [accepted, setAccepted] = createSignal<PlannerBlock[]>(store.accepted);
const [proposal, setProposal] = createSignal<PlannerProposal | null>(store.proposal);
const [selected, setSelected] = createSignal<string[]>([]);

function commit(patch: Partial<Stored>): void {
  store = { ...store, ...patch };
  setExamSignal(store.exam);
  setAccepted(store.accepted);
  setProposal(store.proposal);
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage is blocked: the plan lasts until the window closes */
  }
}

function select(next: string[]): void {
  chosen = next;
  setSelected(next);
}

/** The last thing the Planner did or could not do, shown in its panel. */
const [notice, setNoticeSignal] = createSignal<{ kind: "info" | "error"; text: string } | null>(null);
export const plannerNotice = notice;
export function setPlannerNotice(next: { kind: "info" | "error"; text: string } | null): void {
  setNoticeSignal(next);
}

/** Counts the times something asked to show the timetable in the calendar. The Planner panel opens the page. */
const [calendarRequests, setCalendarRequests] = createSignal(0);
export const plannerCalendarRequests = calendarRequests;
export function requestPlannerCalendar(): void {
  setCalendarRequests((count) => count + 1);
}

/** The agent that owns the study blocks in the calendar: the one chosen in the Planning composer. */
const OWNER_KEY = "jargon:planner-agent";
function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
const [owner, setOwnerSignal] = createSignal<string | null>(readOwner());
export const plannerOwnerId = owner;
export function setPlannerOwner(agentId: string): void {
  setOwnerSignal(agentId);
  try {
    localStorage.setItem(OWNER_KEY, agentId);
  } catch {
    /* storage is blocked: the choice lasts until the window closes */
  }
}

export const plannerExam = exam;
export const plannerAccepted = accepted;
export const plannerProposal = proposal;
export const plannerSelection = selected;

export function chooseExam(next: PlannerExam): void {
  if (next !== store.exam) select([]);
  commit({ exam: next });
}

/** Back to the first question, so the student can pick the other exam. The accepted blocks stay. */
export function forgetExam(): void {
  select([]);
  commit({ exam: null });
}

export function toggleTopic(topicId: string): void {
  select(chosen.includes(topicId) ? chosen.filter((id) => id !== topicId) : [...chosen, topicId]);
}

export function setTopicsSelected(topicIds: readonly string[], on: boolean): void {
  const rest = chosen.filter((id) => !topicIds.includes(id));
  select(on ? [...rest, ...topicIds] : rest);
}

export function clearSelection(): void {
  select([]);
}

function topicsOf(examId: PlannerExam, topicIds: readonly string[]) {
  return topicIds.flatMap((id) => plannerTopicById(examId, id) ?? []);
}

/** Puts topics straight into the calendar, one study block a day from tomorrow. Returns how many it placed. */
export function addTopicsToCalendar(topicIds: readonly string[]): number {
  const examId = store.exam;
  if (!examId) return 0;
  const topics = topicsOf(examId, topicIds).filter(
    (topic) => !store.accepted.some((block) => block.topicId === topic.id),
  );
  if (topics.length === 0) return 0;
  const request: PlanRequest = { ...parsePlanRequest(""), days: topics.length };
  const result = buildTimetable(topics, request, new Date(), busyOf(store.accepted));
  commit({ accepted: [...store.accepted, ...result.blocks] });
  return result.blocks.length;
}

/** Builds the timetable for a typed request. Nothing reaches the calendar until the student accepts it. */
export function proposePlan(topicIds: readonly string[], requestText: string): PlannerProposal | null {
  const examId = store.exam;
  if (!examId) return null;
  const topics = topicsOf(examId, topicIds);
  if (topics.length === 0) return null;
  const parts = requestText
    .split(REQUEST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  const result = buildTimetable(topics, parsePlanRequests(parts), new Date(), busyOf(store.accepted));
  const next: PlannerProposal = {
    request: parts.join(REQUEST_SEPARATOR),
    topicIds: topics.map((topic) => topic.id),
    blocks: result.blocks,
    stretchedToDays: result.stretchedToDays,
  };
  commit({ proposal: next });
  return next;
}

/** A typed request over the topics it selects: the chosen ones, or else the subjects and units it names. */
export function proposeFromText(requestText: string): PlannerProposal | null {
  const examId = store.exam;
  if (!examId) return null;
  const ids = chosen.length > 0 ? chosen : topicsNamedIn(examId, requestText).map((topic) => topic.id);
  return proposePlan(ids, requestText);
}

/** The student changes the waiting timetable: their new words add to the request, over the same topics. */
export function changeProposal(change: string): PlannerProposal | null {
  const current = store.proposal;
  if (!current) return null;
  return proposePlan(current.topicIds, `${current.request}${REQUEST_SEPARATOR}${change.trim()}`);
}

export function acceptProposal(): number {
  const current = store.proposal;
  if (!current) return 0;
  select([]);
  commit({ accepted: [...store.accepted, ...current.blocks], proposal: null });
  return current.blocks.length;
}

export function discardProposal(): void {
  commit({ proposal: null });
}

/** Moves a study block to a new start. It works for a block in the calendar and for one that waits for a decision. */
export function moveBlock(blockId: string, startIso: string): void {
  const moved = (block: PlannerBlock): PlannerBlock => (block.id === blockId ? { ...block, start: startIso } : block);
  const proposed = store.proposal;
  commit({
    accepted: store.accepted.map(moved),
    proposal: proposed ? { ...proposed, blocks: proposed.blocks.map(moved) } : null,
  });
}

export function removeAcceptedBlock(blockId: string): void {
  commit({ accepted: store.accepted.filter((block) => block.id !== blockId) });
}
