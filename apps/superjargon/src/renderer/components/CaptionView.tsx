import { memo, useEffect, useRef, useState } from 'react';
import type { CaptionsOptions } from '../../shared/accessibility';

export interface CaptionEntry {
  id: number;
  text: string;
}

/**
 * Live-caption strip for the stream window. role="log" + aria-live="polite"
 * so assistive tech announces new lines without interrupting; the caller
 * keeps only the last few lines so the strip stays glanceable.
 */
export const CaptionView = memo(function CaptionView({
  lines,
  options,
}: {
  lines: CaptionEntry[];
  options: Pick<CaptionsOptions, 'fontSize' | 'position'>;
}) {
  const size = Math.min(48, Math.max(14, options.fontSize));
  return (
    <div
      className={`caption-view caption-${options.position}`}
      role="log"
      aria-live="polite"
      aria-label="Live captions"
      style={{ fontSize: `${size}px` }}
    >
      {lines.map((l) => (
        <p key={l.id} className="caption-line">
          {l.text}
        </p>
      ))}
    </div>
  );
});

/**
 * Caption bridge, supplied by the accessibility IPC glue (not in the preload
 * yet): both members are optional so the stream window runs unchanged until
 * it lands.
 */
interface CaptionBridge {
  onCaption?: (cb: (line: { text: string; ts: number }) => void) => () => void;
  onCaptionOptions?: (cb: (o: CaptionsOptions) => void) => () => void;
}

const DEFAULT_CAPTIONS = { fontSize: 24, position: 'bottom' } as const;

/** Caption lines kept on screen. */
const CAPTION_LINES = 3;

/**
 * Owns the caption subscriptions and state so a new line re-renders only the
 * strip, not the whole stream rail (StreamApp holds no caption state).
 * Always mounted so the live region exists before the first line arrives.
 */
export function CaptionLayer() {
  const [lines, setLines] = useState<CaptionEntry[]>([]);
  const [opts, setOpts] = useState<CaptionsOptions | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const bridge = window.flicky as unknown as CaptionBridge;
    const unsubOpts = bridge.onCaptionOptions?.((o) => {
      // Options are re-sent on every settings change; keep the old object
      // when nothing visible changed so the memoized strip skips the render.
      setOpts((prev) =>
        prev && prev.fontSize === o.fontSize && prev.position === o.position && prev.enabled === o.enabled ? prev : o,
      );
      if (!o.enabled) setLines((prev) => (prev.length ? [] : prev));
    });
    const unsubLine = bridge.onCaption?.((line) => {
      const id = ++seq.current;
      setLines((prev) => [...prev, { id, text: line.text }].slice(-CAPTION_LINES));
    });
    return () => {
      unsubOpts?.();
      unsubLine?.();
    };
  }, []);

  return <CaptionView lines={lines} options={opts ?? DEFAULT_CAPTIONS} />;
}
