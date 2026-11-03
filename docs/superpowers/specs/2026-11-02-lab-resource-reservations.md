# PAWS Testing: LAB animal resource requests before student groups

Date: 2026-11-02
Environment: UCVM-Teaching-Assignment/Teaching-assignment, PAWS Frontend Demo
Status: Proposed for synthetic review in a feature PR; requires manual acceptance.

## Problem and sequence

ADC publishes Course Session date/time -> LAB sends resource request / Reserve Notes -> resource reviewer confirms or rejects -> LAB plans student groups and runs -> ADFAD confirms Faculty/DOE separately.

LAB may require horses, Pet Professors, both, or neither. Resources are NOT Teaching Assignments and never create DOE. A request belongs to one published LAB Session, not to a whole Course, student group or Faculty member.

Existing LAB datasets may already have published groups. The default opening tab becomes **1. Resource Request**. **New LAB Sessions published by ADC must submit a resource request (or explicitly record no animals required) before LAB group publication, whether using Single Activity or Bulk CSV.** Existing legacy/imported LABs are not retroactively blocked. A hard rule for all historical LABs would require an approved migration.

## Reference patterns

- Equipment reservation systems distinguish request, approval, asset allocation and checkout; permission for requests does not imply permission to approve.
- Equipment/fleet buffer windows restrict reuse of a specific resource after booking, not just aggregate daily counts.
- CCAC animal care guidance requires individual animal-use records and welfare review; a scheduling rule cannot replace qualified animal-care staff or approved protocols.

## Domain rules (synthetic defaults)

| Setting | Default | Meaning |
| --- | ---: | --- |
| Horse pool | 38 | Synthetic H01 to H38; real eligible herd size is not verified. |
| Horse minimum rest | 24 hours | No confirmed reuse of the same horse until prior session end + 24 hours. Longer rest is configurable. |
| Pet Professor threshold | 30 | Warning when combined requested/confirmed demand exceeds 30. This is a planning signal, not a confirmed supply count. |
| Pet demand window | 48 hours | Peak aggregate demand in any rolling 48-hour window containing the current LAB request. Rejected requests do not count. |

LAB time is inherited from ADC's approved date/start/end. Any changed source requires resubmission before new confirmation.

LAB staff request horses by quantity and enter Reserve Notes. The reviewer assigns specific synthetic Horse IDs. Requests are not confirmed animal allocations. Requests that exceed currently unallocated horse numbers can be submitted with a warning, but confirmation rejects unavailable, duplicate or unknown IDs.

Confirmed allocations are immutable in this Testing version so LAB edits cannot erase 24-hour rest records. A later production release needs a separately authorized amendment/cancellation process retaining history. Source changes after confirmation are flagged for review; staff cannot silently rebook.

Pet Professors are a pooled resource category. For example, LAB A requests 18 and LAB B requests 14 within 48h: demand is 32, and both LABs show a warning on refresh. Neither request is silently rejected.

When both quantities are 0, submission records Not required. Otherwise Reserve Notes must be provided. Request versions prevent lost updates; unique request IDs prevent repeated writes.

## Interface

Lab Scheduling now offers:

1. Resource Request: LAB Session selector, Horse quantity, Pet Professor quantity, Reserve Notes, Preview availability, Send Request, warning message.
2. Student Groups / Runs: existing LAB structure, rosters, rooms and room/student conflict checks.
3. Bulk CSV: the existing operational import and publication path.

Owner/Developer can simulate confirmation/rejection, assign synthetic Horse IDs and edit resource rules. LAB cannot self-confirm. The UI explicitly warns that this only saves browser-local Testing data, with no real email, booking or animal-use approval.

## Data and security

- GET /api/v1/lab-scheduling/resources?sessionId=...
- POST /api/v1/lab-scheduling/resource-preview, /resource-request, /resource-review, /resource-rules
- Scope inherits the authorized LAB course/academic year; out-of-scope/inactive accounts fail closed.
- Reservations live in the separate labResourceReservations synthetic store bag; canonical Courses, Sessions, rosters and DOE remain unchanged.
- Private Reserve Notes and Horse IDs never enter public Calendar/LAB projections.
- Audit records who, when, academic year, counts, version and status, without publishing the text of private Notes.
- The browser Demo simulates transactions but does not prove authoritative cross-user concurrency.

## Acceptance checks

1. ADC publishes LAB; LAB opens Resource Request before Student Groups.
2. LAB submits 2 horses and Notes; status Requested, then Owner confirms H01/H02.
3. Newly ADC-published LAB cannot publish Single Activity or Bulk CSV allocations until a resource request (or explicit none) has been recorded. Same horse cannot be confirmed before its previous end + 24h; succeeds exactly at the boundary.
4. 18+14 Pet Professors within 48h displays warning >30, without stopping submission.
5. Insufficient available Horse IDs and repeated Horse IDs are rejected at confirmation.
6. ADC changing session date/time forces a new reservation request.
7. Stale versions/repeated request IDs do not cause duplicate entries.
8. Out-of-scope users and Faculty cannot view private Notes; LAB cannot self-approve.
9. Published Calendar only shows permitted operational detail; DOE unchanged.
10. Verify existing Single Activity/Bulk CSV/ADFAD behavior remains operational.

## Later production prerequisites

A verified animal inventory including availability, health restrictions, retired animals, usage and rest history; qualified resource-approval roles; approved email/task notifications; server-authoritative concurrency and audit; timezone normalization; CCAC/University policy checks per teaching procedure. Never assume all 38 animals are eligible to participate. No SQL/Beta or live animal-care data is modified by this prototype.
