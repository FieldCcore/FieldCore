# FIELDCORE — Launch Readiness Execution Plan

**Created:** 2026-07-01  
**Audit Score at Creation:** 41 / 100  
**Public Launch Ready:** NO  
**Last Updated:** 2026-07-01

---

## Purpose

This document governs all FieldCore development from audit date to public launch. It is the authoritative source of what gets built, in what order, and what "done" means. Every task completed must reference this plan and update `FIELDCORE_TASK_QUEUE.md` and `FIELDCORE_CURRENT_SPRINT.md` before being marked complete.

---

## Governing Rules

### Rule 1 — Queue Order Is Law
Work proceeds in priority order: P0 → P1 → P2 → P3. No P1 task may be started until all P0 tasks are marked **Complete** unless Kevin explicitly approves an exception in writing (logged in `FIELDCORE_DECISIONS_LOG.md`).

### Rule 2 — No Task Closes Without PASS/FAIL Verification
Every task must include a verification section with explicit PASS or FAIL results before being marked Complete. "Code looks right" is not verification. The app must be run, the specific feature exercised, and the result observed.

### Rule 3 — Status Must Be Kept Current
After every work session, both `FIELDCORE_TASK_QUEUE.md` and `FIELDCORE_CURRENT_SPRINT.md` must reflect current task statuses. A task marked In Progress in CURRENT_SPRINT must match the same status in TASK_QUEUE.

### Rule 4 — Completion Checklist Required
Before any task moves to Complete, all checklist items in `FIELDCORE_COMPLETION_CHECKLIST.md` for that task must be checked off.

### Rule 5 — Decisions Must Be Logged
Any non-trivial implementation decision (data model choice, approach divergence from plan, scope change) must be logged in `FIELDCORE_DECISIONS_LOG.md` before the task closes.

### Rule 6 — Deploy to Production Before Closing
A task that modifies backend code must be deployed to Railway before it is marked Complete. A task that modifies frontend code must be deployed to Vercel before it is marked Complete.

### Rule 7 — No Feature Creep During P0
During P0 sprint, no new features are added. Only the specific audit issues are resolved. Polish and new ideas go into the P3 backlog.

---

## Priority Definitions

| Priority | Label | Description | Gate |
|---|---|---|---|
| P0 | Launch Blocker | Breaks core flows or violates legal/compliance requirements. Cannot ship without fixing. | None — start immediately |
| P1 | Critical Core | Feature is incomplete, partially broken, or critically missing for the core user experience | All P0 tasks Complete |
| P2 | Technician App Rework | Technician-specific features — the primary mobile experience for field workers | All P1 tasks Complete or Kevin-approved exception |
| P3 | Polish / Optimization | Performance, UX improvements, nice-to-haves, refactors | P2 Complete or concurrent with Kevin approval |

---

## Phase Overview

### Phase 1 — P0 Launch Blockers (Current)
**Target:** Fix all 10 launch blockers identified in the July 1 audit.  
**Sprint:** PR-001 starts with the 5-fix critical PR.  
**Exit Criteria:** All P0 tasks marked Complete. Audit rescore ≥ 65/100.

### Phase 2 — P1 Critical Core Features
**Target:** Complete all partially-implemented core features across jobs, deposits, entities, comms, accounts.  
**Exit Criteria:** All P1 tasks marked Complete. Audit rescore ≥ 80/100.

### Phase 3 — P2 Technician App Rework
**Target:** Fully rebuild the TechApp mobile experience with real maps, signature pad, tip capture, no-show flow, route guard, multi-day view, push notifications.  
**Exit Criteria:** All P2 tasks Complete. Tech user can complete a full job lifecycle entirely from TechApp without returning to the desktop dashboard.

### Phase 4 — P3 Polish
**Target:** Performance optimization, mobile polish, UX improvements, test coverage.  
**Exit Criteria:** Launch readiness score ≥ 90/100.

---

## Audit Baseline (July 1, 2026)

| Category | Count | Status |
|---|---|---|
| P0 Launch Blockers | 10 | Not Started |
| P1 Critical Core | 11 | Not Started |
| P2 Technician App | 10 | Not Started |
| P3 Polish | TBD | Not Started |
| **Total Tracked Tasks** | **31+** | **Not Started** |

**Launch Readiness Score:** 41 / 100  
**Target Launch Score:** 90 / 100

---

## Current Sprint

**Sprint:** PR-001 — Critical Blockers Fix  
**Status:** Not Started  
**Tasks:** 5  
**See:** `FIELDCORE_CURRENT_SPRINT.md`

---

## File Index

| File | Purpose |
|---|---|
| `FIELDCORE_LAUNCH_EXECUTION_PLAN.md` | This file — master rules and phase overview |
| `FIELDCORE_TASK_QUEUE.md` | Full ordered task list with status, owners, verification requirements |
| `FIELDCORE_CURRENT_SPRINT.md` | Active sprint tasks with detailed sub-tasks and verification steps |
| `FIELDCORE_COMPLETION_CHECKLIST.md` | Per-task completion gate checklists |
| `FIELDCORE_DECISIONS_LOG.md` | Decisions made during development |
| `FIELDCORE_DEVELOPMENT_STANDARD.md` | Code quality, verification, and report format standard |

---

## History

| Date | Event | Score |
|---|---|---|
| 2026-07-01 | Full codebase audit completed | 41/100 |
| 2026-07-01 | Execution plan created, PR-001 sprint opened | 41/100 |
