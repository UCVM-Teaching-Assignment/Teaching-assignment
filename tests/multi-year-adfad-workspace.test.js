'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../frontend/scripts/multi-year-demo-model');
const owner = { uid: 'testing-owner', role: 'owner' };
const adfa = { uid: 'testing-adfa', role: 'adfa_general' };
const developer = { uid: 'testing-developer', role: 'developer' };
const faculty = { uid: 'testing-faculty', role: 'faculty', facultyId: 'person-1' };
const date = '2026-11-24';
const firstYear = '2026-27', nextYear = '2027-28';
const original = {
  faculty: [{ facultyId: 'person-1', displayName: 'Example, Avery', active: true }],
  courses: [{ courseCode: 'VTMD 304', courseName: 'Clinical Foundations' }],
  sessions: [
    { id: 'previous-imaging', academicYear: firstYear, courseCode: 'VTMD 304', topic: 'Imaging', sessionType: 'LEC',
      date: '2026-12-03', startTime: '09:00', endTime: '10:00',
      assignments: [{ facultyId: 'person-1', teachingRole: 'Instructor', doeCredit: 0.3 }] }
  ],
  targets: [{ facultyId: 'person-1', academicYear: firstYear, effectiveTargetDoe: 7 }]
};

function fixture(options = {}) {
  return createEngine({ source: original, now: () => new Date(date + 'T19:00:00Z'), ...options });
}
function plan(engine) {
  engine.createYear(owner, nextYear);
  engine.addCourse(adfa, nextYear, 'VTMD 304');
}
function add(engine, { topic = 'Imaging', day = '2027-12-03', assigned = false } = {}) {
  return engine.addSession(adfa, nextYear, 'VTMD 304', {
    topic, date: day, sessionType: 'LEC', startTime: '09:00', endTime: '10:00',
    assignments: assigned ? [{ facultyId: 'person-1', teachingRole: 'Instructor', doeCredit: 0.3 }] : []
  });
}
const revision = engine => engine.getState().annual[nextYear]['VTMD 304'].revision;
const evidence = { method: 'email', confirmedOn: date, responsiblePerson: 'Example, Avery', reference: 'Synthetic confirmation reference' };

test('opening an academic year defaults the Office to Working and preserves the current Faculty year', () => {
  const engine = fixture();
  engine.setPreferredYear(adfa, firstYear);
  assert.throws(() => engine.createYear(developer, nextYear), /permission|Owner/i);
  engine.createYear(adfa, nextYear);
  assert.equal(engine.getPreferredYear(adfa), nextYear);
  assert.equal(engine.getPreferredYear(faculty), firstYear);
  assert.deepEqual(engine.getState().annual[nextYear], {});
  assert.equal(engine.getState().doe[nextYear].policy.status, 'draft');
  engine.setPreferredYear(adfa, firstYear);
  assert.equal(engine.getPreferredYear(adfa), firstYear);
  engine.setDefaultPlanningYear(owner, nextYear);
  assert.equal(engine.getPreferredYear(adfa), nextYear);
  assert.equal(engine.getState().years[firstYear].status, 'active');
  const snapshot = engine.getState();
  assert.throws(() => engine.createYear(owner, nextYear), /already exists/);
  assert.deepEqual(engine.getState(), snapshot);
});

test('external confirmation preserves exact Working evidence without publishing to Faculty', () => {
  const engine = fixture();
  const before = engine.getDoe(owner, firstYear);
  plan(engine);
  const id = add(engine, { assigned: true });
  assert.throws(() => engine.confirmOfficeCourse(developer, nextYear, 'VTMD 304', revision(engine), evidence), /permission|approval/i);
  assert.throws(() => engine.confirmOfficeCourse(adfa, nextYear, 'VTMD 304', revision(engine) - 1, evidence), /changed|revision/i);
  assert.throws(() => engine.confirmOfficeCourse(adfa, nextYear, 'VTMD 304', revision(engine), { ...evidence, reference: '' }), /reference/i);
  const receipt = engine.confirmOfficeCourse(adfa, nextYear, 'VTMD 304', revision(engine), evidence);
  assert.equal(receipt.by, adfa.uid);
  assert.equal(receipt.reference, evidence.reference);
  assert.equal(receipt.sessions[0].id, id);
  assert.equal(engine.getOfficeProgress(adfa, nextYear).courses[0].status, 'Confirmed');
  assert.deepEqual(engine.getTeaching(faculty, nextYear), []);
  add(engine, { topic: 'Anaesthesia' });
  assert.equal(engine.getOfficeProgress(adfa, nextYear).courses[0].status, 'In Progress');
  assert.equal(engine.getState().annual[nextYear]['VTMD 304'].confirmed[0].sessions.length, 1);
  assert.deepEqual(engine.getDoe(owner, firstYear), before);
});

test('historic suggestions distinguish topics, retain new-year Working scope, and check AFC across May 1', () => {
  const engine = fixture();
  plan(engine);
  const match = add(engine);
  const newTopic = add(engine, { topic: 'Anaesthesia', day: '2027-12-04' });
  const candidates = engine.historicalSuggestions(adfa, nextYear, 'VTMD 304');
  const suggestion = candidates.find(row => row.sessionId === match);
  assert.equal(suggestion.match, 'Exact Match');
  assert.equal(suggestion.candidates[0].facultyId, 'person-1');
  assert.equal(candidates.find(row => row.sessionId === newTopic).match, 'New Topic');
  engine.acceptHistoricalSuggestions(adfa, nextYear, 'VTMD 304', revision(engine), [match]);
  const target = engine.getState().annual[nextYear]['VTMD 304'];
  assert.equal(target.working.find(row => row.id === match).assignments[0].doeCredit, null);
  assert.deepEqual(engine.getTeaching(faculty, nextYear), []);
  assert.equal(engine.getTeaching(faculty, firstYear)[0].id, 'previous-imaging');
  const opening = add(engine, { day: '2027-05-01' });
  engine.addAfc(adfa, { afcRecordId: 'cross-year', facultyId: 'person-1', startDate: '2027-04-30', endDate: '2027-05-02', active: true });
  const conflict = engine.historicalSuggestions(adfa, nextYear, 'VTMD 304').find(row => row.sessionId === opening);
  assert.equal(conflict.candidates[0].availability, 'Unavailable');
  assert.throws(() => engine.acceptHistoricalSuggestions(adfa, nextYear, 'VTMD 304', revision(engine), [opening]), /review|available|conflict/i);
});

test('progress includes real counts and leaves missing sources Awaiting Information', () => {
  const engine = fixture();
  plan(engine);
  add(engine, { assigned: true });
  const p = engine.getOfficeProgress(adfa, nextYear);
  const rows = Object.fromEntries(p.datasets.map(row => [row.dataset, row]));
  assert.equal(rows.teaching.total, 1);
  assert.equal(rows.teaching.outstanding, 1);
  assert.equal(rows.ccc.status, 'Awaiting Information');
  assert.equal(rows.ccc.total, null);
  assert.equal(p.faculty[0].sessions, 1);
  assert.throws(() => engine.getOfficeProgress(faculty, nextYear), /permission|approval/i);
});

test('exports distinguish versions and explicit delivery while archived years remain read-only', () => {
  const engine = fixture();
  plan(engine);
  add(engine, { assigned: true });
  engine.confirmOfficeCourse(adfa, nextYear, 'VTMD 304', revision(engine), evidence);
  const first = engine.generateOfficeExport(adfa, nextYear, { template: 'dvm-schedule', version: 'confirmed', recipient: 'DVM Office', changesOnly: false });
  assert.equal(first.status, 'Generated');
  assert.equal(first.rows.length, 1);
  assert.match(engine.officeExportCsv(owner, nextYear, first.id), /Academic Year,Course,Topic/);
  assert.throws(() => engine.advanceOfficeExport(adfa, nextYear, first.id, 'Delivered'), /order|next/i);
  engine.advanceOfficeExport(adfa, nextYear, first.id, 'Exported');
  assert.equal(engine.getOfficeProgress(adfa, nextYear).exports[0].status, 'Exported');
  add(engine, { topic: 'A second Working lecture', assigned: true });
  const options = { template: 'dvm-schedule', version: 'confirmed', recipient: 'DVM Office', changesOnly: true };
  const unchanged = engine.generateOfficeExport(adfa, nextYear, options);
  assert.equal(unchanged.rows.length, 0);
  engine.confirmOfficeCourse(adfa, nextYear, 'VTMD 304', revision(engine), evidence);
  const changed = engine.generateOfficeExport(adfa, nextYear, options);
  assert.deepEqual(changed.rows.map(r => r.change), ['Added']);
  assert.throws(() => engine.retireYear(developer, nextYear, true), /Owner/i);
  engine.retireYear(owner, nextYear, true);
  assert.throws(() => engine.restoreYear(adfa, nextYear), /Owner/i);
  assert.throws(() => engine.generateOfficeExport(adfa, nextYear, options), /read-only/i);
  assert.match(engine.officeExportCsv(adfa, nextYear, first.id), /Imaging/);
  engine.restoreYear(owner, nextYear);
  assert.equal(engine.getState().years[nextYear].status, 'planning');
});


test('Calendar layers use the actual same-year source and freeze at archive', () => {
  const live = structuredClone(original);
  live.activities = [
    { activityId: 'last-ccc', academicYear: firstYear, category: 'ccc', facultyKey: 'person-1',
      startDate: '2026-12-03', endDate: '2026-12-03',
      timeEvidence: [{ date: '2026-12-03', startTime: '09:30', endTime: '12:00' }] },
    { activityId: 'rotation', academicYear: nextYear, category: 'rotation_participant', facultyKey: 'person-1',
      startDate: '2027-12-03', endDate: '2027-12-06', timeStatus: 'default', timeEvidence: [] }
  ];
  const engine = fixture({ source: live, readSource: () => live });
  plan(engine);
  const id = add(engine);
  assert.deepEqual(engine.getCalendarLayers(owner, nextYear).map(x => x.layer), ['rotation']);
  assert.equal(engine.historicalSuggestions(owner, nextYear, 'VTMD 304').find(x => x.sessionId === id).candidates[0].availability, 'Check needed');
  live.activities = live.activities.filter(x => x.activityId !== 'last-ccc');
  assert.deepEqual(engine.getCalendarLayers(owner, firstYear), []);
  assert.equal(engine.getCalendar(owner, firstYear).length, 1);
  engine.retireYear(owner, nextYear, true);
  live.activities = [];
  assert.deepEqual(engine.getCalendarLayers(owner, nextYear).map(x => x.id), ['rotation']);
  assert.throws(() => engine.getCalendarLayers(faculty, nextYear), /Archived/);
});

test('AFC remains one actual-date source across May 1 and excludes available leave', () => {
  const shared = structuredClone(original);
  shared.afcRecords = [
    { afcRecordId: 'continuous', facultyId: 'person-1', active: true, startDate: '2027-04-30',
      endDate: '2027-05-02', reason: 'Do not expose' },
    { afcRecordId: 'available', facultyId: 'person-1', active: true, startDate: '2027-04-30',
      endDate: '2027-05-02', availability: 'available' }
  ];
  const engine = fixture({ source: shared, readSource: () => shared });
  plan(engine);
  assert.equal(engine.getCalendarLayers(owner, firstYear)[0].endDate, '2027-04-30');
  const layered = engine.getCalendarLayers(owner, nextYear);
  assert.deepEqual(layered.map(item => [item.id, item.date]), [['continuous', '2027-05-01']]);
  assert.doesNotMatch(JSON.stringify(layered), /Do not expose/);
  assert.equal(engine.getState().afc.filter(item => item.afcRecordId === 'continuous').length, 1);
});

test('the May 1 boundary follows Calgary across the UTC rollover', () => {
  assert.equal(fixture({ now: () => new Date('2027-05-01T05:59:00Z') }).currentYear(new Date('2027-05-01T05:59:00Z')), firstYear);
  const engine = fixture({ now: () => new Date('2027-05-01T06:00:00Z') });
  engine.createYear(owner, nextYear);
  assert.equal(engine.getPreferredYear(faculty), nextYear);
});


test('exact Teaching Calendar replacement and recovery act only on the selected Working Course', () => {
  const engine = fixture();
  const before = engine.getState();
  plan(engine);
  const existing = add(engine, { assigned: true });
  const input = { name: 'synthetic-calendar.json', sourceVersion: 'Calendar v2', replace: true,
    records: [{ id: 'imported', academicYear: nextYear, courseCode: 'VTMD 304', topic: 'Synthetic teaching',
      sessionType: 'SRL', date: '2027-10-12', startTime: '08:30', endTime: '09:30' }] };
  const wrong = { ...input, records: [{ ...input.records[0], academicYear: firstYear }] };
  const blocked = engine.previewTeachingImport(adfa, nextYear, 'VTMD 304', wrong);
  assert.equal(blocked.issues.length, 1);
  assert.throws(() => engine.commitTeachingImport(adfa, nextYear, 'VTMD 304', wrong, blocked.signature, true), /validation/);
  const preview = engine.previewTeachingImport(adfa, nextYear, 'VTMD 304', input);
  assert.deepEqual(preview.changes.map(row => row.status), ['Added', 'Pending removal']);
  const receipt = engine.commitTeachingImport(adfa, nextYear, 'VTMD 304', input, preview.signature, true);
  assert.equal(receipt.dataset, 'Teaching Calendar');
  assert.equal(receipt.by, adfa.uid);
  assert.equal(engine.getCalendar(adfa, nextYear)[0].id, 'imported');
  assert.deepEqual(engine.getState().annual[firstYear], before.annual[firstYear]);
  assert.deepEqual(engine.getState().doe[firstYear], before.doe[firstYear]);
  assert.throws(() => engine.commitTeachingImport(adfa, nextYear, 'VTMD 304', input, preview.signature, true), /confirmed again/);
  engine.recoverTeachingImport(adfa, nextYear, receipt.id);
  assert.equal(engine.getCalendar(adfa, nextYear)[0].id, existing);
  assert.equal(engine.getOfficeProgress(adfa, nextYear).imports[0].status, 'Recovered');
});
