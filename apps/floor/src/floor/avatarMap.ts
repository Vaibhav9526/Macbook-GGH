// Maps a host agent onto a character of the floor's cast.
//
// A known character key in `avatar` is used as-is. Otherwise the agent's place
// in the host list gives its role:
//   school: 0 principal (top agent), 1 male teacher, 2 female teacher (lead agents),
//           3 librarian (memory and notes), 4..7 students 1-4 (other agents)
//   office: 0 boss (top agent), 1..6 workers 1-6 (other agents)
// Agents past the last role wrap around the roles.

import { castForTheme, type OfficeCharacterName } from "@/scene/office/cast";
import type { FloorMode } from "./protocol";

const SCHOOL_ORDER: OfficeCharacterName[] = [
  "principal",
  "male_teacher",
  "female_teacher",
  "librarian",
  "student_1",
  "student_2",
  "student_3",
  "student_4",
];

export function characterFor(avatar: string, index: number, mode: FloorMode): OfficeCharacterName {
  const cast = castForTheme(mode === "school" ? "staffroom" : "office");
  const key = avatar.trim().toLowerCase();
  const known = cast.find((member) => member.name === key);
  if (known) return known.name;
  if (mode === "school") return SCHOOL_ORDER[index % SCHOOL_ORDER.length];
  return index === 0 ? "boss" : (`worker_${((index - 1) % 6) + 1}` as OfficeCharacterName);
}

/**
 * The cast member for an agent whose host gave it a role (a school persona). `ordinal` counts the agents
 * with the same role before this one, so two teachers get the two teacher seats and students get student 1 to 4.
 * Returns null when the role is not a school role.
 */
export function characterForRole(role: string | null | undefined, ordinal: number): OfficeCharacterName | null {
  switch (role) {
    case "principal":
      return "principal";
    case "librarian":
      return "librarian";
    case "teacher":
      return ordinal % 2 === 0 ? "male_teacher" : "female_teacher";
    case "student":
      return (["student_1", "student_2", "student_3", "student_4"] as const)[ordinal % 4];
    default:
      return null;
  }
}
