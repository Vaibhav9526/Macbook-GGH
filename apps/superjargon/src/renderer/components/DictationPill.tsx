import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { DictationPillState } from '../../shared/types';

/**
 * Bottom-center dictation pill — the visual contract for Ctrl+Alt+D:
 * a dark rounded bar with audio-reactive orange waveform bars and the
 * dictated text tail inside ("Listening…" until the transcript lands).
 *
 * Bars are driven by the live mic RMS in `levelRef` (written per audio
 * chunk on the mic-owning overlay, or from the MIC_LEVEL broadcast on
 * others) and painted straight onto DOM nodes from a rAF loop — React
 * state never re-renders at 60fps for this.
 */

const BAR_COUNT = 7;
/** Per-bar envelope so one loud frame doesn't make all bars jump together. */
const BAR_PATTERN = [0.55, 0.85, 1.0, 0.7, 0.95, 0.5, 0.8];

interface DictationPillProps {
  phase: DictationPillState['phase'];
  /** Dictated text — shown as a trailing window ("…last ~46 chars"). */
  text?: string;
  /** Live mic level 0..1 — updated outside React. */
  levelRef: RefObject<number>;
}

export function DictationPill({ phase, text, levelRef }: DictationPillProps) {
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const smooth = useRef<number[]>(Array(BAR_COUNT).fill(0.15));

  useEffect(() => {
    let raf = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return; // CSS holds bars at a fixed low height instead.

    const tick = (t: number) => {
      const level = Math.min(1, levelRef.current ?? 0);
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        let target: number;
        if (phase === 'typing') {
          // Text phase: bars settle to low resting dots with a gentle sway.
          target = 0.14 + 0.08 * Math.abs(Math.sin(t / 640 + i * 1.7));
        } else {
          // Listening: real audio drives the height; a slow sine keeps the
          // row visibly alive even in a quiet room.
          const wobble = 0.1 * Math.abs(Math.sin(t / 480 + i * 2.1) * Math.sin(t / 300 + i));
          target = Math.min(1, 0.16 + wobble + level * BAR_PATTERN[i] * 1.9);
        }
        // Critically-damped-ish smoothing so bars rise fast, fall softly.
        const prev = smooth.current[i];
        const k = target > prev ? 0.45 : 0.18;
        const next = prev + (target - prev) * k;
        smooth.current[i] = next;
        el.style.transform = `scaleY(${next.toFixed(3)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, levelRef]);

  const tail = text && text.length > 46 ? `…${text.slice(-46)}` : text;

  return (
    <div className="dictation-pill" role="status" aria-live="polite">
      <div className="dictation-bars" aria-hidden>
        {BAR_PATTERN.map((_, i) => (
          <span
            key={i}
            className="dictation-bar"
            ref={(el) => {
              barRefs.current[i] = el;
            }}
          />
        ))}
      </div>
      <span className="dictation-text">
        {phase === 'typing' && tail ? tail : 'Listening…'}
      </span>
    </div>
  );
}
