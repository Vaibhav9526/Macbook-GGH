import { isDynamicRecord } from "./runtime-values";

// The School library: the Librarian's shelf of notes, books and slides. Main keeps the files and the
// search index on this computer. The renderer only names a book to remove or a question to search.

export interface SchoolLibraryBook {
  id: string;
  name: string;
  addedAt: number;
  chars: number;
  chunks: number;
}

/** Why one file was not added. The renderer turns the code into text; `file` is the file name. */
export type SchoolLibraryFailureCode = "unsupported" | "tooLarge" | "invalidDocx" | "noText" | "failed";

export interface SchoolLibraryFailure {
  file: string;
  code: SchoolLibraryFailureCode;
}

/** What `add` answers. An empty `added` and `failed` means the user closed the file picker. */
export interface SchoolLibraryAddResult {
  added: SchoolLibraryBook[];
  failed: SchoolLibraryFailure[];
}

export interface SchoolLibrarySearchInput {
  query: string;
  /** The most hits to return. Main caps it. */
  limit?: number;
}

export interface SchoolLibraryHit {
  source: string;
  text: string;
  score: number;
}

const FAILURE_CODES: readonly string[] = ["unsupported", "tooLarge", "invalidDocx", "noText", "failed"];

export function isSchoolLibraryBook(value: unknown): value is SchoolLibraryBook {
  return (
    isDynamicRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.addedAt === "number" &&
    typeof value.chars === "number" &&
    typeof value.chunks === "number"
  );
}

export function isSchoolLibraryAddResult(value: unknown): value is SchoolLibraryAddResult {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.added) &&
    value.added.every(isSchoolLibraryBook) &&
    Array.isArray(value.failed) &&
    value.failed.every(
      (item) =>
        isDynamicRecord(item) &&
        typeof item.file === "string" &&
        typeof item.code === "string" &&
        FAILURE_CODES.includes(item.code),
    )
  );
}

export function isSchoolLibraryHit(value: unknown): value is SchoolLibraryHit {
  return (
    isDynamicRecord(value) &&
    typeof value.source === "string" &&
    typeof value.text === "string" &&
    typeof value.score === "number"
  );
}

/** The Librarian's `@convert` or `@compress`. `text` is the message; the files are draft attachments. */
export interface SchoolFileToolInput {
  text: string;
  attachmentIds: string[];
}

export interface SchoolFileToolOutput {
  source: string;
  output: string;
  bytesIn: number;
  bytesOut: number;
  pages?: number;
  note?: string;
}

/** What main made of the command. `report` is the data block that goes to the Librarian with the message. */
export type SchoolFileToolResult =
  | { ok: true; folder: string; outputs: SchoolFileToolOutput[]; report: string }
  | { ok: false; error: string };

export function isSchoolFileToolResult(value: unknown): value is SchoolFileToolResult {
  if (!isDynamicRecord(value)) return false;
  if (value.ok === false) return typeof value.error === "string";
  return (
    value.ok === true &&
    typeof value.folder === "string" &&
    typeof value.report === "string" &&
    Array.isArray(value.outputs) &&
    value.outputs.every(
      (item) =>
        isDynamicRecord(item) &&
        typeof item.source === "string" &&
        typeof item.output === "string" &&
        typeof item.bytesIn === "number" &&
        typeof item.bytesOut === "number",
    )
  );
}
