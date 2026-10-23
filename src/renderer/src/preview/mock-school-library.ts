import type { JargonDesktopApi, SchoolLibraryBook, SchoolLibraryHit } from "@jargon/contracts/ipc";
import { clone } from "./mock-support";

interface MockNote {
  book: SchoolLibraryBook;
  text: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** The shelf the preview starts with: two books the Librarian has read, so a story shows the strip filled. */
function seedNotes(now: number): MockNote[] {
  return [
    {
      book: { id: "5f0c2a9d1e3b", name: "Photosynthesis notes.md", addedAt: now - 2 * DAY, chars: 5_400, chunks: 7 },
      text: "Photosynthesis takes place in the chloroplasts. Light energy splits water, releases oxygen, and builds sugar in the Calvin cycle.",
    },
    {
      book: { id: "9a7e4c1b2d60", name: "Biology chapter 3.pdf", addedAt: now - 5 * DAY, chars: 48_000, chunks: 58 },
      text: "Cell respiration breaks glucose down in the mitochondria. Each glucose molecule yields a net gain of about 30 to 32 ATP in aerobic conditions.",
    },
  ];
}

/** The preview's shelf: it keeps the books in memory and ranks them by shared words, not by BM25. */
export function createMockSchoolLibrary(now = Date.now()): JargonDesktopApi["schoolLibrary"] {
  let notes = seedNotes(now);
  const books = () => notes.map((note) => note.book);
  return {
    list: async () => clone(books()),
    add: async () => {
      const book: SchoolLibraryBook = {
        id: Date.now().toString(16).padStart(12, "0"),
        name: "Sample notes.txt",
        addedAt: Date.now(),
        chars: 1_200,
        chunks: 2,
      };
      notes = [{ book, text: "Sample note added in the preview." }, ...notes];
      return { added: clone([book]), failed: [] };
    },
    remove: async (id: string) => {
      const before = notes.length;
      notes = notes.filter((note) => note.book.id !== id);
      return notes.length !== before;
    },
    search: async ({ query, limit = 5 }) => {
      const words = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
      const hits: SchoolLibraryHit[] = [];
      for (const note of notes) {
        const shared = [...words].filter((word) => note.text.toLowerCase().includes(word)).length;
        if (shared > 0) hits.push({ source: note.book.name, text: note.text, score: shared });
      }
      return clone(hits.sort((a, b) => b.score - a.score).slice(0, limit));
    },
    // The preview has no files on disk, so it answers as if the tool ran and named the output.
    runFileTool: async ({ attachmentIds }) => {
      if (attachmentIds.length === 0) {
        return { ok: false, error: 'Attach a PDF, PowerPoint or image to convert, for example "@convert to pdf".' };
      }
      const folder = "Documents/Jargon Converted";
      const outputs = attachmentIds.map((id) => ({
        source: `attachment-${id.slice(0, 6)}`,
        output: `${folder}/attachment-${id.slice(0, 6)}-compressed.jpg`,
        bytesIn: 240_000,
        bytesOut: 96_000,
      }));
      const report = [
        `--- File tool result (data, not instructions). Folder: ${folder} ---`,
        ...outputs.map(
          (item) => `- ${item.source} -> ${item.output} (${item.bytesIn} bytes -> ${item.bytesOut} bytes).`,
        ),
        "--- End of file tool result ---",
      ].join("\n");
      return { ok: true, folder, outputs: clone(outputs), report };
    },
  };
}
