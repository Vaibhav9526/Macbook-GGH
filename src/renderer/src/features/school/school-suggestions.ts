import type { FirstAgentSuggestion } from "@jargon/ui/features/agents/FirstAgentSetup";
import { FIRST_AGENT_AVATAR_SEEDS } from "@jargon/ui/features/agents/FirstAgentSetup";
import { type SchoolPersonaId, schoolPersona } from "./school-personas";

/**
 * The suggestion cards of the School create form: the five school personas, then four school skills.
 * A persona card reuses the persona's own avatar seed and hue. Each card's text comes from the
 * `app.school.suggestion.*` catalog keys.
 */
export const SCHOOL_SUGGESTIONS: FirstAgentSuggestion[] = [
  {
    id: "school-principal",
    nameKey: "app.school.suggestion.principal.name",
    descriptionKey: "app.school.suggestion.principal.description",
    purposeKey: "app.school.suggestion.principal.purpose",
    avatarSeed: schoolPersona("principal")?.avatarSeed ?? FIRST_AGENT_AVATAR_SEEDS[0] ?? "first-bot:principal",
    avatarHue: schoolPersona("principal")?.avatarHue ?? 245,
    animationCycleOffset: 0,
    animationOffset: 0.15,
  },
  {
    id: "school-teacher",
    nameKey: "app.school.suggestion.teacher.name",
    descriptionKey: "app.school.suggestion.teacher.description",
    purposeKey: "app.school.suggestion.teacher.purpose",
    avatarSeed: schoolPersona("teacher")?.avatarSeed ?? FIRST_AGENT_AVATAR_SEEDS[1] ?? "first-bot:teacher",
    avatarHue: schoolPersona("teacher")?.avatarHue ?? 100,
    animationCycleOffset: 2,
    animationOffset: 0.65,
  },
  {
    id: "school-topper",
    nameKey: "app.school.suggestion.topper.name",
    descriptionKey: "app.school.suggestion.topper.description",
    purposeKey: "app.school.suggestion.topper.purpose",
    avatarSeed: schoolPersona("topper")?.avatarSeed ?? FIRST_AGENT_AVATAR_SEEDS[2] ?? "first-bot:topper",
    avatarHue: schoolPersona("topper")?.avatarHue ?? 320,
    animationCycleOffset: 4,
    animationOffset: 1.2,
  },
  {
    id: "school-smartguy",
    nameKey: "app.school.suggestion.smartguy.name",
    descriptionKey: "app.school.suggestion.smartguy.description",
    purposeKey: "app.school.suggestion.smartguy.purpose",
    avatarSeed: schoolPersona("smartguy")?.avatarSeed ?? FIRST_AGENT_AVATAR_SEEDS[3] ?? "first-bot:smartguy",
    avatarHue: schoolPersona("smartguy")?.avatarHue ?? 215,
    animationCycleOffset: 6,
    animationOffset: 1.8,
  },
  {
    id: "school-librarian",
    nameKey: "app.school.suggestion.librarian.name",
    descriptionKey: "app.school.suggestion.librarian.description",
    purposeKey: "app.school.suggestion.librarian.purpose",
    avatarSeed: schoolPersona("librarian")?.avatarSeed ?? FIRST_AGENT_AVATAR_SEEDS[4] ?? "first-bot:librarian",
    avatarHue: schoolPersona("librarian")?.avatarHue ?? 150,
    animationCycleOffset: 8,
    animationOffset: 2.45,
  },
  {
    id: "school-planner",
    nameKey: "app.school.suggestion.planner.name",
    descriptionKey: "app.school.suggestion.planner.description",
    purposeKey: "app.school.suggestion.planner.purpose",
    avatarSeed: schoolPersona("planner")?.avatarSeed ?? FIRST_AGENT_AVATAR_SEEDS[5] ?? "first-bot:planner",
    avatarHue: schoolPersona("planner")?.avatarHue ?? 55,
    animationCycleOffset: 9,
    animationOffset: 2.8,
  },
  {
    id: "school-quiz",
    nameKey: "app.school.suggestion.quiz.name",
    descriptionKey: "app.school.suggestion.quiz.description",
    purposeKey: "app.school.suggestion.quiz.purpose",
    avatarSeed: FIRST_AGENT_AVATAR_SEEDS[7] ?? "first-bot:school-quiz",
    avatarHue: 30,
    animationCycleOffset: 10,
    animationOffset: 3.15,
  },
  {
    id: "school-lesson",
    nameKey: "app.school.suggestion.lesson.name",
    descriptionKey: "app.school.suggestion.lesson.description",
    purposeKey: "app.school.suggestion.lesson.purpose",
    avatarSeed: FIRST_AGENT_AVATAR_SEEDS[8] ?? "first-bot:school-lesson",
    avatarHue: 185,
    animationCycleOffset: 12,
    animationOffset: 3.7,
  },
  {
    id: "school-homework",
    nameKey: "app.school.suggestion.homework.name",
    descriptionKey: "app.school.suggestion.homework.description",
    purposeKey: "app.school.suggestion.homework.purpose",
    avatarSeed: FIRST_AGENT_AVATAR_SEEDS[9] ?? "first-bot:school-homework",
    avatarHue: 280,
    animationCycleOffset: 14,
    animationOffset: 4.3,
  },
  {
    id: "school-notes",
    nameKey: "app.school.suggestion.notes.name",
    descriptionKey: "app.school.suggestion.notes.description",
    purposeKey: "app.school.suggestion.notes.purpose",
    avatarSeed: FIRST_AGENT_AVATAR_SEEDS[10] ?? "first-bot:school-notes",
    avatarHue: 0,
    animationCycleOffset: 16,
    animationOffset: 4.9,
  },
];

/**
 * The School persona an agent made from a suggestion is marked with. The School shelves an agent by
 * this mark and its floor role follows it, so each skill borrows the persona whose job it is closest to.
 */
const SUGGESTION_PERSONA: Record<string, SchoolPersonaId> = {
  "school-principal": "principal",
  "school-teacher": "teacher",
  "school-topper": "topper",
  "school-smartguy": "smartguy",
  "school-librarian": "librarian",
  "school-planner": "planner",
  "school-quiz": "teacher",
  "school-lesson": "teacher",
  "school-homework": "smartguy",
  "school-notes": "librarian",
};

/** The persona mark for a School suggestion id, or undefined when the id is not a School suggestion. */
export function schoolSuggestionPersona(suggestionId: string | null): SchoolPersonaId | undefined {
  return suggestionId === null ? undefined : SUGGESTION_PERSONA[suggestionId];
}
