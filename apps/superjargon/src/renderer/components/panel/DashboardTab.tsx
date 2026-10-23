import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { A11yTileId, FlickySettings } from '../../../shared/types';
import {
  A11Y_TILE_LABELS,
  A11Y_VOICE_RATE_MAX,
  A11Y_VOICE_RATE_MIN,
  BUILTIN_A11Y_PROFILES,
} from '../../../shared/a11y-profiles';
import type { A11yResult, A11yUpdate } from '../../../shared/a11y-profiles';
import '../../styles/a11y.css';
import { DashboardHeader } from './DashboardHeader';
import { ProfileBar } from './ProfileBar';
import { A11yShortcuts } from './A11yShortcuts';
import { RangeInput } from './RangeInput';
import { TileCard } from './TileCard';
import { tileNotes, times } from './a11yTiles';

interface DashboardTabProps {
  settings: FlickySettings;
}

/** Settings arrive on every SETTINGS_CHANGED (stream-bounds writes hit ~30 Hz); only a11y changes matter here. */
const sameA11y = (a: DashboardTabProps, b: DashboardTabProps): boolean =>
  JSON.stringify(a.settings.accessibility) === JSON.stringify(b.settings.accessibility) &&
  JSON.stringify(a.settings.a11yProfiles) === JSON.stringify(b.settings.a11yProfiles) &&
  // tileNotes warns when the Mind provider can't see images.
  a.settings.mindProvider === b.settings.mindProvider;

export const DashboardTab = memo(DashboardTabImpl, sameA11y);

function DashboardTabImpl({ settings }: DashboardTabProps) {
  const a11y = settings.accessibility;
  const profiles = [...BUILTIN_A11Y_PROFILES, ...(settings.a11yProfiles ?? [])];
  const [error, setError] = useState<string | null>(null);
  // Polite live region: reorders are otherwise silent for screen readers.
  const [announce, setAnnounce] = useState('');
  // After a keyboard reorder the tile remounts in a new slot; hand focus
  // back to the same move button so repeated presses keep working.
  const refocus = useRef<string | null>(null);

  useEffect(() => {
    if (!refocus.current) return;
    const el = document.getElementById(refocus.current) as HTMLButtonElement | null;
    // A move button disables at the list edge; hand focus to its sibling.
    const sibling = refocus.current.endsWith('-earlier')
      ? refocus.current.replace(/-earlier$/, '-later')
      : refocus.current.replace(/-later$/, '-earlier');
    (el && !el.disabled ? el : document.getElementById(sibling))?.focus();
    refocus.current = null;
  });

  // The settings broadcast re-renders the tab with the new state; the
  // result only matters when the main process rejected the change.
  const run = (p: Promise<A11yResult>) => {
    p.then((r) => setError(r.ok ? null : r.error)).catch(() => setError('Could not reach the app.'));
  };
  const update = (u: A11yUpdate) => run(window.flicky.updateA11y(u));

  // TileCard is memoized, so it gets callbacks whose identity never changes;
  // they read the latest closure through this ref.
  const latest = useRef({ update, order: a11y.tileOrder });
  latest.current = { update, order: a11y.tileOrder };

  const onOption = useCallback((id: A11yTileId, key: string, value: unknown) => {
    latest.current.update({ tiles: { [id]: { [key]: value } } as A11yUpdate['tiles'] });
  }, []);

  const onMove = useCallback((id: A11yTileId, delta: -1 | 1, focusId: string) => {
    const order = [...latest.current.order];
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    refocus.current = focusId;
    setAnnounce(`${A11Y_TILE_LABELS[id]} moved to position ${to + 1} of ${order.length}`);
    latest.current.update({ tileOrder: order });
  }, []);

  return (
    <div className="a11y-dash">
      <DashboardHeader a11y={a11y} profiles={profiles} />

      <ProfileBar
        profiles={profiles}
        activeId={a11y.profile}
        onApply={(id) => run(window.flicky.applyA11yProfile(id))}
        onSave={(name) => window.flicky.saveA11yProfile(name)}
        onReset={() => run(window.flicky.resetA11y())}
      />

      {error && <div className="a11y-error" role="alert">{error}</div>}

      <A11yShortcuts settings={settings} />

      <section className="a11y-section" aria-labelledby="a11y-speech-h">
        <h2 className="a11y-section-title" id="a11y-speech-h">Spoken replies</h2>
        <div className="a11y-card a11y-row">
          <label className="a11y-row-label" htmlFor="a11y-voice-rate">Speaking speed</label>
          <div className="a11y-slider">
            <RangeInput
              id="a11y-voice-rate"
              min={A11Y_VOICE_RATE_MIN}
              max={A11Y_VOICE_RATE_MAX}
              step={0.1}
              value={a11y.voiceRate}
              label={times}
              onCommit={(v) => update({ voiceRate: v })}
              valueClass="a11y-pill"
              valueHidden
            />
          </div>
        </div>
      </section>

      <section className="a11y-section" aria-labelledby="a11y-tools-h">
        <h2 className="a11y-section-title" id="a11y-tools-h">Tools</h2>
        <p className="a11y-hint">
          Turn a tool on to see its settings. Use the arrow buttons on a card (or Alt+Arrow) to change the order.
        </p>
        <div className="a11y-sr" role="status" aria-live="polite">{announce}</div>
      <ul className="a11y-grid">
        {a11y.tileOrder.map((id, index) => (
          <TileCard
            key={id}
            id={id}
            index={index}
            count={a11y.tileOrder.length}
            tile={a11y.tiles[id] as unknown as Record<string, unknown>}
            notes={tileNotes(id, a11y.tiles[id] as unknown as Record<string, unknown>, settings)}
            onOption={onOption}
            onMove={onMove}
          />
        ))}
      </ul>
      </section>
    </div>
  );
}
