---
name: start
description: Start the kanban planner dashboard server for this project and open it in the browser. Use when the user wants to open, launch, or view the kanban board, dashboard, or planning board.
---

# Start the Kanban Dashboard

## Steps

1. Determine the project root: the current working directory.

2. Ensure `<project-root>/.claude/dashboard/` exists (the server will create it too, but it's fine to create it first).

3. Check `<project-root>/.claude/dashboard/server.pid`:
   - If present, check whether that PID is a live process (e.g. `kill -0 <pid>`). If it is live, the server is already running — skip straight to step 5, reading the port from `server.port`.
   - If present but the process is not alive (stale PID file from a crash), delete `server.pid` and `server.port` before continuing.

4. Start the server in the background, from the project root:
   ```
   cd <project-root> && node ${CLAUDE_PLUGIN_ROOT}/server/server.js > .claude/dashboard/server.log 2>&1 &
   ```
   The server itself also detects an already-running instance and exits immediately if so — so this is safe to run even if step 3's check is inconclusive. After launching, briefly poll for `.claude/dashboard/server.port` to appear (it's written right after the server binds), so you can report the real URL. A one-second poll loop for a few seconds is enough; if the port file never appears, check `.claude/dashboard/server.log` for the error and report it to the user.

5. Read the port from `.claude/dashboard/server.port`. The dashboard URL is `http://127.0.0.1:<port>/`.

6. Try to open the browser automatically, for a normal local session:
   - macOS: `open <url>`
   - Linux: `xdg-open <url>`
   - Windows: `start <url>`

   Attempt the one that matches the platform, but do NOT treat failure as fatal. In a headless/cloud/Cowork session there is no attached desktop, so shell `open`/`xdg-open`/`start` commands cannot reach the user's real browser — the same caveat documented for this environment's other dashboard-style plugins. If the open command errors, or you have reason to believe this session has no reachable desktop, just skip to the fallback message below rather than retrying.

7. Always tell the user the URL, regardless of whether auto-open worked:
   - If auto-open was attempted: "Dashboard is running at http://127.0.0.1:<port>/ — opening it now."
   - If auto-open isn't possible or failed: "Dashboard is ready at http://127.0.0.1:<port>/. I can't open a browser from here — open that URL yourself to get started."

## Notes

- The server is per-project: each project gets its own port and its own `.claude/dashboard/board.json`.
- If multiple projects' dashboards are running at once, each one's `server.js` auto-increments past `4848` on port conflicts, so they won't collide.
