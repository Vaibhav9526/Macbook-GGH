import type { AvatarHue } from "@jargon/contracts/ipc";
import { Show } from "solid-js";
import { Button } from "../../button";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import type { FloorRole } from "./floor-cast";
import type { FloorStatus } from "./floorBridge";

/** The agent the user picked on the floor. */
export interface FloorSelection {
  id: string;
  name: string;
  status: FloorStatus;
  task: string | null;
  /** The agent's own blob avatar: its seed and hue. */
  avatarSeed: string;
  avatarHue: AvatarHue | null;
  /** The role the floor gave the agent. `null` when the floor sent none. */
  role: FloorRole | null;
}

/**
 * The card beside the floor for the selected agent. It shows the agent's own blob avatar, its name,
 * status, task and the role the floor gave it. Open chat leaves the floor for the agent's chat.
 * Skills opens the agent's settings, where the skills are attached.
 */
export function FloorAgentCard(props: {
  selection: FloorSelection;
  onOpenChat: () => void;
  onSkills: () => void;
  /** Opens the floor's look panel for this agent. */
  onCustomize: () => void;
}) {
  const { t } = useText();
  return (
    <aside class="floor-agent-card" aria-label={props.selection.name} style={cardStyle}>
      <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
        <AgentAvatar seed={props.selection.avatarSeed} hue={props.selection.avatarHue} agentId={props.selection.id} />
        <div style={{ display: "flex", "flex-direction": "column", "min-width": "0" }}>
          <h2 class="floor-agent-card-name" style={{ margin: "0", "font-size": "16px" }}>
            {props.selection.name}
          </h2>
          <Show when={props.selection.role}>
            {(role) => (
              <p class="floor-agent-card-role" style={{ margin: "0", opacity: "0.7" }}>
                {roleLabel(t, role())}
              </p>
            )}
          </Show>
        </div>
      </div>
      <p class={`floor-agent-card-status floor-agent-card-status-${props.selection.status}`} style={{ margin: "0" }}>
        {statusLabel(t, props.selection.status)}
      </p>
      <p class="floor-agent-card-task" style={{ margin: "0", opacity: "0.8" }}>
        {props.selection.task ?? t("app.floor.card.noTask")}
      </p>
      <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
        <Button variant="outline" type="button" class="floor-agent-card-chat" onClick={() => props.onOpenChat()}>
          {t("app.floor.card.openChat")}
        </Button>
        <Button variant="outline" type="button" class="floor-agent-card-customize" onClick={() => props.onCustomize()}>
          {t("app.floor.card.customize")}
        </Button>
        <Button variant="outline" type="button" class="floor-agent-card-skills" onClick={() => props.onSkills()}>
          {t("app.floor.card.skills")}
        </Button>
      </div>
    </aside>
  );
}

type Translate = ReturnType<typeof useText>["t"];

/** The status text in the interface language. Explicit keys keep the catalog check exact. */
function statusLabel(t: Translate, status: FloorStatus): string {
  if (status === "working") return t("app.floor.status.working");
  if (status === "waiting") return t("app.floor.status.waiting");
  return t("app.floor.status.idle");
}

/** The role label in the interface language. */
function roleLabel(t: Translate, role: FloorRole): string {
  if (role === "boss") return t("app.floor.role.boss");
  if (role === "teacher") return t("app.floor.role.teacher");
  if (role === "student") return t("app.floor.role.student");
  return t("app.floor.role.worker");
}

const cardStyle = {
  display: "flex",
  "flex-direction": "column",
  gap: "10px",
  width: "260px",
  "flex-shrink": "0",
  padding: "16px",
  overflow: "auto",
  "border-left": "1px solid var(--jargon-border)",
  background: "var(--jargon-bg-sidebar)",
} as const;
