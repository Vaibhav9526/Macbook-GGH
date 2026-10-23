import type { AvatarHue } from "@jargon/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { createSignal, For, onSettled, Show } from "solid-js";
import { Badge } from "../../badge";
import { Button } from "../../button";
import { Maximize2 } from "../../icons";
import { useText } from "../../text";
import { AgentAvatar } from "../agents/AgentAvatar";
import type { FloorRole } from "./floor-cast";
import type { FloorStatus } from "./floorBridge";

/** The agent the panel shows. */
export interface FloorPanelAgent {
  id: string;
  name: string;
  status: FloorStatus;
  task: string | null;
  avatarSeed: string;
  avatarHue: AvatarHue | null;
  /** The role the floor gave the agent. `null` when it has none. */
  role: FloorRole | null;
  /** A role name from the host, such as a school persona's. It replaces the label of `role`. */
  roleLabel?: string | null;
}

/** One line of the terminal tab: who wrote it and the text. */
export interface FloorTerminalLine {
  id: string;
  from: "you" | "agent";
  text: string;
}

type Tab = "chat" | "terminal";

/**
 * The panel beside the floor for the tapped agent: its card (avatar, name, role, status), the Chat and
 * Terminal tabs, and a Focus button. The chat is the app's own conversation. The host places it over the
 * chat slot, so the transcript and the composer are the real ones and keep every feature they have.
 * `extra` shows above the chat: the Librarian's library box.
 */
export function FloorSidePanel(props: {
  agent: FloorPanelAgent;
  terminal: readonly FloorTerminalLine[];
  extra?: JSX.Element;
  /** Gets the element the chat is drawn over. `undefined` while the Chat tab is not shown. */
  onChatSlot: (element: HTMLElement | undefined) => void;
  onFocus: () => void;
}) {
  const { t } = useText();
  const [tab, setTab] = createSignal<Tab>("chat");
  const statusText = () => {
    if (props.agent.status === "working") return t("app.floor.status.working");
    if (props.agent.status === "waiting") return t("app.floor.status.waiting");
    return t("app.floor.status.idle");
  };
  const roleName = () => {
    if (props.agent.roleLabel) return props.agent.roleLabel;
    return props.agent.role ? roleText(props.agent.role) : "";
  };
  const roleText = (role: FloorRole) => {
    if (role === "boss") return t("app.floor.role.boss");
    if (role === "teacher") return t("app.floor.role.teacher");
    if (role === "student") return t("app.floor.role.student");
    return t("app.floor.role.worker");
  };
  const tabButton = (value: Tab, label: string) => (
    <Button
      variant="ghost"
      type="button"
      class="floor-panel-tab"
      role="tab"
      aria-selected={tab() === value ? "true" : "false"}
      data-active={tab() === value ? "true" : undefined}
      onClick={() => setTab(value)}
    >
      {label}
    </Button>
  );
  return (
    <aside class="floor-panel" aria-label={props.agent.name}>
      <header class="floor-panel-card">
        <span class="floor-panel-avatar">
          <AgentAvatar seed={props.agent.avatarSeed} hue={props.agent.avatarHue} agentId={props.agent.id} />
        </span>
        <div class="floor-panel-id">
          <h2 class="floor-panel-name">{props.agent.name}</h2>
          <span class="floor-panel-role">
            {roleName()}
          </span>
        </div>
        <Badge
          variant={
            props.agent.status === "working"
              ? "warning-light"
              : props.agent.status === "waiting"
                ? "info-light"
                : "secondary"
          }
        >
          {statusText()}
        </Badge>
      </header>
      <div class="floor-panel-tabs" role="tablist">
        {tabButton("chat", t("app.floor.panel.chat"))}
        {tabButton("terminal", t("app.floor.panel.terminal"))}
        <span class="floor-panel-spacer" />
        <Button
          variant="outline"
          type="button"
          class="floor-panel-focus"
          title={t("app.floor.panel.focusHint")}
          onClick={() => props.onFocus()}
        >
          <Maximize2 aria-hidden="true" />
          {t("app.floor.panel.focus")}
        </Button>
      </div>
      {props.extra}
      <Show
        when={tab() === "chat"}
        fallback={
          <div class="floor-panel-terminal" role="log">
            <Show when={props.terminal.length > 0} fallback={<p>{t("app.floor.panel.terminalEmpty")}</p>}>
              <For each={props.terminal}>
                {(line) => (
                  <p class="floor-panel-terminal-line" data-from={line.from}>
                    <span class="floor-panel-terminal-prompt">
                      {line.from === "you" ? t("app.floor.panel.terminalYou") : props.agent.name}
                    </span>
                    {line.text}
                  </p>
                )}
              </For>
            </Show>
          </div>
        }
      >
        <ChatSlot onSlot={props.onChatSlot} />
      </Show>
    </aside>
  );
}

/** The empty box the app's chat is drawn over. The host is told about it while it is mounted. */
function ChatSlot(props: { onSlot: (element: HTMLElement | undefined) => void }) {
  let slot: HTMLDivElement | undefined;
  onSettled(() => {
    props.onSlot(slot);
    return () => props.onSlot(undefined);
  });
  return <div class="floor-panel-chat-slot" ref={slot} />;
}
