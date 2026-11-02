# PAWS Testing: Configurable ADC bulk schedule import

Scope: existing Testing PR #102, browser-local synthetic 2026–27 data only.

## Requirements
1. ADC, Owner or Developer may preview and bulk publish CSV/TSV rows (including pasted Excel cells). Use Course Number, Curriculum Year (1-4), ISO Date and Start/End Time or one Time column. Course/Session Title, Room Number and Suggested Faculty are optional, never silently forced. Existing Course Catalog course name stays authoritative. Published sessions appear on Calendar without teachers.
2. A preview checks every row and displays each row's error. All-or-nothing publication. There is no automatic replacement or DOE credit. A batch ID makes retries idempotent. Maximum input row count and size is Developer-configurable within a safe hard cap.
3. Once published, missing Title and Room create actionable ADC Work Queue entries. Missing Faculty suggestion is never an ADC task; ADFAD gets an assignment/confirmation task based on whether any suggestions exist. After LAB publication with a real booked room, the Room to-do is resolved. Completing items automatically removes them.
4. The existing **Tasks** navigation panel must show these new workflow to-dos, filtered by active role, with Open Work routing into the Schedule Workflow. The Schedule Workflow dialog also has the same queue, so tasks are always discoverable.
5. **Developer Dashboard** must expose editable rule settings from the frontend, backed by versioned persisted Demo configuration and audit logs: optional Title/Room required-for-publication flags; missing-field task owner (ADC/LAB/ADFAD, with role-matched completion); display labels; maximum import rows and default Session Type. Changes immediately affect preview, queue and validation. The four mandatory Calendar fields stay required, visibly locked: disabling them would create invalid Sessions. Missing Faculty remains ADFAD's responsibility.
6. Backend is the single authority on configuration and role checks. ADC cannot edit rules or assign faculty; unprivileged roles cannot import or read private draft details. Developer or Owner can edit Testing rules.
7. CSV or TSV is supported without installing third-party libraries; Excel can paste tabular values or Save As CSV. If the user wants direct XLSX parsing later, add a reviewed parser separately.

## Plan
- RED tests for preview/publish, invalid rows, role isolation, idempotency, live config and task completion.
- Implement service bulk endpoints/config.
- RED tests for browser CSV/TSV normalizer (quoted commas, Excel tabs, time column), then implement.
- Implement import UI, Developer Dashboard and role-aware Tasks integration; tests and manual QA.
- Document limitations, run CI, verify GitHub Pages. PR #102 remains Ready for review (never auto-merge).
