# Academic Year Management and ADFAD Office Workspace

## Architecture assessment

Inspected Testing main `1d89df8fb2b07e3ab37c6aab51bbb1b2aff1c68a` (PR #118) on 2026-11-24. The selected target is the PAWS Frontend Demo built for GitHub Pages. Its demo store and academic-year workspace contain synthetic browser-local records. The SQL and API code in this repository provides reference and regression coverage. University SQL and Firebase Lab deployments have separate approval and acceptance.

Testing already has a May-to-April year, year-specific course snapshots, Working sessions, per-course Published history, independent initial published DOE, role rollover, conflict snapshots, archive and restore, and a year control on the three main pages. The screen currently opens a separate view of the existing year workspace for a future year. The original timetable still uses the synthetic 2026–27 source. The controls must identify the source and version clearly wherever they show different data.

The Testing Graphify index was refreshed from the inspected commit. Source checks confirmed that `tools/build-paws-pages.js` calls `buildDemoApi`, `tools/pages-demo-api/runtime.js` calls `createDataApi`, and the existing year model owns course creation, publication, DOE, role renewal, year preferences and archives. These relationships identify the code to reuse.

## Data isolation matrix

| Domain | Existing year boundary | Gap or risk |
| --- | --- | --- |
| Faculty identity, course catalog, base roles, room identifiers | Shared synthetic entities | Contract DOE exists alongside the synthetic Faculty record. Future-year FTE/contract suggestions must carry their own year. A catalog edit must preserve past annual course titles. |
| AFC, requests and supporting documents | Actual dates and Faculty identity | The multi-year workspace has a shared synthetic AFC list across its years. It boots from the original demo store and can diverge from later AFC edits on the original page. Real AFC remains one continuous source. |
| Teaching Calendar, scheduled LEC/SRL/LAB, instructor assignments | Annual courses and Working/Published rows in the year model | Legacy Calendar, work queue and some selectors initialize at 2026–27. A header year label alone cannot scope these records. Group and roster coverage must be established independently. |
| CCC, rotations, fourth-year and other working activities | Existing runtime has activity categories and date/academic-year fields | The year workspace does not yet integrate these separate sources. A rotation appointment supplies responsibility evidence. A dated rotation schedule supplies time evidence. An approved source must identify any fourth-year overlap. |
| Roles and appointments | Annual role rows and effective dates | Preserve existing synthetic renewals. Review eligibility before confirming new proposals. A role record may not become a scheduled conflict or duplicate DOE credit. |
| Trainees and annual FTE/contract DOE | Ported API provides year-scoped sources | The multi-year workspace has no reviewed independent annual import for these domains. No value may be carried as confirmed without evidence. |
| DOE policy, targets, calculations, overrides | Policy, released records and overrides are keyed by year | The year model aggregates synthetic teaching credits only. It does not substantiate approved University rules for CCC, rotation, trainees or other work. Preserve legacy released values and version evidence. |
| Reviews, SWAP, audit and publication | Ported workflows store academic year and revisions. The Demo has course release receipts and a year journal. | The year workspace and the original review queue are separate projections. A business confirmation must record the recording office actor and external reference, and must not impersonate a course approver. |
| Import, reporting and exports | Report definitions use a year. Existing loaders and dataset-specific bulk paths handle particular sources. | Annual import and export history need an exact dataset and version. Download is distinct from delivery. A report from the older demo store cannot silently stand for the year workspace. |

## Source authority matrix

| Business item | Appropriate existing source | Decision for this workspace |
| --- | --- | --- |
| Teaching identity and dates | Annual Course, session and Working or Published assignment | Preserve the version and instructor role. Historical course codes alone can supply research context. Exact suggestions require the same course, topic, type and applicable instructor role/group context. |
| LAB and SRL | Scheduled sessions and existing detail, roster and group tools | Use those details when present. Progress can count LAB and SRL subsets of the schedule. Count each scheduled assignment once in the teaching DOE input. |
| CCC | CCC Schedule and its complete-source replacement workflow | Keep shifts with their own dates and credit evidence. A CCC role is separate evidence and must not credit the same shift a second time. |
| Rotation and fourth-year | Their schedules, annual rotation allocation and separately dated appointments | Preserve all three concepts. Require provenance and reconcile overlapping rotation/fourth-year authority before calculating or committing imported work. |
| Roles, trainees, other work and manual DOE | Dedicated domain inputs and annual rule evidence | Keep independent editing, verification and import paths. Represent missing evidence explicitly. |
| AFC | Shared approved absence and pending absence records with real dates | Use global date overlap across May 1. Retain only availability information in a cross-faculty projection. |
| Annual confirmation | Office confirmation receipt for an exact Working revision and existing Published course releases | Confirmation records office action. Existing publication remains a separate Faculty-facing action. An archive preserves both version histories. |
| Export | Selected year and version, complete source rows and their receipt | Capture the exact source revisions at generation. Preserve previous exports for delta comparisons. Record delivery and receipt only from an explicit follow-up. |

## Implementation roadmap

1. **Phase 0 — Audit.** Map the exact Testing entry point, version boundaries, hard-coded years and existing authority in this document. Record which tests are browser simulation and which require a trusted environment.
2. **Phase 1 — Foundation.** Reuse the existing year engine, shared header controls and archive history. Give the Office an explicit default planning year and preserve the previous year. Distinguish year lifecycle, Working, internal confirmation and Faculty publication. Guard year state and stale revisions in the model.
3. **Phase 2 — Dataset boundaries.** Keep Calendar, CCC, rotations, fourth-year, roles, trainees and other work in their existing domain paths. Add source/version evidence and exact, dataset-scoped previews where a complete parser and authority are available. A missing dataset remains Awaiting Information. A complete replacement requires a precise preview and reversible operation.
4. **Phase 3 — Initialization and historical suggestions.** Keep the current empty-year creation and optional course catalog setup. For a new Working session, use credible same-topic and same-type histories, with explicit ambiguity, conflicts, eligibility and credit evidence. Accepting a recommendation changes the selected Working record.
5. **Phase 4 — DOE and Availability.** Preserve the current annual policy and DOE evidence. Keep allocations and role periods out of scheduled time. Exercise cross-year AFC in the synthetic model. Plan integration of the independently reviewed multi-Faculty Availability feature and University source policy in their appropriate tracks.
6. **Phase 5 — Office workflow.** Add progress and outstanding record links to the existing workspace. Determine status from real demo rows and confirmation evidence. Allow authorized office staff to record external confirmation directly, with date, method, responsible person and reference. Preserve course publication and existing online review.
7. **Phase 6 — External collaboration.** Reuse a complete data projection for whole and changed exports. Record selected year, version, intended recipient and delivery status. Retain missing template and source coverage as explicit work items.

## Acceptance and recovery

Use both 2026–27 and 2027–28. Compare prior course and DOE snapshots after new-year edits. Verify May 1 AFC overlap, archive write rejection, scoped controls, no automatic Faculty publication, duplicate names and cross-year suggestions. Verify export rows and compare source versions. Verify that a missing domain cannot show complete. Extend the existing multi-year manual catalog where needed, using its actual result vocabulary.

Build and run the full Testing suites and the staged PAWS browser smoke. Use screenshots from the same synthetic fixture and documented viewport when available. Report visual checks and trusted SQL, auth, Firestore and delivery acceptance separately. Treat an actual backend port as a separate reviewed project.

Prior browser-local schema upgrades must preserve versioned records. Any new preview or import writes one validated year and domain, journals the actor and evidence, and must preserve the previous revision. Retiring a year preserves its release and conflict snapshots. Restoring enables eligible new work while retaining those snapshots. Before reversing a test change, preserve a local evidence copy if testers have used it. The normal recovery for a code regression is the last validated Pages artifact and the prior loader contract. Neither University SQL nor Firebase Lab requires a migration for this Testing phase.

## Implemented in the Testing workspace

Open **Academic Years · Demo** from Calendar, Faculty Dashboard or Teaching Assignments. The ADFAD Office tab shares the selected year and clears transient selection when the year or simulated identity changes.

| Phase | Testing implementation | Remaining coverage |
| --- | --- | --- |
| 0 | Architecture, data isolation and source authority review at the exact Testing baseline | Physical database audit and release approval belong to the later trusted integration |
| 1 | Office planning default, May–April Calgary boundary, internal confirmation receipts and Owner archive/restore | The original timetable and dashboard still have their own 2026–27 projections. The year workspace is the working view for these synthetic annual records |
| 2 | Separate teaching, CCC, rotation, fourth-year and other work layers. Year- and course-scoped Teaching Calendar JSON preview, replacement history and recovery | Keep other existing import paths. Add distinct SRL/LAB, CCC, Rotation, Fourth-Year, Roles and Trainee input/version receipts as their formats and trusted sources are accepted |
| 3 | Empty next-year Working setup, draft annual role proposals, historical course/topic/type/instructor matching, checked single and bulk acceptance | FTE, Contract DOE, Rotation and Trainee renewal require source-specific proposals |
| 4 | Same-year demo teaching credits, unknown credit reporting and deduplication within a session. Common AFC and recorded work time participate in candidate checks regardless of displayed layer | Full multi-Faculty Availability and formal multi-source DOE remain separate integrations. The Demo does not determine actual availability or reproduce University DOE rules |
| 5 | Actual Demo counts by dataset, course and faculty, outstanding links, and office-recorded confirmation with actor, date, method and reference | Broader responsibility and deadline tracking remains in the existing work queue until source-specific links are available |
| 6 | Four schedule templates, full and changed CSV/Excel outputs from Working, Confirmed or Published rows, and explicit delivery history | Custom saved templates and the remaining clinical, DOE and Dean’s Office reports need their own confirmed data sources |

No trusted API route or SQL schema changes are part of this increment. The browser uses the existing Demo tables for dated calendar activities and AFC where exposed. The Testing workbook uses the existing report exporter and the browser ExcelJS build. The Teaching Calendar importer binds every row to one selected course and year. It preserves instructor assignments on matching stable Session IDs and lists pending removals before a complete Course replacement. Recovery restores the previous Working rows only while that import remains the latest unconfirmed revision.

Office exports track generated files and manual delivery confirmations. The full and delta files use the exact selected source revisions and a stable session identity. A download can advance Generated to Exported. Recording Delivered or Confirmed Received requires a separate operator action.
