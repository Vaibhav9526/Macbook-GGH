// What main answers for routine flows: one agent's canvas and a new link.

import { isRoutineFlowCanvas, isRoutineFlowLink } from "@jargon/contracts/ipc";
import { guardedDecoder } from "@jargon/contracts/ipc-decoding";

export const decodeRoutineFlowCanvas = guardedDecoder(isRoutineFlowCanvas, "routine flow canvas response");
export const decodeRoutineFlowLink = guardedDecoder(isRoutineFlowLink, "routine flow link response");
