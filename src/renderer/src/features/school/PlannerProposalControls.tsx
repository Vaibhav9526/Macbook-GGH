import { Button, CalendarClock, Check, Input, TriangleAlert } from "@jargon/ui";
import { useText } from "@jargon/ui/text";
import { createSignal, Show } from "solid-js";
import { acceptProposal, changeProposal, discardProposal, plannerProposal, REQUEST_SEPARATOR } from "./planner-state";

/**
 * The timetable that waits for a decision: what it holds, and the three things the student can do with it.
 * It shows above the calendar and in the Planner chat, so both places answer the same way.
 */
export function PlannerProposalControls(props: {
  /** Shown in the chat, where the calendar is one step away. */
  onViewCalendar?: () => void;
  onAccepted?: (count: number) => void;
}) {
  const { t, format } = useText();
  const [changing, setChanging] = createSignal(false);
  const [change, setChange] = createSignal("");

  function accept(): void {
    const count = acceptProposal();
    props.onAccepted?.(count);
  }

  function submitChange(): void {
    const text = change().trim();
    if (!text) return;
    changeProposal(text);
    setChange("");
    setChanging(false);
  }

  return (
    <Show when={plannerProposal()}>
      {(proposal) => {
        const blocks = () => proposal().blocks;
        const hours = () => Math.round((blocks().reduce((sum, block) => sum + block.durationMin, 0) / 60) * 10) / 10;
        const day = (iso: string) => format.date(new Date(iso), { month: "short", day: "numeric" });
        return (
          <section class="planner-proposal" aria-label={t("app.planner.proposalTitle")}>
            <div class="planner-proposal-head">
              <CalendarClock aria-hidden="true" />
              <strong>{t("app.planner.proposalTitle")}</strong>
            </div>
            <p class="planner-proposal-request">{proposal().request.split(REQUEST_SEPARATOR).join(" · ")}</p>
            <Show
              when={blocks().length > 0}
              fallback={<p class="planner-proposal-note">{t("app.planner.proposalEmpty")}</p>}
            >
              <p class="planner-proposal-summary">
                {t("app.planner.proposalSummary", {
                  count: blocks().length,
                  first: day(blocks()[0]?.start ?? ""),
                  last: day(blocks().at(-1)?.start ?? ""),
                  hours: hours(),
                })}
              </p>
            </Show>
            <Show when={proposal().stretchedToDays}>
              {(days) => (
                <p class="planner-proposal-note" role="status">
                  <TriangleAlert aria-hidden="true" />
                  {t("app.planner.stretched", { days: days() })}
                </p>
              )}
            </Show>
            <Show when={changing()}>
              <form
                class="planner-proposal-change"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitChange();
                }}
              >
                <Input
                  value={change()}
                  onInput={(event) => setChange(event.currentTarget.value)}
                  aria-label={t("app.planner.changeLabel")}
                  placeholder={t("app.planner.changePlaceholder")}
                />
                <Button type="submit" size="sm" disabled={change().trim() === ""}>
                  {t("app.planner.apply")}
                </Button>
              </form>
            </Show>
            <div class="planner-proposal-actions">
              <Button size="sm" disabled={blocks().length === 0} onClick={accept}>
                <Check aria-hidden="true" />
                {t("app.planner.accept")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setChanging(!changing())}>
                {t("app.planner.change")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => discardProposal()}>
                {t("app.planner.discard")}
              </Button>
              <Show when={props.onViewCalendar}>
                <Button variant="ghost" size="sm" onClick={() => props.onViewCalendar?.()}>
                  {t("app.planner.viewCalendar")}
                </Button>
              </Show>
            </div>
          </section>
        );
      }}
    </Show>
  );
}
