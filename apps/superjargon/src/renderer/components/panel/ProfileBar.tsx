import { useId, useRef, useState } from 'react';
import type { A11yProfile } from '../../../shared/types';
import type { A11yResult } from '../../../shared/a11y-profiles';
import { A11yIcon } from './a11yIcons';
import type { A11yIconName } from './a11yIcons';

interface ProfileBarProps {
  profiles: A11yProfile[];
  /** Active profile id; '' means the tiles were edited by hand. */
  activeId: string;
  onApply: (id: string) => void;
  /** Resolves with main's verdict so a rejected name is reported, not announced as saved. */
  onSave: (name: string) => Promise<A11yResult>;
  onReset: () => void;
}

/** Icon and one-line "for whom" per built-in profile; saved ones get the generic card. */
const PROFILE_META: Record<string, { icon: A11yIconName; who: string }> = {
  'low-vision': { icon: 'eye', who: 'Magnifier, high contrast and a screen reader' },
  'deaf-hoh': { icon: 'ear', who: 'Live captions and calmer motion' },
  dyslexia: { icon: 'text', who: 'A readable font and a reading ruler' },
  motor: { icon: 'hand', who: 'Voice, dictation and hands-free control' },
};
const SAVED_META = { icon: 'bookmark' as A11yIconName, who: 'Your saved setup' };

/**
 * Profile picker: one selectable card per profile (click applies it), plus a
 * "Custom" card while the tiles have been changed by hand. Save / Reset are
 * quiet buttons on the section header.
 */
export function ProfileBar({ profiles, activeId, onApply, onSave, onReset }: ProfileBarProps) {
  const nameId = useId();
  const headId = useId();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  // Polite status line: Apply/Save/Reset otherwise change state silently.
  const [status, setStatus] = useState('');
  const [saveError, setSaveError] = useState('');
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  const closeSave = () => {
    setSaving(false);
    // The form unmounts with focus inside it; hand focus back to its opener.
    saveBtnRef.current?.focus();
  };

  const submitSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed)
      .then((r) => {
        if (!r.ok) {
          // Keep the form open so the name can be corrected.
          setSaveError(r.error);
          return;
        }
        setSaveError('');
        setStatus(`Saved profile ${trimmed}`);
        setName('');
        closeSave();
      })
      .catch(() => setSaveError('Could not reach the app.'));
  };

  return (
    <section className="a11y-section a11y-profilebar" aria-labelledby={headId}>
      <div className="a11y-section-head">
        <h2 className="a11y-section-title" id={headId}>Profiles</h2>
        <div className="a11y-actions">
          <button
            type="button"
            ref={saveBtnRef}
            className="a11y-btn a11y-btn-quiet"
            onClick={() => setSaving((v) => !v)}
            aria-expanded={saving}
          >
            Save current…
          </button>
          <button
            type="button"
            className="a11y-btn a11y-btn-quiet"
            onClick={() => { onReset(); setStatus('Accessibility settings reset'); }}
          >
            Reset all
          </button>
        </div>
      </div>

      <div className="a11y-profiles" role="group" aria-label="Accessibility profiles">
        {profiles.map((p) => {
          const meta = PROFILE_META[p.id] ?? SAVED_META;
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              className="a11y-chip"
              aria-pressed={active}
              onClick={() => { onApply(p.id); setStatus(`Applied profile ${p.name}`); }}
            >
              <span className="a11y-chip-icon"><A11yIcon name={meta.icon} /></span>
              <span className="a11y-chip-text">
                <span className="a11y-chip-name">{p.name}</span>
                <span className="a11y-chip-who">{meta.who}</span>
              </span>
            </button>
          );
        })}
        {/* Always present so the grid never shifts: dashed slot while a profile is active. */}
        <div className="a11y-chip a11y-chip-custom" data-active={activeId === ''} role="note">
          <span className="a11y-chip-icon"><A11yIcon name="sliders" /></span>
          <span className="a11y-chip-text">
            <span className="a11y-chip-name">Custom{activeId === '' ? ' (active)' : ''}</span>
            <span className="a11y-chip-who">{activeId === '' ? 'Your own mix of tools' : 'Change any tool below to build your own'}</span>
          </span>
        </div>
      </div>

      {saving && (
        <form
          className="a11y-profilebar-save"
          onSubmit={(e) => { e.preventDefault(); submitSave(); }}
        >
          <label className="a11y-profilebar-label" htmlFor={nameId}>Profile name</label>
          <input
            id={nameId}
            className="a11y-field"
            value={name}
            maxLength={40}
            autoFocus
            onChange={(e) => { setName(e.target.value); setSaveError(''); }}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSave(); }}
          />
          <button type="submit" className="a11y-btn" disabled={!name.trim()}>Save</button>
          <button type="button" className="a11y-btn a11y-btn-quiet" onClick={closeSave}>Cancel</button>
          {saveError && <p className="a11y-error a11y-error-inline" role="alert">{saveError}</p>}
        </form>
      )}
      <div className="a11y-sr" role="status" aria-live="polite">{status}</div>
    </section>
  );
}
