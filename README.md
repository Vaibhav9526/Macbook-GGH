<p align="center">
  <img src="assets/app-logo.png" alt="Jargon logo" width="144" height="144">
</p>

<h1 align="center">Jargon</h1>

<p align="center"><strong>A desktop workspace for AI agents, built for learning and teaching.</strong></p>

Jargon runs AI agents on your own computer. Each agent keeps its own workspace, memory and conversation.
Agents can message each other, share channels, and hand work over, so a tutor, a planner and a librarian
can work on the same material without losing context.

## Contents

- [Features](#features)
- [Agents in School](#agents-in-school)
- [Getting started](#getting-started)
- [Project layout](#project-layout)

## Features

- **Local first.** Workspaces, conversations, attachments and team data stay on your computer. Providers,
  the pages an agent visits, and plugins use the network only when you use them.
- **Persistent agents.** Each agent has its own memory, its own message queue, and can be paused, resumed
  or cancelled.
- **Teamwork.** Agent-to-agent messages and shared channels with one task owner.
- **Practice and teaching.** Multiple-choice quizzes with grading and a list of weak topics, and interactive
  lessons opened from a chat with `@teach-me`.
- **Library.** Add notes, books and slides, then ask an agent to answer from them with `@memory-notes`.
- **Files.** Convert documents and images, and compress images, from the chat.
- **Office and School floors.** See your agents at work on a floor plan.
- **Planner.** Plan a study timetable for JEE or NEET from the syllabus.

## Agents in School

| Agent | What it does |
| --- | --- |
| Teacher | Explains lessons step by step, checks understanding, and runs quizzes. |
| Librarian | Keeps the shared library and answers from your notes. |
| Topper | Gives confident answers and challenging questions. |
| Smart Guy | Shares shortcuts, tricks and the big picture. |
| Vice Principal | Helps plan time and priorities. |

## Getting started

Requirements: [Bun](https://bun.sh), Node.js and Git.

```sh
bun install
bun run dev
```

Checks for the main process and the renderer:

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
apps/           Account API, status page and integrations
marketplace/    Skills and agents for the marketplace
scripts/        Build and maintenance scripts
test/           Tests
```
