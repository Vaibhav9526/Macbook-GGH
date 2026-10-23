import { defineMessages } from "../../message";

export const messages = defineMessages("library", {
  "library.title": "Library",
  "library.shelf.label": "The Librarian's shelf",
  "library.count": { one: "{count} book", other: "{count} books" },
  "library.chunks": { one: "{count} part", other: "{count} parts" },
  "library.add": "Add files",
  "library.adding": "Reading",
  "library.remove": "Remove {name}",
  "library.empty":
    "Add PDFs, slides, Word files, books or text notes. Then type @memory-notes in any chat and that character answers from them.",
  "library.hint": "Type @memory-notes and a question in any School chat to answer from this shelf.",
  "library.error.unsupported": "{file}: this file type is not supported.",
  "library.error.tooLarge": "{file}: the file is larger than 60 MB.",
  "library.error.invalidDocx": "{file}: this is not a valid Word file.",
  "library.error.noText": "{file}: no readable text found. A scanned PDF needs OCR first.",
  "library.error.failed": "{file}: could not read the file.",
  "library.error.load": "The library did not load.",
});
