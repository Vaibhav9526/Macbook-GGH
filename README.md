# Jargon

Jargon is a desktop workspace for AI agents. Each agent keeps its own workspace, memory and conversation,
and agents can message each other, share channels and hand work over. Everything runs on your computer.

## Contents

- [1. AI for education and skills](#1-ai-for-education--skills)
- [2. Local first](#2-local-first)
- [3. Teamwork between agents](#3-teamwork-between-agents)
- [4. Tools](#4-tools)
- [Getting started](#getting-started)
- [Project layout](#project-layout)

## 1. AI FOR EDUCATION & SKILLS

Solutions for learning, teaching, skill development, career readiness, and campus experiences.

- Tutor agents that explain step by step and check understanding with short questions.
- Multiple-choice quizzes with grading and a clear list of topics to revise.
- A shared library of notes, books and slides that agents can answer from.
- Interactive lessons opened from a chat with `@teach-me`.

## 2. LOCAL FIRST

- Workspaces, conversations, attachments and team data stay on your computer.
- Providers, the pages an agent visits, and plugins use the network only when you use them.
- A local SQLite database is the source of truth.

## 3. TEAMWORK BETWEEN AGENTS

- Persistent agents with a queue per agent: messages are delivered in order, and can be paused,
  resumed or cancelled.
- Agent-to-agent messages and shared channels with one task owner.
- Versioned team protocols, so older clients keep working.

## 4. TOOLS

- File tools: convert documents and images, and compress images, from the chat.
- Browser: an agent can open and read pages in the built-in browser.
- Provider CLIs: Jargon uses the coding CLIs you already have, and can download a managed copy.

## Getting started

Download the Windows installer from the GitHub Releases page, or build from source.

Requirements for building from source: Bun, Node.js and Git.

```sh
bun install
bun run dev
```

Useful checks:

```sh
bun run typecheck:node
bun run typecheck:renderer
```

## Project layout

```
src/main        Electron main process and IPC handlers
src/backend     Agent service, storage, migrations and provider runtimes
src/renderer    Application interface
src/preload     Preload bridge
packages/       Shared packages: contracts, i18n, brand, UI, team client and more
apps/           Account API, status page and chat app integrations
marketplace/    Skills and agents for the marketplace
scripts/        Build and maintenance scripts
test/           Tests
```
