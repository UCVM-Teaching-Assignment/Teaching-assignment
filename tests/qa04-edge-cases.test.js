'use strict';
// QA-04: edge cases. A DOE service that rejects input with its own 4xx status
// (target override: negative/non-numeric value, unknown reason, unknown Faculty)
// was reported as "The DOE service is temporarily unavailable" (503).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../tools/pages-demo-api/store.js');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime.js');

function setup() {
  const store = createStore({ autoLoadFixture: true });
  return { store, route: createDemoRuntime(store) };
}
const put = async (route, uid, facultyId, override) => {
  const r = await route(new Request('https://pages-demo.invalid/api/v1/doe/targets/' + facultyId, {
    method: 'PUT', headers: { authorization: 'Bearer demo-token-' + uid, 'content-type': 'application/json' },
    body: JSON.stringify({ academicYear: '2026-27', override })
  }));
  return { status: r.status, code: r.jsonBody?.error?.code, message: r.jsonBody?.error?.message };
};

test('invalid DOE override values get a clear input error, not "service unavailable"', async () => {
  const { store, route } = setup();
  const facultyId = store.tables.faculty[0].facultyId;
  for (const override of [{ value: -5, reason: 'RSL' }, { value: 'abc', reason: 'RSL' }, { value: 10, reason: 'Not a reason' }]) {
    const r = await put(route, 'uid-owner', facultyId, override);
    assert.equal(r.status, 422, JSON.stringify(override));
    assert.equal(r.code, 'DOE_TARGET_OVERRIDE_INVALID');
    assert.match(r.message, /non-negative DOE value/);
  }
  const missing = await put(route, 'uid-owner', '00000000-0000-4000-8000-000000000000', { value: 5, reason: 'RSL' });
  assert.equal(missing.status, 404);
  assert.equal(missing.code, 'FACULTY_NOT_FOUND');
});

test('valid DOE overrides, including zero and clearing, still save', async () => {
  const { store, route } = setup();
  const facultyId = store.tables.faculty[0].facultyId;
  assert.equal((await put(route, 'uid-owner', facultyId, { value: 0, reason: 'RSL' })).status, 200);
  assert.equal((await put(route, 'uid-owner', facultyId, { value: 33, reason: 'Other', notes: 'QA4' })).status, 200);
  assert.equal((await put(route, 'uid-owner', facultyId, null)).status, 200);
  assert.equal((await put(route, 'uid-fac-001', facultyId, { value: 5, reason: 'RSL' })).status, 403);
});
