import type { RoutineCalendarRoutine, RoutineCalendarRun } from "@jargon/ui/features/conversation/RoutineCalendar";
import { localDate, localTime, type PlannerBlock } from "./planner-schedule";

/** The id prefix of the calendar entries that the Planner adds. A host routine never has it. */
export const PLANNER_ENTRY_PREFIX = "planner:";

export interface PlannerCalendarEntries {
  routines: RoutineCalendarRoutine[];
  runs: RoutineCalendarRun[];
}

/**
 * The Planner's study blocks as entries of the routine calendar, so they show in the same calendar. Each block
 * is a routine that runs once. Accepted blocks show as planned, or as done once their time has passed; the
 * blocks of a timetable that waits for a decision show as proposed.
 */
export function plannerCalendarEntries(
  accepted: readonly PlannerBlock[],
  proposed: readonly PlannerBlock[],
  plannerAgentId: string | undefined,
  now: Date,
): PlannerCalendarEntries {
  const routines: RoutineCalendarRoutine[] = [];
  const runs: RoutineCalendarRun[] = [];
  const add = (block: PlannerBlock, status: RoutineCalendarRun["status"]): void => {
    const id = `${PLANNER_ENTRY_PREFIX}${block.id}`;
    routines.push({
      id,
      name: block.title,
      agentIds: plannerAgentId ? [plannerAgentId] : [],
      schedule: { kind: "once", date: localDate(block.start), time: localTime(block.start) },
    });
    runs.push({ id: `${id}:run`, routineId: id, at: block.start, status });
  };
  for (const block of accepted) {
    const over = Date.parse(block.start) + block.durationMin * 60_000 < now.getTime();
    add(block, over ? "completed" : "active");
  }
  for (const block of proposed) add(block, "proposed");
  return { routines, runs };
}

export function isPlannerEntry(routineId: string): boolean {
  return routineId.startsWith(PLANNER_ENTRY_PREFIX);
}
