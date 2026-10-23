/**
 * The Teaching guide launcher in the sidebar top bar. It opens a separate
 * desktop program; this component only calls the action it is given.
 *
 * The graduation-cap SVG is hand-written instead of a `lucide-solid` icon
 * because the brief asks for this exact mark. It follows the sidebar's own SVG
 * conventions (`SidebarIcons.tsx`), which is the exception `src/renderer/AGENTS.md`
 * asks to be named.
 */

import { Button, MotionTooltip } from "@jargon/ui";
import { useText } from "../../text";

export function SuperJargonButton(props: { onOpen: () => void }) {
  const { t } = useText();
  const label = () => t("sidebar.topbar.teachingGuide");
  return (
    <MotionTooltip content={label()}>
      <Button
        variant="ghost"
        type="button"
        class="sidebar-icon-button no-drag"
        aria-label={label()}
        onClick={() => props.onOpen()}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" class="ui-glyph-20 size-4 fill-none stroke-current">
          <path d="M10 3.6 2.4 7.4 10 11.2l7.6-3.8L10 3.6Z" stroke-linejoin="round" />
          <path d="M5.4 9.3v3.3c0 1.4 2.1 2.6 4.6 2.6s4.6-1.2 4.6-2.6V9.3" stroke-linecap="round" />
          <path d="M17.6 7.4v4.3" stroke-linecap="round" />
          <circle cx="17.6" cy="12.6" r="0.9" />
        </svg>
      </Button>
    </MotionTooltip>
  );
}
