import type { PlannerTopic } from "./planner-syllabus";

/**
 * The timetable builder of the Planner. It is plain code, not a model: the same topics and the same request
 * give the same timetable, and the calendar shows exactly what was computed. Times are in the viewer's zone.
 */
export interface PlannerBlock {
  id: string;
  topicId: string;
  title: string;
  subject: string;
  unit: string;
  /** The start, as an ISO instant. */
  start: string;
  durationMin: number;
}

export interface PlanRequest {
  /** How many calendar days to spread the topics over. Null: the pace decides. */
  days: number | null;
  /** Study hours per day. Null: the days decide. */
  hoursPerDay: number | null;
  /** The part of the day to prefer. Null: evenings, then mornings. */
  timeOfDay: "morning" | "afternoon" | "evening" | "night" | null;
  /** An exact start hour, from "at 6 pm". */
  startHour: number | null;
  skipWeekends: boolean;
  /** Start today, not tomorrow. */
  startToday: boolean;
}

export interface PlanResult {
  blocks: PlannerBlock[];
  /** Set when the work did not fit in the requested days, so the plan runs longer. */
  stretchedToDays: number | null;
}

const MINUTE = 60_000;
const BREAK_MIN = 15;
const DEFAULT_HOURS_PER_DAY = 2;
const MAX_HOURS_PER_DAY = 6;
const MAX_DAYS = 120;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
};

const COUNT =
  "(\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|fifteen|twenty|thirty)";

function countOf(word: string | undefined): number | null {
  if (!word) return null;
  const known = NUMBER_WORDS[word];
  if (known !== undefined) return known;
  const parsed = Number(word);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The parts of a typed request that the builder understands. Words it does not know are ignored. */
export function parsePlanRequest(text: string): PlanRequest {
  const lower = text.toLowerCase();
  let days: number | null = null;
  const span =
    new RegExp(
      `\\b(?:in|within|over|for|across|by|take|takes|into)\\s+(?:the\\s+next\\s+)?${COUNT}\\s*(days?|weeks?|months?)\\b`,
    ).exec(lower) ?? new RegExp(`\\b${COUNT}\\s*(days?|weeks?|months?)\\b`).exec(lower);
  if (span) {
    const amount = countOf(span[1]);
    const unit = span[2] ?? "";
    if (amount !== null) days = Math.round(amount * (unit.startsWith("week") ? 7 : unit.startsWith("month") ? 30 : 1));
  } else if (/\bthis week\b/.test(lower)) {
    days = 7;
  } else if (/\b(a|one) week\b/.test(lower)) {
    days = 7;
  } else if (/\btomorrow\b/.test(lower) && !/\b(from|starting)\b/.test(lower)) {
    days = 1;
  }
  let hoursPerDay: number | null = null;
  const pace = new RegExp(`${COUNT}\\s*(?:hours?|hrs?|h)\\s*(?:a|per|each|every|/)\\s*day`).exec(lower);
  if (pace) hoursPerDay = countOf(pace[1]);
  const clock = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(lower);
  let startHour: number | null = null;
  if (clock?.[1]) {
    let hour = Number(clock[1]);
    if (clock[3] === "pm" && hour < 12) hour += 12;
    if (clock[3] === "am" && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23) startHour = hour;
  }
  const timeOfDay = /\bmornings?\b/.test(lower)
    ? "morning"
    : /\bafternoons?\b/.test(lower)
      ? "afternoon"
      : /\bevenings?\b/.test(lower)
        ? "evening"
        : /\bnights?\b/.test(lower)
          ? "night"
          : null;
  return {
    days: days !== null && days > 0 ? Math.min(days, MAX_DAYS) : null,
    hoursPerDay: hoursPerDay !== null && hoursPerDay > 0 ? Math.min(hoursPerDay, MAX_HOURS_PER_DAY) : null,
    timeOfDay,
    startHour,
    skipWeekends: /\b(weekdays only|no weekends?|skip (?:the )?weekends?|except weekends?)\b/.test(lower),
    startToday: /\b(today|right now|from now)\b/.test(lower),
  };
}

/**
 * Several requests in order, the first one and then each change. A later request overrides an earlier one on
 * every point it names, and keeps the rest.
 */
export function parsePlanRequests(texts: readonly string[]): PlanRequest {
  let merged = parsePlanRequest("");
  for (const text of texts) {
    const next = parsePlanRequest(text);
    merged = {
      days: next.days ?? merged.days,
      hoursPerDay: next.hoursPerDay ?? merged.hoursPerDay,
      timeOfDay: next.timeOfDay ?? merged.timeOfDay,
      startHour: next.startHour ?? merged.startHour,
      skipWeekends: next.skipWeekends || merged.skipWeekends,
      startToday: next.startToday || merged.startToday,
    };
  }
  return merged;
}

/** Whether a message in the Planner chat reads as a request to plan topics, and not as a question. */
export function looksLikePlanRequest(text: string): boolean {
  const lower = text.toLowerCase();
  const verb = /\b(cover|plan|schedule|timetable|finish|complete|revise|revision|study|prepare)\b/.test(lower);
  const span = /\b(day|days|week|weeks|month|months|tomorrow|today|hours?|hrs?)\b/.test(lower);
  return verb && span;
}

interface Window {
  start: number;
  end: number;
}

const WINDOWS: Record<"morning" | "afternoon" | "evening" | "night", Window> = {
  morning: { start: 7, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 22 },
  night: { start: 20, end: 23.5 },
};

/** The windows of a day, in the order the builder tries them. */
function windowsFor(request: PlanRequest): Window[] {
  if (request.startHour !== null) {
    return [{ start: request.startHour, end: Math.min(23.5, request.startHour + 5) }, WINDOWS.evening, WINDOWS.morning];
  }
  const first = request.timeOfDay ?? "evening";
  const rest = (["evening", "morning", "afternoon", "night"] as const).filter((name) => name !== first);
  return [WINDOWS[first], ...rest.map((name) => WINDOWS[name])];
}

function atHour(day: Date, hour: number): number {
  const moment = new Date(day);
  moment.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return moment.getTime();
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Round up to the next quarter hour. */
function roundUp(time: number): number {
  const step = 15 * MINUTE;
  return Math.ceil(time / step) * step;
}

/** Subjects take turns, so a week of Physics alone does not happen. Each subject keeps its own order. */
function interleave(topics: readonly PlannerTopic[]): PlannerTopic[] {
  const bySubject = new Map<string, PlannerTopic[]>();
  for (const topic of topics) {
    const list = bySubject.get(topic.subject);
    if (list) list.push(topic);
    else bySubject.set(topic.subject, [topic]);
  }
  const queues = [...bySubject.values()];
  const out: PlannerTopic[] = [];
  for (let round = 0; out.length < topics.length; round++) {
    for (const queue of queues) {
      const next = queue[round];
      if (next) out.push(next);
    }
  }
  return out;
}

export interface Busy {
  start: number;
  end: number;
}

/**
 * Spreads the topics over the days. A topic goes to the day that its place in the whole workload falls in, so
 * the load is even. `busy` holds time that is taken already, for example blocks the student accepted before.
 */
export function buildTimetable(
  topics: readonly PlannerTopic[],
  request: PlanRequest,
  now: Date,
  busy: readonly Busy[] = [],
): PlanResult {
  if (topics.length === 0) return { blocks: [], stretchedToDays: null };
  const ordered = interleave(topics);
  const totalMin = ordered.reduce((sum, topic) => sum + topic.hours * 60, 0);
  const perDayMin = Math.min(
    MAX_HOURS_PER_DAY * 60,
    (request.hoursPerDay ?? (request.days ? totalMin / 60 / request.days : DEFAULT_HOURS_PER_DAY)) * 60,
  );
  const planDays = Math.min(MAX_DAYS, request.days ?? Math.max(1, Math.ceil(totalMin / perDayMin)));

  const firstDay = startOfDay(now);
  if (!request.startToday) firstDay.setDate(firstDay.getDate() + 1);
  const dayList: Date[] = [];
  for (let offset = 0; dayList.length < MAX_DAYS * 2 && offset < MAX_DAYS * 3; offset++) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + offset);
    if (request.skipWeekends && (day.getDay() === 0 || day.getDay() === 6)) continue;
    dayList.push(day);
  }

  const taken: Busy[] = [...busy];
  const windows = windowsFor(request);
  const earliest = roundUp(now.getTime() + 15 * MINUTE);

  /** The first free start on a day for a block of this length, or null when the day is full. */
  const slotOn = (day: Date, durationMin: number): number | null => {
    for (const window of windows) {
      let cursor = Math.max(atHour(day, window.start), earliest);
      const end = atHour(day, window.end);
      while (cursor + durationMin * MINUTE <= end) {
        const clash = taken.find(
          (item) =>
            cursor < item.end + BREAK_MIN * MINUTE && cursor + durationMin * MINUTE + BREAK_MIN * MINUTE > item.start,
        );
        if (!clash) return cursor;
        cursor = roundUp(clash.end + BREAK_MIN * MINUTE);
      }
    }
    return null;
  };

  const blocks: PlannerBlock[] = [];
  /** The minutes the builder placed on each day. A day never holds more than the daily limit. */
  const load = new Map<number, number>();
  let before = 0;
  let lastDayIndex = 0;
  for (const topic of ordered) {
    const durationMin = topic.hours * 60;
    const wanted = Math.min(planDays - 1, Math.floor(((before + durationMin / 2) / totalMin) * planDays));
    let dayIndex = Math.max(wanted, lastDayIndex);
    let start: number | null = null;
    while (start === null && dayIndex < dayList.length) {
      const day = dayList[dayIndex];
      const full = (load.get(dayIndex) ?? 0) + durationMin > MAX_HOURS_PER_DAY * 60;
      start = day && !full ? slotOn(day, durationMin) : null;
      if (start === null) dayIndex++;
    }
    before += durationMin;
    if (start === null) continue;
    lastDayIndex = dayIndex;
    load.set(dayIndex, (load.get(dayIndex) ?? 0) + durationMin);
    taken.push({ start, end: start + durationMin * MINUTE });
    blocks.push({
      id: `${topic.id}@${start}`,
      topicId: topic.id,
      title: topic.name,
      subject: topic.subject,
      unit: topic.unit,
      start: new Date(start).toISOString(),
      durationMin,
    });
  }
  blocks.sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
  const usedDays = lastDayIndex + 1;
  return { blocks, stretchedToDays: request.days !== null && usedDays > request.days ? usedDays : null };
}

export function localDate(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function localTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function busyOf(blocks: readonly PlannerBlock[]): Busy[] {
  return blocks.map((block) => ({
    start: Date.parse(block.start),
    end: Date.parse(block.start) + block.durationMin * MINUTE,
  }));
}
