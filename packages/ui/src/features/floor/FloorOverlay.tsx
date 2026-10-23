import type { JSX } from "@solidjs/web";
import { createEffect, onCleanup, Show } from "solid-js";
import { Button } from "../../button";
import { Palette, Plus, Puzzle, Store, X } from "../../icons";
import { MotionTooltip } from "../../motion-tooltip";
import { useText } from "../../text";
import { FloorSidePanel, type FloorPanelAgent, type FloorTerminalLine } from "./FloorSidePanel";
import { FloorStrip, type FloorStripAgent } from "./FloorStrip";
import type { FloorMode } from "./floor-cast";
import type { FloorBridge } from "./floorBridge";

/**
 * The floor, shown over the main panel. The left rail stays visible, so the user can leave the floor
 * at any time with the rail or the close button. The floor is a separate web app in an iframe, so it
 * is mounted only while open: closing it removes the iframe.
 *
 * The toolbar keeps the app's own actions within reach: the marketplace, a new agent and the skills of
 * the selected agent. Each one is a callback from the host, so this component does not open dialogs.
 */
export function FloorOverlay(props: {
  open: boolean;
  /** The floor build, from apps/floor. */
  src: string;
  bridge: FloorBridge;
  mode: FloorMode;
  /** The agent picked on the floor, or `null` while none is picked. Shows the side panel. */
  selection: FloorPanelAgent | null;
  /** Every agent, for the strip below the floor. */
  strip: readonly FloorStripAgent[];
  /** How many agents the user hid. */
  hiddenCount: number;
  /** What the selected agent said and was told, for the Terminal tab. */
  terminal: readonly FloorTerminalLine[];
  /** Shown in the panel above the chat. The Librarian's library box. */
  panelExtra?: JSX.Element;
  /** Gets the element the app's chat is drawn over, or `undefined` when it goes away. */
  onChatSlot: (element: HTMLElement | undefined) => void;
  onSelectAgent: (agentId: string) => void;
  onDismissAgent: (agentId: string) => void;
  onRestoreTeam: () => void;
  /** Leaves the floor for the full chat of the agent. */
  onFocus: (agentId: string) => void;
  onClose: () => void;
  onHire: () => void;
  onNewAgent: () => void;
  onSkills: (agentId: string) => void;
  onCustomize: (agentId: string) => void;
}) {
  const { t } = useText();
  // While the overlay is open, the toasts move out of its top corners (see primitives.css).
  createEffect(
    () => props.open,
    (open) => {
      document.body.dataset.floorOpen = open ? "true" : "";
    },
  );
  onCleanup(() => {
    delete document.body.dataset.floorOpen;
  });
  return (
    <Show when={props.open}>
      <div
        class="floor-overlay"
        role="region"
        aria-label={t("app.floor.title")}
        style={{
          position: "absolute",
          inset: "0",
          "z-index": "40",
          display: "flex",
          "flex-direction": "column",
          background: "var(--jargon-bg-canvas)",
        }}
      >
        <div
          class="floor-overlay-bar"
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            gap: "8px",
            padding: "var(--jargon-space-2)",
            background: "var(--jargon-bg-sidebar)",
          }}
        >
          <div class="floor-overlay-tools" style={{ display: "flex", "align-items": "center", gap: "4px" }}>
            <MotionTooltip content={t("app.floor.hire")}>
              <Button
                variant="ghost"
                type="button"
                class="floor-overlay-hire"
                aria-label={t("app.floor.hire")}
                onClick={() => props.onHire()}
              >
                <Store aria-hidden="true" />
              </Button>
            </MotionTooltip>
            <MotionTooltip content={t("app.floor.newAgent")}>
              <Button
                variant="ghost"
                type="button"
                class="floor-overlay-new-agent"
                aria-label={t("app.floor.newAgent")}
                onClick={() => props.onNewAgent()}
              >
                <Plus aria-hidden="true" />
              </Button>
            </MotionTooltip>
            <Show when={props.selection}>
              {(selection) => (
                <MotionTooltip content={t("app.floor.card.skills")}>
                  <Button
                    variant="ghost"
                    type="button"
                    class="floor-overlay-skills"
                    aria-label={t("app.floor.card.skills")}
                    onClick={() => props.onSkills(selection().id)}
                  >
                    <Puzzle aria-hidden="true" />
                  </Button>
                </MotionTooltip>
              )}
            </Show>
            <Show when={props.selection}>
              {(selection) => (
                <MotionTooltip content={t("app.floor.card.customize")}>
                  <Button
                    variant="ghost"
                    type="button"
                    class="floor-overlay-customize"
                    aria-label={t("app.floor.card.customize")}
                    onClick={() => props.onCustomize(selection().id)}
                  >
                    <Palette aria-hidden="true" />
                  </Button>
                </MotionTooltip>
              )}
            </Show>
          </div>
          <Button
            variant="ghost"
            type="button"
            class="floor-overlay-close"
            aria-label={t("app.floor.close")}
            onClick={() => props.onClose()}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div class="floor-overlay-body">
          <iframe
            class="floor-overlay-frame"
            title={t("app.floor.title")}
            src={props.src}
            ref={(frame) => props.bridge.attach(frame)}
            style={{ flex: "1", width: "100%", border: "0", "min-height": "0" }}
          />
          <Show when={props.selection}>
            {(selection) => (
              <FloorSidePanel
                agent={selection()}
                terminal={props.terminal}
                extra={props.panelExtra}
                onChatSlot={props.onChatSlot}
                onFocus={() => props.onFocus(selection().id)}
              />
            )}
          </Show>
        </div>
        <FloorStrip
          agents={props.strip}
          selectedId={props.selection?.id ?? null}
          hiddenCount={props.hiddenCount}
          onSelect={props.onSelectAgent}
          onDismiss={props.onDismissAgent}
          onAdd={props.onNewAgent}
          onRestore={props.onRestoreTeam}
        />
      </div>
    </Show>
  );
}
