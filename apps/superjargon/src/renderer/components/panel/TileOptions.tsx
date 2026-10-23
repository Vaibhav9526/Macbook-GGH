import type { A11yTileId } from '../../../shared/types';
import { RangeInput } from './RangeInput';
import type { OptionUi } from './a11yTiles';

interface TileOptionsProps {
  tileId: A11yTileId;
  /** id of the tile heading; prefixes every control id. */
  titleId: string;
  options: OptionUi[];
  values: Record<string, unknown>;
  onChange: (id: A11yTileId, key: string, value: unknown) => void;
}

/**
 * The option controls of one tile as aligned rows: label on the left, control
 * on the right (checkbox, select, or throttled slider with a value pill).
 */
export function TileOptions({ tileId, titleId, options, values, onChange }: TileOptionsProps) {
  return (
    <div className="a11y-options">
      {options.map((o) => {
        const inputId = `${titleId}-${o.key}`;
        const value = values[o.key];
        if (o.kind === 'check') {
          return (
            <label key={o.key} className="a11y-row a11y-check" htmlFor={inputId}>
              <span className="a11y-row-label">{o.label}</span>
              <input
                id={inputId}
                type="checkbox"
                checked={value === true}
                onChange={(e) => onChange(tileId, o.key, e.target.checked)}
              />
            </label>
          );
        }
        if (o.kind === 'select') {
          return (
            <div key={o.key} className="a11y-row">
              <label className="a11y-row-label" htmlFor={inputId}>{o.label}</label>
              <select
                id={inputId}
                className="a11y-field"
                value={String(value)}
                onChange={(e) => onChange(tileId, o.key, e.target.value)}
              >
                {o.choices.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
              </select>
            </div>
          );
        }
        return (
          <div key={o.key} className="a11y-row">
            <label className="a11y-row-label" htmlFor={inputId}>{o.label}</label>
            <div className="a11y-slider">
              <RangeInput
                id={inputId}
                min={o.min}
                max={o.max}
                step={o.step}
                value={Number(value)}
                label={o.fmt}
                onCommit={(v) => onChange(tileId, o.key, v)}
                valueClass="a11y-pill"
                valueHidden
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
