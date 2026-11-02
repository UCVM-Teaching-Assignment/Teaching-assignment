# PAWS Testing: ADC → LAB → ADFAD schedule workflow

Status: PR #102 is a **Frontend Demo feature**, not a University SQL, Firebase or PAWS Beta deployment. Use fictional test data only.

## Roles and publication order

| Stage | Who can change it | Action | Required for publication | Must NOT happen here |
| --- | --- | --- | --- | --- |
| 1. ADC | ADC, Developer, Owner | Save draft; publish Course Session to Calendar; optionally suggest Faculty | Existing Course code, date, start and end time, valid session type | No Faculty Teaching Assignment/DOE write; Topic, room and suggested Faculty are optional |
| 2. LAB | Scoped LAB Admin, Developer, Owner | Book room/subspace, set capacity, group student rosters, create runs and allocate each group | ADC-published LAB Session, valid room/student-group allocation inside ADC-approved time | No teacher permission, Faculty/AFC review or DOE write |
| 3. ADFAD | ADFAD, Developer, Owner | Confirm ADC suggestions or choose Faculty; set Primary / Secondary and credited hours; review conflicts | Published Course Session; for new LAB sessions, also completed LAB publication | No blanket authority for LAB student roster changes |

Developer may use all three modes to test. LAB accounts require their authorized year/cohort/course scope. Only current-year (2026–27) canonical timetable is implemented by this new Testing route; the separate Academic Years demo has its existing year and release controls, which must not be assumed to be connected to the real Beta DB.

All means the students explicitly assigned to the Lab station, not the entire university or an optional window. In-class overlaps, missing rosters and room-capacity conflicts block LAB publication. Faculty availability and known/unknown other work conflicts are considered at ADFAD confirmation; unknown availability needs a recorded review note. Confirmed faculty role and credited-hours inputs are the only additions that produce Teaching Assignments and DOE in this flow; blank credited hours remain unresolved, never fabricated from a whole-day envelope.

## Manual testing

1. Open https://ucvm-teaching-assignment.github.io/Teaching-assignment/ and verify **PR #102** and the exact current commit SHA on the TEST SITE banner. The shared URL can later be overwritten by another PR.
2. In **Demo Role Tester**, select **ADC** (or **Developer**) and open **Schedule Workflow** in the Calendar header.
3. **Stage 1:** select an existing Course (e.g. VETM 505), Type **LAB**, a date within 2026–27 and a start/end time. Deliberately leave Session title, room and suggestions blank. Click **Save ADC Draft**, then **Publish saved schedule to Calendar**. The row must become visible in Calendar, with Faculty pending. Confirm it was not visible before Publish.
4. Return to the workflow. As ADC you cannot use ADFAD **Confirm Faculty**. Optionally create another draft and select an active Faculty name only under **Suggested faculty**. Publish; a suggestion must not appear as an assigned teacher or affect DOE.
5. Select **LAB Coordinator** / **LAB Backup** in Demo Role Tester. Built-in LAB accounts receive explicit course scopes when ADC publishes a new LAB Session; other LAB accounts still require Owner grants. Open **Lab Scheduling**, select the newly published LAB Session in the activity dropdown. Add a fictional Group 1 and roster (e.g. `TEST001<TAB>Student One`). In **Assigned activity audience**, select Group 1; choose the run's **Selected groups**, also Group 1, and a room with sufficient capacity. Save Draft. No public group details should change yet.
6. Click **Publish Changes**. Resolve only real student/room conflicts; do not bypass by inventing attendance semantics or altering Faculty. Calendar's LAB detail must show Group 1 and the published room.
7. Return to **Schedule Workflow** as **ADFAD** (or **Developer**). Select that LAB Session. If ADC gave suggestions, click **Use ADC suggestions**; otherwise **Add faculty**. Choose an eligible synthetic Faculty, correct **Lab Primary** or **Lab Secondary**, and explicitly enter credited hours (or leave blank to mark DOE needs review). Click **Confirm Faculty assignments**.
8. Reopen Calendar LAB detail: published groups/rooms and now confirmed Faculty must appear without forcing LAB to republish. Verify previous group roster release unchanged. Changing just group order must not multiply DOE.
9. Negative tests: a new LAB session must reject ADFAD confirmation before Stage 2 publication; an unknown work time must ask ADFAD for an explicit review note; a known Faculty overlap/AFC must block. A non-LAB session goes directly from ADC to ADFAD. Two distinct ADC drafts may intentionally publish parallel LAB stations with the same Course/date/time even when Topic and Room are blank; publishing the same draft twice is still rejected. Faculty role must never see unpublished drafts/rosters. Developer must open every stage.
10. Check draft persistence, time/date validation, stale revisions, keyboard/modal behavior and desktop/mobile viewport. Record pass/fail, PR SHA, role, chosen Course, date, error code and evidence. This checklist is not a claim of completed human acceptance.

## Data boundaries and future backend contract

Source of schedule truth is the canonical Course Session. ADC suggestions are explicitly separate from ADFAD-confirmed Assignment rows. Lab booking publishes only operational group/room/run metadata linked by Session ID, and restricted rosters remain out of public payloads. Shared/authoritative storage, real role enforcement, concurrent editing, roster retention/privacy review, ADFAD override governance and historic/multi-year migration require a trusted backend and institutional acceptance. Demo localStorage does not establish any of those guarantees.

The original multi-year Academic Years workspace and historical Sessions may still use their prior approval flows; migrate those separately instead of modifying real rows implicitly.
