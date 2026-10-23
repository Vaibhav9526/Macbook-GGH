/**
 * Pure logic added by the main-process review fixes: window targeting for the
 * screen reader's 'window' scope.
 *
 *   bunx tsx scripts/a11y-revfix-main-smoke.mts
 */
import { chooseTarget, hwndFromSourceId, isOwnOrShell, matchWindowSource } from '../src/main/services/a11y/capture-region';

let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) console.log(`PASS ${name}`);
  else {
    fail++;
    console.log(`FAIL ${name}`, extra ?? '');
  }
}

check(hwndFromSourceId('window:197380:0') === 197380 && hwndFromSourceId('screen:0:0') === null, 'hwnd parsed from source id');

const wins = [
  { id: 'window:100:0', name: 'Notepad' },
  { id: 'window:200:0', name: 'Notepad++' },
  { id: 'window:300:0', name: 'Docs' },
  { id: 'window:400:0', name: 'Docs' },
];
check(matchWindowSource(wins, { title: 'whatever', hwnd: 200 })?.id === 'window:200:0', 'handle wins over title');
check(matchWindowSource(wins, { title: 'Notepad' })?.id === 'window:100:0', 'exact title, no substring confusion with Notepad++');
check(matchWindowSource(wins, { title: 'Note' }) === null, 'partial title never matches');
check(matchWindowSource(wins, { title: 'Docs' }) === null, 'duplicate titles are ambiguous -> null');
check(matchWindowSource(wins, { title: 'Docs', hwnd: 400 })?.id === 'window:400:0', 'duplicate titles resolved by handle');
check(matchWindowSource(wins, { title: 'gone', hwnd: 999 }) === null, 'dead handle and unknown title -> null');

const OWN = ['SuperJargon', 'electron'];
const app = { title: 'Report.docx - Word', processName: 'WINWORD', hwnd: 11 };
check(!isOwnOrShell(app, OWN), 'normal app is a valid target');
check(isOwnOrShell({ title: 'SuperJargon', processName: 'SuperJargon.exe', hwnd: 1 }, OWN), 'own window excluded');
check(isOwnOrShell({ title: '', processName: 'explorer', hwnd: 2 }, OWN), 'untitled shell/tray window excluded');
check(isOwnOrShell(null, OWN), 'no foreground excluded');

const mem = { fg: app, at: 1_000 };
check(chooseTarget(app, null, 5_000, OWN)?.hwnd === 11, 'live foreground used when valid');
check(chooseTarget({ title: '', processName: 'explorer' }, mem, 5_000, OWN)?.hwnd === 11, 'tray foreground -> remembered window');
check(chooseTarget({ title: '', processName: 'explorer' }, mem, 1_000 + 200_000, OWN) === null, 'stale memory ignored');
check(chooseTarget({ title: 'x', processName: 'chrome', hwnd: 5 }, mem, 5_000, OWN)?.hwnd === 5, 'live valid window beats memory');

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
