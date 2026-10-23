import { agentProviderDescriptor } from "@jargon/contracts/agent-providers";
import { TEAM_AGENT_CREATE_MODEL_CAPABILITY } from "@jargon/contracts/team-protocol/current";
import {
  createFirstAgentDraft,
  type FirstAgentDraft,
  FirstAgentSetup,
} from "@jargon/ui/features/agents/FirstAgentSetup";
import { createEffect, createMemo, createSignal } from "solid-js";
import { useProviders } from "../../providers";
import { useAgentActions } from "../agents/agent-actions";
import { resolveCreationModel } from "../agents/agent-creation-model";
import { useAgents } from "../agents/agents-context";
import { useCustomAgents } from "../custom-agents/custom-agents-context";
import { useCustomProviders } from "../custom-providers/custom-providers-context";
import { useSetup } from "../onboarding/onboarding-context";
import { useServerSettings } from "../servers/server-settings";
import { useServers } from "../servers/servers-context";
import { SCHOOL_PERSONAS } from "./school-personas";
import { SCHOOL_SUGGESTIONS, schoolSuggestionPersona } from "./school-suggestions";
import { markSchoolAgent } from "./school-workspace";

/**
 * The create-agent form of the School workspace. It is the normal create-agent screen, offering the
 * school personas and school skills as its suggestions. A created agent is marked as a School agent,
 * with the persona its suggestion belongs to.
 */
export function SchoolPersonaSetup() {
  const {
    agentList,
    allAgentList,
    setAgentSetupOpen,
    agentSetupError,
    creatingAgent,
    modelOptions,
    agentStatus,
    serverSetupChoice,
  } = useAgents();
  const { createAgent } = useAgentActions();
  const { setupState } = useSetup();
  // Same provider wiring as the normal create screen, so the School form offers the same choices.
  const { customProviders } = useCustomProviders();
  const { customAgents } = useCustomAgents();
  const { activeServer, activeServerSupportsCapability } = useServers();
  const {
    providerRuntimeStatuses,
    providerRuntimeDownloadsAvailable,
    downloadProviderRuntime,
    cancelProviderRuntimeDownload,
    connectProvider,
    providerAdminServerId,
  } = useProviders();
  const { openServerSettings } = useServerSettings();
  const localProviderDownloads = () => activeServer()?.kind === "local" && providerRuntimeDownloadsAvailable();
  const createModelSupported = () =>
    activeServer()?.kind !== "remote" || activeServerSupportsCapability(TEAM_AGENT_CREATE_MODEL_CAPABILITY);

  const [draft, setDraft] = createSignal<FirstAgentDraft>(createFirstAgentDraft());

  /**
   * The School starts on Claude Haiku when the catalog lists it, because the Codex default needs a newer
   * CLI than some machines have. Without it, the normal resolution applies. The user's own pick wins.
   */
  const [modelTouched, setModelTouched] = createSignal(false);
  const schoolDefault = agentProviderDescriptor("claude");
  const defaultChoice = createMemo(() => {
    const options = modelOptions();
    if (options.some((option) => option.provider === schoolDefault.id && option.id === schoolDefault.defaultModel)) {
      return { provider: schoolDefault.id, model: schoolDefault.defaultModel };
    }
    return resolveCreationModel(serverSetupChoice() ?? setupState(), options);
  });
  createEffect(
    () => ({ touched: modelTouched(), choice: defaultChoice(), current: draft() }),
    ({ touched, choice, current }) => {
      if (touched || !choice) return;
      if (current.provider === choice.provider && current.model === choice.model) return;
      setDraft({ ...current, provider: choice.provider, model: choice.model });
    },
  );

  /**
   * Creates the agent through the normal create path, which keeps the picked model and the Customize
   * look, then marks the new agent as a School agent. A persona's own prompt is its suggestion's purpose
   * text, so the purpose the user sees is the one the agent gets.
   */
  async function submit(value: FirstAgentDraft): Promise<void> {
    // The full roster, not the School list: a new agent is only shown in the School once it is marked.
    const before = new Set(allAgentList().map((agent) => agent.id));
    await createAgent(value);
    if (agentSetupError()) return;
    const created = allAgentList().find((agent) => !before.has(agent.id));
    if (!created) return;
    const persona = schoolSuggestionPersona(value.suggestionId) ?? SCHOOL_PERSONAS[0]?.id;
    if (persona) markSchoolAgent(created.id, persona);
  }

  return (
    <FirstAgentSetup
      value={draft()}
      suggestions={SCHOOL_SUGGESTIONS}
      mode="additional"
      submitting={creatingAgent()}
      error={agentSetupError()}
      modelOptions={createModelSupported() ? modelOptions() : undefined}
      agentStatus={agentStatus()}
      runtimeStatuses={localProviderDownloads() ? providerRuntimeStatuses() : undefined}
      customProviders={customProviders()}
      customAgents={activeServer()?.kind === "local" ? customAgents() : undefined}
      onDownloadProvider={localProviderDownloads() ? downloadProviderRuntime : undefined}
      onCancelProviderDownload={localProviderDownloads() ? cancelProviderRuntimeDownload : undefined}
      onConnectProvider={localProviderDownloads() ? connectProvider : undefined}
      onAddCustomProvider={
        activeServer()?.kind === "local" || providerAdminServerId() !== undefined
          ? (trigger: HTMLElement) => {
              const server = activeServer();
              if (server) openServerSettings(server.id, trigger, "providers");
            }
          : undefined
      }
      onChange={(next) => {
        const current = draft();
        if (next.provider !== current.provider || next.model !== current.model) setModelTouched(true);
        setDraft(next);
      }}
      onSubmit={submit}
      onCancel={agentList().length > 0 ? () => setAgentSetupOpen(false) : undefined}
    />
  );
}
