import type { ReactElement } from 'react';

/**
 * Inline 24x24 line icons for the accessibility dashboard and Guide tab.
 * Stroke-only and `currentColor`, so palettes and the on/off tint recolour
 * them for free. Decorative: always aria-hidden, the visible name carries meaning.
 */
export type A11yIconName =
  | 'screenReader' | 'magnifier' | 'captions' | 'readingAids'
  | 'voice' | 'dictation' | 'pointing' | 'handsFree'
  | 'eye' | 'ear' | 'text' | 'hand' | 'sliders' | 'bookmark'
  | 'info' | 'chevronLeft' | 'chevronRight' | 'search' | 'rocket' | 'keyboard' | 'lock' | 'wrench' | 'bot' | 'chat';

const G: Record<A11yIconName, ReactElement> = {
  // speaker with sound waves
  screenReader: (<><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></>),
  // lens with plus
  magnifier: (<><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /><path d="M10.5 8v5M8 10.5h5" /></>),
  // closed-caption box
  captions: (<><rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M10 10.2a2.2 2.2 0 1 0 0 3.6" /><path d="M17 10.2a2.2 2.2 0 1 0 0 3.6" /></>),
  // page with text lines
  readingAids: (<><path d="M6 3.5h9l3 3v14H6z" /><path d="M9 11h6M9 14.5h6M9 7.5h3" /></>),
  // sound bars
  voice: (<><path d="M5 10v4M9 7v10M13 4.5v15M17 8v8M21 10.5v3" /></>),
  // microphone
  dictation: (<><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>),
  // pointer arrow
  pointing: (<><path d="M5 3.5 18.5 10l-6 1.8-1.9 6.2z" /></>),
  // raised hand
  handsFree: (<><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V4.8a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6 7-2.6 0-4.2-1.3-5.4-3.5L3.5 13a1.5 1.5 0 0 1 2.6-1.3L8 14" /></>),
  // eye
  eye: (<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  // ear
  ear: (<><path d="M7 9.5a5 5 0 0 1 10 0c0 3-2.5 3.8-2.5 6a3 3 0 0 1-5.7 1.2" /><path d="M10 9.5a2 2 0 0 1 4 0" /></>),
  // Aa
  text: (<><path d="M3.5 18 8 6l4.5 12M5 14h6" /><path d="M14.5 18v-5.5a2.5 2.5 0 0 1 5 0V18M14.5 15.5h5" /></>),
  hand: (<><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 11V4.8a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6 7-2.6 0-4.2-1.3-5.4-3.5L3.5 13a1.5 1.5 0 0 1 2.6-1.3L8 14" /></>),
  sliders: (<><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>),
  bookmark: (<><path d="M7 3.5h10v17l-5-3.8-5 3.8z" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8v.1" strokeWidth="2.4" /></>),
  chevronLeft: (<path d="m14.5 6-6 6 6 6" />),
  chevronRight: (<path d="m9.5 6 6 6-6 6" />),
  search: (<><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>),
  rocket: (<><path d="M14 4c3.5 0 6 2.5 6 6-2.5 3.5-5 5.5-8 6.5L7.5 12C8.5 9 10.5 6.5 14 4z" /><circle cx="14.5" cy="9.5" r="1.5" /><path d="M7.5 12.5c-2 .5-3.5 2-4 4.5 2.5-.5 4-2 4.5-4M10.5 16.5c-.5 2-2 3.5-4.5 4 .5-2.5 2-4 4-4.5" /></>),
  keyboard: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.1M9.5 10h.1M13 10h.1M16.5 10h.1M7 14h10" /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  wrench: (<><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" /></>),
  bot: (<><rect x="4.5" y="8" width="15" height="11" rx="3" /><path d="M12 4.5V8M9.5 13v.1M14.5 13v.1M9.5 16.5h5" /></>),
  chat: (<><path d="M4.5 6.5a2.5 2.5 0 0 1 2.5-2.5h10a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V16H7a2.5 2.5 0 0 1-2.5-2.5z" /></>),
};

export function A11yIcon({ name, size = 20 }: { name: A11yIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {G[name]}
    </svg>
  );
}
