---
name: sync
description: Sync the kanban board — break down newly submitted plans into actionable cards, and act on new change-request comments left on cards. Use when the user asks to sync, update, or process the kanban board, or after adding a plan or comment on the dashboard.
---

# Sync the Kanban Board

Read and write `<project-root>/.claude/dashboard/board.json` directly with your own file
tools (Read/Edit/Write). Never call the dashboard's HTTP API — only the browser does that.
Always read the whole file, compute the full updated object, and write the whole file
back (no partial edits), so the running server's live-update watcher sees a single
consistent JSON document and the open dashboard (if any) updates correctly.

## Steps

1. Read `.claude/dashboard/board.json`. If it doesn't exist, tell the user to run
   `/kanban-planner:start` first (starting the server creates it) and stop here.

2. **Process pending plans.** For each entry in `plans[]` whose `status` is
   `"pending_breakdown"`:
   - Read its `goal` text.
   - Break it into 3–8 concrete, actionable sub-task cards. Each card should be small
     enough to finish in one sitting, with an imperative title ("Add input validation to
     the signup form") and a one-to-three sentence `description` giving enough context to
     act on without re-reading the original goal.
   - Append each as a new card object:
     - `id`: `"card_"` followed by 6 random hex characters
     - `title`, `description` as above
     - `column`: `"backlog"`
     - `parentPlanId`: this plan's `id`
     - `createdAt` / `updatedAt`: current ISO-8601 timestamp
     - `comments`: `[]`
   - Set the plan's `status` to `"broken_down"`.
   - If a goal is too vague to break down responsibly, use your best judgment to make
     reasonable assumptions and proceed rather than blocking — note the assumptions briefly
     in the final summary (step 4) rather than stopping to ask.

3. **Process unprocessed comments.** For every card, for every comment whose `status` is
   `"unprocessed"`:
   - Treat `comment.text` as a change-request instruction about that specific card.
   - Decide what it's asking for — it may call for:
     a. editing the card itself (title/description), and/or
     b. moving the card to a different column, and/or
     c. an actual code or content change elsewhere in the project (use your normal file
        tools to make that change, scoped to what the comment reasonably asks).
   - Carry out the change.
   - Append a new comment to the same card:
     - `id`: `"cmt_"` followed by 6 random hex characters
     - `author`: `"claude"`
     - `text`: a short, concrete summary of what you did — or, if no action was
       appropriate, a short explanation of why
     - `createdAt`: current ISO-8601 timestamp
     - `status`: `"processed"` (Claude's own replies need no further action)
   - Set the original comment's `status` to `"processed"`.
   - Update the card's `updatedAt`.

4. Write the updated board object back to `board.json` as a single atomic write: write to
   a temp file in the same directory (e.g. `board.json.tmp-<random>`) and rename it over
   `board.json`. Do not edit the file in place with partial string replacements.

5. Report a short summary to the user: how many plans were broken down (and into how many
   cards each), how many comments were processed and what changed as a result of each. If
   there was nothing to sync, say so plainly.
