// The one list of published guides. Same shape as the news registry, and read by
// the same pages, feed, sitemap and image generator.
//
// The public guides explain how Jargon works and how to use it. Contributor
// instructions for adding a guide live in CONTRIBUTING.md instead.

import { type ContentCollection, publishedFirst } from "./content-collection";
import { NEWS_AUTHOR } from "./news";

export const GUIDES_COLLECTION: ContentCollection<"guides"> = {
  id: "guides",
  indexRoute: "/guides",
  articleRoute: "/guides/$slug",
  name: "Guides",
  indexTitle: "Jargon Guides: How to Run a Team of AI Agents",
  indexDescription:
    "How Jargon works and how to run a team of AI agents. Start with Jargon 101, then explore practical guides to models, agents, and the Marketplace.",
  feedTitle: "Jargon guides",
  backLabel: "All guides",
  moreTitle: "More guides",
  imageEyebrow: "JARGON · GUIDES",
  articles: publishedFirst([
    {
      slug: "agentic-ai-definition",
      title: "Agentic AI Definition: How It Differs From Chatbots",
      description:
        "What is agentic AI? Compare Jargon agents with a typical chatbot: ongoing tasks, saved files, source checking and handoffs between agents.",
      publishedAt: "2026-10-13",
      author: NEWS_AUTHOR,
    },
    {
      slug: "jargon-hosted-servers",
      title: "Jargon Hosted Servers: Plans, Pricing, and How They Work",
      description:
        "Compare Jargon hosted server plans, pricing, storage, and team limits. Learn how to set one up and when self-hosting may suit you better.",
      publishedAt: "2026-10-07",
      author: NEWS_AUTHOR,
    },
    {
      slug: "jargon-marketplace",
      title: "How to Use the Jargon Marketplace: Agents, Skills, and Plugins",
      description:
        "Browse the Jargon Marketplace, install agents, plugins, and skills, and submit your own agent for review.",
      publishedAt: "2026-09-29",
      author: NEWS_AUTHOR,
    },
    {
      slug: "what-are-ai-agents",
      title: "What Are AI Agents? How They Work and When to Use Them",
      description:
        "What are AI agents, how do they work, and when are they useful? A practical guide to their tools, use cases, and limits.",
      publishedAt: "2026-09-24",
      author: NEWS_AUTHOR,
    },
    {
      slug: "jargon-101",
      title: "Jargon 101",
      description:
        "What Jargon is, what an agent keeps between runs, and how to get one doing real work on your computer. Start here if you have not opened the app yet.",
      publishedAt: "2026-09-12",
      author: NEWS_AUTHOR,
    },
    {
      slug: "wtf-is-jargon",
      title: "WTF Is Jargon?",
      description:
        "A practical explanation of models, providers, agents, and the local-first workspace that brings them together.",
      publishedAt: "2026-09-15",
      author: NEWS_AUTHOR,
    },
  ]),
};
