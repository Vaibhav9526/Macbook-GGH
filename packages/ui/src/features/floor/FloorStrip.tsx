import type { AvatarHue } from "@jargon/contracts/ipc";
import { For, Show } from "solid-js";
import { Badge } from "../../badge";
import { Button } from "../../button";
import { Plus, RotateCcw, X } from "../../icons";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import type { FloorStatus } from "./floorBridge";

/** One agent in the strip below the floor. */
export interface FloorStripAgent {
  id: string;
  name: string;
  status: FloorStatus;
  /** A short line: the agent's task. `null` when it has none. */
  line: string | null;
  avatarSeed: string;
  avatarHue: AvatarHue | null;
}

const STATUS_VARIANT = {
  working: "warning-light",
  waiting: "info-light",
  idle: "secondary",
} as const satisfies Record<FloorStatus, "warning-light" | "info-light" | "secondary">;

/**
 * The row of cards under the floor: every agent as a card with its avatar, name, status pill and a short
 * line. A click opens the agent in the side panel. The x hides an agent from the team, and Restore team
 * brings the hidden ones back. Add agent opens the app's create-agent flow.
 */
export function FloorStrip(props: {
  agents: readonly FloorStripAgent[];
  selectedId: string | null;
  /** How many agents the user hid. Restore team is off while it is 0. */
  hiddenCount: number;
  onSelect: (agentId: string) => void;
  onDismiss: (agentId: string) => void;
  onAdd: () => void;
  onRestore: () => void;
}) {
  const { t } = useText();
  const statusLabel = (status: FloorStatus) => {
    if (status === "working") return t("app.floor.status.working");
    if (status === "waiting") return t("app.floor.status.waiting");
    return t("app.floor.status.idle");
  };
  return (
    <section class="floor-strip" aria-label={t("app.floor.strip.label")}>
      <div class="floor-strip-cards">
        <For each={props.agents}>
          {(agent) => (
            <div class="floor-strip-slot">
              <button
                type="button"
                class="floor-strip-card"
                data-selected={props.selectedId === agent.id ? "true" : undefined}
                aria-pressed={props.selectedId === agent.id ? "true" : "false"}
                onClick={() => props.onSelect(agent.id)}
              >
                <span class="floor-strip-avatar">
                  <AgentAvatar seed={agent.avatarSeed} hue={agent.avatarHue} agentId={agent.id} />
                </span>
                <span class="floor-strip-text">
                  <span class="floor-strip-name">{agent.name}</span>
                  <Badge variant={STATUS_VARIANT[agent.status]} class="floor-strip-status">
                    {statusLabel(agent.status)}
                  </Badge>
                  <span class="floor-strip-line">{agent.line ?? t("app.floor.card.noTask")}</span>
                </span>
              </button>
              <button
                type="button"
                class="floor-strip-dismiss"
                aria-label={t("app.floor.strip.dismiss", { name: agent.name })}
                onClick={() => props.onDismiss(agent.id)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          )}
        </For>
      </div>
      <div class="floor-strip-actions">
        <Button variant="outline" type="button" class="floor-strip-add" onClick={() => props.onAdd()}>
          <Plus aria-hidden="true" />
          {t("app.floor.strip.add")}
        </Button>
        <Button
          variant="outline"
          type="button"
          class="floor-strip-restore"
          disabled={props.hiddenCount === 0}
          title={props.hiddenCount === 0 ? t("app.floor.strip.restoreNone") : undefined}
          onClick={() => props.onRestore()}
        >
          <RotateCcw aria-hidden="true" />
          {t("app.floor.strip.restore")}
          <Show when={props.hiddenCount > 0}>
            <span class="floor-strip-restore-count">{props.hiddenCount}</span>
          </Show>
        </Button>
      </div>
    </section>
  );
}
