import syllabi from "./planner-syllabi.json";

/**
 * The syllabus the Planner works from. It is a local data file (`planner-syllabi.json`): for each exam, its
 * subjects, their units and the topics of each unit. Nothing is fetched. `hoursPerTopic` is the study time
 * the Planner books for one topic of that unit.
 */
export type PlannerExam = "jee" | "neet";

export interface PlannerTopic {
  /** Stable across runs: exam, subject, unit and place of the topic. */
  id: string;
  name: string;
  subject: string;
  unit: string;
  hours: number;
}

export interface PlannerUnit {
  id: string;
  name: string;
  topics: PlannerTopic[];
}

export interface PlannerSubject {
  id: string;
  name: string;
  units: PlannerUnit[];
}

export interface PlannerSyllabus {
  id: PlannerExam;
  name: string;
  subjects: PlannerSubject[];
}

export const PLANNER_EXAMS: readonly PlannerExam[] = ["jee", "neet"];

export function isPlannerExam(value: unknown): value is PlannerExam {
  return PLANNER_EXAMS.some((exam) => exam === value);
}

function build(exam: PlannerExam): PlannerSyllabus {
  const source = syllabi[exam];
  return {
    id: exam,
    name: source.name,
    subjects: source.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      units: subject.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        topics: unit.topics.map((name, index) => ({
          id: `${exam}/${subject.id}/${unit.id}/${index}`,
          name,
          subject: subject.name,
          unit: unit.name,
          hours: unit.hoursPerTopic,
        })),
      })),
    })),
  };
}

const SYLLABI: Record<PlannerExam, PlannerSyllabus> = { jee: build("jee"), neet: build("neet") };

export function plannerSyllabus(exam: PlannerExam): PlannerSyllabus {
  return SYLLABI[exam];
}

/** Every topic of the exam, in syllabus order. */
export function plannerTopics(exam: PlannerExam): PlannerTopic[] {
  return SYLLABI[exam].subjects.flatMap((subject) => subject.units.flatMap((unit) => unit.topics));
}

export function plannerTopicById(exam: PlannerExam, id: string): PlannerTopic | undefined {
  return plannerTopics(exam).find((topic) => topic.id === id);
}

/**
 * The topics that a request names without a selection: every subject or unit whose name appears in the text,
 * for example "cover Kinematics in 3 days". A unit already inside a named subject is not added twice.
 */
export function topicsNamedIn(exam: PlannerExam, text: string): PlannerTopic[] {
  const lower = text.toLowerCase();
  const found = new Map<string, PlannerTopic>();
  for (const subject of SYLLABI[exam].subjects) {
    const wholeSubject = new RegExp(`\\b${subject.name.toLowerCase()}\\b`).test(lower);
    for (const unit of subject.units) {
      const unitName = unit.name.toLowerCase();
      if (wholeSubject || lower.includes(unitName)) {
        for (const topic of unit.topics) found.set(topic.id, topic);
      }
    }
  }
  return [...found.values()];
}
