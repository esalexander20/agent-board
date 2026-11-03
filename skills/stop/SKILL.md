---
name: stop
description: Stop the kanban planner dashboard server for this project. Use when the user wants to close, stop, or shut down the kanban board/dashboard server.
---

# Stop the Kanban Dashboard

## Steps

1. Look for `<project-root>/.claude/dashboard/server.pid`. If it doesn't exist, tell the
   user no server appears to be running for this project and stop here.

2. Read the PID from that file. If possible, sanity-check that it's actually this
   dashboard's process (e.g. on Linux/macOS, `ps -p <pid> -o command=` should mention
   `server.js`) before signaling it, so you don't accidentally kill an unrelated process
   that happens to have reused the PID.

3. Send it a graceful termination signal: `kill <pid>` (SIGTERM — do not use `kill -9`
   here). The server's own shutdown handler closes connections and deletes `server.pid`
   and `server.port` on clean exit.

4. Briefly wait (a second or two) and confirm the process is gone (e.g. `kill -0 <pid>`
   now fails) and that `server.pid` / `server.port` were removed.
   - If the files still exist after a few seconds, delete them yourself as a fallback.
   - If the process still appears alive after a few seconds, fall back to `kill -9 <pid>`.

5. Confirm to the user that the dashboard server has been stopped.
