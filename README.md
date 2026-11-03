# kanban-planner

A local kanban dashboard for planning work, built as a Claude Code plugin.

Type a high-level goal into the board, and Claude breaks it down into small, actionable
cards — each with a short "what to build" description and an acceptance-criteria
checklist. Leave a comment on any card as a change request, and Claude reads and acts on
it — editing the card, moving it, or making a real change elsewhere in your project — then
replies on the card so the loop stays visible.

Comment **"implement this"** (or "build this", "ship this card", etc.) on a card, and
Claude runs its `implement` skill against it: it writes the code (test-first where the
project has a test suite), runs typecheck/tests, reviews its own diff, and **commits to
the current branch automatically** — then moves the card to Pending Review and ticks off
its acceptance criteria. This is adapted from [Matt Pocock's `implement`
skill](https://github.com/mattpocock/skills), scoped down to a single kanban card.

## Install

In a Claude Code session:
```
/plugin marketplace add esalexander20/agent-board
/plugin install kanban-planner@agent-board
```
Or from your shell:
```bash
claude plugin marketplace add esalexander20/agent-board
claude plugin install kanban-planner@agent-board
```
Confirm it loaded: type `/` and look for `/kanban-planner:start`, `/kanban-planner:sync`,
and `/kanban-planner:stop`.

To try it from a local clone without installing, start Claude Code with
`claude --plugin-dir /path/to/agent-board` instead — this loads it for one session only.

## How it works

- **A local Node.js server** (zero npm dependencies) serves the dashboard UI in your
  browser and exposes a small JSON API + a live-update stream (SSE) for it. It only talks
  to the browser.
- **Claude reads and writes the same data file directly** (`.claude/dashboard/board.json`
  in your project) using its normal file tools — it never calls the server's HTTP API.
  The server watches that file and pushes updates to your open browser tab whenever it
  changes, whether the change came from the browser or from Claude.
- **Everything is scoped per project.** Each project gets its own `.claude/dashboard/`
  directory, its own board, and its own server instance/port.

## Usage

- `/kanban-planner:start` — start the dashboard server for the current project and open
  it in your browser (prints the URL if it can't open a browser for you, e.g. in a
  headless/cloud session).
- In the dashboard: click **+ New Plan** to describe a goal, or **+ New Card** to add a
  task manually. Expand any card to leave a comment.
- `/kanban-planner:sync` — ask Claude to break down any newly submitted plans into cards,
  and to act on any new unprocessed comments (including running `implement` on any card
  commented "implement this").
- `/kanban-planner:stop` — stop the dashboard server for the current project.

> **Heads up:** an "implement this"-style comment causes Claude to actually write code and
> commit it to your current branch, without asking for confirmation first. Don't leave
> that comment on a card unless you want that to happen.

## Data

Board state lives at `.claude/dashboard/board.json` in your project (plus `server.pid` /
`server.port` while the server is running). It's plain JSON — feel free to inspect it, and
consider adding `.claude/dashboard/` to your project's `.gitignore` if you don't want board
state committed.

## Notes

- The server binds to `127.0.0.1` only and has no authentication — it's a local,
  single-user tool, not meant to be exposed beyond your own machine.
- Default port is `4848`, auto-incrementing on conflicts; override with the `KANBAN_PORT`
  environment variable.
