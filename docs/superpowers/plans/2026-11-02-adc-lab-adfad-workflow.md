# ADC → LAB → ADFAD schedule workflow implementation plan

> **For agentic workers:** Implement with test-first changes in the existing PAWS Testing branch; keep PR #102 in Draft until independently reviewed.

**Goal:** Let ADC publish an instructor-free timetable with Course + date/start/end as the only required schedule data; LAB then books rooms/student runs; ADFAD finally confirms faculty suggestions or assigns instructors. Developer tests every role.

**Architecture:** Keep canonical Course Sessions as the source of truth. Create a browser-local Testing-only schedule workflow adapter that stores ADC drafts separately, publishes validated Sessions to the existing Demo timetable, and lets ADFAD confirm instructors through a role-gated operation. Reuse Lab Scheduling's groups and publish operation, but make operational publication independent of faculty allocation. The LAB public projection reads confirmed faculty from the canonical session without making student data public.

**Stack:** Existing JavaScript, Node test runner, PAWS Frontend Demo API, existing Browser localStorage. No SQL/Firebase migration.

**Spec:** User approval on 2026-11-02: Developer can test all steps; ADC publishes Course/Date/Start/End (topic/room/faculty optional), optional faculty suggestion; LAB follows for LAB Sessions with rooms/groups/rosters; ADFAD last accepts suggestions or independently assigns faculty.

## Invariants
- Date is mandatory to place a scheduled time on Calendar. Academic year is May 1–April 30. Course comes from the existing Course Catalog.
- Developer and Owner have test/admin authority for both ADC and ADFAD; ADC cannot approve faculty; LAB cannot change teaching assignments; ADFAD cannot impersonate ADC publication without Developer/Owner authority.
- Suggestions are not assignments and have no DOE effect.
- LAB publication does not require faculty or AFC review. Room/student/time validations remain; teacher/AFC conflicts are checked in ADFAD faculty confirmation, not suppressed.
- Credited hours are entered or confirmed by ADFAD; never multiply hours by student group counts or derive them from an all-day LAB envelope.
- Existing Sessions and historical releases remain available and read-only where archived; no implicit import/overwrite.
- The published Calendar must show the ADC-created Session without a Faculty name; Group details appear only after LAB Publish; Faculty appear after ADFAD Confirm.
- Public views never return student identities, private rosters, drafts, or unapproved suggestions.
- Existing multi-year data are separate; the demo route implements current 2026–27 canonical Sessions and does not claim University SQL/real authorization. The Academic Years synthetic workspace will be aligned with ADC publication and ADFAD confirmation rules where feasible.

## Task 1: ADC schedule service and API
Files: tools/pages-demo-api/schedule-workflow.js, schedule-workflow-routes.js, runtime.js; tests/schedule-workflow.test.js.
- [ ] Write failing tests: ADC publish missing-topic/room/faculty, validation, suggestions, isolation, authorized roles, stale revisions.
- [ ] Verify test fails on missing behavior.
- [ ] Implement draft/save/publish and role-gated confirmation with explicit DOE quantity, current availability and conflict review.
- [ ] Run focused tests and verify red becomes green.

## Task 2: LAB stage independent of faculty
Files: tools/pages-demo-api/lab-scheduling.js, repos/core.js, tests/lab-scheduling*.test.js.
- [ ] Write failing tests: faculty-free Lab publications and later confirmed instructors appear on public detail without LAB republish or draft loss.
- [ ] Verify failures.
- [ ] Move teacher availability checks to ADFAD stage, preserve student/room conflict checks, preserve source revision checks for course structure.
- [ ] Ensure Calendar projection uses only published LAB room labels, with no student identities.
- [ ] Run new/old focused LAB tests.

## Task 3: Scheduling workflow UI and Calendar integration
Files: frontend/scripts/schedule-workflow.js, frontend/pages/index.html, tools/static-assets.paws.json, tests/schedule-workflow-ui.test.js.
- [ ] Exercise route via UI: ADC draft/publish, LAB existing editor, ADFAD suggested/independent faculty confirmation, Developer both.
- [ ] Keep new UI behind Frontend Demo mode and visibility by role; do not expose SQL controls to ADC.
- [ ] Refresh Calendar after publication/confirmation; include clear stage/status and error messages.
- [ ] Browser and responsive checks; verify repository CI.

## Task 4: Document constraints and release evidence
Files: docs/acceptance/schedule-workflow.md, docs/architecture/lab-scheduling-database-proposal.md, CHANGELOG.json.
- [ ] Document 3-stage handoff, Developer testing, public projections, permissions and unresolved backend scope.
- [ ] Test valid, incomplete and conflict scenarios; record CI SHA and deployment outcomes. Do not claim Beta changes.
- [ ] Keep PR #102 Draft, no automatic merge.
