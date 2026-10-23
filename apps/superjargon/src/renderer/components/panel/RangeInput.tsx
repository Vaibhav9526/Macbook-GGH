import { useEffect, useRef, useState } from 'react';

/** Trailing-throttle interval for slider drags; each commit is an IPC + disk write. */
const DRAG_COMMIT_MS = 100;

/**
 * Range input that follows the pointer from local state and sends the value
 * to main at most every DRAG_COMMIT_MS (and immediately on release / key up /
 * blur). Driving `value` straight from the settings round trip made the
 * thumb trail the pointer and wrote the settings file on every tick.
 */
export function RangeInput({
  id, min, max, step, value, onCommit, label, style, valueClass, valueHidden,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (v: number) => void;
  label: (v: number) => string;
  style?: React.CSSProperties;
  /** The readout lives here so it tracks the draft, not the stored value. */
  valueClass?: string;
  valueHidden?: boolean;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  const commit = useRef(onCommit);
  commit.current = onCommit;

  const flush = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    commit.current(latest.current);
    // Drop the draft shortly after the last commit so a value main clamped
    // or rejected snaps back to the stored one instead of sticking.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => setDraft(null), 400);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const shown = draft ?? value;
  return (
    <>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-valuetext={label(shown)}
        style={style}
        onChange={(e) => {
          const v = Number(e.target.value);
          latest.current = v;
          setDraft(v);
          if (settle.current) clearTimeout(settle.current);
          if (timer.current === null) timer.current = setTimeout(flush, DRAG_COMMIT_MS);
        }}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
      />
      <span className={valueClass} aria-hidden={valueHidden || undefined}>{label(shown)}</span>
    </>
  );
}
