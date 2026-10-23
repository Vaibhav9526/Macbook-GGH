// E2E smoke for the Librarian's file tools. It makes a noisy PNG in a temp folder, runs @compress 50% and
// @convert to pdf on it through the same parser and runner that main uses, and prints a JSON report.
// Exit code 1 when a check fails. Run: bun scripts/school-file-tools-smoke.ts
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { fileToolCommandOf, parseFileToolRequest, runFileToolJob } from "../src/main/school/file-tools";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
const record = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

const root = mkdtempSync(join(tmpdir(), "jargon-file-tools-"));
const outDir = join(root, "Jargon Converted");
mkdirSync(outDir, { recursive: true });

try {
  // A noisy image, so that compression has real work to do.
  const source = join(root, "noise-photo.png");
  const width = 1200;
  const height = 800;
  const pixels = randomBytes(width * height * 3);
  writeFileSync(
    source,
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer(),
  );
  const file = { path: source, name: "noise-photo.png" };

  // 1. @compress 50% on a PNG.
  const compress = parseFileToolRequest("@compress 50%", [file]);
  record("parse @compress 50%", compress.ok && fileToolCommandOf("@compress 50%") === "compress", "");
  if (compress.ok) {
    const run = await runFileToolJob(compress.job, outDir);
    if (run.ok) {
      const out = run.outputs[0];
      const ratio = out ? out.bytesOut / out.bytesIn : 1;
      const written = out ? statSync(out.output).isFile() : false;
      record(
        "@compress 50% writes a smaller PNG in Jargon Converted",
        written && ratio <= 0.5,
        `output=${out?.output ?? ""} bytesIn=${out?.bytesIn ?? 0} bytesOut=${out?.bytesOut ?? 0} ratio=${ratio.toFixed(3)} note=${out?.note ?? ""}`,
      );
    } else record("@compress 50% runs", false, run.error);
  } else record("parse @compress 50%", false, compress.error);

  // 2. @convert to pdf on the same PNG: one PDF with one page.
  const convert = parseFileToolRequest("@convert to pdf", [file]);
  if (convert.ok) {
    const run = await runFileToolJob(convert.job, outDir);
    if (run.ok) {
      const out = run.outputs[0];
      const text = out ? readFileSync(out.output).toString("latin1") : "";
      record(
        "@convert to pdf writes a one-page PDF",
        text.startsWith("%PDF-") && /\/Count 1\b/.test(text),
        `output=${out?.output ?? ""} pages=${out?.pages ?? 0} bytesOut=${out?.bytesOut ?? 0}`,
      );
    } else record("@convert to pdf runs", false, run.error);
  } else record("parse @convert to pdf", false, convert.error);

  // 3. Replies for a message with no attachment, and for a missing or unsupported target.
  const replyFor = (text: string, files: { path: string; name: string }[]): string | null => {
    const parsed = parseFileToolRequest(text, files);
    return parsed.ok ? null : parsed.error;
  };
  const cases: [string, string | null][] = [
    ["@compress 50% (no file)", replyFor("@compress 50%", [])],
    ["@convert to pdf (no file)", replyFor("@convert to pdf", [])],
    ["@convert (PDF, no target)", replyFor("@convert", [{ path: source, name: "doc.pdf" }])],
    ["@convert to docx (image)", replyFor("@convert to docx", [file])],
  ];
  for (const [name, reply] of cases) record(`reply: ${name}`, reply !== null, reply ?? "(no reply)");
  const unsupported = cases[3]?.[1] ?? "";
  record("unsupported target lists the supported targets", unsupported.includes('"@convert to pdf"'), "");
} catch (error) {
  record("smoke run", false, error instanceof Error ? error.message : String(error));
} finally {
  rmSync(root, { recursive: true, force: true });
}

const failed = checks.filter((check) => !check.ok).length;
process.stdout.write(`${JSON.stringify({ ok: failed === 0, failed, total: checks.length, checks }, null, 2)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
