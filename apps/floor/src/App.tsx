// Floor island shell: a dark top strip (mode switch, status count, close) over
// the Pixi floor. Data arrives by window.postMessage; see floor/protocol.ts.

import { useEffect, useMemo, useState } from "react";
import { CharacterCustomizer } from "./components/CharacterCustomizer";
import { lookOf, roleFor } from "./floor/agentLook";
import { FloorScene } from "./floor/FloorScene";
import { demoAgents } from "./floor/fakeAgents";
import {
  customizeMessage,
  type FloorAgent,
  type FloorMode,
  type FloorRole,
  MSG_CLOSE,
  parseAgentsMessage,
  parseCustomizeOpen,
  parseLockedMode,
  parseModeMessage,
  selectMessage,
  sendToHost,
} from "./floor/protocol";
import type { Custom } from "./scene/office/spriteGen";

/** The host's role label for a floor role: the host knows four roles, the floor has six. */
function hostRole(role: ReturnType<typeof roleFor>): FloorRole {
  if (role === "boss" || role === "principal") return "boss";
  if (role === "teacher" || role === "librarian") return "teacher";
  if (role === "student") return "student";
  return "worker";
}

function initialMode(): FloorMode {
  const param = new URLSearchParams(window.location.search).get("mode");
  return param === "school" ? "school" : "office";
}

export function App() {
  const [mode, setMode] = useState<FloorMode>(initialMode);
  // True when the host fixed the mode (lockedMode). The mode switch is then hidden.
  const [locked, setLocked] = useState(false);
  const [hostAgents, setAgents] = useState<FloorAgent[]>([]);
  // Looks the user changed here. They show at once; the host saves them (jargon-floor:customize).
  const [overrides, setOverrides] = useState<Record<string, Custom | null>>({});
  // The agent whose look panel is open.
  const [customizeId, setCustomizeId] = useState<string | null>(null);
  const agents = useMemo(
    () => hostAgents.map((a) => (a.id in overrides ? { ...a, custom: overrides[a.id] ?? null } : a)),
    [hostAgents, overrides],
  );
  // Inside the app, the host toolbar has the mode switch and the close button, so the strip keeps only the counts.
  const hosted = window.parent !== window;
  // Standalone page (no host frame) shows demo agents.
  const demo = window.parent === window;

  // Hosted: wait for the host's agents. Standalone: post demo agents to ourselves.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const list = parseAgentsMessage(event.data);
      if (list) {
        setAgents(list);
        return;
      }
      const next = parseModeMessage(event.data);
      if (next) setMode(next);
      const fixed = parseLockedMode(event.data);
      if (fixed) {
        setMode(fixed);
        setLocked(true);
      }
      const open = parseCustomizeOpen(event.data);
      if (open) setCustomizeId(open);
    };
    window.addEventListener("message", onMessage);

    // Standalone (no host frame): show demo agents now, then move one every 5 seconds.
    const standalone = window.parent === window;
    let tick = 0;
    const post = () => {
      window.postMessage({ type: "jargon-floor:agents", agents: demoAgents(tick++) }, "*");
    };
    if (standalone) post();
    const cycle = standalone ? window.setInterval(post, 5000) : null;

    return () => {
      window.removeEventListener("message", onMessage);
      if (cycle !== null) window.clearInterval(cycle);
    };
  }, []);

  const counts = useMemo(() => {
    const c = { working: 0, idle: 0, waiting: 0 };
    for (const a of agents) c[a.status] += 1;
    return c;
  }, [agents]);

  // Clicking a person tells the host (its side card) and opens the look panel on the right.
  const onSelect = (id: string) => {
    const index = agents.findIndex((a) => a.id === id);
    const role = index >= 0 ? hostRole(roleFor(mode, index, agents[index])) : null;
    sendToHost(selectMessage(id, role));
    setCustomizeId(id);
  };
  const customAgentIndex = customizeId ? agents.findIndex((a) => a.id === customizeId) : -1;
  const customAgent = customAgentIndex >= 0 ? agents[customAgentIndex] : null;
  const onCustomChange = (id: string, custom: Custom | undefined) => {
    const next = custom && Object.keys(custom).length > 0 ? custom : null;
    setOverrides((prev) => ({ ...prev, [id]: next }));
    sendToHost(customizeMessage(id, next));
  };
  const onClose = () => sendToHost({ type: MSG_CLOSE });

  return (
    <div className="floor-root">
      <header className="floor-strip" style={hosted ? { justifyContent: "center" } : undefined}>
        {!hosted && (
          <div className="floor-strip-left">
            <span className="floor-title">Floor</span>
            {!locked && (
              <div className="floor-segmented" role="group" aria-label="Floor">
                <button
                  type="button"
                  className="floor-segment"
                  aria-pressed={mode === "office"}
                  onClick={() => setMode("office")}
                >
                  <DeskGlyph />
                  <span>Office</span>
                </button>
                <button
                  type="button"
                  className="floor-segment"
                  aria-pressed={mode === "school"}
                  onClick={() => setMode("school")}
                >
                  <BookGlyph />
                  <span>School</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="floor-strip-mid">
          <span className="floor-count" data-status="working">
            {counts.working} working
          </span>
          <span className="floor-count" data-status="waiting">
            {counts.waiting} waiting
          </span>
          <span className="floor-count" data-status="idle">
            {counts.idle} idle
          </span>
          {demo && <span className="floor-demo">Demo agents</span>}
        </div>

        {!hosted && (
          <button type="button" className="floor-close" aria-label="Close floor" title="Close floor" onClick={onClose}>
            <CloseGlyph />
          </button>
        )}
      </header>

      <main className="floor-stage">
        <FloorScene mode={mode} agents={agents} onSelect={onSelect} />
        {customAgent && (
          <CharacterCustomizer
            key={customAgent.id}
            name={customAgent.name}
            role={roleFor(mode, customAgentIndex, customAgent)}
            shape={lookOf(customAgent).person}
            color={lookOf(customAgent).color}
            custom={customAgent.custom ?? undefined}
            onChange={(next) => onCustomChange(customAgent.id, next)}
            onClose={() => setCustomizeId(null)}
          />
        )}
      </main>
    </div>
  );
}

/* Glyphs: plain inline SVG, one colour (currentColor). No emoji. */

function DeskGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="6" />
      <path d="M8 9v3M5 13h6" />
    </svg>
  );
}

function BookGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="M2 3h4.5A1.5 1.5 0 0 1 8 4.5V13a1 1 0 0 0-1-1H2zM14 3H9.5A1.5 1.5 0 0 0 8 4.5V13a1 1 0 0 1 1-1h5z" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}
