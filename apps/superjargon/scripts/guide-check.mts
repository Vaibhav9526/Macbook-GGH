/**
 * Guide content check.
 *
 *   1. every section has a non-empty id / title / summary / body, ids are
 *      unique slugs, and every block has text
 *   2. every setting key and IPC key a section lists in `refs` exists in
 *      src/shared/types.ts (FlickySettings field or IPC.* key)
 *   3. the built-in profile names and the tile labels the guide talks about
 *      still match shared/a11y-profiles.ts
 *   4. docs/GUIDE.md is byte-for-byte what guideToMarkdown() renders
 *      (`bunx tsx scripts/guide-check.mts --write` regenerates it)
 *
 * Runner-agnostic, no Electron: bunx tsx scripts/guide-check.mts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { GUIDE_SECTIONS, blockText, guideToMarkdown, sectionText } from '../src/renderer/components/panel/guideContent';
import { A11Y_TILE_LABELS, BUILTIN_A11Y_PROFILES } from '../src/shared/a11y-profiles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUIDE_MD = path.join(ROOT, 'docs', 'GUIDE.md');

let pass = 0;
let fail = 0;
function check(cond: boolean, name: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`PASS ${name}`);
  } else {
    fail++;
    console.log(`FAIL ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(GUIDE_MD, guideToMarkdown());
  console.log(`wrote ${path.relative(ROOT, GUIDE_MD)}`);
}

// 1. shape
const ids = new Set<string>();
for (const s of GUIDE_SECTIONS) {
  check(/^[a-z][a-z0-9-]*$/.test(s.id ?? ''), `${s.id}: id is a slug`);
  check(!ids.has(s.id), `${s.id}: id is unique`);
  ids.add(s.id);
  check(!!s.title?.trim(), `${s.id}: has a title`);
  check(!!s.summary?.trim(), `${s.id}: has a summary`);
  check(Array.isArray(s.body) && s.body.length > 0, `${s.id}: has a body`);
  check(s.body.every((b) => blockText(b).trim().length > 0), `${s.id}: no empty blocks`);
  check(!/[\u2013\u2014]/.test(sectionText(s)), `${s.id}: no en/em dashes (plain style)`);
}

// 2. refs exist in types.ts
const types = fs.readFileSync(path.join(ROOT, 'src', 'shared', 'types.ts'), 'utf8');
const hasIdent = (name: string): boolean => new RegExp(`(^|[^A-Za-z0-9_])${name}\\s*\\??:`, 'm').test(types);
for (const s of GUIDE_SECTIONS) {
  for (const ref of s.refs ?? []) {
    check(hasIdent(ref), `${s.id}: ref "${ref}" exists in shared/types.ts`);
  }
}

// 3. profiles and tile labels the guide names
const dashboard = GUIDE_SECTIONS.find((s) => s.id === 'dashboard');
const dashText = dashboard ? sectionText(dashboard) : '';
for (const p of BUILTIN_A11Y_PROFILES) check(dashText.includes(p.name), `dashboard section names profile "${p.name}"`);
for (const id of ['screenReader', 'magnifier', 'captions', 'readingAids'] as const) {
  check(dashText.includes(A11Y_TILE_LABELS[id]), `dashboard section names tile "${A11Y_TILE_LABELS[id]}"`);
}

// 4. markdown twin is current
const onDisk = fs.existsSync(GUIDE_MD) ? fs.readFileSync(GUIDE_MD, 'utf8').replace(/\r\n/g, '\n') : '';
check(onDisk === guideToMarkdown(), 'docs/GUIDE.md matches guideContent.ts (run with --write to refresh)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
