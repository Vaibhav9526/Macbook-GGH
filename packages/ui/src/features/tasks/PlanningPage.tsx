import { Button, PanelLeft } from "@jargon/ui";
import { TasksComposer, type TasksComposerProps } from "@jargon/ui/features/tasks/TasksPage";
import { useText } from "@jargon/ui/text";
import type { JSX } from "@solidjs/web";
import { createUniqueId, Show } from "solid-js";

export interface PlanningPageProps extends TasksComposerProps {
  /** Whether the agent list shows beside the page. */
  agentsOpen?: boolean | undefined;
  /** Shows or hides the agent list. Without it, the header has no button for the list. */
  onToggleAgents?: (() => void) | undefined;
  /** The left column, under the composer: the question of the Planner, or the syllabus. */
  children?: JSX.Element;
  /** The right column: the calendar, with the timetable that the Planner proposes. */
  side?: JSX.Element;
}

/**
 * The Planning page: the Tasks page layout with its own words. The title sits next to the button for the agent
 * list, one centred composer (the chat composer, with an agent chip, a microphone and a send button) follows,
 * and the Planner's answers show below it in the same column.
 */
export function PlanningPage(props: PlanningPageProps) {
  const { t } = useText();
  const headingId = createUniqueId();
  const agentsLabel = () =>
    t(props.agentsOpen ? "conversation.tasks.page.hideAgents" : "conversation.tasks.page.showAgents");
  return (
    <section class="tasks-page planning-page" aria-labelledby={headingId}>
      <div class="tasks-page-scroll">
        <div class="tasks-page-column">
          <header class="tasks-page-header">
            <Show when={props.onToggleAgents}>
              {(toggle) => (
                <Button
                  variant="ghost"
                  type="button"
                  class="header-panel-toggle side-panel-toggle"
                  aria-label={agentsLabel()}
                  title={agentsLabel()}
                  aria-expanded={props.agentsOpen ? "true" : "false"}
                  onClick={() => toggle()()}
                >
                  <PanelLeft aria-hidden="true" class="size-[14px]" />
                </Button>
              )}
            </Show>
            <h2 id={headingId} tabindex={-1}>
              {t("app.planning.title")}
            </h2>
          </header>
          <TasksComposer
            agents={props.agents}
            agentId={props.agentId}
            onAgentChange={props.onAgentChange}
            draft={props.draft}
            onDraftChange={props.onDraftChange}
            focusRequest={props.focusRequest}
            startError={props.startError}
            onDismissStartError={props.onDismissStartError}
            onStart={props.onStart}
            voice={props.voice}
            placeholder={props.placeholder}
            sendLabel={props.sendLabel}
            errorTitle={props.errorTitle}
          />
          <div class="planning-page-grid">
            <div class="planning-page-left" aria-live="polite">
              {props.children}
            </div>
            <div class="planning-page-right">{props.side}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
