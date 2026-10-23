// Slug to guide body, on the same terms as the news bodies: eager, so the prose
// is in the server's HTML rather than arriving after hydration.

import type { ArticleBody } from "../body";
import { AgenticAIDefinition } from "./agentic-ai-definition";
import { Jargon101 } from "./jargon-101";
import { JargonHostedServers } from "./jargon-hosted-servers";
import { JargonMarketplace } from "./jargon-marketplace";
import { WhatAreAIAgents } from "./what-are-ai-agents";
import { WtfIsJargon } from "./wtf-is-jargon";

export const GUIDE_BODIES: Readonly<Record<string, ArticleBody>> = {
  "agentic-ai-definition": AgenticAIDefinition,
  "what-are-ai-agents": WhatAreAIAgents,
  "jargon-101": Jargon101,
  "jargon-hosted-servers": JargonHostedServers,
  "jargon-marketplace": JargonMarketplace,
  "wtf-is-jargon": WtfIsJargon,
};
