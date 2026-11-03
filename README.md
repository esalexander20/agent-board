# kanban-planner

A local kanban dashboard for planning work, built as a Claude Code plugin.

Type a high-level goal into the board, and Claude breaks it down into small, actionable
cards. Leave a comment on any card as a change request, and Claude reads and acts on it —
editing the card, moving it, or making a real change elsewhere in your project — then
replies on the card so the loop stays visible.

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
  and to act on any new unprocessed comments.
- `/kanban-planner:stop` — stop the dashboard server for the current project.

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
