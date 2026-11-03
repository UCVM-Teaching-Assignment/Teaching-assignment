# Lab scheduling implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Track steps with checkboxes.

**Goal:** Add scoped student-group and run scheduling to existing PAWS LAB sessions, with separately published public views.
**Architecture:** Extend the existing Demo request router and store; reuse canonical sessions and assignments. Add a lazy Calendar editor and public detail renderer. Existing SWAP/Teaching Assignment tools remain the approval authority.
**Tech Stack:** Existing vanilla JavaScript, Node built-in test runner, browser-local Demo API.
**Spec:** docs/superpowers/specs/2026-11-02-lab-scheduling-design.md

## Global constraints
- Target Testing repository and browser-local Demo only; do not modify SQL, Firestore, Beta, or actual Faculty/student records.
- All means an explicit assigned audience. Never infer optional attendance or whole-cohort membership.
- No new independent faculty assignment or DOE authority.
- Do not publish drafts, private rosters, UCIDs, emails, DOE or AFC reasons in public projections.
- Preserve scope, revisions, audit, archived-year protection and existing approval boundaries.

## Review focus
- All overlapping a smaller mandatory group must raise a real student conflict.
- Saved roster changes cannot alter the previously published audience or group labels.
- Revoked account/scope and stale source/working revisions must be checked at every action.
- Duplicate operation IDs cannot be reused with a different payload.
- No-source-time, missing capacity, unconfirmed coverage and unknown availability must remain explicit blockers.

## Task 1: Operational service and request integration
Files: tools/pages-demo-api/lab-scheduling.js, tools/pages-demo-api/lab-scheduling-routes.js, tools/pages-demo-api/runtime.js, tests/lab-scheduling.test.js, tests/lab-scheduling-routes.test.js.
Interfaces: createLabService({store, annualState}), list(uid), read(uid,sessionId), save(uid,payload), publish(uid,payload), publicView(sessionId), roster(uid,sessionId,version), copyStructure(uid,payload).
- [x] Write and run failing tests for explicit All, groups, immutable publication, scope/readiness, stale revisions, approvals, conflicts and privacy.
- [x] Implement the service using store.bag(), canonical Session/Assignment references and store.audit()/commit().
- [x] Wire authenticated Demo routes, public published-only projection, and synthetic fixtures with explicit demo LAB scopes.
- [x] Run focused domain and route tests.

## Task 2: Calendar editor and public display
Files: frontend/scripts/lab-scheduling-entry.js, frontend/scripts/lab-scheduling-editor.js, frontend/styles/lab-scheduling.css, frontend/scripts/lab-session-detail.js, tools/static-assets.paws.json, tests/lab-scheduling-ui.test.js.
Interfaces: PAWS_LAB_SCHEDULING.request(path,options), renderPublished(publication); PAWS_LAB_EDITOR.open(sessionId).
- [x] Test published rendering, escaping, roles and empty cells before implementation.
- [x] Add a lazy Lab Scheduling entry from Calendar and the existing LAB detail.
- [x] Build group/roster/room/run forms, validation, Save Draft/Publish Changes and published preview.
- [x] Route restricted source changes to existing request tools; never simulate approval by changing LAB state.
- [x] Verify rendered component behavior on desktop and mobile in the available offline harness.
- [ ] Verify the complete selected build and staged-site integration.

## Task 3: Documentation, PR and verification
Files: docs/architecture/lab-scheduling-database-proposal.md, docs/acceptance/lab-scheduling-demo.md, CHANGELOG.json.
- [x] Document future schema/API contracts without migrations.
- [x] Record the exact source baseline, implemented scope, gaps and tests in the acceptance document and Draft PR #102.
- [x] Add/update the PR-specific public Change Log entry.
- [ ] Run npm test, npm run test:all and selected build on the full repository via available CI; distinguish focused local tests from full-suite results.
- [ ] Complete full-branch review and manual acceptance. Do not merge or claim deployment without evidence.

## Environment ruling
The container cannot resolve github.com, so this local directory is a focused verification workspace, NOT a full clone. Remote base is d3a1bf2b1ae5218679af854ead38f21bed6e97cb; GitHub connector writes work. Run newly added dependency-free tests here, and use repository CI for complete regression/build evidence. Report any unavailable checks rather than claiming a full-suite pass.

## Execution checkpoint

Domain, routes, lazy editor, Calendar detail integration and focused tests implemented. Runtime dispatch is in tools/pages-demo-api/runtime.js rather than routes.js to keep the existing route composition unchanged. Entry loading is attached to the existing lab-session-detail.js rather than rewriting the generated index. Full-suite/build/emulator/staged-site acceptance and fresh Graphify remain pending repository CI/full checkout. See docs/acceptance/lab-scheduling-demo.md.
