# Lab scheduling - approved Testing design

Approved by the Owner in the 2026-11-02 conversation. Target: UCVM-Teaching-Assignment/Teaching-assignment, PAWS Frontend Demo only. No Beta, SQL, Firebase Lab, real roster import, merge or production publication is authorized.

## Intent
Extend Calendar's existing LAB detail, not a parallel authoritative timetable. Canonical Course Sessions and Teaching Assignments remain the source of course, faculty, role, and credited hours. Store operational student groups, membership, rooms, runs and group allocations separately, linked by session ID and academic-year/course/cohort scope.

## Agreed rules
- All means the entire explicitly assigned audience of this activity, never the whole cohort by default or optional attendance. Empty All cannot publish. All does not exempt student overlaps.
- Primary and Secondary are explicit teaching roles. Sessional/Guest are distinct participant categories. Preserve the canonical assignment authority.
- Lab administrators may maintain scoped student groups/membership, runs and room allocations. They may publish operational changes only within approved course bounds and without changing faculty work time, assignments, teaching roles or credit.
- Out-of-bound course changes need the existing ADC route. Faculty, role, coverage or credited-hours changes need the existing ADFAD route. Do not create a substitute approval authority.
- Draft and Published are distinct. Explicit Publish Changes is required; published group labels and audience membership are snapshots.
- Public payloads contain timetable fields and group labels/counts only. Restricted rosters never travel in the public response. No UCID, email, DOE, AFC reasons or unpublished draft fields.
- Check scope, academic year, archival status, revisions, dependency changes, students, room capacity and conflicts before publication. Check current faculty availability. Unknown evidence is not an automatic pass.
- Group ordering alone must not change DOE. A display block is not extra teaching credit; three two-hour teaching runs do not become eighteen hours because three groups are listed.
- New-year templates copy structure only, not student memberships, publications or approvals. Archived versions remain read-only.

## Approaches
Selected: linked operational scheduling below existing Course Sessions, with immutable published views. Rejected: duplicate independent timetable (divergent authority), and one session per faculty/group export row (duplicate sessions/credit).

## Reference shape
Use synthetic fixtures only: a 2026-11-03 Year 3 Course 505 activity with an All-assigned station and another station with groups 1/2/3 at 08:30-10:30, 11:00-13:00 and 14:30-16:30. Shared mandatory students across overlapping runs must be flagged, not relabeled as optional. Actual uploaded staff records and source workbooks must not enter this public repository.

## Execution boundary
The default site uses frontend/ and tools/pages-demo-api/, with simulated identities and browser-local persistence. Demo permissions and tests are not real backend security acceptance. Proposed future database contracts belong in a separate Markdown proposal. All PRs update their own CHANGELOG.json entry. Full-suite/CI, build, browser checks, PR state, and preview deployment must be reported separately.
