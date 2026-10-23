/**
 * Rebrand straggler sweep: every 'zapi'/'zappi' left in the tree after the
 * ZAPI → SuperJargon rename. Twin of flicky-sweep.mts, same contract.
 *
 * Walks the repo, skipping build/dep output (node_modules, dist, release,
 * .git), vendored agent config (.devin, .claude), and the sweep/verify
 * scripts themselves, then buckets each hit:
 *
 *   [INTENTIONAL] legacy wake-word aliases ('zapi|zappi' kept in the
 *                 WAKE_NAME alternation per the flicky|clicky precedent —
 *                 old users' spoken trigger must not silently die), the
 *                 userData migration block in main/index.ts which must name
 *                 the previous brand's directories and zapi-*.json files,
 *                 and docs that document those same legacy names.
 *   [STRAY]       everything else — strings, log prefixes, comments, file
 *                 names, config values. A full rebrand leaves zero of these.
 *
 * Exits 1 when any STRAY hit exists so CI can gate on it. Report-only: this
 * script never edits anything.
 *
 * Run: bunx tsx scripts/zapi-sweep.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', 'release', '.git', '.devin', '.claude']);
const SKIP_FILES_EXACT = new Set(['zapi-sweep.mts', 'flicky-sweep.mts', 'dev-verify.mts']);
const MAX_BYTES = 4 * 1024 * 1024;
const PER_FILE_CAP = 15;

// 'zapi' and the doubled-p mishear 'zappi', whole-word so 'zapping' is clean.
const NEEDLE = /\bzapp?i\b/i;

interface Hit {
  file: string;
  line: number;
  text: string;
  reason: string | null;
}
const intentional: Hit[] = [];
const stray: Hit[] = [];

/** Legacy tokens that are allowed only in the listed file scopes. */
const WAKE_ALT = /zapi\s*\|\s*zappi|zappi\s*\|\s*zapi|super\s*\?\s*jargon\s*\|/i;
const LEGACY_FS =
  /ZAPI Companion|zapi-(?:settings|keys|chats|usage|suggestions|artifacts)(?:-\w+)?\.json|zapi-\*\.json|'zapi'|zapi\.db|%APPDATA%\\zapi\b/i;
const LEGACY_WAKE_DOC = /hey zapi|zapi agent|zapi\|zappi|ZAPI AGENT/i;
/** Alias lists in any spell ("zapi`/`zappi", "zapi` and `zappi", "zapi`, `zappi", "zappy"). */
const WAKE_ALIAS_LIST = /zapi.{0,12}zappi|\bzappy\b/i;
const WAKE_ALIAS_DOC = /legacy (?:spoken )?(?:wake ?words?|aliases?)|old wake words?|wake words? [`'"]?zapi|muscle memory/i;
/** Theme-key fallbacks let returning users keep their stored theme. */
const LEGACY_THEME_KEY = /zapi-theme|flicky-theme/i;
/** Doc-scope contexts where 'ZAPI' is allowed as history, not branding. */
const DOC_HISTORY_CTX = /flicky|clicky|superjargon|previous|former|brand|histor|attribut|descend|lineage|migrat|original/i;
const DOC_SCOPE = /^(?:AGENTS\.md|README\.md|codebase\.md|docs\/|docs-parts\/|design-mockups\/|landing\/)/i;

interface Rule {
  file: RegExp;
  line: RegExp;
  ctx?: RegExp;
  reason: string;
}
const RULES: Rule[] = [
  // The WAKE_NAME alternation keeps 'zapi|zappi' so an old user's spoken
  // trigger still routes. Same shape wherever it is quoted (code, tests,
  // docs, generated snapshots of that code).
  { file: /./, line: WAKE_ALT, reason: 'wake-word alternation keeps legacy zapi|zappi aliases' },
  { file: /./, line: LEGACY_WAKE_DOC, reason: 'legacy wake-word example (documented alias)' },
  { file: /./, line: WAKE_ALIAS_LIST, reason: 'wake-word alias list (legacy names kept)' },
  { file: /./, line: WAKE_ALIAS_DOC, reason: 'legacy wake-word documentation' },
  { file: /./, line: LEGACY_THEME_KEY, reason: 'legacy theme-key read fallback' },
  // 'ZAPI' in docs/readme is fine when the line is clearly talking about the
  // brand's history or the migration, not presenting it as the current name.
  { file: DOC_SCOPE, line: /\bZAPI\b/, ctx: DOC_HISTORY_CTX, reason: 'brand lineage / migration note' },
  // The migration block in index.ts must name the previous brand's dirs and
  // files to move them forward. Any zapi hit elsewhere in index.ts is a
  // missed rename — the rule only matches the legacy tokens themselves.
  { file: /^src\/main\/index\.ts$/i, line: LEGACY_FS, reason: 'legacy userData migration source' },
  // Docs may mention the old brand where they explain the migration or the
  // wake aliases; plain prose mentions elsewhere in the file still flag.
  {
    file: /^(?:AGENTS\.md|README\.md|codebase\.md|docs\/|docs-parts\/|design-mockups\/)/i,
    line: new RegExp(`${LEGACY_FS.source}|${LEGACY_WAKE_DOC.source}`, 'i'),
    reason: 'documented legacy name (migration note or alias)',
  },
  // Parser fixture pins the legacy aliases on purpose.
  { file: /^\.tmp-parse-test\.ts$/i, line: /zapp?i|ZAPI/i, reason: 'legacy-alias parse fixture' },
];

/** Classify one matching line; null reason ⇒ STRAY. */
function classify(rel: string, line: string): string | null {
  for (const r of RULES) {
    if (!r.file.test(rel) || !r.line.test(line)) continue;
    if (r.ctx && !r.ctx.test(line)) continue;
    return r.reason;
  }
  return null;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    const base = entry.name;
    if (SKIP_FILES_EXACT.has(base)) continue;
    out.push(path.join(dir, base));
  }
  return out;
}

let scanned = 0;
let skippedBinary = 0;
for (const file of walk(root)) {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    continue;
  }
  if (stat.size > MAX_BYTES) {
    skippedBinary++;
    continue;
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    continue;
  }
  // Binary sniff: a NUL in the first block means this isn't text.
  const probe = buf.subarray(0, Math.min(buf.length, 4096));
  if (probe.includes(0)) {
    skippedBinary++;
    continue;
  }
  scanned++;
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const lines = buf.toString('utf-8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (!NEEDLE.test(text)) continue;
    const hit: Hit = { file: rel, line: i + 1, text: text.trim(), reason: classify(rel, text) };
    if (hit.reason === null) stray.push(hit);
    else intentional.push(hit);
  }
}

// ── Report ──────────────────────────────────────────────────────────────
function printGroup(title: string, hits: Hit[]): void {
  const byFile = new Map<string, Hit[]>();
  for (const h of hits) {
    const list = byFile.get(h.file) ?? [];
    list.push(h);
    byFile.set(h.file, list);
  }
  console.log(`\n${title} — ${hits.length} hit${hits.length === 1 ? '' : 's'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}`);
  for (const [file, list] of [...byFile.entries()].sort()) {
    console.log(`  ${file}`);
    for (const h of list.slice(0, PER_FILE_CAP)) {
      const tag = h.reason ? `[${h.reason}]` : '';
      console.log(`    ${String(h.line).padStart(5)}: ${h.text.slice(0, 110)} ${tag}`);
    }
    if (list.length > PER_FILE_CAP) {
      console.log(`    ... +${list.length - PER_FILE_CAP} more in this file`);
    }
  }
}

console.log(
  `zapi sweep: ${scanned} text files scanned ` +
    `(${skippedBinary} skipped as binary/oversized), ` +
    `skipped dirs [${[...SKIP_DIRS].join(', ')}] + sweep/verify scripts`,
);
console.log('NOTE git history is not visible to a file sweep; only working-tree files are classified.');

printGroup('[INTENTIONAL]', intentional);
printGroup('[STRAY]', stray);

const byReason = new Map<string, number>();
for (const h of intentional) byReason.set(h.reason ?? '?', (byReason.get(h.reason ?? '?') ?? 0) + 1);
console.log('\nintentional breakdown:');
for (const [reason, n] of [...byReason.entries()].sort()) console.log(`  ${n}\t${reason}`);

console.log(
  `\n${intentional.length} intentional, ${stray.length} stray` +
    (stray.length > 0 ? ' — STRAY hits must be triaged' : ' — clean'),
);
process.exit(stray.length > 0 ? 1 : 0);
