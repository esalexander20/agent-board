---
name: implement
description: Implement a specific kanban card end-to-end — write code (test-first where a test suite exists), run typecheck/tests, review the diff, and commit. Use when asked to implement, build, or ship a specific kanban card, or when the sync skill detects an "implement this" comment on a card.
---

# Implement a Kanban Card

Adapted from Matt Pocock's `implement` skill (`mattpocock/skills`), scoped to one
kanban-planner card instead of a full issue-tracker ticket/spec pipeline.

## Steps

1. Read `.claude/dashboard/board.json` and find the card by id. State its title
   before starting. If the card id is missing or ambiguous, ask.

2. Treat the card's `description` as the "what to build" spec — the end-to-end
   behavior from the user's perspective — and `acceptanceCriteria` (if present)
   as the checklist to satisfy. If there's no `acceptanceCriteria`, infer 2-5
   reasonable ones from the title/description and proceed.

3. Explore the relevant part of the project to understand the current code
   before changing anything.

4. Implement the work:
   - If the project has an existing test suite/framework, work test-first at
     the clearest seam you can find: red (write a failing test for one
     acceptance criterion) → green (minimal code to pass it) → repeat per
     criterion. Prefer the project's existing test patterns over inventing
     new ones.
   - If there's no test suite, or testing this change isn't practical,
     implement directly, but keep changes scoped to exactly what the card
     describes.
   - Run the project's typecheck/build command regularly if one exists (check
     `package.json` scripts or the project's equivalent), and run the full
     test suite once at the end.

5. Load the `code-review` skill against your own diff before committing, and
   fix anything it flags.

6. Commit the change to the current branch with a concise commit message
   describing what was built (reference the card's title, not its internal
   id).

7. Update the board:
   - Mark every acceptance criterion `done: true`.
   - Find the triggering "implement this"-style comment on this card and mark
     its `status` `"processed"`.
   - Move the card to the `pending_review` column.
   - Append a new comment: `author: "claude"`, summarizing what was built,
     the commit hash, and what's left for human review; `status: "processed"`.
   - Write the whole board back atomically (temp file in the same directory,
     then rename over `board.json`) — same discipline as the `sync` skill.
     Read the file fresh immediately before this write, since time has passed
     since step 1 and other changes may have landed in the meantime.

8. Report a short summary to the user: what was built, test/typecheck
   results, the commit hash, and the card's new column.

## Notes

- This mirrors Pocock's implement → code-review → commit discipline, scoped
  down to a single card — no issue tracker, ADRs, or domain glossary
  involved, since kanban-planner doesn't have that apparatus.
- If the request is genuinely ambiguous or risky (it would touch unrelated
  areas, delete data, or affect production config), stop and ask rather than
  guessing.
- This skill commits automatically when it finishes. The user should know
  that commenting an implement-trigger ("implement this", "build this",
  "ship this card") on a card causes real commits to the project — see the
  README.
