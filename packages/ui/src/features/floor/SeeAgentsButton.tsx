import { Button } from "../../button";
import { MotionTooltip } from "../../motion-tooltip";
import { useText } from "../../text";

/**
 * A desk with a monitor on it. Lucide has no desk icon, so this one is drawn here. It uses the same
 * stroke style as the Lucide icons.
 */
export function DeskMonitorIcon(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="10" rx="1.5" />
      <path d="M12 13v3" />
      <path d="M8 16h8" />
      <path d="M2 19h20" />
      <path d="M5 19v2" />
      <path d="M19 19v2" />
    </svg>
  );
}

/**
 * The rail button that opens the floor. It is a rail item like the others: the same ghost button and
 * the same tooltip. The floor itself opens only when the user clicks this.
 */
export function SeeAgentsButton(props: {
  /** Opens the floor overlay. */
  onOpen: () => void;
  /** Marks the button while the floor is open. */
  current?: boolean;
}) {
  const { t } = useText();
  const label = () => t("app.floor.seeAgents");
  return (
    <MotionTooltip content={label()}>
      <Button
        variant="ghost"
        type="button"
        class="window-rail-button floor-see-agents-button"
        aria-label={label()}
        aria-pressed={props.current ? "true" : undefined}
        onClick={() => props.onOpen()}
      >
        <DeskMonitorIcon />
      </Button>
    </MotionTooltip>
  );
}
