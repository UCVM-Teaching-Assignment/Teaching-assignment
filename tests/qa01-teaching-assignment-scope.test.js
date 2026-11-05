'use strict';
// QA-01: Teaching Assignment writes need the actor's own package scope, as SQL
// CanActOnTeachingAssignmentPackage requires. Any HICC account could previously
// save a draft or submit another HICC's package in the Testing Demo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../tools/pages-demo-api/store.js');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime.js');
const { buildDataset } = require('../tools/seed/dataset.js');

const seed = buildDataset().documents;
const PACKAGE = 'f1579cf9-f057-4b66-af57-99d3ee579840'; // VTMD 200 · Avery Lindqvist (draft)
const APPROVED = 'eb1f7405-ea1f-4272-a91f-70dfe81f6f4c'; // VTMD 206 · Tobias Bergstrom (visc_approved)
const REVIEW = '1694a114-1794-42a7-b894-a43a1994a5cd'; // VTMD 202 (visc_review)

function runtime({ averyAsHicc = false } = {}) {
  const store = createStore({ autoLoadFixture: true });
  store.accountOverlay = uid => {
    const doc = (seed.find(d => d.path === 'users/' + uid) || {}).data || null;
    return averyAsHicc && uid === 'uid-fac-001' ? { ...doc, role: 'hicc' } : doc;
  };
  return createDemoRuntime(store);
}
const call = async (route, uid, method, url, body) => {
  const r = await route(new Request('https://pages-demo.invalid' + url, { method, headers: { authorization: 'Bearer demo-token-' + uid, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: r.status, body: r.jsonBody };
};
async function draftBody(route, uid, packageId) {
  const p = (await call(route, uid, 'GET', '/api/v1/teaching-assignments/packages/' + packageId)).body;
  return { expectedWorkingRevision: p.workingRevision, sessions: p.revisions.at(-1).sessions.map(s => ({ sessionId: s.sessionId, assignments: (s.assignments || []).map(a => ({ facultyId: a.facultyId, teachingRole: a.teachingRole })) })), revisionNote: 'qa' };
}

test('the package HICC can save and submit its own draft', async () => {
  const route = runtime({ averyAsHicc: true });
  const body = await draftBody(route, 'uid-fac-001', PACKAGE);
  assert.equal((await call(route, 'uid-fac-001', 'POST', `/api/v1/teaching-assignments/packages/${PACKAGE}/draft`, body)).status, 200);
  assert.equal((await call(route, 'uid-fac-001', 'POST', `/api/v1/teaching-assignments/packages/${PACKAGE}/submit`, { expectedWorkingRevision: body.expectedWorkingRevision + 1 })).status, 200);
});

test('another HICC cannot save, submit or final-submit a package outside its scope', async () => {
  const owner = runtime({ averyAsHicc: true });
  const body = await draftBody(owner, 'uid-fac-001', PACKAGE);
  for (const uid of ['uid-hicc-1', 'uid-hicc-2']) {
    const draft = await call(runtime(), uid, 'POST', `/api/v1/teaching-assignments/packages/${PACKAGE}/draft`, body);
    assert.equal(draft.status, 400, uid);
    assert.match(draft.body.error.message, /does not hold the current HICC responsibility/);
    const submit = await call(runtime(), uid, 'POST', `/api/v1/teaching-assignments/packages/${PACKAGE}/submit`, { expectedWorkingRevision: body.expectedWorkingRevision });
    assert.equal(submit.status, 400, uid);
    assert.match(submit.body.error.message, /Current HICC scope is required/);
  }
  const route = runtime();
  const approved = (await call(route, 'uid-owner', 'GET', '/api/v1/teaching-assignments/packages/' + APPROVED)).body;
  const final = await call(route, 'uid-hicc-1', 'POST', `/api/v1/teaching-assignments/packages/${APPROVED}/final-submit`, { expectedWorkingRevision: approved.workingRevision });
  assert.equal(final.status, 400);
  assert.match(final.body.error.message, /Current HICC package scope is required/);
});

test('a scoped VISC can still review, other roles cannot', async () => {
  assert.equal((await call(runtime(), 'uid-visc-1', 'POST', `/api/v1/teaching-assignments/packages/${REVIEW}/reviews`, { revisionNumber: 2, decision: 'approved', comment: 'qa' })).status, 200);
  for (const uid of ['uid-hicc-1', 'uid-fac-001', 'uid-owner']) {
    assert.equal((await call(runtime(), uid, 'POST', `/api/v1/teaching-assignments/packages/${REVIEW}/reviews`, { revisionNumber: 2, decision: 'approved' })).status, 403, uid);
  }
});
