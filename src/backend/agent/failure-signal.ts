import type { AgentProviderId } from "@jargon/contracts/agent-providers";
import type { CauseCode } from "@jargon/telemetry";

/** Local analytics context. This is not an IPC or Team API payload. */
export interface FailureContext {
  causeCode?: CauseCode;
  provider?: AgentProviderId;
  model?: string | null;
  turnId?: string | null;
  severity?: "error" | "warning";
}
export interface FailureSignal extends FailureContext {
  code: string;
  causeCode: CauseCode;
  agentId?: string;
}
