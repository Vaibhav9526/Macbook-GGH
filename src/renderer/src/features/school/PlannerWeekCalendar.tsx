import { Button, ChevronLeft, ChevronRight, IconButton, X } from "@jargon/ui";
import { useText } from "@jargon/ui/text";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import type { PlannerBlock } from "./planner-schedule";
import { moveBlock, plannerAccepted, plannerProposal, removeAcceptedBlock } from "./planner-state";

/** The hours that the grid shows, from 6 in the morning to 11 at night. */
const FIRST_HOUR = 6;
const LAST_HOUR = 23;
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, index) => FIRST_HOUR + index);
const DAY_MS = 86_400_000;
const SNAP_MIN = 15;
/** The grid opens scrolled to this hour. */
const OPEN_AT_HOUR = 8;

/** The subjects have short tags and a colour each. The colours are the chart series of the app. */
const SUBJECT_TAG: Record<string, { label: string; tone: string }> = {
  Physics: { label: "Physics", tone: "1" },
  Chemistry: { label: "Chemistry", tone: "2" },
  Mathematics: { label: "Maths", tone: "3" },
  Botany: { label: "Botany", tone: "4" },
  Zoology: { label: "Zoology", tone: "5" },
};

function mondayOf(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function sameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

interface Shown {
  block: PlannerBlock;
  proposed: boolean;
}

/**
 * The study calendar of the Planning page: one week as seven day columns with the hours down the left. The
 * blocks that the student accepted show solid. A timetable that waits for a decision shows dashed, in the same
 * grid. A block moves by drag and drop, in steps of 15 minutes.
 */
export function PlannerWeekCalendar() {
  const { t, format } = useText();
  const [weekStart, setWeekStart] = createSignal(mondayOf(new Date()));
  let scroller: HTMLDivElement | undefined;
  let dragOffsetMin = 0;

  const days = createMemo(() =>
    Array.from({ length: 7 }, (_, index) => new Date(weekStart().getTime() + index * DAY_MS)),
  );
  const shown = createMemo<Shown[]>(() => [
    ...plannerAccepted().map((block) => ({ block, proposed: false })),
    ...(plannerProposal()?.blocks ?? []).map((block) => ({ block, proposed: true })),
  ]);

  // A new timetable brings the calendar to its first week.
  createEffect(
    () => plannerProposal()?.blocks[0]?.start ?? null,
    (first) => {
      if (!first) return;
      setWeekStart(mondayOf(new Date(first)));
      // The grid scrolls to the hour before the first block, so the block is in view.
      queueMicrotask(() => {
        if (scroller) scroller.scrollTop = Math.max(0, new Date(first).getHours() - 1 - FIRST_HOUR) * hourPx();
      });
    },
  );
  onSettled(() => {
    if (scroller) scroller.scrollTop = (OPEN_AT_HOUR - FIRST_HOUR) * hourPx();
  });

  const hourPx = () => (scroller?.firstElementChild?.clientHeight ?? 0) / HOURS.length;
  const inDay = (day: Date) => shown().filter((entry) => sameDay(new Date(entry.block.start), day));
  const minutesIntoGrid = (iso: string) => {
    const start = new Date(iso);
    return start.getHours() * 60 + start.getMinutes() - FIRST_HOUR * 60;
  };
  const hourLabel = (hour: number) => format.date(new Date(2000, 0, 1, hour), { hour: "numeric" });
  const timeText = (block: PlannerBlock) => {
    const start = new Date(block.start);
    return format.date(start, { hour: "numeric", minute: "2-digit" });
  };
  const rangeLabel = () => {
    const first = days()[0];
    const last = days()[6];
    if (!first || !last) return "";
    const part = { month: "short", day: "numeric" } as const;
    return `${format.date(first, part)} – ${format.date(last, part)}`;
  };
  const monthLabel = () => format.date(days()[3] ?? weekStart(), { month: "long", year: "numeric" });
  const step = (weeks: number) => setWeekStart(new Date(weekStart().getTime() + weeks * 7 * DAY_MS));

  /** The keyboard moves a focused block: Up and Down by 15 minutes, Left and Right by a day. */
  function nudge(event: KeyboardEvent, block: PlannerBlock): void {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -SNAP_MIN],
      ArrowDown: [0, SNAP_MIN],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = new Date(block.start);
    next.setDate(next.getDate() + move[0]);
    next.setMinutes(next.getMinutes() + move[1]);
    moveBlock(block.id, next.toISOString());
  }

  function drop(event: DragEvent, day: Date, column: HTMLElement): void {
    event.preventDefault();
    const id = event.dataTransfer?.getData("text/plain");
    if (!id) return;
    const rect = column.getBoundingClientRect();
    const pxPerMin = rect.height / (HOURS.length * 60);
    const minutes = (event.clientY - rect.top) / pxPerMin - dragOffsetMin;
    const snapped = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
    const clamped = Math.min(Math.max(snapped, 0), HOURS.length * 60 - SNAP_MIN);
    const start = new Date(day);
    start.setHours(FIRST_HOUR, 0, 0, 0);
    start.setMinutes(clamped);
    moveBlock(id, start.toISOString());
  }

  return (
    <section class="planner-week" aria-label={t("app.planner.calendarLabel")}>
      <header class="planner-week-header">
        <div class="planner-week-title">
          <strong>{monthLabel()}</strong>
          <span>{rangeLabel()}</span>
        </div>
        <div class="planner-week-nav">
          <IconButton variant="ghost" label={t("app.planner.prevWeek")} onClick={() => step(-1)}>
            <ChevronLeft aria-hidden="true" />
          </IconButton>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>
            {t("app.planner.thisWeek")}
          </Button>
          <IconButton variant="ghost" label={t("app.planner.nextWeek")} onClick={() => step(1)}>
            <ChevronRight aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <div class="planner-week-days" aria-hidden="true">
        <span />
        <For each={days()}>
          {(day) => (
            <span class="planner-week-day-head" data-today={sameDay(day, new Date()) ? "true" : undefined}>
              <span>{format.date(day, { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
            </span>
          )}
        </For>
      </div>

      <div class="planner-week-scroll" ref={scroller}>
        <div class="planner-week-body" style={{ "--planner-hours": String(HOURS.length) }}>
          <div class="planner-week-hours" aria-hidden="true">
            <For each={HOURS}>{(hour) => <span class="planner-week-hour">{hourLabel(hour)}</span>}</For>
          </div>
          <For each={days()}>
            {(day) => {
              let column: HTMLFieldSetElement | undefined;
              return (
                <fieldset
                  aria-label={format.date(day, { weekday: "long", month: "long", day: "numeric" })}
                  class="planner-week-column"
                  data-today={sameDay(day, new Date()) ? "true" : undefined}
                  ref={column}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => column && drop(event, day, column)}
                >
                  <For each={inDay(day)}>
                    {(entry) => {
                      const tag = SUBJECT_TAG[entry.block.subject] ?? { label: entry.block.subject, tone: "1" };
                      return (
                        <div
                          class="planner-week-block"
                          data-proposed={entry.proposed ? "true" : undefined}
                          data-tone={tag.tone}
                          style={{
                            top: `calc(100% * ${minutesIntoGrid(entry.block.start)} / ${HOURS.length * 60})`,
                            height: `calc(100% * ${entry.block.durationMin} / ${HOURS.length * 60})`,
                          }}
                        >
                          <button
                            type="button"
                            class="planner-week-block-main"
                            draggable="true"
                            title={t("app.planner.moveHint")}
                            aria-label={t("app.planner.blockLabel", {
                              title: entry.block.title,
                              time: timeText(entry.block),
                            })}
                            onDragStart={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              dragOffsetMin = ((event.clientY - rect.top) / rect.height) * entry.block.durationMin;
                              event.dataTransfer?.setData("text/plain", entry.block.id);
                              if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                            }}
                            onKeyDown={(event) => nudge(event, entry.block)}
                          >
                            <span class="planner-week-tag">{tag.label}</span>
                            <span class="planner-week-block-title">{entry.block.title}</span>
                            <span class="planner-week-block-time">{timeText(entry.block)}</span>
                          </button>
                          <Show when={!entry.proposed}>
                            <IconButton
                              variant="ghost"
                              size="icon-xs"
                              class="planner-week-remove"
                              label={t("app.planner.removeBlock")}
                              onClick={() => removeAcceptedBlock(entry.block.id)}
                            >
                              <X aria-hidden="true" />
                            </IconButton>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </fieldset>
              );
            }}
          </For>
        </div>
      </div>
    </section>
  );
}
