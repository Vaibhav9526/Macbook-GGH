import { createMemo } from "solid-js";
import { useAgentActions } from "../agents/agent-actions";
import { resolveCreationModel } from "../agents/agent-creation-model";
import { useAgents } from "../agents/agents-context";
import { useSetup } from "../onboarding/onboarding-context";
import type { SchoolPersonaId } from "./school-personas";
import { type SchoolPersona, schoolPersona } from "./school-personas";
import { markSchoolAgent } from "./school-workspace";

/**
 * Makes an agent from a school persona. The persona's instructions become the agent's standing role, the
 * persona's avatar and floor role come with it, and the agent is marked as a School agent so only the
 * School workspace shows it. The model is the one a new agent would start on.
 */
export function useSchoolAgentCreator() {
  const { createAgentInPlace } = useAgentActions();
  const { modelOptions, serverSetupChoice } = useAgents();
  const { setupState } = useSetup();
  const model = createMemo(() => resolveCreationModel(serverSetupChoice() ?? setupState(), modelOptions()));

  async function createPersonaAgent(persona: SchoolPersona, name: string) {
    const choice = model();
    const agent = await createAgentInPlace({
      name,
      purpose: persona.prompt,
      avatarSeed: persona.avatarSeed,
      avatarHue: persona.avatarHue,
      ...(choice ? { provider: choice.provider, model: choice.model } : {}),
    });
    markSchoolAgent(agent.id, persona.id);
    return agent;
  }

  return { createPersonaAgent, personaOf: (id: SchoolPersonaId) => schoolPersona(id) };
}
