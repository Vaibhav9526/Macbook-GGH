// Panel to customise how one agent looks on the floor. The agent keeps its blob avatar in the app;
// this changes the person drawn from it. Every change is sent up at once, so the floor updates live.

import { useEffect, useMemo, useRef } from "react";
import {
  ALL_PEOPLE,
  type Custom,
  customOf,
  FACIAL_STYLES,
  HAIR_STYLES,
  portraitCanvas,
  type Role,
  recipeFor,
  SKIN_TONES,
} from "../scene/office/spriteGen";
import "./customizer.css";

export interface CustomizerProps {
  name: string;
  role: Role;
  /** Index of the person the avatar picks (spriteGen.personIndex). */
  shape: number;
  color: string;
  custom: Custom | undefined;
  onChange: (next: Custom | undefined) => void;
  onClose: () => void;
}

const SKIN_SWATCH: Record<string, string> = { light: "#f7c9aa", tan: "#d6a274", brown: "#9e704e", dark: "#785038" };
const HAIR_PRESETS = ["#2a1c14", "#5a3a22", "#8a5a34", "#c4a26a", "#8c8c96", "#1e1e26", "#b04a3a"];
const CLOTH_PRESETS = ["#4a7ab5", "#c0392b", "#3f7a4e", "#7b4fc4", "#d16ba5", "#f0b429", "#2d2f3a", "#f2f2f2"];
const HAIR_LABEL: Record<string, string> = {
  styleShort: "Short",
  styleFloppy: "Floppy",
  styleFrame: "Long",
  styleBun: "Bun",
  styleCurly: "Curly",
  styleMessy: "Messy",
  styleRecede: "Receding",
  styleSpiky: "Spiky",
  styleBald: "Bald",
};
const FACIAL_LABEL: Record<string, string> = {
  none: "None",
  mustache: "Mustache",
  mustacheSm: "Small mustache",
  stubble: "Stubble",
  goatee: "Goatee",
};

function Canvas({ source }: { source: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.width = source.width;
    el.height = source.height;
    el.getContext("2d")!.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} />;
}

export function CharacterCustomizer({ name, role, shape, color, custom, onChange, onClose }: CustomizerProps) {
  const recipe = useMemo(() => recipeFor(role, shape, color, custom), [role, shape, color, custom]);
  const now = useMemo(() => customOf(recipe), [recipe]);
  const preview = useMemo(() => portraitCanvas(role, shape, color, custom), [role, shape, color, custom]);
  const people = useMemo(
    () => ALL_PEOPLE.map((p) => ({ p, canvas: portraitCanvas(role, shape, color, { ...(custom ?? {}), person: p }) })),
    [role, shape, color, custom],
  );
  const set = (patch: Custom) => onChange({ ...(custom ?? {}), ...patch });

  return (
    <aside className="cz" aria-label={`Customize ${name}`}>
      <div className="cz-head">
        <div style={{ flex: 1 }}>
          <div className="cz-title">{name}</div>
          <div className="cz-sub">Customize look</div>
        </div>
        <button type="button" className="cz-x" aria-label="Close" onClick={onClose}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
      <div className="cz-preview">
        <Canvas source={preview} />
      </div>

      <div className="cz-sec">
        <div className="cz-label">Person</div>
        <div className="cz-people">
          {people.map(({ p, canvas }) => (
            <button
              key={p}
              type="button"
              className="cz-person"
              aria-pressed={custom?.person === p}
              title={p[0]!.toUpperCase() + p.slice(1)}
              onClick={() => set({ person: p })}
            >
              <Canvas source={canvas} />
            </button>
          ))}
        </div>
      </div>

      <div className="cz-sec">
        <div className="cz-label">Skin</div>
        <div className="cz-row">
          {SKIN_TONES.map((s) => (
            <button
              key={s}
              type="button"
              className="cz-sw"
              style={{ background: SKIN_SWATCH[s] }}
              aria-label={s}
              aria-pressed={now.skin === s}
              onClick={() => set({ skin: s })}
            />
          ))}
        </div>
      </div>

      <div className="cz-sec">
        <div className="cz-label">Hair</div>
        <div className="cz-row" style={{ marginBottom: 8 }}>
          {HAIR_STYLES.map((h) => (
            <button
              key={h}
              type="button"
              className="cz-chip"
              aria-pressed={now.hair === h}
              onClick={() => set({ hair: h })}
            >
              {HAIR_LABEL[h] ?? h}
            </button>
          ))}
        </div>
        <div className="cz-row">
          {HAIR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className="cz-sw"
              style={{ background: c }}
              aria-label={c}
              aria-pressed={now.hairColor === c}
              onClick={() => set({ hairColor: c })}
            />
          ))}
          <input
            type="color"
            aria-label="Hair colour"
            value={now.hairColor}
            onChange={(e) => set({ hairColor: e.target.value })}
          />
        </div>
      </div>

      <div className="cz-sec">
        <div className="cz-label">Clothes</div>
        <div className="cz-row">
          {CLOTH_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className="cz-sw"
              style={{ background: c }}
              aria-label={c}
              aria-pressed={now.clothes === c}
              onClick={() => set({ clothes: c })}
            />
          ))}
          <input
            type="color"
            aria-label="Clothes colour"
            value={now.clothes}
            onChange={(e) => set({ clothes: e.target.value })}
          />
        </div>
      </div>

      <div className="cz-sec">
        <div className="cz-label">Tie or trim</div>
        <div className="cz-row">
          <input type="color" aria-label="Tie colour" value={now.tie} onChange={(e) => set({ tie: e.target.value })} />
          <span className="cz-sub">Shown on shirts with a tie</span>
        </div>
      </div>

      <div className="cz-sec">
        <div className="cz-label">Face</div>
        <div className="cz-row" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="cz-chip"
            aria-pressed={now.glasses}
            onClick={() => set({ glasses: !now.glasses })}
          >
            Glasses
          </button>
        </div>
        <div className="cz-row">
          {FACIAL_STYLES.map((f) => (
            <button
              key={f}
              type="button"
              className="cz-chip"
              aria-pressed={now.facial === f}
              onClick={() => set({ facial: f })}
            >
              {FACIAL_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="cz-foot">
        <button type="button" className="cz-btn" onClick={() => onChange(undefined)}>
          Reset look
        </button>
        <button type="button" className="cz-btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </aside>
  );
}
