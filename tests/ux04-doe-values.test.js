'use strict';
// UX-04: DOE values show correctly for zero, null, missing and unknown values,
// without misleading defaults. A real 0 stays "0.00%"; an absent value is not 0.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const view = require('../frontend/scripts/dashboard-view-model.js');
const demo = require('../frontend/scripts/multi-year-demo-model.js');

test('imported unknown credits and missing targets survive the engine-to-display path', () => {
  const engine = demo.createEngine({ source: { faculty: [{facultyId:'f1'}], sessions: [{id:'s1',academicYear:'2026-27',courseCode:'C',date:'2026-09-01',assignments:[{facultyId:'f1',doeCredit:null}]}] } });
  const row = engine.getTeaching({uid:'owner',role:'owner'}, '2026-27')[0];
  assert.equal(demo.sessionDoeCredit(row.assignments), 'Not recorded');
  const record = engine.getState().doe['2026-27'].records.f1;
  assert.equal(record.effective, null);
  assert.equal(record.needsReview, true);
  const actor={uid:'owner',role:'owner'};
  engine.addSession(actor,'2026-27','C',{id:'s2',date:'2026-09-02',assignments:[{facultyId:'f1'}]});
  assert.equal(engine.getState().annual['2026-27'].C.working.find(x=>x.id==='s2').assignments[0].doeCredit,null);
  assert.equal(engine.editAssignment(actor,'2026-27','C','s2','f1').assignments[0].doeCredit,null);
});

test('blank and nonnumeric data never becomes a recorded zero', () => {
  for (const value of ['   ', false, true, [], [1], {}]) {
    assert.equal(demo.formatDoeNumber(value), '—');
    assert.equal(view.formatRoleDoe(value, 'effective'), 'Needs Review');
    assert.equal(view.formatHours(value), '—');
  }
});

test('role DOE columns say what is absent instead of "DOE unavailable"', () => {
  assert.equal(view.formatRoleDoe(null, 'mapped'), 'Not mapped');
  assert.equal(view.formatRoleDoe(null, 'override'), 'No override');
  assert.equal(view.formatRoleDoe(null, 'calculated'), 'Not calculated');
  assert.equal(view.formatRoleDoe(null, 'effective'), 'Needs Review');
  assert.equal(view.formatRoleDoe(undefined, 'override'), 'No override');
  assert.equal(view.formatRoleDoe('', 'mapped'), 'Not mapped');
  for (const kind of ['mapped', 'override', 'calculated', 'effective']) {
    assert.equal(view.formatRoleDoe(0, kind), '0.00%', kind);
    assert.equal(view.formatRoleDoe(3.5, kind), '3.50%', kind);
    assert.equal(view.formatRoleDoe(-2, kind), '-2.00%', kind);
  }
  assert.equal(view.formatDoe(null), 'DOE unavailable');
  assert.equal(view.formatDoe(0), '0.00%');
});

test('credited hours show at most two decimals and missing hours are not 0', () => {
  assert.equal(view.formatHours(238.90000000000035), '238.9');
  assert.equal(view.formatHours(222.4000000000003), '222.4');
  assert.equal(view.formatHours(12.345), '12.35');
  assert.equal(view.formatHours(40), '40');
  assert.equal(view.formatHours(0), '0');
  assert.equal(view.formatHours(null), '—');
  assert.equal(view.formatHours(''), '—');
  assert.equal(view.formatHours('abc'), '—');
});

test('Teaching Summary and Roles use the formatters', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'scripts', 'faculty-admin.js'), 'utf8');
  assert.match(source, /formatHours\(row\.creditedHours\)/);
  assert.doesNotMatch(source, /display\(row\.creditedHours\)/);
  for (const kind of ['mapped', 'override', 'calculated', 'effective']) {
    assert.match(source, new RegExp(`formatRoleDoe\\(doe\\.${kind}, '${kind}'\\)`), 'Roles tab ' + kind);
    assert.match(source, new RegExp(`formatRoleDoe\\(effective\\.${kind}, '${kind}'\\)`), 'profile roles ' + kind);
  }
});

test('Multi-year Demo shows a missing DOE as a dash, not 0.00', () => {
  assert.equal(demo.formatDoeNumber(null), '—');
  assert.equal(demo.formatDoeNumber(undefined), '—');
  assert.equal(demo.formatDoeNumber(''), '—');
  assert.equal(demo.formatDoeNumber(0), '0.00');
  assert.equal(demo.formatDoeNumber(1.234), '1.23');
});

test('Multi-year Demo session DOE credit does not count unknown credit as 0', () => {
  assert.equal(demo.sessionDoeCredit([{ doeCredit: 1.5 }, { doeCredit: 0.5 }]), '2.00');
  assert.equal(demo.sessionDoeCredit([{ doeCredit: 0 }]), '0.00');
  assert.equal(demo.sessionDoeCredit([{ doeCredit: null }]), 'Not recorded');
  assert.equal(demo.sessionDoeCredit([]), 'Not recorded');
  assert.equal(demo.sessionDoeCredit([{ doeCredit: 1 }, { doeCredit: null }]), '1.00 + not recorded');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'scripts', 'multi-year-demo.js'), 'utf8');
  assert.doesNotMatch(ui, /Number\(f\.doeCredit\)\|\|0/);
  assert.match(ui, /sessionDoeCredit\(x\.assignments\)/);
});
