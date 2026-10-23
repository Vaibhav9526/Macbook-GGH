import { useId, useMemo, useState } from 'react';
import { GUIDE_SECTIONS, sectionText } from './guideContent';
import type { GuideBlock, GuideSection } from './guideContent';
import '../../styles/a11y.css';
import { A11yIcon } from './a11yIcons';
import type { A11yIconName } from './a11yIcons';

const SECTION_ICON: Record<string, A11yIconName> = {
  'getting-started': 'rocket',
  talking: 'voice',
  pointing: 'pointing',
  dictation: 'dictation',
  agents: 'bot',
  dashboard: 'sliders',
  'voice-settings': 'chat',
  keyboard: 'keyboard',
  privacy: 'lock',
  troubleshooting: 'wrench',
};

// Shortcut text (Ctrl+Alt+X, Shift+Tab, Escape ...) becomes key chips. Plain
// words like "tab" stay prose: only capitalised key names and modifier combos match.
const KEY_RE = /((?:Ctrl|Alt|Shift|Win|Cmd)(?:\+[A-Za-z0-9]+)+|\b(?:Escape|Esc|Enter|Space)\b|\bTab\b(?=,| and | or |\.))/g;

/** Inline text with <kbd> chips; a combo renders as one chip per key. */
function Rich({ text }: { text: string }) {
  const parts = text.split(KEY_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const keys = part.split('+');
        return (
          <span key={i} className="guide-keys">
            {keys.map((k, j) => (
              <span key={j}>
                {j > 0 && <span aria-hidden="true">+</span>}
                <kbd>{k}</kbd>
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'p':
      return <p><Rich text={block.text} /></p>;
    case 'list':
      return <ul>{block.items.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>;
    case 'steps':
      return <ol>{block.items.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ol>;
    case 'defs':
      return (
        <dl>
          {block.items.map(([term, text]) => (
            <div key={term}>
              <dt><Rich text={term} /></dt>
              <dd><Rich text={text} /></dd>
            </div>
          ))}
        </dl>
      );
  }
}

/** Every word typed must appear somewhere in the section (case-insensitive). */
function matches(section: GuideSection, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = sectionText(section).toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function GuideTab() {
  const uid = useId();
  const [query, setQuery] = useState('');
  // First section open so the tab is never a wall of closed boxes.
  const [open, setOpen] = useState<Set<string>>(() => new Set([GUIDE_SECTIONS[0].id]));

  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const shown = useMemo(() => GUIDE_SECTIONS.filter((s) => matches(s, words)), [words]);
  const filtering = words.length > 0;

  // Opening the hits when the query changes (rather than forcing them open
  // while it is non-empty) keeps every heading button a working toggle.
  const onQuery = (value: string) => {
    setQuery(value);
    const w = value.toLowerCase().split(/\s+/).filter(Boolean);
    if (w.length > 0) setOpen(new Set(GUIDE_SECTIONS.filter((s) => matches(s, w)).map((s) => s.id)));
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const allOpen = shown.length > 0 && shown.every((s) => open.has(s.id));
  const setAll = (value: boolean) => setOpen(value ? new Set(GUIDE_SECTIONS.map((s) => s.id)) : new Set());

  const count = filtering
    ? shown.length === 0
      ? `No sections match "${query.trim()}".`
      : `${shown.length} of ${GUIDE_SECTIONS.length} sections match.`
    : `${GUIDE_SECTIONS.length} sections.`;

  return (
    <div className="guide a11y-dash">
      <h1 className="main-h1">
        Guide<em>.</em>
      </h1>
      <p className="main-lead">
        How to use SuperJargon, in short sections. Press a heading to open or close it, or search for a word.
      </p>

      <div className="guide-tools" role="search">
        <label className="guide-sr" htmlFor={`${uid}-q`}>Search the guide</label>
        <div className="guide-searchbox">
          <A11yIcon name="search" size={16} />
          <input
            id={`${uid}-q`}
            className="guide-search"
            type="search"
            placeholder="Search the guide"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onQuery(''); }}
          />
        </div>
        <button type="button" className="guide-btn" onClick={() => setAll(!allOpen)}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <p className="guide-count" role="status" aria-live="polite">{count}</p>

      {shown.length === 0 ? (
        <p className="guide-empty">Try a shorter word, such as "caption" or "key".</p>
      ) : (
        <ul className="guide-list">
          {shown.map((s) => {
            const isOpen = open.has(s.id);
            const btnId = `${uid}-${s.id}-btn`;
            const panelId = `${uid}-${s.id}-panel`;
            return (
              <li key={s.id} className="guide-item" id={`guide-${s.id}`}>
                <h2 className="guide-h">
                  <button
                    type="button"
                    id={btnId}
                    className="guide-toggle"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(s.id)}
                  >
                    <span className="guide-icon"><A11yIcon name={SECTION_ICON[s.id] ?? 'info'} /></span>
                    <span className="guide-text">
                      <span className="guide-title">{s.title}</span>
                      <span className="guide-sum">{s.summary}</span>
                    </span>
                    <span className="guide-chev" aria-hidden />
                  </button>
                </h2>
                <div id={panelId} className="guide-body" hidden={!isOpen}>
                  {s.body.map((b, i) => <Block key={i} block={b} />)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
