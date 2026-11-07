# AFC Special Leave implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Date-aware Available Special Leave with FTE/DOE deduction in the Testing Frontend Demo.

**Architecture:** Pure calculation policy used by the Demo AFC repository and administrator UI; no mutation of original contract FTE/DOE or teaching assignments. Preserve historical AFC semantics for other records.

**Tech Stack:** CommonJS JavaScript, Node test runner, PAWS Frontend Demo.

**Spec:** docs/superpowers/specs/2026-11-06-afc-special-leave-design.md

## Global Constraints
- Testing demo only; no remote server, RDC, SQL writes or Beta changes.
- Source data missing is Pending; never impute a Service/Research value.
- 1 FTE equals 100 DOE points, no duration pro-rata.
- Retain private deduction details for administrator-authorized paths.
- Review, test, draft PR, and add PR-specific root CHANGELOG.json entry.

## Review Focus
- Invalid FTE/DOE, missing sources, and year boundary.
- Overlapping approved leaves and priority, only conflicting dates paused.
- Cancel/date change or base FTE change recomputes effective values.
- Approved administrative records versus pending Faculty requests.
- Available AFC must not mask actual teaching-session conflicts.

### Task 1: Pure rules
**Files:** Create `frontend/scripts/afc-special-leave-policy.js`, test `tests/paws-afc-special-leave.test.js`.
- [ ] Write failing Node test for zero, exact splits, overlapping date, cross-year, missing and source mismatch.
- [ ] Verify RED using `node --test tests/paws-afc-special-leave.test.js`.
- [ ] Implement policy, verify GREEN, commit.

### Task 2: Demo persistence and API
**Files:** Modify demo AFC repo and ported dashboard API, client.
- [ ] Write failing API tests for admin create, explicit Available and Pending, cancellation.
- [ ] Verify RED, implement with safe feature opt-in only in Demo, verify GREEN, commit.

### Task 3: Admin form and Lookup
**Files:** Modify PAWS frontend HTML, AFC helper and Faculty Dashboard.
- [ ] Write failing UI tests, verify RED.
- [ ] Implement Available/Unavailable selector and date-aware Lookup flags.
- [ ] Verify GREEN, commit.

### Task 4: Scheduling, audit, review
**Files:** Demo scheduling, relevant tests, documentation.
- [ ] Write failing availability tests and verify RED.
- [ ] Fix check to respect Available Special Leave but retain true session conflicts.
- [ ] Verify GREEN, run `npm test` and `npm run test:all`.
- [ ] Open draft PR and update root `CHANGELOG.json` for its own PR number.
