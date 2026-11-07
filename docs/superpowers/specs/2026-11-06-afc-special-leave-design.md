# AFC Special Leave: Available + FTE/DOE deductions (Testing)

Date: 2026-11-06. Owner decisions: Questions 1–33 in the working conversation. **Mode: PAWS Frontend Demo (synthetic only).** No Beta, production DB, real DOE publication or RDP.

## Goal
For **Special Leave** only, administrator chooses Available or Unavailable. Available keeps teaching eligibility (subject to normal timetable conflicts) and carries a date-scoped FTE/DOE reduction. Unavailable preserves old AFC behavior. Admin-created AFC is approved immediately; self-service requests remain pending until normal AFC approval. Only approved records appear in the AFC archive.

## Source and calculations
* 1.00 contract FTE = 100 DOE points; deduction of 0.25 FTE requires exactly 25 DOE across Teaching, Service, Research; 0 is allowed; never negative or above available FTE/DOE. The three deductions sum **exactly** to FTE × 100 (fixed decimal tolerance).
* Show original contract FTE and recorded category DOE before Admin edits. Preserve source FTE/DOE and actual scheduled teaching; Effective is derived, date-scoped and returns to original on exit. DOE over-target workload is a warning, not a teaching block.
* No pro rata reduction by leave length. Non-overlapping leaves do not accumulate. Overlaps accumulate per day and per-category, sorted by earlier approval time. A later over-budget leave pauses **only overlapping offending dates**; other dates and earlier valid deductions stay effective. Never allow negative Effective.
* Cross academic years (May 1–Apr 30): same FTE deduction **in each** touched year; copy previous year's distribution as suggestion, allow per-year adjustment and validation. Missing year/category FTE/DOE source => AFC can still be Approved, deduction Pending with a Lookup flag. Never impute missing source as zero. On source readiness, Admin explicitly Apply; do not auto-apply. If source changes invalidate a deduction, pause affected deduction, flag Adjustment Required; retain approved record and audit. After collision clears, Admin explicitly confirms reapplication.
* Keep source mismatches between contract FTE × 100 and category sum as warnings, never mutate or normalize them. Effective FTE may be 0, warn, keep Available.
* Unavailable AFC always dominates Available Special Leave; normal teaching time conflicts remain blocking. Changes/cancel to AFC or source cause re-evaluation, preserving history.

## Visibility and authority
* All server-authorized administrator roles may enter and confirm; Faculty submit date/reason only and never choose status or amounts. Preserve existing self-service approval stages. Never send confidential FTE/DOE to other Faculty.
* Admin Lookup defaults to Calgary today and permits a date picker. Show original / deduction / Effective FTE + DOE and flagged Pending / Partial Adjustment Required / Ready to Apply. An existing AFC archive record is approved, imported legacy semantics stay stable.

## Guardrails and release
* The existing Testing demo has authoritative **Teaching target only** for most synthetic faculty. Do not infer Service or Research; explicitly seed a limited clearly synthetic scenario for verification; other faculty show Pending. On ported SQL route, fail closed for Available Special Leave until a reviewed trusted schema/repository supports it (no silent field loss).
* Preserve existing AFC batch behavior, PDF originals, cancel/date-edit version checks, Changes, SWAP and appointment permissions.
* Build/test on a feature branch, PR only. Fresh CI, emulator, shared GitHub Pages deploy and real backend acceptance are different gates. No automatic merge.
