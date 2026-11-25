'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime');
const { createStore } = require('../tools/pages-demo-api/store');

const week = '/api/v1/sessions?start=2026-11-02&end=2026-11-07';
const schedule = week + '&view=teaching-schedule';

function request(route, path, uid, method = 'GET') {
  const headers = uid ? { authorization: 'Bearer demo-token-' + uid } : {};
  const body = method === 'POST' ? '{}' : undefined;
  return route(new Request('https://pages-demo.invalid' + path, { method, headers, body }));
}

test('Demo Teaching Schedule shows Years 1–3 and identifies only the viewer’s own assignments', async () => {
  const store = createStore({ autoLoadFixture: true, now: () => new Date('2026-11-24T19:00:00Z') });
  const route = createDemoRuntime(store);
  const developer = await request(route, week, 'uid-developer');
  assert.equal(developer.status, 200);
  assert.equal(developer.jsonBody.sessions.length, 74);
  const expectedIds = developer.jsonBody.sessions.map(row => row.id);

  for (const uid of ['uid-fac-001', 'uid-hicc-1', 'uid-visc-1']) {
    const personal = await request(route, week, uid);
    const calendar = await request(route, schedule, uid);
    assert.equal(personal.status, 200, uid);
    assert.equal(calendar.status, 200, uid);
    const ownIds = new Set(personal.jsonBody.sessions.map(row => row.id));
    assert.ok(ownIds.size > 0 && ownIds.size < expectedIds.length, uid);
    const rows = calendar.jsonBody.sessions;
    assert.deepEqual(rows.map(row => row.id), expectedIds, uid);
    assert.deepEqual([...new Set(rows.map(row => String(row.curriculumYear)))].sort(), ['1', '2', '3'], uid);
    for (const row of rows) {
      assert.equal(row.assignedToViewer, ownIds.has(row.id), uid);
      assert.deepEqual(JSON.parse(row.assignmentsJson), [], uid);
      assert.equal(row.academicYear, '2026-27', uid);
    }
  }
});

test('Demo schedule reads still require an active identity and cannot grant write access', async () => {
  const store = createStore({ autoLoadFixture: true });
  const route = createDemoRuntime(store);
  assert.equal((await request(route, schedule)).status, 401);
  assert.equal((await request(route, schedule, 'uid-fac-001', 'POST')).status, 403);
  assert.equal((await request(route, '/api/v1/sessions?start=2026-11-07&end=2026-11-02&view=teaching-schedule', 'uid-fac-001')).status, 400);
  const account = store.tables.users.find(row => row.firebaseUid === 'uid-fac-001');
  account.active = false;
  assert.equal((await request(route, schedule, 'uid-fac-001')).status, 403);
});
