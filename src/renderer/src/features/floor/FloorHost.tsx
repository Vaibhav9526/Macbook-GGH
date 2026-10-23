import { FloorOverlay } from "@jargon/ui/features/floor/FloorOverlay";
import type { FloorMode, FloorRole } from "@jargon/ui/features/floor/floor-cast";
import type { FloorCustom } from "@jargon/ui/features/floor/floor-custom";
import { createFloorBridge, type FloorSourceAgent, floorStatus } from "@jargon/ui/features/floor/floorBridge";
import { SeeAgentsButton } from "@jargon/ui/features/floor/SeeAgentsButton";
import type { FloorPanelAgent, FloorTerminalLine } from "@jargon/ui/features/floor/FloorSidePanel";
import type { FloorStripAgent } from "@jargon/ui/features/floor/FloorStrip";
import { computeSidebarAgentStates } from "@jargon/ui/features/sidebar/sidebar-agent-states";
import { useText } from "@jargon/ui/text";
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { useLayout } from "../../layout";
import { useNavigation } from "../../navigation";
import { useTurns } from "../../turns";
import { useAgentActions } from "../agents/agent-actions";
import { useAgents } from "../agents/agents-context";
import { useChannels } from "../channels/channels-context";
import { useConversation } from "../conversation/conversation-context";
import { schoolPersona } from "../school/school-personas";
import { schoolActive, schoolPersonaOf } from "../school/school-workspace";
import { useServerSettings } from "../servers/server-settings";
import { useSettings } from "../settings/settings-context";
import { SchoolLibraryStrip } from "../school/SchoolLibraryStrip";
import { useWindowPage } from "../window/window-page-context";
import { readFloorCustom, writeFloorCustom } from "./floor-custom-store";

/** Whether the floor overlay is open. The rail button and the overlay share it. */
const [floorOpen, setFloorOpen] = createSignal(false);
/** The agent picked on the floor and the role the floor gave it. Its side card stays until the user leaves. */
const [selected, setSelected] = createSignal<{ id: string; role: FloorRole | null } | null>(null);
/** The custom look chosen this session, by agent id. Storage holds it across restarts. */
const [customs, setCustoms] = createSignal<Record<string, FloorCustom | null>>({});

/** The custom look of an agent: the choice made this session, else the stored one. */
function customOf(agentId: string): FloorCustom | null {
  const chosen = customs();
  return agentId in chosen ? (chosen[agentId] ?? null) : readFloorCustom(agentId);
}

/** The role on the floor of an agent made from a school persona. */
function schoolFloorRole(agentId: string) {
  const id = schoolPersonaOf(agentId);
  return id ? schoolPersona(id)?.floorRole : undefined;
}

/**
 * The floor is a separate small app (apps/floor). It is served at /floor/ on the renderer's own origin
 * (see floorHostPlugin in electron.vite.config.ts), so the page CSP needs no change.
 */
const floorSrc = () => new URL("floor/index.html", window.location.href).toString();

/** The rail button. Clicking it is the only way the floor opens. */
export function FloorRailButton() {
  return <SeeAgentsButton current={floorOpen()} onOpen={() => setFloorOpen(true)} />;
}

/**
 * The overlay, with the live agent list sent to the floor. Mounted once in the workspace frame.
 *
 * Each agent is drawn as its own blob avatar: the floor gets the blob's shape index and colour. The
 * toolbar and the side card reuse the app's own actions: the marketplace, the create-agent flow, the
 * agent's settings (where its skills are) and the agent's chat. The floor closes before each one, so
 * the app's dialog is not hidden behind it.
 */
export function FloorOverlayHost() {
  // The Local workspace opens the Office floor, the School workspace the School floor. No switch between them.
  const floorMode = (): FloorMode => (schoolActive() ? "school" : "office");
  const { agentList, openAgentSetup, activeAgentId, userHiddenAgentIds } = useAgents();
  const { activeTurns, queues, failedTurns, usageLimits, pendingPrompts, approvals } = useTurns();
  const { t } = useText();
  const { unreadReplies, recentReplies, conversations } = useConversation();
  const { selectAgent } = useNavigation();
  const { editAgent, setAgentHiddenByUser } = useAgentActions();
  const { setSkillsMarketplaceOpen, appSettingsOpen, skillsMarketplaceOpen } = useSettings();
  const { serverSettingsOpen } = useServerSettings();
  const windowPage = useWindowPage();
  const layout = useLayout();
  const channels = useChannels();

  // Picking an agent on the floor opens its chat in the panel. That may switch the rail page to Agents,
  // which is not a reason to leave the floor.
  let pickingAgent = false;

  // Any navigation closes the floor, so the page it opens is not hidden under it: a rail page,
  // a channel, settings, or the marketplace. The toolbar buttons close it themselves. A chat opened
  // from the sidebar while the floor is open shows in the panel instead (see the effect below).
  createEffect(
    () => [
      windowPage.page(),
      channels.state.selectedId,
      appSettingsOpen(),
      serverSettingsOpen(),
      skillsMarketplaceOpen(),
    ],
    () => {
      untrack(() => {
        if (floorOpen() && !pickingAgent) setFloorOpen(false);
      });
    },
  );

  // The panel follows the open chat, so an agent picked in the sidebar shows there too. The agent that
  // was open when the floor opened is not a pick: the panel stays empty until the user taps someone.
  let activeOnOpen: string | null = null;
  createEffect(
    () => (floorOpen() ? activeAgentId() : null),
    (agentId) => {
      if (!agentId) {
        activeOnOpen = null;
        return;
      }
      if (activeOnOpen === null) {
        activeOnOpen = agentId;
        return;
      }
      if (agentId !== activeOnOpen && untrack(selected)?.id !== agentId) setSelected({ id: agentId, role: null });
      activeOnOpen = agentId;
    },
  );

  // The panel starts empty each time the floor opens.
  createEffect(
    () => floorOpen(),
    (open) => {
      if (!open) setSelected(null);
    },
  );

  function pickAgent(agentId: string, role: FloorRole | null) {
    setSelected({ id: agentId, role });
    pickingAgent = true;
    // The routines view has no chat. The sidebar view goes back to the agent list, so the chat can show.
    if (layout.sidebarView() !== "agents") layout.setSidebarView("agents");
    selectAgent(agentId);
    setTimeout(() => {
      pickingAgent = false;
    }, 250);
  }

  // Same inputs as the sidebar badges, so the floor and the sidebar always agree on who is working.
  const states = createMemo(() => {
    const agentThreads = new Map(agentList().map((agent) => [agent.id, agent.threadId]));
    const inAgentThread = (agentId: string, threadId: string | undefined) =>
      threadId !== undefined && agentThreads.get(agentId) === threadId;
    return computeSidebarAgentStates({
      agentIds: agentList().map((agent) => agent.id),
      activeTurns: activeTurns(),
      queues: queues(),
      unreadReplies: unreadReplies(),
      recentReplies: recentReplies(),
      pendingPrompts: Object.fromEntries(
        Object.entries(pendingPrompts()).filter(([agentId, event]) =>
          inAgentThread(agentId, event?.type === "prompt" ? event.threadId : event?.request.threadId),
        ),
      ),
      pendingApprovals: Object.fromEntries(
        approvals()
          .filter((approval) => inAgentThread(approval.agentId, approval.threadId))
          .map((approval) => [approval.agentId, approval]),
      ),
      failedTurns: failedTurns(),
      usageLimits: usageLimits(),
    });
  });

  // The floor is fed from the live agent list, so an agent hired from the marketplace shows up here.
  const shownAgents = createMemo(() => agentList().filter((agent) => !userHiddenAgentIds().has(agent.id)));
  const floorAgents = (): FloorSourceAgent[] =>
    shownAgents().map((agent) => ({
      id: agent.id,
      name: agent.name,
      avatarSeed: agent.avatarSeed,
      avatarHue: agent.avatarHue ?? null,
      task: agent.title || null,
      state: states()[agent.id],
      custom: customOf(agent.id),
      role: schoolFloorRole(agent.id),
    }));

  const selection = createMemo((): FloorPanelAgent | null => {
    const picked = selected();
    const agent = picked ? agentList().find((item) => item.id === picked.id) : undefined;
    if (!picked || !agent) return null;
    return {
      id: agent.id,
      name: agent.name,
      status: floorStatus(states()[agent.id]),
      task: agent.title || null,
      avatarSeed: agent.avatarSeed,
      avatarHue: agent.avatarHue ?? null,
      role: picked.role,
      roleLabel: schoolRoleLabel(agent.id),
    };
  });

  const schoolRoleLabel = (agentId: string): string | null => {
    const id = schoolPersonaOf(agentId);
    const persona = id ? schoolPersona(id) : undefined;
    return persona ? t(persona.roleKey) : null;
  };

  const strip = createMemo((): FloorStripAgent[] =>
    shownAgents().map((agent) => ({
      id: agent.id,
      name: agent.name,
      status: floorStatus(states()[agent.id]),
      line: agent.title || null,
      avatarSeed: agent.avatarSeed,
      avatarHue: agent.avatarHue ?? null,
    })),
  );
  const hiddenCount = createMemo(() => agentList().filter((agent) => userHiddenAgentIds().has(agent.id)).length);

  /** The last lines of the open agent's chat, for the Terminal tab. */
  const terminal = createMemo((): FloorTerminalLine[] => {
    const id = selected()?.id;
    const messages = id ? (conversations[id]?.messages ?? []) : [];
    return messages
      .filter((message) => (message.kind === undefined || message.kind === "text") && message.body.trim() !== "")
      .slice(-40)
      .map((message) => ({
        id: message.id,
        from: message.author === "you" ? "you" : "agent",
        text: message.body.trim().slice(0, 600),
      }));
  });

  const isLibrarian = () => {
    const id = selected()?.id;
    return id !== undefined && schoolPersonaOf(id) === "librarian";
  };

  // The app's chat is drawn over the panel's chat slot. The slot's rectangle is written as CSS variables
  // (in window coordinates: the chat is position: fixed), and body marks that it applies.
  let slotObserver: ResizeObserver | undefined;
  let removeResize: (() => void) | undefined;
  const clearChatSlot = () => {
    slotObserver?.disconnect();
    slotObserver = undefined;
    removeResize?.();
    removeResize = undefined;
    delete document.body.dataset.floorChat;
  };
  function setChatSlot(element: HTMLElement | undefined) {
    clearChatSlot();
    if (!element) return;
    const place = () => {
      const slot = element.getBoundingClientRect();
      const style = document.documentElement.style;
      style.setProperty("--floor-chat-x", `${slot.left}px`);
      style.setProperty("--floor-chat-y", `${slot.top}px`);
      style.setProperty("--floor-chat-w", `${slot.width}px`);
      style.setProperty("--floor-chat-h", `${slot.height}px`);
    };
    place();
    slotObserver = new ResizeObserver(place);
    slotObserver.observe(element);
    window.addEventListener("resize", place);
    removeResize = () => window.removeEventListener("resize", place);
    document.body.dataset.floorChat = "true";
  }
  onCleanup(clearChatSlot);

  const bridge = createFloorBridge({
    agents: floorAgents,
    mode: floorMode,
    // The workspace fixes the mode: Local shows Office only, School shows School only.
    lockMode: true,
    onSelectAgent: pickAgent,
    onCustomize: (agentId, custom) => {
      writeFloorCustom(agentId, custom);
      setCustoms((current) => ({ ...current, [agentId]: custom }));
    },
    onClose: () => setFloorOpen(false),
  });

  const focusAgent = (agentId: string) => {
    setFloorOpen(false);
    selectAgent(agentId);
  };

  return (
    <FloorOverlay
      open={floorOpen()}
      src={floorSrc()}
      bridge={bridge}
      mode={floorMode()}
      selection={selection()}
      strip={strip()}
      hiddenCount={hiddenCount()}
      terminal={terminal()}
      panelExtra={isLibrarian() ? <SchoolLibraryStrip /> : undefined}
      onChatSlot={setChatSlot}
      onSelectAgent={(agentId) => pickAgent(agentId, null)}
      onDismissAgent={(agentId) => {
        if (selected()?.id === agentId) setSelected(null);
        void setAgentHiddenByUser(agentId, true);
      }}
      onRestoreTeam={() => {
        for (const agentId of userHiddenAgentIds()) void setAgentHiddenByUser(agentId, false);
      }}
      onFocus={focusAgent}
      onClose={() => setFloorOpen(false)}
      onHire={() => {
        setFloorOpen(false);
        setSkillsMarketplaceOpen(true);
      }}
      onNewAgent={() => {
        setFloorOpen(false);
        openAgentSetup();
      }}
      onSkills={(agentId) => {
        setFloorOpen(false);
        // Opens the agent's settings, where its skills are attached.
        editAgent(agentId);
      }}
      onCustomize={(agentId) => bridge.openCustomizer(agentId)}
    />
  );
}
