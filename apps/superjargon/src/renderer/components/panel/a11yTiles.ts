import type { A11yTileId, FlickySettings } from '../../../shared/types';
import { providerSeesImages } from '../../../shared/a11y-vision';

export type OptionUi =
  | { key: string; label: string; kind: 'range'; min: number; max: number; step: number; fmt: (v: number) => string }
  | { key: string; label: string; kind: 'select'; choices: Array<[string, string]> }
  | { key: string; label: string; kind: 'check' };

export interface TileInfo {
  /** One line under the tile name. */
  blurb: string;
  /** Body of the "What this does" disclosure. */
  help: string;
  /** Shown only while the tile is on. */
  options: OptionUi[];
}

export const times = (v: number) => `${v}×`;

// Option controls per tile; ranges mirror TILE_SCHEMA in shared/a11y-profiles.
// `enabled` is the tile header switch, so it never appears here.
export const TILE_INFO: Record<A11yTileId, TileInfo> = {
  screenReader: {
    blurb: 'Reads the screen aloud.',
    help: 'Reads the focused window or an area around the pointer using Windows accessibility text (the same information NVDA and Narrator use), so control names, states and values are spoken exactly. Apps that expose no accessibility text fall back to a screenshot description from your Mind provider. Shortcuts and the tray item trigger a read.',
    options: [
      { key: 'scope', label: 'Reads', kind: 'select', choices: [['window', 'Focused window'], ['region', 'Area around the pointer']] },
      { key: 'rate', label: 'Speech rate', kind: 'range', min: 0.5, max: 2, step: 0.1, fmt: times },
    ],
  },
  magnifier: {
    blurb: 'Zooms in around the cursor or focus.',
    help: 'Magnifies the whole display under the pointer, like Windows Magnifier: what is under the pointer stays under the pointer, so clicking still lands where you expect. Smoothing makes the view glide instead of jumping.',
    options: [
      { key: 'zoom', label: 'Zoom', kind: 'range', min: 1, max: 5, step: 0.25, fmt: times },
      { key: 'follow', label: 'Follows', kind: 'select', choices: [['cursor', 'Cursor'], ['focus', 'Keyboard focus (uses the pointer)']] },
      { key: 'smoothing', label: 'Smoothing', kind: 'range', min: 0, max: 1, step: 0.1, fmt: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  captions: {
    blurb: 'Shows what is said as on-screen text.',
    help: 'Displays spoken replies as text in a strip at the top or bottom of the stream window, so sound is never the only way to get an answer.',
    options: [
      { key: 'fontSize', label: 'Text size', kind: 'range', min: 14, max: 48, step: 2, fmt: (v) => `${v} px` },
      { key: 'position', label: 'Position', kind: 'select', choices: [['bottom', 'Bottom'], ['top', 'Top']] },
    ],
  },
  readingAids: {
    blurb: 'Colors, fonts and guides for easier reading.',
    help: 'Changes how text looks across SuperJargon: a colour palette (including colour-blind friendly ones), a dyslexia-friendly font, a ruler that dims everything except the line you read, and less motion.',
    options: [
      {
        key: 'palette', label: 'Palette', kind: 'select',
        choices: [
          ['default', 'Default'], ['high-contrast', 'High contrast'], ['protanopia', 'Protanopia'],
          ['deuteranopia', 'Deuteranopia'], ['tritanopia', 'Tritanopia'],
        ],
      },
      { key: 'dyslexiaFont', label: 'Dyslexia-friendly font', kind: 'check' },
      { key: 'readingRuler', label: 'Reading ruler', kind: 'check' },
      { key: 'reducedMotion', label: 'Reduce motion', kind: 'check' },
    ],
  },
  voice: {
    blurb: 'Spoken replies.',
    help: 'Turns on spoken replies. Voice, provider and speed details live in the Voice tab; the speed slider above applies to every spoken reply.',
    options: [],
  },
  dictation: {
    blurb: 'Speak to type.',
    help: 'Types what you say into whichever field has focus instead of sending it to the assistant. The hotkey and other details live in the General tab.',
    options: [],
  },
  pointing: {
    blurb: 'Points at things on screen.',
    help: 'Lets SuperJargon show you where to look or click with its cursor and ink, instead of only describing it.',
    options: [],
  },
  handsFree: {
    blurb: 'Always-on listening, no key presses.',
    help: 'Keeps the microphone open so you can talk without pressing a shortcut. Only turn it on where background speech will not trigger it.',
    options: [],
  },
};

export interface TileNote {
  text: string;
  warn?: boolean;
}

/** Extra, always-visible help under a tile's blurb. `warn` lines are problems
 *  the user can fix; plain lines are how-to or honest limits. */
export function tileNotes(id: A11yTileId, tile: Record<string, unknown>, settings: FlickySettings): TileNote[] {
  const notes: TileNote[] = [];
  if (id === 'screenReader') {
    notes.push({ text: 'Use "Read screen now" in the tray menu, or its keyboard shortcut, to hear the screen.' });
    if (tile.scope === 'region') notes.push({ text: 'The area is about 900 by 560 pixels centered on the mouse pointer.' });
    if (!providerSeesImages(settings.mindProvider)) {
      notes.push({
        warn: true,
        text: 'The Copilot Mind provider cannot see images. The screen reader still works through Windows accessibility text, but apps that expose none (games, canvas apps) cannot be read until you switch to Claude, OpenAI or Ollama with a vision model.',
      });
    }
  }
  if (id === 'magnifier' && tile.follow === 'focus') {
    notes.push({ text: 'Keyboard focus tracking is not available yet. The magnifier follows the mouse pointer instead.' });
  }
  if (id === 'captions') {
    notes.push({ text: 'Uses your Ear tab transcription provider and the microphone. Lines appear in the stream window after each pause in speech.' });
  }
  return notes;
}
