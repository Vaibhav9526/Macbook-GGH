import { PlanningPage } from "@jargon/ui/features/tasks/PlanningPage";
import { useText } from "@jargon/ui/text";
import { createMemo, createSignal, createStore, Show } from "solid-js";
import { usePlatform } from "../../platform";
import { readAgentSelection, writeAgentSelection } from "../agents/agent-selection";
import { useAgents } from "../agents/agents-context";
import { voiceSupported } from "../conversation/voice-status";
import { PlannerProposalControls } from "../school/PlannerProposalControls";
import { PlannerWeekCalendar } from "../school/PlannerWeekCalendar";
import {
  plannerExam,
  plannerNotice,
  proposeFromText,
  setPlannerNotice,
  setPlannerOwner,
} from "../school/planner-state";
import { ExamQuestion, Syllabus } from "../school/SchoolPlannerPanel";
import { schoolAgentIdOf } from "../school/school-workspace";
import { createTasksVoice } from "../tasks/TasksPanel";
import type { TasksVoiceAdapter, TasksVoiceControls } from "../tasks/TasksView";

/** The agent last chosen in the Planning composer for each server. */
const PLANNING_AGENT_STORAGE_KEY = "jargon:planning-agent:v1";

export interface PlanningPanelProps {
  serverId: string;
  agentsOpen?: boolean | undefined;
  onToggleAgents?: (() => void) | undefined;
}

/**
 * The Planning page on desktop. Its composer is the Tasks composer: an agent chip (the Planner by default), a
 * microphone and a send button. What the student types is a request to the Planner, such as "cover these topics
 * in a week". The Planner asks for the exam first, then shows the syllabus and the timetable under the composer.
 */
export function PlanningPanel(props: PlanningPanelProps) {
  const { t } = useText();
  const { agentList } = useAgents();
  const { appInfo } = usePlatform();
  const [state, setState] = createStore<{
    agentId: string;
    draft: string;
    focusRequest: number;
    startError: string | null;
  }>({
    agentId: "",
    draft: "",
    focusRequest: 0,
    startError: null,
  });
  const [chosen, setChosen] = createSignal(readAgentSelection(PLANNING_AGENT_STORAGE_KEY)[props.serverId] ?? "");

  const isListed = (id: string) => agentList().some((agent) => agent.id === id);
  const agentId = createMemo(() => {
    if (isListed(state.agentId)) return state.agentId;
    if (isListed(chosen())) return chosen();
    const planner = schoolAgentIdOf("planner");
    return planner && isListed(planner) ? planner : (agentList()[0]?.id ?? "");
  });

  function submit(text: string): boolean {
    const request = text.trim();
    if (!request) return false;
    if (!plannerExam()) {
      setPlannerNotice({ kind: "error", text: t("app.planning.needExam") });
      return false;
    }
    if (!proposeFromText(request)) {
      setPlannerNotice({ kind: "error", text: t("app.planner.needTopics") });
      return false;
    }
    setPlannerNotice(null);
    setState((draft) => {
      draft.draft = "";
    });
    return true;
  }

  const controls: TasksVoiceControls = {
    serverId: () => props.serverId,
    draft: () => state.draft,
    setDraft: (text) =>
      setState((draft) => {
        draft.draft = text;
      }),
    start: submit,
    showError: (message) =>
      setState((draft) => {
        draft.startError = message;
      }),
    focus: () =>
      setState((draft) => {
        draft.focusRequest += 1;
      }),
  };
  const voice: TasksVoiceAdapter | undefined = voiceSupported(appInfo()?.platform)
    ? createTasksVoice(controls)
    : undefined;

  return (
    <PlanningPage
      agentsOpen={props.agentsOpen}
      onToggleAgents={props.onToggleAgents}
      agents={agentList()}
      agentId={agentId()}
      onAgentChange={(id) => {
        writeAgentSelection(PLANNING_AGENT_STORAGE_KEY, props.serverId, id);
        setChosen(id);
        setPlannerOwner(id);
        setState((draft) => {
          draft.agentId = id;
        });
      }}
      draft={state.draft}
      onDraftChange={controls.setDraft}
      focusRequest={state.focusRequest}
      startError={state.startError}
      onDismissStartError={() =>
        setState((draft) => {
          draft.startError = null;
        })
      }
      onStart={() => {
        if (voice?.phase === "recording") voice.submit();
        else submit(state.draft);
      }}
      voice={voice}
      placeholder={t("app.planning.placeholder")}
      sendLabel={t("app.planning.send")}
      errorTitle={t("app.planning.send")}
      side={
        <>
          <PlannerProposalControls
            onAccepted={(count) => setPlannerNotice({ kind: "info", text: t("app.planner.accepted", { count }) })}
          />
          <PlannerWeekCalendar />
        </>
      }
    >
      <Show
        when={plannerExam()}
        fallback={
          <>
            <ExamQuestion />
            <Show when={plannerNotice()}>
              {(notice) => (
                <p class="planner-notice" data-kind={notice().kind} role="alert">
                  {notice().text}
                </p>
              )}
            </Show>
          </>
        }
      >
        {(exam) => <Syllabus exam={exam()} embedded />}
      </Show>
    </PlanningPage>
  );
}
