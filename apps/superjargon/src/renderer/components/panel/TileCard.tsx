import { memo, useState } from 'react';
import type { A11yTileId } from '../../../shared/types';
import { A11Y_TILE_LABELS } from '../../../shared/a11y-profiles';
import { TILE_INFO } from './a11yTiles';
import type { TileNote } from './a11yTiles';
import { A11yIcon } from './a11yIcons';
import { TileOptions } from './TileOptions';

interface TileCardProps {
  id: A11yTileId;
  index: number;
  count: number;
  /** This tile's stored options (enabled + its own keys). */
  tile: Record<string, unknown>;
  /** Help / warning lines (computed from settings by the parent). */
  notes: TileNote[];
  onOption: (id: A11yTileId, key: string, value: unknown) => void;
  onMove: (id: A11yTileId, delta: -1 | 1, focusId: string) => void;
}

/** Re-render only when this tile's own data or slot changes (callbacks are stable). */
const sameTile = (a: TileCardProps, b: TileCardProps): boolean =>
  a.id === b.id &&
  a.index === b.index &&
  a.count === b.count &&
  JSON.stringify(a.tile) === JSON.stringify(b.tile) &&
  JSON.stringify(a.notes) === JSON.stringify(b.notes);

export const TileCard = memo(function TileCard({ id, index, count, tile, notes, onOption, onMove }: TileCardProps) {
  const info = TILE_INFO[id];
  const label = A11Y_TILE_LABELS[id];
  const on = tile.enabled === true;
  const titleId = `a11y-tile-${id}`;
  const infoId = `${titleId}-info`;
  const [showInfo, setShowInfo] = useState(false);
  const warnings = notes.filter((n) => n.warn);
  const hints = notes.filter((n) => !n.warn);
  return (
    <li
      className="a11y-tile"
      data-on={on}
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        // Alt+Arrow is the shortcut for the move buttons below.
        // Alt+Down opens a <select> and Alt+Left/Right is browser history,
        // so leave those controls alone.
        if ((e.target as HTMLElement).tagName === 'SELECT') return;
        if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
        onMove(id, back ? -1 : 1, (e.target as HTMLElement).id || `${titleId}-${back ? 'earlier' : 'later'}`);
      }}
    >
      <div className="a11y-tile-head">
        <span className="a11y-tile-icon"><A11yIcon name={id} /></span>
        <div className="a11y-tile-name">
          <h3 className="a11y-tile-title" id={titleId}>{label}</h3>
          <p className="a11y-tile-blurb">{info.blurb}</p>
        </div>
        <div className="a11y-tile-toggle">
          {/* Text twin of the switch (1.4.1); the switch itself carries the state for AT. */}
          <span className="a11y-tile-state" aria-hidden>{on ? 'On' : 'Off'}</span>
          <button
            type="button"
            role="switch"
            className="a11y-switch"
            aria-checked={on}
            aria-labelledby={titleId}
            onClick={() => onOption(id, 'enabled', !on)}
          />
        </div>
      </div>

      {warnings.map((n) => (
        <p key={n.text} className="a11y-callout" role="note">
          <span className="a11y-callout-icon" aria-hidden>!</span>
          <span><span className="a11y-sr">Warning: </span>{n.text}</span>
        </p>
      ))}

      {on && info.options.length > 0 && (
        <TileOptions tileId={id} titleId={titleId} options={info.options} values={tile} onChange={onOption} />
      )}

      {showInfo && (
        <div className="a11y-info-panel" id={infoId}>
          <p>{info.help}</p>
          {hints.map((n) => <p key={n.text}>{n.text}</p>)}
        </div>
      )}

      <div className="a11y-tile-foot">
        <button
          type="button"
          className="a11y-info"
          aria-expanded={showInfo}
          aria-controls={infoId}
          onClick={() => setShowInfo((v) => !v)}
        >
          <A11yIcon name="info" size={16} />
          <span>What this does</span>
        </button>
        <div className="a11y-move" role="group" aria-label={`Reorder ${label}`}>
          <button
            type="button"
            id={`${titleId}-earlier`}
            className="a11y-btn a11y-btn-quiet"
            disabled={index === 0}
            aria-label={`Move ${label} earlier`}
            title="Move earlier"
            onClick={() => onMove(id, -1, `${titleId}-earlier`)}
          >
            <A11yIcon name="chevronLeft" size={16} />
          </button>
          <button
            type="button"
            id={`${titleId}-later`}
            className="a11y-btn a11y-btn-quiet"
            disabled={index === count - 1}
            aria-label={`Move ${label} later`}
            title="Move later"
            onClick={() => onMove(id, 1, `${titleId}-later`)}
          >
            <A11yIcon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}, sameTile);
