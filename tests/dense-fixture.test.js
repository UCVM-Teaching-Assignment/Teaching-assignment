'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTables } = require('../tools/pages-demo-api/store.js');
const { applyDenseFixture, COURSE_TARGET, CCC_TARGET, CCC_LOCUM_TARGET, WEEKS, weekOf } = require('../tools/pages-demo-api/dense-fixture.js');
const { sessionRows } = require('../tools/pages-demo-api/dataset.js');
const { createCccScheduleRepository } = require('../tools/pages-demo-api/repos/calendar.js');

function countByWeek(tables, termName, week) {
  return tables.sessions.filter(row => row.academicYear === '2026-27'
    && weekOf(row.date)?.term.term === termName && weekOf(row.date)?.week === week).length;
}

test('Beta-density fixture matches synthetic weekly profile and preserves current seeded sessions', () => {
  const t = buildTables();
  const beforeSessions = t.sessions.map(row => row.id);
  const originalCount = t.sessions.length;
  const beforeCCC = t.activities.filter(row => row.category === 'ccc').length;
  const result = applyDenseFixture(t);
  assert.equal(result.expectedSessions, COURSE_TARGET);
  assert.equal(COURSE_TARGET, 1937);
  assert.equal(CCC_TARGET, 413);
  assert.equal(result.totalSessions, 1937);
  assert.equal(result.totalCCC, CCC_TARGET);
  assert.equal(result.addedSessions, 1937 - originalCount);
  assert.equal(result.addedCCC, CCC_TARGET - beforeCCC);
  for (const id of beforeSessions) assert.ok(t.sessions.some(row => row.id === id), 'Existing session must be preserved');
  for (const term of WEEKS) term.counts.forEach((expected, week) => {
    assert.equal(countByWeek(t, term.term, week), expected, term.term + ' W' + (week + 1));
  });
  assert.equal(countByWeek(t, 'fall', 0), 77);
  assert.equal(countByWeek(t, 'fall', 4), 69);
  assert.equal(countByWeek(t, 'fall', 5), 79);
  assert.equal(countByWeek(t, 'spring', 3), 17);
  // Beta's historical grid/check-needed partition anchors, using missing
  // source times as the synthetic, explicitly reviewable example.
  for (const [term, week, checkNeeded] of [['fall', 0, 25], ['fall', 4, 9], ['fall', 5, 19], ['spring', 3, 7]]) {
    const actual = t.sessions.filter(row => row.academicYear === '2026-27'
      && weekOf(row.date)?.term.term === term && weekOf(row.date)?.week === week
      && (!row.startTime || !row.endTime)).length;
    assert.equal(actual, checkNeeded, term + ' W' + (week + 1) + ' check needed');
  }
  const kinds = new Set(t.sessions.map(row => row.sessionType));
  for (const kind of ['LEC', 'LAB', 'SRL', 'Exam', 'OSCE']) assert.ok(kinds.has(kind), kind + ' coverage');
  const ccc = t.activities.filter(row => row.category === 'ccc');
  assert.equal(ccc.filter(row => row.staffingKind === 'unassigned' || row.facultyDisplayName === 'Locum').length, CCC_LOCUM_TARGET);
  assert.ok(ccc.every(row => row.academicYear === '2026-27'));
  assert.ok(ccc.every(row => row.timeEvidence?.every(e => e.startTime >= '08:30' && e.endTime <= '16:30')));
  assert.ok(ccc.some(row => row.syntheticFixture), 'Additional CCC staffing slots exist');
  const unknown = t.sessions.filter(row => row.syntheticFixture && !row.startTime);
  assert.ok(unknown.length > 0, 'Check Needed example must exist');
  assert.ok(unknown.every(row => row.assignments.every(a => a.creditedHours === null && a.doeCredit === null)));
  assert.ok(t.sessions.filter(row => row.syntheticFixture).every(row => row.assignments.every(a => a.facultyId && a.sessionAssignmentId)));
});

test('fixture is idempotent and does not overwrite manually edited sessions or CCC activities', () => {
  const t = buildTables();
  if (!t.sessions.length) t.sessions.push(...sessionRows(t.courses, t.faculty).slice(0, 2)); // PR #107 starts empty
  const original = t.sessions[0];
  const edit = { ...original, topic: 'Staff-edited test topic', room: 'Staff test room' };
  t.sessions[0] = edit;
  const ccc = t.activities.find(row => row.category === 'ccc');
  ccc.label = 'Staff-edited CCC note';
  applyDenseFixture(t);
  const snapshot = { sessions: t.sessions.length, ccc: t.activities.length };
  const second = applyDenseFixture(t);
  assert.equal(second.addedSessions, 0);
  assert.equal(second.addedCCC, 0);
  assert.equal(t.sessions.length, snapshot.sessions);
  assert.equal(t.activities.length, snapshot.ccc);
  assert.equal(t.sessions.find(row => row.id === edit.id).topic, edit.topic);
  assert.equal(t.sessions.find(row => row.id === edit.id).room, edit.room);
  assert.equal(t.activities.find(row => row.activityId === ccc.activityId).label, ccc.label);
});

test('CCC schedule API receives Beta-shaped half-day rows and full synthetic coverage', async () => {
  const t = buildTables();
  applyDenseFixture(t);
  const result = await createCccScheduleRepository({ tables: t }).list({ academicYear: '2026-27' });
  assert.equal(result.entries.length, CCC_TARGET);
  assert.ok(result.entries.every(row => row.date && row.endDate && row.blockLabel && row.courseCode === 'CCC' && typeof row.facultyName === 'string' && typeof row.halfDay === 'boolean'));
  assert.ok(result.entries.some(row => row.halfDay === true));
  assert.ok(result.entries.some(row => row.halfDay === false), 'Full-day CCC rotation example expected');
});

test('empty calendar baseline from PR #107 can load complete dense fixture', () => {
  const t = buildTables();
  t.sessions = [];
  t.activities = t.activities.filter(row => row.category !== 'ccc');
  const result = applyDenseFixture(t);
  assert.equal(result.addedSessions, COURSE_TARGET);
  assert.equal(result.addedCCC, CCC_TARGET);
  assert.equal(result.totalSessions, COURSE_TARGET);
  assert.equal(result.totalCCC, CCC_TARGET);
  assert.equal(t.sessions.filter(row => row.syntheticFixture).length, COURSE_TARGET);
});