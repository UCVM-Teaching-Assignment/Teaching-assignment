'use strict';
// QA-03: daily workflows from Calendar through Dashboard for each role.
// - Working activities: a range with more than one page (100 rows) failed to load
//   because the Demo returned an offset cursor ("100") the API rejects. The Demo
//   now returns the "YYYY-MM-DD|activityId" keyset cursor the API validates.
// - Teaching Assignments: Developer is an administrator there (server
//   ADMINISTRATOR_ROLES, SQL AUTH-1) but the page turned Developer away.
// - User Management: the name badge stayed on "Checking sign-in..." when access
//   was refused.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('../tools/pages-demo-api/store.js');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const get = async (route, uid, url) => {
  const r = await route(new Request('https://pages-demo.invalid' + url, { headers: { authorization: 'Bearer demo-token-' + uid } }));
  return { status: r.status, body: r.jsonBody };
};

async function loadAll(route, uid, base) {
  const rows = [];
  let url = base;
  for (let i = 0; i < 50; i += 1) {
    const page = await get(route, uid, url);
    assert.equal(page.status, 200, `page ${i + 1} for ${uid}: ${page.body?.error?.message || ''}`);
    rows.push(...page.body.activities);
    if (!page.body.nextCursor) return rows;
    assert.match(page.body.nextCursor, /^\d{4}-\d{2}-\d{2}\|[0-9a-f-]{36}$/i);
    url = `${base}&cursor=${encodeURIComponent(page.body.nextCursor)}`;
  }
  throw new Error('too many pages');
}

test('a full academic year of working activities loads across pages without gaps or repeats', async () => {
  const store = createStore({ autoLoadFixture: true });
  const route = createDemoRuntime(store);
  const base = '/api/v1/calendar-activities?start=2026-05-01&end=2027-05-01';
  for (const uid of ['uid-owner', 'uid-fac-001']) {
    const rows = await loadAll(route, uid, base);
    assert.ok(rows.length > 100, `${uid} needs more than one page (${rows.length})`);
    assert.equal(new Set(rows.map(r => r.activityId)).size, rows.length, `${uid} has no repeats`);
    const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.activityId.localeCompare(b.activityId));
    assert.deepEqual(rows.map(r => r.activityId), sorted.map(r => r.activityId), `${uid} pages stay in order`);
  }
  const single = await get(route, 'uid-owner', '/api/v1/calendar-activities?start=2026-11-01&end=2026-11-02&limit=1');
  assert.equal(single.status, 200);
});

test('Developer can open Teaching Assignments', () => {
  assert.match(read('frontend/scripts/teaching-assignments.js'), /const adminRoles = new Set\(\['developer','owner','administrator','adfa_general','adfa_regular','admin'\]\)/);
});

test('User Management shows who is signed in before refusing access', () => {
  const source = read('frontend/scripts/user-management.js');
  const badge = source.indexOf("$('identity').textContent=`${displayFaculty(me.name||u.email)}");
  const refusal = source.indexOf('User Management is available to Owner.');
  assert.ok(badge > 0 && refusal > badge);
});
