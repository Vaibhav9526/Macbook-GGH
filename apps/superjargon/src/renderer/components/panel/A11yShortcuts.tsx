import { useCallback, useEffect, useRef, useState } from 'react';
import type { A11yShortcutAction, A11yShortcuts, FlickySettings } from '../../../shared/types';
import {
  A11Y_SHORTCUT_ACTIONS,
  A11Y_SHORTCUT_LABELS,
  DEFAULT_A11Y_SHORTCUTS,
  shortcutConflicts,
} from '../../../shared/a11y-shortcuts';
import { ShortcutCapture } from './ShortcutCapture';

interface A11yShortcutsProps {
  settings: FlickySettings;
}

/**
 * Keyboard shortcuts for the accessibility features: one row per action with
 * an editor (the same ShortcutCapture the talk shortcuts use), a clear button,
 * conflict warnings and reset-to-defaults. Main owns registration; every
 * change goes through it so an OS refusal rolls back and is reported here.
 */
export function A11yShortcuts({ settings }: A11yShortcutsProps) {
  const bindings: A11yShortcuts = settings.a11yShortcuts ?? DEFAULT_A11Y_SHORTCUTS;
  const talk = [settings.pushToTalkShortcut, settings.dictationShortcut, settings.agentPttShortcut];
  const [failed, setFailed] = useState<A11yShortcutAction[]>([]);
  const [editing, setEditing] = useState<A11yShortcutAction | null>(null);
  const [message, setMessage] = useState('');
  const [errorFor, setErrorFor] = useState<{ action: A11yShortcutAction; text: string } | null>(null);
  const editButtons = useRef(new Map<A11yShortcutAction, HTMLButtonElement>());
  const refocus = useRef<A11yShortcutAction | null>(null);

  // Which accelerators the OS refused is only known to main; re-ask whenever
  // the bindings change (settings broadcast) and on mount.
  const bindingsKey = JSON.stringify(bindings);
  useEffect(() => {
    let alive = true;
    window.flicky.getA11yShortcuts().then((s) => { if (alive) setFailed(s.failed); }).catch(() => {});
    return () => { alive = false; };
  }, [bindingsKey]);

  // Hand focus back to the row's Edit button once the capture UI unmounts.
  useEffect(() => {
    if (editing === null && refocus.current) {
      editButtons.current.get(refocus.current)?.focus();
      refocus.current = null;
    }
  }, [editing]);

  const finish = useCallback((action: A11yShortcutAction) => {
    refocus.current = action;
    setEditing(null);
  }, []);

  const apply = async (action: A11yShortcutAction, accelerator: string) => {
    const r = await window.flicky.updateA11yShortcut(action, accelerator);
    setFailed(r.failed);
    if (r.ok) {
      setErrorFor(null);
      setMessage(accelerator ? `${A11Y_SHORTCUT_LABELS[action]} set to ${accelerator}` : `${A11Y_SHORTCUT_LABELS[action]} shortcut cleared`);
    } else {
      setErrorFor({ action, text: r.error });
      setMessage(`${A11Y_SHORTCUT_LABELS[action]}: ${r.error}`);
    }
  };

  const reset = async () => {
    const r = await window.flicky.resetA11yShortcuts();
    setFailed(r.failed);
    setErrorFor(null);
    setMessage('Accessibility shortcuts reset to defaults');
  };

  return (
    <section className="a11y-section a11y-keys" aria-labelledby="a11y-keys-title">
      <h2 className="a11y-section-title" id="a11y-keys-title">Keyboard shortcuts</h2>
      <p className="a11y-hint">
        These work from any window. Choose a combination with at least one modifier
        (Ctrl, Alt or Shift) and one key. Clear a shortcut to turn it off.
      </p>
      <div className="a11y-card">
      <table className="a11y-table">
        <caption className="a11y-sr">Accessibility keyboard shortcuts</caption>
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Shortcut</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {A11Y_SHORTCUT_ACTIONS.map((action) => {
            const accel = bindings[action];
            const label = A11Y_SHORTCUT_LABELS[action];
            const c = accel ? shortcutConflicts(accel, bindings, talk, action) : { actions: [], reserved: false };
            const warn =
              errorFor?.action === action ? errorFor.text
              : c.reserved ? 'Same keys as a talk shortcut'
              : c.actions.length ? `Same keys as "${A11Y_SHORTCUT_LABELS[c.actions[0]]}"`
              : failed.includes(action) ? 'Another app is using these keys, so this shortcut is off'
              : '';
            return (
              <tr key={action}>
                <th scope="row">{label}</th>
                <td>
                  {editing === action ? (
                    <ShortcutCapture
                      onSave={(a) => { finish(action); void apply(action, a); }}
                      onCancel={() => finish(action)}
                    />
                  ) : accel ? (
                    accel.split('+').map((k, i) => <kbd key={`${k}-${i}`}>{k}</kbd>)
                  ) : (
                    <span className="a11y-keys-unset">Not set</span>
                  )}
                  {warn && <span className="a11y-keys-warn" role="alert">{warn}</span>}
                </td>
                <td>
                  <div className="a11y-keys-btns">
                    <button
                      type="button"
                      className="a11y-btn a11y-btn-quiet"
                      ref={(el) => { if (el) editButtons.current.set(action, el); else editButtons.current.delete(action); }}
                      disabled={editing !== null}
                      aria-label={`Change shortcut for ${label}`}
                      onClick={() => { setErrorFor(null); setEditing(action); }}
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      className="a11y-btn a11y-btn-quiet"
                      disabled={!accel || editing !== null}
                      aria-label={`Clear shortcut for ${label}`}
                      onClick={() => void apply(action, '')}
                    >
                      Clear
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="a11y-keys-foot">
        <button type="button" className="a11y-btn a11y-btn-quiet" disabled={editing !== null} onClick={() => void reset()}>
          Reset shortcuts to defaults
        </button>
      </div>
      <div className="a11y-sr" role="status" aria-live="polite">{message}</div>
    </section>
  );
}
