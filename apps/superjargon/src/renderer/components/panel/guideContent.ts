// The in-app Guide, as data. GuideTab.tsx renders it; docs/GUIDE.md is its
// plain-markdown twin; scripts/guide-check.mts validates it. Keep it as data
// (no JSX) so a doc generator can import it under plain tsx.
//
// Labels, shortcuts and defaults below are read from the code — the shortcut
// strings come straight from DEFAULT_SETTINGS and the profile names from
// BUILTIN_A11Y_PROFILES, so those cannot drift. Everything else is prose that
// was checked against the tree; guide-check.mts verifies the setting/IPC names
// listed in `refs` still exist in shared/types.ts.

import { DEFAULT_SETTINGS } from '../../../shared/types';
import { BUILTIN_A11Y_PROFILES } from '../../../shared/a11y-profiles';
import { A11Y_SHORTCUT_ACTIONS, A11Y_SHORTCUT_LABELS, DEFAULT_A11Y_SHORTCUTS } from '../../../shared/a11y-shortcuts';

export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'steps'; items: string[] }
  /** Small two-column table: term on the left, explanation on the right. */
  | { kind: 'defs'; items: Array<[string, string]> };

export interface GuideSection {
  /** Stable slug: used for the DOM ids, the markdown anchors and tests. */
  id: string;
  title: string;
  /** One line shown under the title while the section is collapsed. */
  summary: string;
  body: GuideBlock[];
  /** Setting keys (FlickySettings) and IPC keys (IPC.*) this section talks
   *  about, so guide-check can prove they still exist. */
  refs?: string[];
}

const PTT = DEFAULT_SETTINGS.pushToTalkShortcut;
const DICT = DEFAULT_SETTINGS.dictationShortcut;
const AGENT = DEFAULT_SETTINGS.agentPttShortcut;
const MAX_STEPS = DEFAULT_SETTINGS.agentMaxSteps;

const profile = (id: string) => {
  const p = BUILTIN_A11Y_PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`guideContent: unknown built-in profile "${id}"`);
  return p.name;
};

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Find the app, pick a Mind provider, add your keys.',
    refs: ['mindProvider', 'copilotCliPath', 'pushToTalkShortcut', 'apiKeyStatus', 'onboardingComplete'],
    body: [
      {
        kind: 'p',
        text: 'SuperJargon lives in the system tray, the row of small icons beside the clock (you may need to click the little ^ to see it). Click the tray icon to show or hide this panel. Right-click it for the quick menu: Show Panel, Read screen now, Always-on listening, Dictation mode, Agent mode, Stop agent, Play ink demo, Quit SuperJargon.',
      },
      {
        kind: 'steps',
        items: [
          'Open the Mind tab and pick a Mind provider. This is the brain that answers you. It is the only thing you must set up.',
          'Optional: open the Ear tab and add a Groq key (the default) so SuperJargon can turn your speech into text. You need this for talking, dictation and live captions.',
          'Optional: open the Voice tab and add a Fish Audio or ElevenLabs key if you want a nicer spoken voice. Without one, replies use your Windows system voice.',
          `Hold ${PTT} and ask something. That is the default push-to-talk shortcut.`,
        ],
      },
      { kind: 'p', text: 'Mind providers you can choose in the Mind tab:' },
      {
        kind: 'defs',
        items: [
          ['Anthropic', 'Needs an Anthropic API key.'],
          ['OpenAI-compatible', 'Needs a key for OpenAI or ClinePass, or any /v1 endpoint. This is the provider a fresh install starts on.'],
          ['Devin CLI', 'Uses the devin command you already have and are logged in to. No key to paste.'],
          ['Claude Code', 'Uses the claude command you already have and are logged in to. No key to paste.'],
          ['OpenCode', 'Uses the opencode command and its own providers. No key to paste.'],
          ['GitHub Copilot', 'Uses the copilot command and your GitHub login. No key to paste.'],
        ],
      },
      {
        kind: 'p',
        text: 'To use GitHub Copilot, install it once from a terminal with: npm install -g @github/copilot (it needs Node 22 or newer). Then run copilot once to sign in, or set the COPILOT_GITHUB_TOKEN or GH_TOKEN environment variable. Back in the Mind tab, pick GitHub Copilot and press Test connection. If Windows cannot find the command, type its full path into the CLI path (optional) box.',
      },
      {
        kind: 'p',
        text: 'No key yet and just curious? Right-click the tray icon and choose Play ink demo. It shows the cursor and drawing on your real screen without calling any service.',
      },
    ],
  },
  {
    id: 'talking',
    title: 'Talking to it',
    summary: 'Push-to-talk, always-on listening, and cutting it off.',
    refs: ['pushToTalkShortcut', 'pttMode', 'alwaysOnEnabled', 'speakReplies', 'streamVisibility', 'transcriptionLanguage'],
    body: [
      {
        kind: 'p',
        text: `Push-to-talk: hold ${PTT}, say what you want, let go. SuperJargon looks at your screen, thinks, and answers out loud. If holding a key is awkward, open General, find Trigger style and choose Toggle: tap once to start, tap again to send. You can rebind the shortcut in General by pressing edit next to it.`,
      },
      {
        kind: 'p',
        text: 'Always-on listening: turn on Always-on listening in General (or the tray menu) and you do not need to press anything. SuperJargon only reacts when your sentence starts with its name, for example "SuperJargon, how do I make this text bigger?" Speech that does not start with the name is ignored.',
      },
      {
        kind: 'p',
        text: 'Speaking Hindi: open the Ear tab, find Language and choose Hindi (or Auto-detect if you mix Hindi and English). Your speech is then transcribed in Hindi (Devanagari script) and the Mind answers in kind. Keep saying "SuperJargon" in English to wake it, and for the best accuracy pick the Whisper Large v3 model in the same tab. The spoken accessibility commands ("magnify to 2.5x", "undo that") and agent triggers are English only for now.',
      },
      {
        kind: 'p',
        text: 'Interrupting: start a new turn (press push-to-talk again, or speak a new sentence in always-on mode) and the turn in progress is cancelled, including speech that is playing. You can also say "SuperJargon, stop the agent" to halt a running agent.',
      },
      {
        kind: 'p',
        text: 'Do not want to hear replies? Turn off Speak replies aloud in the Voice tab, or say "be quiet". Say "talk again" to bring the voice back. The stream window (General, Stream window: off, while replying, always) shows a live transcript of the conversation.',
      },
    ],
  },
  {
    id: 'pointing',
    title: 'Pointing and drawing on screen',
    summary: 'The blue cursor and ink that show you where to click.',
    refs: ['isClickyCursorEnabled'],
    body: [
      {
        kind: 'p',
        text: 'When you ask a how-to question, SuperJargon can fly a small blue pointer to the right button and draw arrows, circles and highlights on top of your real screen. For a multi-step task it points at one thing at a time, in order.',
      },
      {
        kind: 'list',
        items: [
          'The drawing is on a see-through layer on every display. It never blocks your mouse. If you notice a transparent window over your desktop, that is it.',
          'Turn the pointer off with Show cursor in General.',
          'Try it without any key using Play ink demo in the tray menu.',
        ],
      },
    ],
  },
  {
    id: 'dictation',
    title: 'Dictation',
    summary: 'Speak and have the words typed where you are working.',
    refs: ['dictationEnabled', 'dictationShortcut', 'autoTypeEnabled'],
    body: [
      {
        kind: 'p',
        text: `Two ways to dictate. For one burst, hold the push-to-dictate hotkey (default ${DICT}) and speak. To keep dictating, turn on Dictation mode in General or the tray menu. What you say is put in the window you are using instead of being answered.`,
      },
      {
        kind: 'p',
        text: 'By default the text goes to your clipboard and you paste it. To have SuperJargon type it for you, turn on Allow superjargon to type for you in General. Text with several lines or with characters like accents and emoji is always sent through the clipboard, so paste it if it does not appear.',
      },
      {
        kind: 'p',
        text: 'While dictation is on, a sentence only becomes a command when it starts with the name, for example "SuperJargon, turn on captions". That keeps ordinary dictated words from changing your settings.',
      },
    ],
  },
  {
    id: 'agents',
    title: 'Agent mode and multiple agents',
    summary: 'Let it use the mouse and keyboard for you, and name your helpers.',
    refs: ['agentEnabled', 'agentMaxSteps', 'agentPttShortcut', 'agents', 'routines', 'routinesMuted'],
    body: [
      {
        kind: 'p',
        text: 'Agent mode lets SuperJargon operate the mouse and keyboard to do a task. Start your sentence with the trigger, for example "SuperJargon agent: open Notepad and type hello". It repeats look, decide, act until it is finished.',
      },
      {
        kind: 'list',
        items: [
          `Shortcut: hold ${AGENT} and say the task. No trigger words are needed, and holding the key counts as your permission for it to take over.`,
          `Agent mode is on by default. Turn it off in General (Agent mode) or the tray menu. Max agent steps (default ${MAX_STEPS}, from 3 to 30) is the hard stop for one run.`,
          'Stop it any time with Stop agent in the tray menu, or say "SuperJargon, stop the agent".',
          'Only one agent moves the mouse at a time. Others wait their turn and show as waiting.',
        ],
      },
      {
        kind: 'p',
        text: 'Multiple agents: on the Home tab press new agent, give it a name, and each agent gets its own chat, files and routines. Name one in your request ("SuperJargon agent Scout: check the build log") to send the task to it. If the name is not recognised, the default agent takes it. Routines (Home, routines) run a task on a schedule; Mute routine announcements in General keeps them quiet.',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'The Accessibility Dashboard',
    summary: 'Screen reader, magnifier, live captions, reading aids, and four ready-made profiles.',
    refs: ['accessibility', 'a11yProfiles', 'A11Y_UPDATE', 'A11Y_APPLY_PROFILE', 'A11Y_READ_SCREEN'],
    body: [
      {
        kind: 'p',
        text: 'Open the Accessibility tab. Each tile has an on/off switch and its own options. Pick a profile at the top for a quick start, then fine-tune. Use Move earlier and Move later on a tile to change the order. The Spoken reply speed slider sets how fast SuperJargon talks.',
      },
      {
        kind: 'defs',
        items: [
          ['Screen reader', 'Reads what is on the screen aloud, in reading order, naming buttons and their state. Turn the tile on, then choose Read screen now from the tray menu (or use the shortcut shown on the Accessibility tab). It reads the display your cursor is on. Options: Reads (Focused window or Drawn region) and Speech rate (0.5 to 2). It asks your Mind provider to look at a picture of the screen, so use a provider that can see images. GitHub Copilot is sent text only, not screenshots.'],
          ['Magnifier', 'A small lens that follows your cursor or keyboard focus and shows that spot enlarged. Options: Zoom (1 to 5, starts at 2), Follows (Cursor or Keyboard focus) and Smoothing. The lens does not block clicks.'],
          ['Live captions', 'Shows what is being said as text on screen. Options: Text size (14 to 48, starts at 24) and Position (Bottom or Top). It turns on the microphone and uses your Ear provider, so you need an Ear key. Text arrives in short bursts of about two seconds, so expect a small delay.'],
          ['Reading aids', 'Makes text easier to read. Options: Palette (Default, High contrast, Protanopia, Deuteranopia, Tritanopia), Dyslexia-friendly font, Reading ruler and Reduce motion.'],
          ['Voice replies, Dictation, Pointing, Hands-free', 'Switches for the matching features described in the other sections. Details live in the Voice and General tabs.'],
        ],
      },
      { kind: 'p', text: 'The four built-in profiles. Applying one switches on its tiles; you can change anything afterwards, and Save current lets you keep your own. Voice replies, Dictation, Pointing, Hands-free and reply speed stay as they are unless the profile lists them, and Reset all leaves those five alone too, so a reset never turns off the voice control you are using.' },
      {
        kind: 'defs',
        items: [
          [profile('low-vision'), 'Magnifier at 3x following the cursor, Screen reader, High contrast palette, Voice replies.'],
          [profile('deaf-hoh'), 'Live captions at text size 28, plus Reading aids with Reduce motion.'],
          [profile('dyslexia'), 'Dyslexia-friendly font and Reading ruler, Screen reader at 0.9x, and spoken replies at 0.9x.'],
          [profile('motor'), 'Voice replies, Pointing and Hands-free listening, plus Reduce motion. Dictation stays a separate choice: with Hands-free on, dictation types everything the microphone hears, without waiting for the wake word.'],
        ],
      },
    ],
  },
  {
    id: 'voice-settings',
    title: 'Changing settings by voice',
    summary: 'Short spoken commands that adjust SuperJargon for you.',
    refs: ['voiceSpeed', 'routinesMuted', 'alwaysOnEnabled', 'A11Y_UPDATE'],
    body: [
      {
        kind: 'p',
        text: 'You can say these instead of opening a tab. SuperJargon replies with a short spoken confirmation. In always-on or dictation mode, begin with "SuperJargon".',
      },
      {
        kind: 'defs',
        items: [
          ['"talk slower" / "speed up"', 'Changes how fast replies are spoken.'],
          ['"be quiet" / "talk again"', 'Turns spoken replies off or on.'],
          ['"always listen" / "stop listening"', 'Turns always-on listening on or off.'],
          ['"mute my routines" / "unmute routines"', 'Silences or restores routine announcements.'],
          ['"magnify to 2.5x"', 'Sets the magnifier zoom. Another example: "turn on captions".'],
          ['"undo that"', 'Reverses the last accessibility change you made by voice. It remembers the last 20 and forgets them when the app restarts.'],
          ['"apply the Dyslexia profile"', 'Switches to a profile by name.'],
          ['"which profile suits me"', 'SuperJargon suggests one and asks "Want me to apply it?" Answer "yes" to apply it. Anything else, or 60 seconds, drops the suggestion.'],
          ['"explain the magnifier tile"', 'Explains what a tile does. Name the tile, or it asks "Which tile?"'],
        ],
      },
      {
        kind: 'p',
        text: 'If a request is out of range or not understood, SuperJargon says so and changes nothing.',
      },
    ],
  },
  {
    id: 'keyboard',
    title: 'Keyboard-only tips',
    summary: 'Using the panel without a mouse.',
    refs: ['pushToTalkShortcut', 'dictationShortcut', 'pttMode', 'a11yShortcuts'],
    body: [
      {
        kind: 'list',
        items: [
          'Everything in the panel is a normal button, switch, slider or menu. Press Tab and Shift+Tab to move, Space or Enter to press, and the arrow keys on sliders and menus.',
          'A tile switch is named after its tile, for example "Magnifier", and says whether it is on.',
          'On the Accessibility tab, Alt+Arrow keys on a tile move it, the same as Move earlier and Move later. A message announces the new position.',
          'Press Escape to close the Save current form.',
          `Global shortcuts work from any window: ${PTT} (talk), ${DICT} (dictate), ${AGENT} (agent task). Change them in General by pressing edit next to the shortcut.`,
          'To reach the tray icon without a mouse, press the Windows key plus B, arrow to the SuperJargon icon, then press Enter to show or hide the panel, or the Menu key for the quick menu.',
        ],
      },
      {
        kind: 'p',
        text: 'Every accessibility feature also has a global shortcut that works from any window. Each toggle gives a short spoken and on-screen confirmation. Change or clear any of them under Keyboard shortcuts at the bottom of the Accessibility tab; Reset shortcuts to defaults restores this list. If another app already uses a combination, that row says so and the shortcut stays off.',
      },
      {
        kind: 'defs',
        items: A11Y_SHORTCUT_ACTIONS.map((a): [string, string] => [A11Y_SHORTCUT_LABELS[a], DEFAULT_A11Y_SHORTCUTS[a]]),
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    summary: 'What stays on your computer and what is sent where.',
    refs: ['encryptionAvailable', 'apiKeyStatus', 'copilotCliPath'],
    body: [
      {
        kind: 'list',
        items: [
          'Screenshots are held in memory only. SuperJargon does not save them to disk. The magnifier and screen reader frames are not logged either.',
          'A screenshot is sent with your question to the Mind provider you picked. With GitHub Copilot, screenshots are not sent at all.',
          'API keys are kept in an encrypted store, protected by Windows. If Windows secure storage is unavailable, the panel shows a warning that keys are not encrypted.',
          'GitHub Copilot runs as a reply engine with no tools: it cannot run commands or edit files, and it starts in a fresh empty temporary folder.',
          'Settings, chat history and counters are files in your %APPDATA%\\SuperJargon folder. Usage analytics are off.',
          'Speech you send for transcription (talking, dictation, live captions) goes to your Ear provider, and reply text goes to your Voice provider when you use one.',
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    summary: 'No sound, no key, copilot not found, magnifier or captions missing.',
    refs: ['speakReplies', 'copilotCliPath', 'transcriptionProvider', 'streamVisibility', 'TEST_COPILOT_CLI'],
    body: [
      {
        kind: 'defs',
        items: [
          ['No sound', 'Check Speak replies aloud in the Voice tab. If you said "be quiet", say "talk again". Muted routines are silent on purpose. If the Voice key is missing or wrong, SuperJargon falls back to the Windows system voice, so also check Windows volume and output device.'],
          ['No key / nothing answers', 'A dot beside Mind, Voice or Ear in the sidebar means a key is missing. Add it in that tab. A banner at the top shows the latest error. CLI providers (Devin, Claude Code, OpenCode, GitHub Copilot) need no key but must be installed and signed in.'],
          ['Nothing happens when I talk', 'Make sure the Ear tab has a Groq key. Check that nothing else uses the shortcut: rebind it in General. Try Trigger style Toggle if holding does not register. If you unplugged the monitor the microphone was using, restart SuperJargon.'],
          ['"copilot" not found', 'Install it with npm install -g @github/copilot (Node 22 or newer), open a new terminal to check that copilot runs, then press Test connection in the Mind tab. If it still fails, type the full path to copilot in the CLI path (optional) box.'],
          ['Magnifier not showing', 'Turn the Magnifier tile on in the Accessibility tab. Raise Zoom above 1. The lens appears next to your cursor, not as a normal window.'],
          ['Captions blank', 'Turn Live captions on and add a Groq key in the Ear tab, because captions are made from the microphone audio. Speak, then wait a couple of seconds. The text appears in the SuperJargon stream window, which stays up while captions are on.'],
          ['Screen reader says nothing', 'The tile must be on. Use Read screen now in the tray menu. It needs a Mind provider that can see images, and GitHub Copilot cannot.'],
          ['Start over', 'General, Setup, "show onboarding again" replays first-run setup. Your keys and settings stay.'],
        ],
      },
    ],
  },
];

/** Flatten a block to plain text. Shared by the filter, the check and docs. */
export function blockText(b: GuideBlock): string {
  switch (b.kind) {
    case 'p':
      return b.text;
    case 'list':
    case 'steps':
      return b.items.join(' ');
    case 'defs':
      return b.items.map(([t, d]) => `${t} ${d}`).join(' ');
  }
}

export function sectionText(s: GuideSection): string {
  return [s.title, s.summary, ...s.body.map(blockText)].join(' ');
}

/**
 * Render the whole guide as markdown. docs/GUIDE.md is exactly this output
 * (`bunx tsx scripts/guide-check.mts --write` regenerates it), and the check
 * fails when the file drifts, so the tab and the doc cannot disagree.
 */
export function guideToMarkdown(sections: GuideSection[] = GUIDE_SECTIONS): string {
  const out: string[] = [
    '# SuperJargon Guide',
    '',
    '<!-- Generated from src/renderer/components/panel/guideContent.ts. Do not edit by hand:',
    '     run `bunx tsx scripts/guide-check.mts --write`. This is the same text as the Guide tab in the app. -->',
    '',
    'How to use SuperJargon, in short sections.',
    '',
    ...sections.map((s) => `- [${s.title}](#${s.id}) - ${s.summary}`),
    '',
  ];
  for (const s of sections) {
    out.push(`<a id="${s.id}"></a>`, '', `## ${s.title}`, '');
    for (const b of s.body) {
      switch (b.kind) {
        case 'p':
          out.push(b.text, '');
          break;
        case 'list':
          out.push(...b.items.map((t) => `- ${t}`), '');
          break;
        case 'steps':
          out.push(...b.items.map((t, i) => `${i + 1}. ${t}`), '');
          break;
        case 'defs':
          out.push(...b.items.map(([t, d]) => `- **${t}**: ${d}`), '');
          break;
      }
    }
  }
  return out.join('\n');
}
