// What main answers for the School quiz. Each decoder checks the shape its contract type says.

import {
  isSchoolQuizReportResult,
  isSchoolQuizStartResult,
  type SchoolQuizReportResult,
  type SchoolQuizStartResult,
} from "@jargon/contracts/ipc";
import { guardedDecoder } from "@jargon/contracts/ipc-decoding";

export const decodeSchoolQuizStart: (value: unknown) => SchoolQuizStartResult = guardedDecoder(
  isSchoolQuizStartResult,
  "school quiz start result",
);
export const decodeSchoolQuizReport: (value: unknown) => SchoolQuizReportResult = guardedDecoder(
  isSchoolQuizReportResult,
  "school quiz report result",
);
