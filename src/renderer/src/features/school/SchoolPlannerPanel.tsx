import {
  Button,
  CalendarClock,
  Check,
  Checkbox,
  ChevronDown,
  ChevronRight,
  IconButton,
  Input,
  Plus,
  SlidingTabs,
} from "@jargon/ui";
import { useText } from "@jargon/ui/text";
import { createEffect, createMemo, createSignal, createStore, For, Show } from "solid-js";
import { useAgents } from "../agents/agents-context";
import { useWindowPage } from "../window/window-page-context";
import { PlannerProposalControls } from "./PlannerProposalControls";
import {
  addTopicsToCalendar,
  chooseExam,
  clearSelection,
  forgetExam,
  plannerAccepted,
  plannerCalendarRequests,
  plannerExam,
  plannerNotice,
  plannerSelection,
  proposeFromText,
  setPlannerNotice,
  setTopicsSelected,
  toggleTopic,
} from "./planner-state";
import {
  PLANNER_EXAMS,
  type PlannerExam,
  type PlannerSubject,
  type PlannerUnit,
  plannerSyllabus,
  plannerTopics,
} from "./planner-syllabus";
import { schoolActive, schoolPersonaOf } from "./school-workspace";

/**
 * The Planner's panel, above the composer of the Planner chat. It asks which exam the student prepares for, then
 * shows the whole syllabus of that exam: subjects, units and topics. A topic goes straight to the calendar, or a
 * typed request such as "cover these topics in a week" builds a timetable that the student accepts or changes.
 */
export function SchoolPlannerPanel() {
  const { activeAgent } = useAgents();
  const isPlanner = () => schoolActive() && schoolPersonaOf(activeAgent()?.id ?? "") === "planner";
  return (
    <Show when={isPlanner()}>
      <Show when={plannerExam()} fallback={<ExamQuestion />}>
        {(exam) => <Syllabus exam={exam()} />}
      </Show>
    </Show>
  );
}

export function ExamQuestion() {
  const { t } = useText();
  return (
    <section class="planner-card planner-question" aria-labelledby="planner-question-title">
      <div class="planner-head">
        <CalendarClock class="planner-glyph" aria-hidden="true" />
        <strong id="planner-question-title">{t("app.planner.ask")}</strong>
      </div>
      <p class="planner-hint">{t("app.planner.askHint")}</p>
      <div class="planner-exam-choices">
        <For each={PLANNER_EXAMS}>
          {(exam) => (
            <Button variant="outline" onClick={() => chooseExam(exam)}>
              {exam === "jee" ? t("app.planner.jee") : t("app.planner.neet")}
            </Button>
          )}
        </For>
      </div>
    </section>
  );
}

export function Syllabus(props: { exam: PlannerExam; embedded?: boolean }) {
  const { t } = useText();
  const windowPage = useWindowPage();
  const syllabus = () => plannerSyllabus(props.exam);
  const [open, setOpen] = createSignal(true);
  const [subjectId, setSubjectId] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createStore<Record<string, boolean>>({});
  const [request, setRequest] = createSignal("");
  // A request typed in the chat asks for the calendar through this counter.
  createEffect(plannerCalendarRequests, (count, previous) => {
    if (previous !== undefined && count !== previous) windowPage.openSchedule(null);
  });

  const subject = (): PlannerSubject | undefined =>
    syllabus().subjects.find((candidate) => candidate.id === subjectId()) ?? syllabus().subjects[0];
  const selectedHours = createMemo(() => {
    const chosen = new Set(plannerSelection());
    return plannerTopics(props.exam)
      .filter((topic) => chosen.has(topic.id))
      .reduce((sum, topic) => sum + topic.hours, 0);
  });
  const inCalendar = (topicId: string) => plannerAccepted().some((block) => block.topicId === topicId);

  function addSelected(): void {
    const count = addTopicsToCalendar(plannerSelection());
    setPlannerNotice({
      kind: "info",
      text: count > 0 ? t("app.planner.added", { count }) : t("app.planner.addedNone"),
    });
    if (count > 0) clearSelection();
  }

  function addOne(topicId: string): void {
    const count = addTopicsToCalendar([topicId]);
    setPlannerNotice({
      kind: "info",
      text: count > 0 ? t("app.planner.added", { count }) : t("app.planner.addedNone"),
    });
  }

  function build(): void {
    const text = request().trim();
    if (!text) return;
    const made = proposeFromText(text);
    if (!made) {
      setPlannerNotice({ kind: "error", text: t("app.planner.needTopics") });
      return;
    }
    setPlannerNotice(null);
    setRequest("");
    // The calendar shows the timetable, as proposed blocks, with Accept and Change above it.
    windowPage.openSchedule(null);
  }

  return (
    <section class="planner-card" aria-label={t("app.planner.title", { exam: syllabus().name })}>
      <div class="planner-head">
        <CalendarClock class="planner-glyph" aria-hidden="true" />
        <strong class="planner-title">{t("app.planner.title", { exam: syllabus().name })}</strong>
        <Button variant="ghost" size="xs" onClick={() => forgetExam()}>
          {t("app.planner.changeExam")}
        </Button>
        <IconButton
          variant="ghost"
          label={open() ? t("app.planner.collapse") : t("app.planner.expand")}
          aria-expanded={open() ? "true" : "false"}
          onClick={() => setOpen(!open())}
        >
          {open() ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </IconButton>
      </div>

      <Show when={!props.embedded}>
        <PlannerProposalControls
          onViewCalendar={() => windowPage.openSchedule(null)}
          onAccepted={(count) => setPlannerNotice({ kind: "info", text: t("app.planner.accepted", { count }) })}
        />
      </Show>

      <Show when={open()}>
        <SlidingTabs.Root value={subject()?.id ?? ""} onChange={(value) => setSubjectId(value)}>
          <SlidingTabs.List aria-label={t("app.planner.subjects")}>
            <For each={syllabus().subjects}>
              {(item) => <SlidingTabs.Trigger value={item.id}>{item.name}</SlidingTabs.Trigger>}
            </For>
          </SlidingTabs.List>
        </SlidingTabs.Root>

        <div class="planner-units">
          <For each={subject()?.units ?? []}>
            {(unit) => (
              <UnitRow
                unit={unit}
                expanded={expanded[unit.id] === true}
                onToggle={() =>
                  setExpanded((draft) => {
                    draft[unit.id] = draft[unit.id] !== true;
                  })
                }
                inCalendar={inCalendar}
                onAdd={addOne}
              />
            )}
          </For>
        </div>

        <div class="planner-selection">
          <span class="planner-selection-text">
            {plannerSelection().length > 0
              ? t("app.planner.selected", { count: plannerSelection().length, hours: selectedHours() })
              : t("app.planner.noneSelected")}
          </span>
          <Show when={plannerSelection().length > 0}>
            <Button variant="ghost" size="xs" onClick={() => clearSelection()}>
              {t("app.planner.clear")}
            </Button>
          </Show>
          <Button variant="outline" size="sm" disabled={plannerSelection().length === 0} onClick={() => addSelected()}>
            <Plus aria-hidden="true" />
            {t("app.planner.addSelected")}
          </Button>
        </div>
      </Show>

      <Show when={!props.embedded}>
        <form
          class="planner-request"
          onSubmit={(event) => {
            event.preventDefault();
            build();
          }}
        >
          <Input
            value={request()}
            onInput={(event) => setRequest(event.currentTarget.value)}
            aria-label={t("app.planner.requestLabel")}
            placeholder={t("app.planner.requestPlaceholder")}
          />
          <Button type="submit" size="sm" disabled={request().trim() === ""}>
            {t("app.planner.build")}
          </Button>
        </form>
      </Show>

      <Show when={plannerNotice()}>
        {(notice) => (
          <p class="planner-notice" data-kind={notice().kind} role={notice().kind === "error" ? "alert" : "status"}>
            <Show when={notice().kind === "info"}>
              <Check aria-hidden="true" />
            </Show>
            {notice().text}
          </p>
        )}
      </Show>
    </section>
  );
}

function UnitRow(props: {
  unit: PlannerUnit;
  expanded: boolean;
  onToggle: () => void;
  inCalendar: (topicId: string) => boolean;
  onAdd: (topicId: string) => void;
}) {
  const { t } = useText();
  const ids = () => props.unit.topics.map((topic) => topic.id);
  const allSelected = () => ids().every((id) => plannerSelection().includes(id));
  return (
    <div class="planner-unit" data-expanded={props.expanded ? "true" : undefined}>
      <div class="planner-unit-row">
        <Checkbox
          checked={allSelected()}
          aria-label={t("app.planner.selectUnit", { unit: props.unit.name })}
          onChange={(event) => setTopicsSelected(ids(), event.currentTarget.checked)}
        />
        <button
          type="button"
          class="planner-unit-name"
          aria-expanded={props.expanded ? "true" : "false"}
          onClick={() => props.onToggle()}
        >
          <span>{props.unit.name}</span>
          <span class="planner-unit-count">{t("app.planner.unitTopics", { count: props.unit.topics.length })}</span>
          {props.expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </button>
      </div>
      <Show when={props.expanded}>
        <ul class="planner-topics">
          <For each={props.unit.topics}>
            {(topic) => (
              <li class="planner-topic">
                <Checkbox
                  checked={plannerSelection().includes(topic.id)}
                  aria-label={t("app.planner.selectTopic", { topic: topic.name })}
                  onChange={() => toggleTopic(topic.id)}
                />
                <span class="planner-topic-name">{topic.name}</span>
                <span class="planner-topic-hours">{t("app.planner.hours", { hours: topic.hours })}</span>
                <Show
                  when={!props.inCalendar(topic.id)}
                  fallback={
                    <span
                      class="planner-topic-done"
                      role="img"
                      aria-label={t("app.planner.inCalendar", { topic: topic.name })}
                    >
                      <Check aria-hidden="true" />
                    </span>
                  }
                >
                  <IconButton
                    variant="ghost"
                    size="icon-xs"
                    label={t("app.planner.addTopic", { topic: topic.name })}
                    onClick={() => props.onAdd(topic.id)}
                  >
                    <Plus aria-hidden="true" />
                  </IconButton>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
