# PR #102 - Lab scheduling Demo acceptance

Target: UCVM-Teaching-Assignment/Teaching-assignment, PAWS Frontend Demo. No Beta/SQL/Firebase Lab changes. No real uploaded teaching schedules or rosters are committed.

## Implemented entry points

Calendar -> Lab Scheduling; existing LAB detail -> Lab Scheduling / Published Groups. The entry loads through the existing asset loader; the editor and CSS load only when needed. Original source-session actions and SRL details remain accessible.

The built-in LAB Coordinator and LAB Backup Demo accounts now get explicit edit scopes for existing 2026-27 LAB courses, including previously saved browser-local data. Each scope is an academic-year/cohort/course tuple, not a role-wide grant. Owner must still grant access for new courses, additional LAB accounts and other years. Owner/Developer can load the synthetic Course 505 example; its All/three-run overlap remains a Draft conflict and is not silently published.

LAB editors can edit group labels and synthetic TSV rosters, room/subspace capacities, explicit activity audiences, arbitrary run rows, All/group allocations, save drafts, review issues and publish valid operational changes. Public tables retain Primary/Secondary and participant categories separately. Faculty receives the published projection without working rosters. Published roster views require scoped access and a release version. Template copying into an empty target clears memberships and leaves publication empty.

## Verification evidence

- Dependency-free Node tests: `node --test tests/lab-scheduling*.test.js` - 48 passing, 0 failing after the LAB access scope fix. Includes source-detail integration, roles/scope, All, arbitrary groups, public privacy, source revisions, receipts, archive/copy behavior, real activity timeEvidence shape, pending AFC, future Course publication, renderer escaping and TSV parsing.
- TDD: domain, routes, rendering, new integration findings and the published-list privacy regression were observed failing before their implementation/fix.
- Chromium component QA: 1400x1000 and 390x844. Open/reopen -> group/roster editing -> Save Draft -> Publish Changes -> later Draft remains private -> out-of-envelope change is blocked -> switching to Faculty clears editor and shows published-only view. No page errors in the component run. Fixed mobile column squeeze and a close/reopen race.
- Browser connector in this Chat session exposes read-only tabs, not browser control. Chromium direct navigation to localhost is blocked by environment policy. Rendered checks used an offline DOM harness, the actual editor/renderer, and a bridge to the actual new Demo route/service. They are component evidence, not full staged-site or authentication signoff.
- Container cannot resolve github.com, so the local workspace is a partial source workspace, not a complete clone. Full `npm test`, `npm run test:all`, emulator, staged build and full-site smoke require repository CI. Check PR status; do not infer a green run from the focused result.
- Existing Graphify guide/receipt and affected current files were inspected. Fresh whole-repository graph generation is blocked by the partial workspace. No merge has been performed; regenerate the graph from exact merged main before any later merge handoff.
- No independent reviewer or human signoff is claimed. Backend concurrency, durable audit, real roster security, mail, SQL and Firestore acceptance remain Blocked/out of this Demo scope.

## Manual checks on the deployed PR artifact (initially Not run)

Record actual PR/SHA/banner first; the shared Pages URL may show a different PR. These supplement ENV-01/02/03, AUTH-07/08, NAV-02/03, NAME-01/02, Calendar/Session administration and Privacy cases in PAWS_TESTING_MANUAL_ACCEPTANCE.md; do not overwrite completed operator checklists.

| Case | Action | Expected |
| --- | --- | --- |
| LAB-01 | Open Calendar and a LAB detail | Both entries work; source SWAP/actions and SRL remain accessible |
| LAB-02 | Owner loads sample twice | Exactly two synthetic Sessions; no duplicated faculty/credits or overwritten existing source |
| LAB-03 | Switch to LAB Coordinator or LAB Backup and open an existing 2026-27 LAB course | Working Draft / Save Draft enabled without Owner setup, but no access to other years, Faculty information or DOE |
| LAB-04 | Assign All with an empty audience | Explicit blocking issue; no whole-cohort fallback |
| LAB-05 | Publish the default reference-shaped sample | Overlapping mandatory students block publication |
| LAB-06 | Use disjoint valid synthetic audiences, known capacities and approved run intervals | Save, review and Publish Changes succeeds |
| LAB-07 | Edit only group order/labels and save | Public release remains unchanged; canonical assignments/DOE unchanged |
| LAB-08 | Publish new valid operational revision | Public release/version changes explicitly; old roster version stays frozen |
| LAB-09 | Extend run or alter faculty coverage | ADC/ADFAD requirement; no LAB self-approval; existing source tools accessible |
| LAB-10 | Create capacity, room, student, teacher, AFC or unknown-time conflicts | Specific review issue; no silent publication |
| LAB-11 | Switch identity/sign out while editor or roster is open | Private content clears; no stale async response restores it |
| LAB-12 | Faculty/public payload inspection | No student IDs/names, drafts, DOE, UCID, email or AFC reason |
| LAB-13 | Archived and next-year template | Archive read-only; copied roster empty; no approvals/publication copied |
| LAB-14 | Desktop, narrow viewport, keyboard and Escape | Readable scrollable tables; operable controls; no focus trap |


## Quick manual test: LAB editing (PR #102)

1. Open https://ucvm-teaching-assignment.github.io/Teaching-assignment/ . Confirm banner PR #102 and exact head SHA; this is a shared Testing site.
2. Choose **LAB Coordinator** or **LAB Backup** in Demo Role Tester.
3. From **Calendar**, click **Lab Scheduling**; alternatively click a LAB session, then **Lab Scheduling / Published Groups**.
4. Choose an existing 2026-27 Year 1, 2 or 3 LAB in **Academic year / cohort / course / activity**. **Working Draft**, **Add group**, rooms/runs, **Save Draft** and **Publish Changes** must be available. The old generic **Edit Session** is intentionally administrator-only.
5. Use only synthetic roster rows: a student ID, TAB, then name. Add Group 1, select it in **Assigned activity audience** and a run, enter a room with known capacity, then **Save Draft**. Close/reopen: draft remains; published display is unchanged.
6. To test publication, complete all group rosters, use approved faculty coverage and room capacity, and resolve every Publication checks issue. Save again; **Publish Changes** should update only the published group table.
7. For the All/three-group reference, switch to Owner and **Load synthetic 505 example** once; return to LAB Coordinator. Its intentional All/rotation student overlap must block publishing until the conflict is actually resolved.
8. Moving run times outside the approved source must require ADC/ADFAD. Switching to Faculty removes editing and private rosters. Other LAB accounts and future years without explicit Owner scope are still denied.
9. Repeat with LAB Backup. Do not reset browser Demo data merely to enable these scopes; the one-time grant handles existing browser-local records.

Never use real student or staff data in Testing. Record PR/SHA, role, year/course, observed errors, and actual manual pass/fail evidence.

## Boundaries to retain

This initial editor links one station to each existing canonical LAB Session. Create/split teaching Sessions through existing Course tools first. It does not reinterpret a combined import row as multiple authoritative Sessions, import the uploaded live Excel files, or supply missing source times.

Teacher identities/roles are read-only here. Existing SWAP/Teaching Assignment workflows remain the route for protected changes. Per-run teacher substitution and an arbitrary approved-run-interval write contract are not newly implemented. Unknown or changed coverage blocks publication. The separate database proposal records the trusted-backend work still required.

Public means the published read projection in this Demo browser, not shared University persistence or a claim that the live Internet-facing site has been deployed. Only the workflow deployment and its exact SHA can establish that.
