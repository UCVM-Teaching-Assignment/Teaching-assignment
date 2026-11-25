'use strict';
// QA-06: key pages at 1280px, 1440px and 390px.
// - At 390px the timetable view switcher (overflow:hidden for its rounded
//   corners) cut off "Compare Weeks" and "Course List", so they could not be
//   reached. It now wraps on narrow screens.
// - Testing-site overlays (Workflow notifications popup, Demo role tester and
//   Test site banner) sat above page dialogs and covered buttons such as
//   "Edit Session" and "Save" on phones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('timetable view switcher wraps instead of clipping on narrow screens', () => {
  const css = read('frontend/styles/timetable.css');
  const narrow = css.match(/@media\(max-width:700px\)\{[^\n]*/)[0];
  const rule = narrow.match(/\.cal-view-toggle\{([^}]*)\}/)[1];
  assert.match(rule, /flex-wrap:wrap/);
  assert.match(rule, /max-width:100%/);
});

test('testing-only workflow notifications popup stays below page dialogs', () => {
  const js = read('frontend/scripts/testing-only-features.js');
  const z = Number(js.match(/\.testing-only-notify\{[^}]*z-index:(\d+)/)[1]);
  const timetable = read('frontend/styles/timetable.css');
  const modalZ = Number(timetable.match(/\.modal-container\.open\{[^}]*z-index:(\d+)/)[1]);
  const afcZ = Number(timetable.match(/\.afc-timetable-panel\{[^}]*z-index:(\d+)/)[1]);
  assert.ok(z < modalZ && z < afcZ, `notify ${z} must be below modal ${modalZ} and AFC panel ${afcZ}`);
  assert.ok(z > 100, 'still above sticky headers and dropdowns');
});

test('testing-site floating panels drop below an open dialog', () => {
  const js = read('tools/pages-demo-panels.js');
  const rule = js.match(/body:has\(([^)]*\([^)]*\)[^)]*)*[^)]*\)\s*\[data-paws-floating-panel\]\{z-index:(\d+)!important\}/);
  assert.ok(rule, 'dialog-open rule present');
  for (const sel of ['#modal.open', '.afc-timetable-panel:not([hidden])', '[aria-modal="true"]:not([aria-hidden="true"])']) assert.ok(js.includes(sel), sel);
  assert.ok(Number(rule[2]) < 150);
});
