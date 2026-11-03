'use strict';
// Pure deterministic, entirely fictional load-test fixture for the PAWS browser Demo.
// Targets approximate historical Beta source density, NOT a copy of Beta records:
// 1,937 teaching Course Sessions, including LAB/SRL/LEC, and 413 CCC assignment
// slots (11 Locum). Existing browser-local manual work is preserved.
const { uuidFor, addDays, weekday } = require('./ids.js');
const { ACADEMIC_YEAR, CREATED, hours } = require('./dataset.js');
const { resolveTeachingDoe } = require('../../server/src/domain/doe-calculator.js');

const FIXTURE = 'beta-density-synthetic-v1';
const WEEKS = Object.freeze([
  { term: 'spring', start: '2026-05-04', counts: Object.freeze(Array(12).fill(17)) },
  { term: 'fall', start: '2026-08-24', counts: Object.freeze([77, 72, 74, 72, 69, 79, 73, 71, 75, 78, 74, 76, 72, 75, 77, 66]) },
  { term: 'winter', start: '2027-01-11', counts: Object.freeze([37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 37, 36, 36]) }
]);
const COURSE_TARGET = WEEKS.reduce((sum, term) => sum + term.counts.reduce((a, b) => a + b, 0), 0);
const CCC_TARGET = 413;
const CCC_LOCUM_TARGET = 11;
const CYCLE = Object.freeze({
  spring: ['LAB', 'LAB', 'SRL', 'LAB', 'LEC', 'LAB', 'SRL', 'LAB', 'LAB', 'SRL'],
  fall: ['LEC', 'LAB', 'SRL', 'LEC', 'LAB', 'LEC', 'SRL', 'LAB', 'LEC', 'SRL'],
  winter: ['LEC', 'SRL', 'LAB', 'LEC', 'LAB', 'SRL', 'LEC', 'LAB', 'SRL', 'LEC']
});
const SLOTS = Object.freeze({
  LEC: [['08:30:00', '09:30:00'], ['09:30:00', '10:30:00'], ['10:30:00', '11:30:00'], ['13:00:00', '14:00:00'], ['14:00:00', '15:00:00'], ['15:00:00', '16:00:00']],
  SRL: [['08:30:00', '10:00:00'], ['10:30:00', '12:00:00'], ['13:00:00', '14:30:00'], ['15:00:00', '16:30:00']],
  LAB: [['08:30:00', '10:20:00'], ['10:30:00', '12:20:00'], ['13:00:00', '14:50:00'], ['14:40:00', '16:30:00']],
  Exam: [['08:30:00', '10:30:00'], ['13:00:00', '15:00:00']],
  'Quiz/Midterm': [['08:30:00', '10:00:00'], ['13:00:00', '14:30:00']]
});
const TOPICS = Object.freeze([
  'Clinical reasoning', 'Core veterinary concepts', 'Small-group discussion',
  'Applied diagnosis', 'Practical skills', 'Case-based learning',
  'Clinical communication', 'Laboratory technique', 'Patient assessment'
]);
const CCC_CLOSED = new Set([
  '2026-05-18', '2026-07-01', '2026-08-03', '2026-09-07', '2026-09-30',
  '2026-10-12', '2026-11-11', '2026-12-25', '2026-12-28', '2026-12-29',
  '2026-12-30', '2026-12-31', '2027-01-01', '2027-02-15', '2027-03-26',
  '2027-03-29'
]);

function weekOf(date) {
  if (typeof date !== 'string') return null;
  const time = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(time)) return null;
  for (const term of WEEKS) {
    const start = Date.parse(term.start + 'T00:00:00Z');
    const week = Math.floor((time - start) / (7 * 86400000));
    if (week >= 0 && week < term.counts.length) return { term, week };
  }
  return null;
}

function makeAssignment(sessionId, person, role, index, startTime, endTime, type) {
  const creditedHours = startTime && endTime ? hours(startTime, endTime) : null;
  const doe = resolveTeachingDoe({ sessionType: type, teachingRole: role, creditedHours });
  return {
    sessionAssignmentId: uuidFor('dense-assignment:' + sessionId + ':' + index),
    facultyId: person.facultyId, teachingRole: role,
    labLead: role === 'Lab Primary' ? 'Yes' : '',
    creditedHours, doeRate: doe.rate ?? null,
    doeQuantity: doe.quantity ?? creditedHours,
    doeUnit: doe.unit || 'credited hour',
    doeCredit: doe.calculatedDoe ?? null,
    doeStatus: doe.calculatedDoe == null ? (doe.applicable === false ? 'not_applicable' : 'needs_review') : 'calculated',
    sourceFacultyName: person.displayName
  };
}

function makeSession(term, week, index, courses, faculty) {
  const course = courses[(index + week * 3) % courses.length];
  let type = CYCLE[term.term][index % CYCLE[term.term].length];
  if (term.term !== 'spring' && week === 7 && index % 37 === 10) type = 'Quiz/Midterm';
  if (term.term !== 'spring' && week === term.counts.length - 1 && index % 29 === 11) type = 'Exam';
  const date = addDays(term.start, week * 7 + ((index * 3 + week) % 5));
  const slots = SLOTS[type];
  const [rawStart, rawEnd] = slots[(index + Math.floor(index / courses.length) + week) % slots.length];
  // A small intentional Check Needed sample; never invent missing DOE time.
  const unknown = (index + week * 17) % 31 === 0;
  const startTime = unknown ? null : rawStart, endTime = unknown ? null : rawEnd;
  const id = uuidFor('dense-session:' + ACADEMIC_YEAR + ':' + term.term + ':' + week + ':' + index);
  const leadIndex = (week * 13 + index * 3) % faculty.length;
  const lead = faculty[leadIndex], partner = faculty[(leadIndex + 5) % faculty.length];
  const instructors = type === 'LAB'
    ? [{ person: lead, role: 'Lab Primary' }, { person: partner, role: 'Lab Secondary' }]
    : [{ person: lead, role: type === 'SRL' ? 'SRL' : type === 'LEC' ? 'Lecture' : 'Exam Supervisor' }];
  return {
    id, academicYear: ACADEMIC_YEAR, curriculumYear: String(course.curriculumYear),
    courseCode: course.courseCode, courseName: course.courseName, subjectKey: null,
    topic: '[Synthetic] ' + TOPICS[(week + index) % TOPICS.length] + ' - ' + term.term + ' W' + (week + 1),
    sessionType: type, date, startTime, endTime,
    room: type === 'LAB' ? 'Demo VLC Lab ' + (1 + index % 8)
      : type === 'SRL' ? 'Demo SRL Room ' + (1 + index % 8) : 'Demo Lecture Room ' + (1 + index % 12),
    updatedAtUtc: CREATED, syntheticFixture: FIXTURE,
    assignments: instructors.map((entry, i) => makeAssignment(id, entry.person, entry.role, i, startTime, endTime, type))
  };
}

function clinicDates() {
  const dates = [];
  for (let date = '2026-05-04'; date <= '2027-04-30'; date = addDays(date, 1)) {
    if (weekday(date) >= 1 && weekday(date) <= 5 && !CCC_CLOSED.has(date)) dates.push(date);
  }
  return dates;
}

function makeCccActivity(index, faculty, dates, locum) {
  const date = dates[index % dates.length];
  const isAm = (Math.floor(index / dates.length) + index) % 2 === 0;
  const startTime = isAm ? '08:30' : '13:00', endTime = isAm ? '12:00' : '16:30';
  const shift = isAm ? 'AM' : 'PM';
  const day = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse('2026-05-04T00:00:00Z')) / 86400000);
  const block = 'Block ' + (1 + Math.floor(day / 28) % 13);
  const person = faculty[(index * 5 + Math.floor(day / 7)) % faculty.length];
  const id = uuidFor('dense-ccc:' + ACADEMIC_YEAR + ':' + index);
  return {
    activityId: id, academicYear: ACADEMIC_YEAR,
    facultyKey: locum ? null : person.facultyId,
    facultyDisplayName: locum ? 'Locum' : person.displayName,
    category: 'ccc', label: 'CCC - ' + shift + ' half day',
    startDate: date, endDate: date, courseCode: 'CCC',
    blockLabel: block + ' - ' + shift,
    staffingKind: locum ? 'unassigned' : 'assigned',
    staffingLabel: locum ? 'Locum' : null,
    timeStatus: 'verified', timeEvidence: [{ date, startTime, endTime }],
    days: 1, version: '0000000000001000',
    syntheticFixture: FIXTURE,
    isFourthYearRotation: (Math.floor(day / 28) % 3) === 0
  };
}

function applyDenseFixture(tables) {
  if (!tables || !Array.isArray(tables.sessions) || !Array.isArray(tables.activities)
      || !Array.isArray(tables.courses) || !Array.isArray(tables.faculty)) {
    throw new TypeError('PAWS browser Demo tables required.');
  }
  const active = tables.faculty.filter(person => person.active === true);
  if (!active.length) throw new Error('No active synthetic Faculty available.');
  const seenSessions = new Set(tables.sessions.map(row => String(row.id)));
  const weekCounts = new Map();
  for (const row of tables.sessions) {
    if (row.academicYear !== ACADEMIC_YEAR) continue;
    const ref = weekOf(row.date);
    if (ref) {
      const key = ref.term.term + ':' + ref.week;
      weekCounts.set(key, (weekCounts.get(key) || 0) + 1);
    }
  }
  const addedByType = {}, additions = [];
  for (const term of WEEKS) {
    const courses = tables.courses.filter(course => term.term === 'spring'
      ? course.term === 'rotation' : course.term === term.term && Number(course.curriculumYear) <= 3);
    if (!courses.length) throw new Error('Missing Demo Course Catalog for ' + term.term);
    term.counts.forEach((target, week) => {
      const key = term.term + ':' + week;
      const required = Math.max(0, target - (weekCounts.get(key) || 0));
      let added = 0, candidate = 0;
      while (added < required) {
        if (candidate > target * 4) throw new Error('Unable to allocate unique synthetic session IDs.');
        const row = makeSession(term, week, candidate++, courses, active);
        if (seenSessions.has(row.id)) continue;
        seenSessions.add(row.id); additions.push(row); added++;
        addedByType[row.sessionType] = (addedByType[row.sessionType] || 0) + 1;
      }
    });
  }
  const existingCCC = tables.activities.filter(row => row.category === 'ccc' && row.academicYear === ACADEMIC_YEAR);
  const locumExisting = existingCCC.filter(row => row.staffingKind === 'unassigned' || row.facultyDisplayName === 'Locum').length;
  const cccNeeded = Math.max(0, CCC_TARGET - existingCCC.length);
  const locumNeeded = Math.max(0, CCC_LOCUM_TARGET - locumExisting);
  const dates = clinicDates(), seenCCC = new Set(tables.activities.map(row => String(row.activityId)));
  const cccAdditions = [];
  for (let index = 0; cccAdditions.length < cccNeeded; index++) {
    if (index > CCC_TARGET * 5) throw new Error('Unable to allocate unique synthetic CCC slots.');
    const row = makeCccActivity(index, active, dates, cccAdditions.length < locumNeeded);
    if (seenCCC.has(row.activityId)) continue;
    seenCCC.add(row.activityId); cccAdditions.push(row);
  }
  // Only additions; pre-existing and manually edited browser-local records are
  // never deleted, replaced, or assigned new DOE values by this command.
  tables.sessions.push(...additions);
  tables.sessions.sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || '').localeCompare(String(b.startTime || '')));
  tables.activities.push(...cccAdditions);
  return {
    addedSessions: additions.length, addedCCC: cccAdditions.length,
    totalSessions: tables.sessions.filter(row => row.academicYear === ACADEMIC_YEAR).length,
    totalCCC: tables.activities.filter(row => row.category === 'ccc' && row.academicYear === ACADEMIC_YEAR).length,
    addedByType, expectedSessions: COURSE_TARGET, expectedCCC: CCC_TARGET,
    exampleId: additions[0]?.id || null, synthetic: true
  };
}

module.exports = { FIXTURE, WEEKS, COURSE_TARGET, CCC_TARGET, CCC_LOCUM_TARGET, applyDenseFixture, weekOf, clinicDates };