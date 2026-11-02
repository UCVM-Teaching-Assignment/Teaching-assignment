# Lab scheduling: future trusted-backend proposal

Status: design only. PR #102 writes no SQL migration, Firestore rule, real student roster, or Beta data. The implemented adapter is exclusively the browser-local PAWS Frontend Demo.

## Authority

Keep Course Session and Session Assignment as the only teaching authority. Operational Lab data link to their stable IDs and academic year. Primary/Secondary comes from the assignment; Sessional/Guest is a separate participant category. The calendar's activity block is a display grouping, not another DOE-bearing session.

Proposed normalized records:

| Record | Minimum fields |
| --- | --- |
| LabActivity | id, academicYear, curriculumYear, courseId, date, revision, sourceRevision |
| LabStation | id, activityId, canonicalSessionId, displayLabel |
| StudentGroupingScheme | id, academicYear, cohortId, course/activity scope, revision |
| StudentGroup | id, schemeId, code |
| StudentMembership | groupId, studentKey, validFrom, validTo; private student directory separate |
| RoomResource | id, label, capacity, subspaceId, revision; shared resource identity, not a free-text alias |
| LabRun | id, stationId, start, end, roomResourceId |
| LabAudience | stationId, groupId; explicit assigned audience |
| LabAllocation | runId, mode all/groups, groupId when groups |
| LabPublication | activityId, version, sourceRevision, private audience snapshot, public allowlist snapshot, publisher, timestamp |
| LabOperation | actor, operationId, payload hash, receipt, before/after revisions |

A room alias must resolve to one canonical resource. Independent subspaces need institution-approved identity/capacity; typing a different spelling must not bypass room conflicts. The Demo exposes resource/subspace fields to exercise the model but is not a production facilities authority.

## Writes and publication

Require current authenticated readiness and dated course/year/cohort LAB scope. Owner-managed scope changes must use the real access subsystem. LAB allocation rights do not confer Faculty HR, contract, DOE, policy, account or final teaching-assignment rights.

Save drafts with expected revisions. Publication must atomically reread the canonical course and faculty assignments, roster/resource revisions, AFC/work availability and all affected allocations. Lock or serialize relevant resource/student/faculty intervals, then validate and create the immutable publication plus audit/receipt in one transaction. A publication is not a second teaching assignment.

All resolves the union of explicitly assigned audience groups at publication; it does not mean the whole cohort or optional attendance. Empty All is invalid. The private snapshot permits an authorized roster view for the exact public version. Later roster edits cannot silently alter historical membership or room counts.

Run time changes outside approved course bounds need ADC. Changes to teacher identity, role, credited hours or approved coverage need existing ADFAD review; copy no approvals and create no LAB shortcut. The Demo deliberately blocks these changes and opens existing SWAP/Teaching Assignment tools. The current generic SWAP contract does not yet write an arbitrary list of approved run intervals: extending that contract and authorizing per-run teacher coverage is follow-up backend work, not implemented approval automation in this PR. Missing approved coverage must remain a visible blocker.

Validate student, faculty and room overlap across courses, actual room capacity, known appointments and availability, valid academic year and source versions. Unknown availability requires review. Do not reveal AFC reasons, medical information, DOE, UCID or emails in conflict messages.

## Public reads

Return only published course/date/time/station/room fields, public instructor labels and roles, group labels/counts and release metadata. Never return raw drafts, students, rosters, faculty private identifiers, original source payloads or audit bodies. Public data is a server allowlist, not client-side hiding. Restricted roster reads require scope and a specific release version.

Use an institution-approved public audience policy; the Demo's anonymous published endpoint is local simulation, not authorization to publish University data on the Internet. Real student roster privacy/retention requires institutional review.

## Years, audit and DOE

Archived years disallow writes and retain original publications and conflict snapshots; Faculty historical Calendar remains hidden. A next-year template copies structure only, not students, approvals or published states. A new year requires canonical annual Sessions first.

Every operational edit needs restricted before/after audit, timestamp, actor and academic-year context. The Demo's global Change History contains revision/version metadata only; real detailed roster audit belongs in restricted storage. LocalStorage cannot provide real concurrency, atomicity, access control or durable audit guarantees.

Do not multiply DOE by audience count or display columns. The Demo never changes existing teaching credits through operational edits and delegates synthetic example credit calculation to the existing calculator. Trusted per-run coverage and approved credit recomputation require the authoritative teaching/DOE domain and separate backend acceptance.
