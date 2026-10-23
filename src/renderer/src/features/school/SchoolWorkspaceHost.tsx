import { INPUT_LIMITS } from "@jargon/contracts/input-limits";
import { useText } from "@jargon/ui/text";
import { createEffect } from "solid-js";
import { useAgents } from "../agents/agents-context";
import { useSchoolAgentCreator } from "./school-agents";
import { SCHOOL_PERSONAS, schoolPersona } from "./school-personas";
import {
  clearSchoolSeeded,
  extraPersonaSeeded,
  schoolActive,
  schoolAgentIdOf,
  schoolPersonaOf,
  schoolSeeded,
  setExtraPersonaSeeded,
  setSchoolSeeded,
} from "./school-workspace";

/**
 * Renderless. The first time the School workspace opens, it makes one agent for each of the five personas.
 * It waits until the roster has loaded and a model is known, so the agents can start. The flag is set
 * before the first agent is made, so a second open cannot make them twice; if no agent could be made it is
 * cleared again, so the next open tries again.
 */
export function SchoolWorkspaceHost() {
  const { t } = useText();
  const { agentListSettled, modelOptions, allAgentList, updateAgent } = useAgents();
  const { createPersonaAgent } = useSchoolAgentCreator();
  let seeding = false;
  /**
   * The prompt last sent to each agent. The effect below runs again on every roster change, and each
   * update is a roster change: a stored description that never equals the persona prompt would then
   * update forever. One send per agent and prompt breaks that loop.
   */
  const sentPrompts = new Map<string, string>();

  async function seed(): Promise<void> {
    seeding = true;
    setSchoolSeeded();
    let made = 0;
    for (const persona of SCHOOL_PERSONAS) {
      try {
        await createPersonaAgent(persona, t(persona.nameKey));
        made += 1;
        if (persona.id === "planner") setExtraPersonaSeeded("planner");
      } catch {
        // The next open of the School tries again for this persona.
      }
    }
    if (made === 0) clearSchoolSeeded();
    seeding = false;
  }

  /** The Planner joined the School after some students had opened it: they get one Planner agent too. */
  async function seedPlanner(): Promise<void> {
    const persona = schoolPersona("planner");
    if (!persona) return;
    seeding = true;
    setExtraPersonaSeeded("planner");
    try {
      await createPersonaAgent(persona, t(persona.nameKey));
    } catch {
      // The mark is kept, so a failure is not tried again. The student can add a Planner from the create form.
    }
    seeding = false;
  }

  // A School agent made before a persona changed keeps the old instructions. Bring its description up to date.
  createEffect(
    () => (schoolActive() && agentListSettled() ? allAgentList() : null),
    (agents) => {
      if (!agents) return;
      for (const agent of agents) {
        const persona = schoolPersonaOf(agent.id);
        const current = persona ? schoolPersona(persona) : undefined;
        if (!current) continue;
        // updateAgent cuts the description to the backend limit, so the stored text is compared cut the same way.
        const wanted = current.prompt.slice(0, INPUT_LIMITS.agentDescription);
        if (agent.description === wanted || sentPrompts.get(agent.id) === current.prompt) continue;
        sentPrompts.set(agent.id, current.prompt);
        void updateAgent(agent.id, { description: current.prompt }).catch(() => {
          // Sent again on the next open of the School.
          sentPrompts.delete(agent.id);
        });
      }
    },
  );

  createEffect(
    () => ({ school: schoolActive(), settled: agentListSettled(), ready: modelOptions().length > 0 }),
    ({ school, settled, ready }) => {
      if (school && settled && ready && !seeding && !schoolSeeded()) void seed();
    },
  );

  createEffect(
    () => ({
      school: schoolActive(),
      settled: agentListSettled(),
      ready: modelOptions().length > 0,
      hasPlanner: schoolAgentIdOf("planner") !== undefined,
    }),
    ({ school, settled, ready, hasPlanner }) => {
      if (school && settled && ready && !seeding && schoolSeeded() && !hasPlanner && !extraPersonaSeeded("planner")) {
        void seedPlanner();
      }
    },
  );

  return null;
}
