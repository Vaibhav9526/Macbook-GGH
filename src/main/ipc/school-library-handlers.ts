// The School library: the Librarian's shelf. The file picker opens here, so the renderer never names a
// path. `@memory-notes` in a message is answered from the same shelf (see `notesForMessage`).

import type {
  SchoolFileToolInput,
  SchoolFileToolResult,
  SchoolLibraryAddResult,
  SchoolLibrarySearchInput,
} from "@jargon/contracts/ipc";
import type { AppTranslate } from "@jargon/i18n";
import { type BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import {
  type FileToolFile,
  type FileToolRunResult,
  fileToolChatReply,
  fileToolReport,
  parseFileToolRequest,
  runFileToolJob,
} from "../school/file-tools";
import { LIBRARY_EXTENSIONS, type Library, memoryNotesQuery, withLibraryNotes } from "../school/library";
import { handler, type IpcGroupHandlers, payloadHandler } from "./define-ipc-group";
import { isObject, requireString, stringPayload } from "./validation";

const MAX_QUERY_LENGTH = 4000;
const MAX_HITS = 12;
const NOTES_HITS = 5;
const MAX_FILE_TOOL_TEXT = 4000;
const MAX_FILE_TOOL_ATTACHMENTS = 20;

export interface SchoolLibraryIpcDependencies {
  /** The shelf folder, `<userData>/school-library`. */
  library: Library;
  getMainWindow: () => BrowserWindow | null;
  translate: AppTranslate;
  /** Local path and name of a draft or sent attachment, or null when this computer does not hold it. */
  resolveAttachment: (id: string) => Promise<FileToolFile | null>;
  /** Where `@convert` and `@compress` write, `<Documents>/Jargon Converted`. */
  fileToolFolder: string;
}

export interface SchoolFileToolDependencies {
  resolveAttachment: (id: string) => Promise<FileToolFile | null>;
  fileToolFolder: string;
}

/**
 * Runs `@convert` or `@compress` on the draft attachments of one message. Never sends anything to a model.
 * Shared by the file-tool endpoint and the send hook in `agent-handlers.ts`.
 */
export async function runSchoolFileToolCommand(
  input: SchoolFileToolInput,
  deps: SchoolFileToolDependencies,
): Promise<SchoolFileToolResult> {
  const run = await runCommand(input, deps);
  if (!run.ok) return run;
  return { ok: true, folder: run.result.folder, outputs: run.result.outputs, report: fileToolReport(run.result) };
}

/** The reply the student reads in the chat for a file command. Its error is the reply when it fails. */
export async function librarianFileCommandReply(
  input: SchoolFileToolInput,
  deps: SchoolFileToolDependencies,
): Promise<string> {
  const run = await runCommand(input, deps);
  return run.ok ? fileToolChatReply(run.result) : run.error;
}

type CommandRun = { ok: true; result: Extract<FileToolRunResult, { ok: true }> } | { ok: false; error: string };

async function runCommand(
  { text, attachmentIds }: SchoolFileToolInput,
  { resolveAttachment, fileToolFolder }: SchoolFileToolDependencies,
): Promise<CommandRun> {
  const files: FileToolFile[] = [];
  for (const id of attachmentIds) {
    const file = await resolveAttachment(id);
    if (!file) return { ok: false, error: "An attached file is no longer available. Attach it again." };
    files.push(file);
  }
  const parsed = parseFileToolRequest(text, files);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const result = await runFileToolJob(parsed.job, fileToolFolder);
  return result.ok ? { ok: true, result } : { ok: false, error: result.error };
}

function parseFileToolInput(value: unknown): SchoolFileToolInput {
  if (!isObject(value)) throw new Error("Invalid file tool request.");
  const text = requireString(value.text, "text", MAX_FILE_TOOL_TEXT);
  const ids = value.attachmentIds;
  if (!Array.isArray(ids) || ids.length > MAX_FILE_TOOL_ATTACHMENTS) throw new Error("Invalid file tool attachments.");
  const attachmentIds = ids.map((id) => requireString(id, "attachmentId"));
  return { text, attachmentIds };
}

function parseSearch(value: unknown): SchoolLibrarySearchInput {
  if (!isObject(value)) throw new Error("Invalid library search.");
  const query = requireString(value.query, "query", MAX_QUERY_LENGTH);
  const limit = value.limit;
  if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit)))
    throw new Error("Invalid library search limit.");
  return limit === undefined ? { query } : { query, limit };
}

/**
 * The message with a block of library notes when it holds `@memory-notes`, otherwise the message as it is.
 * It runs in the one place where a message reaches an agent from the renderer.
 */
export function notesForMessage(library: Library, text: string): string {
  const query = memoryNotesQuery(text);
  if (query === null) return text;
  const hits = library.search(query, NOTES_HITS);
  return withLibraryNotes(text, hits, library.list().length === 0);
}

export function schoolLibraryIpcHandlers({
  library,
  getMainWindow,
  translate,
  resolveAttachment,
  fileToolFolder,
}: SchoolLibraryIpcDependencies): Pick<IpcGroupHandlers, "schoolLibrary"> {
  const choose = async (): Promise<string[]> => {
    const mainWindow = getMainWindow();
    const options: OpenDialogOptions = {
      title: translate("dialog.chooseLibraryFiles"),
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: translate("dialog.filter.libraryFiles"),
          extensions: LIBRARY_EXTENSIONS.map((extension) => extension.slice(1)),
        },
      ],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  };
  return {
    schoolLibrary: {
      list: handler(() => library.list()),
      add: handler(async (): Promise<SchoolLibraryAddResult> => {
        const result: SchoolLibraryAddResult = { added: [], failed: [] };
        for (const path of await choose()) {
          const added = await library.add(path);
          if (added.ok) result.added.push(added.doc);
          else result.failed.push({ file: added.file, code: added.code });
        }
        return result;
      }),
      remove: payloadHandler(stringPayload("id"), (id) => library.remove(id)),
      search: payloadHandler(parseSearch, ({ query, limit }) =>
        library.search(query, Math.max(1, Math.min(MAX_HITS, Math.floor(limit ?? NOTES_HITS)))),
      ),
      // The Librarian's file desk. Runs in main; the renderer only names draft attachments by id.
      runFileTool: payloadHandler(
        parseFileToolInput,
        (input): Promise<SchoolFileToolResult> =>
          runSchoolFileToolCommand(input, { resolveAttachment, fileToolFolder }),
      ),
    },
  };
}
