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

## Developer-configurable ADC bulk import (PR #102)

The **Developer Dashboard** button appears at the top of Calendar only for the Developer and Owner Demo roles. Settings are saved to the current browser-local Testing store with an audit entry and incrementing revision. Configuration edits affect both new import validation and the existing live ADC/ADFAD task projection. Rules are not silently shared with other browsers, authenticated university databases, SQL, or future academic years.

Four fields must always be provided to create a valid published Session:

- **Course Number**: an existing Course Catalog code.
- **Year**: the curriculum year, 1–4, which must agree with the Course Catalog. This is not an academic-year selector.
- **Date**: date inside the active 2026–27 academic year (May 1, 2026 through April 30, 2027).
- **Time**: either Start Time and End Time columns, or a single `08:30-10:30` range.

Developer can change **Title / Topic** and **Room Number** rules: their field labels, whether they are additional blockers before publication, and who owns missing optional work (**ADC** or **ADFAD**). Developer can also set default Session Type and a maximum import count (1–500). To preserve valid Calendar data, the four core fields remain required, visibly locked. Faculty suggestions remain optional and the eventual Faculty assignment is always an **ADFAD** responsibility.

### CSV/TSV import testing

1. Select **ADC** or **Developer** in Demo Role Tester, open **Schedule Workflow**, then **Bulk Import CSV / Excel Paste**.
2. Click **Download CSV template**. Upload a `.csv` or `.tsv` file, or paste cells from Excel into the text area. Direct binary `.xlsx` is not supported: save the worksheet as CSV or paste the selected cells.
3. Create three synthetic lines with a valid Course, curriculum Year, ISO date and start/end time. Leave Title, Room and Faculty blank on one row, and enter Title/Room and a known **Suggested Faculty** on another. The optional title is a per-Session description and **does not overwrite the Course Catalog name**.
4. Click **Validate & Preview**. Verify each row's status, valid/invalid counts, and expected office to-dos. Add an invalid Course or Year, then re-preview: publication must be disabled for the entire batch, without creating any Session.
5. Correct the row and preview again; click **Publish all** and confirm. All rows should appear in Calendar at the specified dates/times, with no automatic Faculty assignment or DOE credit. The same batch ID is idempotent in the API; submitting an existing batch ID with different data is rejected.
6. Open the existing **Tasks** panel as ADC. It should show **Session title**, **Room number** (when missing) for these published Sessions, with **Open Work**. Complete the missing Title and Room; the item disappears immediately. For LAB, a published LAB room booking also resolves a missing-Room task.
7. Switch to **ADFAD**. The same session should display **Assign faculty (no suggestion)** or **Confirm suggested faculty** rather than generating an ADC suggestion task. Open Work and confirm/assign through the existing ADFAD stage, following LAB publication when required.
8. Switch to **Developer**. Verify both ADC and ADFAD work items. Open Developer Dashboard and make Room required for publication. Without Room, a subsequent import row should fail preview; after turning the setting back off it should publish and create a missing-room to-do. Change Room to ADFAD ownership and confirm the outstanding task moves between role queues, with ADFAD able to complete it. Check rule version increments and stale-version rejection.
9. Negative checks: LAB and Faculty cannot publish/import or write Developer rule settings. Invalid CSV quoting, duplicate header mapping, unknown suggested Faculty, invalid times and invalid Curriculum Year must be rejected. Do not use actual UCIDs, student rosters or private faculty information in this Demo.

This is a manual acceptance checklist, not evidence that a person has run it in the deployed site. Published Session creation does not imply the SQL source has been updated; authoritative multi-year import and persistent institutional work queue require a separate reviewed backend implementation.
