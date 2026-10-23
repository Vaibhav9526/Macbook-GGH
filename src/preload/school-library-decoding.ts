// What main answers for the School library shelf. Each decoder checks the shape its contract type says.

import {
  isSchoolFileToolResult,
  isSchoolLibraryAddResult,
  isSchoolLibraryBook,
  isSchoolLibraryHit,
  type SchoolFileToolResult,
  type SchoolLibraryAddResult,
  type SchoolLibraryBook,
  type SchoolLibraryHit,
} from "@jargon/contracts/ipc";
import { guardedDecoder, guardedListDecoder } from "@jargon/contracts/ipc-decoding";

export const decodeSchoolLibraryBooks: (value: unknown) => SchoolLibraryBook[] = guardedListDecoder(
  isSchoolLibraryBook,
  "school library books",
);
export const decodeSchoolLibraryAddResult: (value: unknown) => SchoolLibraryAddResult = guardedDecoder(
  isSchoolLibraryAddResult,
  "school library add result",
);
export const decodeSchoolLibraryHits: (value: unknown) => SchoolLibraryHit[] = guardedListDecoder(
  isSchoolLibraryHit,
  "school library hits",
);
export const decodeSchoolLibraryRemoved: (value: unknown) => boolean = guardedDecoder(
  (value): value is boolean => typeof value === "boolean",
  "school library remove result",
);
export const decodeSchoolFileToolResult: (value: unknown) => SchoolFileToolResult = guardedDecoder(
  isSchoolFileToolResult,
  "school file tool result",
);
