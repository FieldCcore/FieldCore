# FIELDCORE DEVELOPMENT STANDARD

**Version:** 1.0  
**Created:** 2026-06-25  
**Status:** ACTIVE — Mandatory for all FieldCore development work  
**Authority:** This document supersedes all informal conventions. Every Claude Code task in this project must comply.

---

## Purpose

This document is the binding operating standard for all development work on the FieldCore codebase. It defines how tasks are tracked, how requirements are verified, how UI changes are confirmed, how documentation is maintained, and what a completed task actually looks like.

Before starting any task, Claude must read this file and apply its rules. There are no exceptions.

---

## 1. Requirement Tracking

### Rule

Before writing a single line of code, Claude must:

1. Read the entire task prompt from beginning to end.
2. Extract every discrete requirement — no matter how small.
3. Build a numbered checklist of all requirements.
4. Track each item throughout execution using one of four states:

| State | Meaning |
|---|---|
| `IN PROGRESS` | Work started, not yet verified |
| `PASS` | Implemented and confirmed working |
| `FAIL` | Attempted but broken or incomplete |
| `NOT APPLICABLE` | Explicitly does not apply to this task |

### Rules

- No requirement may be silently skipped.
- If a requirement is ambiguous, resolve it before starting — not after.
- If a requirement cannot be met due to a blocker, document the blocker explicitly. Do not omit the item.
- Every item on the checklist must reach `PASS` or `NOT APPLICABLE` before the task can be closed.

---

## 2. Completion Gates

### Definition

A task is **not complete** until every gate below passes. Claude may not report a task as done, submit a commit, or push to production until all gates clear.

### Gates

| Gate | Requirement |
|---|---|
| Requirements | Every extracted requirement is PASS or NOT APPLICABLE |
| Routes | Every modified or new route responds correctly |
| Features | Every requested feature exists and functions |
| UI | Rendered output matches the task description |
| Documentation | All affected doc files updated |
| QA | Hostile QA review found no issues |
| Build | Code builds without errors |
| Deployment | Production reflects the changes |

### On Gate Failure

If any gate fails:

```
TASK STATUS = INCOMPLETE
```

Claude must continue working until all gates pass. Partial completion is not acceptable and must not be described as complete.

---

## 3. UI Verification

### Rule

Every task that touches the UI must be verified against the **rendered result**, not just the source code. Reading the code and assuming it works is not verification.

### Checklist

For every UI task, verify:

- [ ] Layout — containers, grids, and spacing render as intended
- [ ] Typography — correct font family, size, weight, and color
- [ ] Buttons — correct label, color, hover state, disabled state
- [ ] Navigation — all links route correctly, active states highlight correctly
- [ ] Forms — inputs, labels, validation messages, and submit states render correctly
- [ ] Tables — headers, rows, borders, hover states, and empty states render correctly
- [ ] Badges — correct color, label, and positioning for each status variant
- [ ] Colors — all colors use FieldCore CSS variables (`var(--navy)`, `var(--sand)`, `var(--red)`, etc.) — no raw Tailwind hex codes
- [ ] Responsive behavior — layout does not break at 768px or 390px breakpoints
- [ ] No duplicate titles — page title appears only once (topbar or page, not both)
- [ ] No orphaned elements — removing a component does not leave empty space or broken margins

### Brand Color Reference

All colors must use CSS variables defined in `client/src/style.css`:

| Variable | Hex | Use |
|---|---|---|
| `var(--navy)` | `#1C2333` | Sidebar, headers, primary text |
| `var(--sand)` | `#D6B58A` | CTAs, active states, accents |
| `var(--sand-dark)` | `#C09A6A` | Sand hover states |
| `var(--sand-lt)` | `#F5EDE0` | Sand backgrounds |
| `var(--slate)` | `#5F667A` | Secondary text |
| `var(--steel)` | `#8A90A2` | Muted text, placeholders |
| `var(--offwhite)` | `#EDEBE7` | Page backgrounds |
| `var(--lightgray)` | `#E6E6E6` | Borders |
| `var(--red)` | `#C62828` | Errors, destructive actions |
| `var(--red-lt)` | `#FFEBEE` | Error backgrounds |
| `var(--green)` | `#2E7D32` | Success, complete states |
| `var(--green-lt)` | `#E8F5E9` | Success backgrounds |
| `var(--blue)` | `#1565C0` | Active/in-progress states |
| `var(--blue-lt)` | `#E3F2FD` | Active backgrounds |
| `var(--amber)` | `#E65100` | Warning states |
| `var(--amber-lt)` | `#FFF3E0` | Warning backgrounds |

---

## 4. Hostile QA Review

### Rule

Before marking any task complete, Claude must perform a hostile audit. The default assumption is that the implementation failed. The goal is to find problems — not to confirm everything is fine.

### Method

1. Re-read the original task prompt.
2. For each requirement, attempt to disprove that it was met.
3. Check adjacent areas that were not explicitly modified for regressions.
4. Check the UI from a first-time user perspective — not an author perspective.

### What to Look For

- Missing features — was anything in the prompt not implemented?
- Incomplete requirements — partially implemented counts as FAIL
- Broken routes — does every named route still work?
- Broken UI — do layouts, fonts, colors, and spacing still look correct?
- Missing styling — was any element left with default browser styles?
- Inconsistent typography — are all heading/label/body fonts using the correct FieldCore type scale?
- Duplicate components — did the change introduce duplicate titles, badges, or buttons?
- Missing mobile support — does the layout break below 768px?
- Missing empty states — do tables, lists, and panels show a proper empty state when there is no data?
- Side effects — did the change break something that was previously working?

### Outcome

If any issue is found during the hostile review:

```
Task remains INCOMPLETE. Fix the issue and re-run the hostile review.
```

The hostile review passes only when no issues are found.

---

## 5. Documentation Updates

### Rule

After every task, update all documentation files that are affected by the change. If a file is not affected, state explicitly why.

### Files to Review After Every Task

| File | When to Update |
|---|---|
| `FEATURE_INVENTORY.md` | New feature added, feature modified, or feature removed |
| `CURRENT_DEVELOPMENT_STATUS.md` | Any change to what is working, partially working, or broken |
| `NEXT_DEVELOPMENT_TASKS.md` | Task completed (remove it) or new task identified (add it) |
| `RELEASE_READINESS_REPORT.md` | Launch readiness status changes |
| `TECHNICAL_DEBT_REPORT.md` | Debt introduced or debt resolved |
| `LAUNCH_BLOCKERS.md` | Blocker resolved or new blocker identified |
| `FIELDCORE_DECISIONS_LOG.md` | Any decision made during the task (architecture, design, scope) |

### Format for Documentation Entries

- Use present tense for current state descriptions.
- Use past tense for resolved items (e.g., `~~RESOLVED 2026-06-25~~`).
- Date all entries `YYYY-MM-DD`.
- Reference the relevant decision number (`DECISION-NNN`) when a decision was recorded.
- Do not duplicate existing content — update in place.

---

## 6. File Tracking

### Rule

Every task must produce a complete list of files touched. This list must appear in the final report.

### Track

- **Files modified** — existing files changed (path + brief description of what changed)
- **Files created** — new files added (path + purpose)
- **Components changed** — React component names affected
- **Routes changed** — Express routes or React Router paths added, removed, or modified
- **Database changes** — migrations, schema changes, new tables or columns
- **API changes** — endpoint signatures, request/response shape changes
- **CSS changes** — style rules added, removed, or overridden

### Rule for Side Effects

If a change to file A causes a required change to file B, file B must also be tracked and updated — not left inconsistent.

---

## 7. Route Verification

### Rule

Every route touched by a task must be verified to work after the change. Verification means the route responds correctly — not that the code looks correct.

### Sidebar Routes (Verify After Any Navigation Change)

| Route | Page | Access |
|---|---|---|
| `/dashboard` | Dashboard | All roles |
| `/jobs` | Calendar | All roles |
| `/dispatch` | Dispatch | Owner, Manager |
| `/revenue` | Revenue | Owner, Manager |
| `/invoices` | Invoices | All roles |
| `/estimates` | Estimates | Owner, Manager |
| `/deposits` | Deposits | Owner, Manager |
| `/billing` | Billing | Owner |
| `/clients` | Clients | Owner, Manager, Staff |
| `/communications` | Communications | Owner, Manager |
| `/team` | Team | Owner |
| `/fleet` | Fleet | Owner |
| `/entities` | Entities | Owner |
| `/booking` | Settings | Owner |
| `/account` | Account | All roles |

### Verification Steps

1. Navigate to the route.
2. Confirm the correct page loads.
3. Confirm the active sidebar item highlights correctly.
4. Confirm no console errors appear.
5. Confirm the topbar title matches the page.

---

## 8. Mobile Verification

### Rule

Every UI change must be checked at the following breakpoints:

| Breakpoint | Target |
|---|---|
| 1280px+ | Desktop — sidebar always visible |
| 768px–1024px | Tablet — sidebar visible, content adjusts |
| 390px–768px | Mobile — sidebar hidden, bottom nav visible |
| < 390px | Small phone — compressed layout |

### Mobile-Specific Checks

- Sidebar collapses and opens via hamburger menu on mobile
- Bottom navigation bar is visible and functional at `≤768px`
- No horizontal overflow or cut-off content
- Modals display as bottom sheets on mobile (not centered overlays)
- Tables scroll horizontally on mobile inside `.table-wrap`
- Filter tabs scroll horizontally on mobile
- Form rows collapse to single column on mobile

---

## 9. Database Verification

### Rule

Any task that modifies the database must verify the following before marking complete:

- Migration ran successfully on the target environment
- New columns or tables exist and have the correct types
- Existing data is not corrupted
- API endpoints that read or write the new schema return correct responses
- No N+1 query issues introduced for common list endpoints

### Migration Rules

- All migrations must use `IF NOT EXISTS` or equivalent guards to be safe to re-run.
- Never drop a column or table without explicit owner approval.
- Always add new columns as nullable unless the column has a safe default.
- Document every migration in `CURRENT_DEVELOPMENT_STATUS.md`.

---

## 10. Deployment Verification

### Deployment Target

- **Frontend:** Vercel — run `npx vercel --prod` from the **repo root** (`/fieldcore/`), not from `client/`
- **Backend:** Railway — auto-deploys from `main` branch push

### Pre-Deployment Checklist

- [ ] All changes committed with a clear message
- [ ] Pushed to `origin main`
- [ ] `npx vercel --prod` run from repo root (not `client/`)
- [ ] Vercel build completes without errors
- [ ] Production URL checked after deploy
- [ ] No 500 errors or blank screens on production

### Vercel Path Warning

Running `npx vercel --prod` from inside `client/` causes the path error:

```
Error: The provided path "~/fieldcore/client/client" does not exist
```

Always run from the repo root. The Vercel project `rootDirectory` is already set to `client/`.

---

## 11. Final Reporting Standards

### Rule

Every task must end with a structured final report using the format below. No exceptions. Do not summarize informally without the structured report.

### Report Format

```
==================================================
TASK STATUS: [COMPLETE / INCOMPLETE]
==================================================

PASS REQUIREMENTS
- [List every requirement that passed]

FAIL REQUIREMENTS
- [List every requirement that failed, with reason]

NOT APPLICABLE
- [List requirements that did not apply to this task, with reason]

FILES MODIFIED
- path/to/file.jsx — description of change
- ...

FILES CREATED
- path/to/new-file.md — description of purpose
- ...

ROUTES VERIFIED
- /route — PASS / FAIL / NOT APPLICABLE

DOCUMENTATION UPDATED
- FILENAME.md — what was updated
- FILENAME.md — not applicable because [reason]
- ...

REMAINING ISSUES
- [Any known issues not resolved in this task]
- None if clean

NEXT RECOMMENDED TASK
- [The single most valuable next task based on current state]
```

---

## Mandatory Pre-Task Behavior

Before starting any future task, Claude must:

1. Read this file (`FIELDCORE_DEVELOPMENT_STANDARD.md`).
2. Extract all requirements from the task prompt.
3. Build the requirement checklist.
4. Apply the Completion Gate.
5. Apply the Hostile QA Review before reporting done.
6. Produce the Final Report using the format in Section 11.

This is not optional. It is the default operating mode for all FieldCore development.

---

## Version History

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-06-25 | Initial creation — see DECISION-030 |
