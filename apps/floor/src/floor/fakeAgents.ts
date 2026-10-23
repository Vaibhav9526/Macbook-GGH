// Demo agents for the standalone page (roles come from list order, see avatarMap.ts).
// Used only when the page is not framed
// by a host, so `bun run --cwd apps/floor dev` shows the floor on its own.
// Each demo agent has a blob look (silhouette 0-6, face 0-15, colour), like a real agent.

import type { FloorAgent, FloorStatus } from "./protocol";

const BASE: FloorAgent[] = [
  {
    id: "demo-1",
    name: "Planner",
    status: "working",
    avatar: "",
    look: { shape: 0, face: 0, color: "#e0482f" },
    task: "Splitting the release plan",
    custom: null,
    role: null,
  },
  {
    id: "demo-2",
    name: "Coder",
    status: "working",
    avatar: "",
    look: { shape: 3, face: 4, color: "#2f7de0" },
    task: "Editing src/app.ts",
    custom: null,
    role: null,
  },
  {
    id: "demo-3",
    name: "Reviewer",
    status: "waiting",
    avatar: "",
    look: { shape: 5, face: 9, color: "#8a3fd6" },
    task: "Needs a decision on the API",
    custom: null,
    role: null,
  },
  {
    id: "demo-4",
    name: "Tester",
    status: "idle",
    avatar: "",
    look: { shape: 1, face: 12, color: "#2fa35b" },
    task: "",
    custom: null,
    role: null,
  },
  {
    id: "demo-5",
    name: "Writer",
    status: "working",
    avatar: "",
    look: { shape: 6, face: 7, color: "#e0a02f" },
    task: "Drafting the changelog",
    custom: null,
    role: null,
  },
  {
    id: "demo-6",
    name: "Researcher",
    status: "idle",
    avatar: "",
    look: { shape: 2, face: 14, color: "#d6408f" },
    task: "",
    custom: null,
    role: null,
  },
];

/** The demo list, with one agent's status moved on each call so the floor shows changes. */
export function demoAgents(tick: number): FloorAgent[] {
  const cycle: FloorStatus[] = ["working", "waiting", "idle"];
  return BASE.map((agent, i) => {
    if (i !== tick % BASE.length) return agent;
    const next = cycle[(cycle.indexOf(agent.status) + 1) % cycle.length];
    return { ...agent, status: next, task: next === "working" ? "Working on the next step" : agent.task };
  });
}
