'use strict';
// QA-05: downloads and exported records.
// - Calendar .ics files had an invalid DTSTAMP ("...ZZ") and no VTIMEZONE for
//   TZID=America/Edmonton, so some calendar apps rejected or shifted them.
// - "My timetable" CSV export for Faculty/HICC/VISC said "No records match":
//   profile names are "Last, First" and the server-scoped timetable carries no
//   Faculty IDs, so the client-side ownership check dropped every row.
// - Demo AFC seed records had empty workDays and generic coverage text, so the
//   approved PDF did not match the request.
// - Excel exports (Reports, Change History, CCC template) failed on the testing
//   site because the demo bundle stubbed out ExcelJS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const timetable = fs.readFileSync(path.join(ROOT, 'frontend/scripts/timetable.js'), 'utf8');
// Pull one top-level helper out of the browser script by brace matching.
function fn(name) {
  const start = timetable.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = timetable.indexOf('{', start); i < timetable.length; i++) {
    if (timetable[i] === '{') depth++;
    else if (timetable[i] === '}' && --depth === 0) return timetable.slice(start, i + 1);
  }
  throw new Error('unterminated ' + name);
}

test('ICS exports use a valid single-Z DTSTAMP and include the Edmonton VTIMEZONE', () => {
  const stampSrc = fn('icsStamp');
  const stamp = vm.runInNewContext(`${stampSrc}; icsStamp()`);
  assert.match(stamp, /^\d{8}T\d{6}$/);
  // Callers append exactly one Z, so the helper must not leave one on.
  assert.equal((timetable.match(/DTSTAMP:\$\{stamp\}Z`/g) || []).length, 3);
  assert.doesNotMatch(timetable, /DTSTAMP:\$\{new Date\(\)/);
  const tz = vm.runInNewContext(timetable.match(/const EDMONTON_VTIMEZONE=\[[^\]]+\]\.join\('\\r\\n'\);/)[0] + 'EDMONTON_VTIMEZONE');
  for (const line of ['BEGIN:VTIMEZONE', 'TZID:America/Edmonton', 'TZOFFSETTO:-0700', 'TZOFFSETTO:-0600', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:VTIMEZONE']) assert.ok(tz.includes(line), line);
  assert.equal((timetable.match(/METHOD:(PUBLISH|REQUEST)[^`]*\$\{EDMONTON_VTIMEZONE\}/g) || []).length, 2, 'both ICS exports embed the VTIMEZONE');
});

function belongs(currentUser, session, demo = false) {
  const window = demo ? { UCVM_PAWS_DEMO_API: { authoritative: false } } : {};
  const src = [fn('swapNameKey'), fn('splitInstructorNames'), fn('roleIsFaculty'), fn('usesDemoTeachingSchedule'), fn('sessionBelongsToCurrentFaculty')].join('\n');
  return vm.runInNewContext(`${src}; sessionBelongsToCurrentFaculty(s)`, { window, currentUser, s: session });
}

test('Faculty-role timetable export keeps their own sessions', () => {
  const faculty = { uid: 'uid-fac-001', name: 'Lindqvist, Avery', instructorName: 'Lindqvist, Avery', role: 'faculty', profile: { facultyId: 'f1' } };
  assert.equal(belongs(faculty, { instructor: 'Avery Lindqvist', assignments: [{ name: 'Avery Lindqvist' }] }), true, '"Last, First" profile matches "First Last" session');
  const hicc = { uid: 'uid-hicc', name: 'HICC Lead', role: 'hicc', profile: { facultyId: 'f9' } };
  assert.equal(belongs(hicc, { instructor: 'Someone Else', assignments: [{ name: 'Someone Else' }] }), true, 'server-scoped rows (no Faculty IDs) are trusted');
  assert.equal(belongs(hicc, { instructor: 'Someone Else', assignments: [{ name: 'Someone Else', facultyId: 'f2' }] }), false, 'rows with another Faculty ID are still excluded');
  const admin = { uid: 'uid-owner', name: 'Owner', role: 'owner', profile: {} };
  assert.equal(belongs(admin, { instructor: 'Someone Else', assignments: [{ name: 'Someone Else' }] }), false, 'admins do not get the server-scope fallback');
});

test('the shared Demo timetable uses its ownership flag for personal exports', () => {
  const faculty = { role: 'faculty', name: 'Lindqvist, Avery', profile: { facultyId: 'f1' } };
  assert.equal(belongs(faculty, { instructor: 'Someone Else', assignedToViewer: true }, true), true);
  assert.equal(belongs(faculty, { instructor: 'Avery Lindqvist', assignedToViewer: false }, true), false);
  assert.equal(belongs(faculty, { instructor: 'Someone Else' }, true), false);
});

test('demo AFC seed requests carry their work days and specific coverage text', () => {
  const { createStore } = require('../tools/pages-demo-api/store.js');
  const { requests } = require('../tools/pages-demo-api/repos/afc.js');
  const rows = requests(createStore({ autoLoadFixture: true }));
  assert.ok(rows.length > 0);
  for (const q of rows) {
    assert.ok(Number(q.workDays) > 0, `${q.afcRequestId} workDays=${q.workDays}`);
    assert.ok(q.coverage && q.coverage.length > 0);
  }
  assert.ok(new Set(rows.map(q => q.coverage)).size > 1);
});

test('testing-site bundle loads ExcelJS on demand instead of stubbing it out', () => {
  const build = fs.readFileSync(path.join(ROOT, 'tools/pages-demo-api/build.js'), 'utf8');
  assert.match(build, /exceljs: 'exceljs\.js'/);
  assert.match(build, /pages-demo-exceljs\.js/);
  const browser = fs.readFileSync(path.join(ROOT, 'tools/pages-demo-api/browser.js'), 'utf8');
  assert.match(browser, /const needsExcel = /);
  assert.match(browser, /ensureExcel\(\)/);
  const shimPath = require.resolve('../tools/pages-demo-api/shims/exceljs.js');
  delete globalThis.ExcelJS;
  const shim = require(shimPath);
  assert.throws(() => shim.Workbook, e => e.code === 'EXCEL_UNAVAILABLE');
  globalThis.ExcelJS = { Workbook: class Workbook {} };
  try { assert.equal(typeof shim.Workbook, 'function'); } finally { delete globalThis.ExcelJS; }
});
