'use strict';
// QA-02: approval actions work for authorized users and stay refused for others.
// - An administrator may recommend an AFC request on behalf of Reports To
//   (SQL RecommendAfcRequest sets SignedOnBehalf); the page offers that button.
// - Teaching Assignment review / final / publish / draft accept an empty note.
//   The page sends null for an empty note box, which the API used to reject.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../tools/pages-demo-api/store.js');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime.js');
const { buildDataset } = require('../tools/seed/dataset.js');

const seed = buildDataset().documents;
const NOW = '2026-11-09T20:00:00.000Z';
const PENDING_REPORT_TO = '29c09fc2-2ac0-4155-97c0-9c9c28c09e2f'; // Rowan, Reports To = Avery
const DRAFT = 'f1579cf9-f057-4b66-af57-99d3ee579840'; // VTMD 200 · Avery Lindqvist
const ADFAD = '3713f4a9-3613-4316-a513-f1833413eff0'; // VTMD 211 submitted_to_adfad
const DRAFT_PATH = `/api/v1/teaching-assignments/packages/${DRAFT}`;

function setup({ roles = {}, storage } = {}) {
  const store = createStore({ autoLoadFixture: true, now: () => new Date(NOW), storage });
  store.accountOverlay = uid => {
    const profile = seed.find(d => d.path === 'users/' + uid)?.data;
    return profile && roles[uid] ? { ...profile, role: roles[uid] } : profile || null;
  };
  return { store, route: createDemoRuntime(store) };
}
const call = async (route, uid, method, url, body) => {
  const r = await route(new Request('https://pages-demo.invalid' + url, { method, headers: { authorization: 'Bearer demo-token-' + uid, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: r.status, body: r.jsonBody, bytes: r.binaryBody };
};
const signature = uid => {
  const email = (seed.find(d => d.path === 'users/' + uid) || {}).data?.email || '';
  return { signature: { mode: 'typed', name: 'QA Tester', uid, email, signedAt: '2026-11-09T20:00:00.000Z', account: email, attested: true, fingerprint: 'a'.repeat(64), imageDataUrl: '' } };
};

test('Reports To and administrators can recommend; others cannot', async () => {
  for (const uid of ['uid-fac-001', 'uid-admin', 'uid-owner']) {
    const { route } = setup();
    const r = await call(route, uid, 'POST', `/api/v1/afc-requests/${PENDING_REPORT_TO}/recommend`, signature(uid));
    assert.equal(r.status, 200, uid);
    assert.equal(r.body.afcRequest.status, 'pending_admin', uid);
  }
  for (const uid of ['uid-fac-003', 'uid-fac-002', 'uid-visc-1', 'uid-adc-1', 'uid-lab-1']) {
    const { route } = setup();
    assert.equal((await call(route, uid, 'POST', `/api/v1/afc-requests/${PENDING_REPORT_TO}/recommend`, signature(uid))).status, 403, uid);
  }
});

test('an administrator recommendation is recorded as signed on behalf', async () => {
  const { store, route } = setup();
  const response = await call(route, 'uid-admin', 'POST', `/api/v1/afc-requests/${PENDING_REPORT_TO}/recommend`, signature('uid-admin'));
  assert.equal(response.status, 200);
  const request = store.tables.extra.afcRequests.find(row => row.afcRequestId === PENDING_REPORT_TO);
  const approval = request.approvals.find(a => a.stage === 'report_to');
  assert.equal(approval.signedOnBehalf, true);
  assert.equal(approval.approverFirebaseUid, 'uid-admin');
  assert.equal(store.tables.history[0].after.signedOnBehalf, true);
});

test('AFC decisions and approved PDFs follow the saved account role', async () => {
  const { route } = setup({ roles: { 'uid-fac-003': 'administrator', 'uid-admin': 'faculty' } });
  const path = `/api/v1/afc-requests/${PENDING_REPORT_TO}`;
  assert.equal((await call(route, 'uid-admin', 'POST', `${path}/recommend`, signature('uid-admin'))).status, 403);
  assert.equal((await call(route, 'uid-fac-003', 'POST', `${path}/recommend`, signature('uid-fac-003'))).status, 200);
  assert.equal((await call(route, 'uid-fac-003', 'POST', `${path}/approve`, signature('uid-fac-003'))).status, 200);
  const artifact = await call(route, 'uid-fac-003', 'POST', `${path}/approved-artifact`);
  assert.equal(artifact.status, 201, JSON.stringify(artifact.body));
  assert.equal(artifact.bytes.subarray(0, 5).toString(), '%PDF-');
  const download = await call(route, 'uid-fac-002', 'GET', `${path}/approved-artifact`);
  assert.equal(download.status, 200);
  assert.deepEqual(download.bytes, artifact.bytes);
  assert.equal((await call(route, 'uid-fac-004', 'GET', `${path}/approved-artifact`)).status, 404);
});

test('an AFC rejection retains its reason for the requester after reload', async () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const { store, route } = setup({ storage });
  const rejectionReason = 'Please choose dates with course coverage.';
  const path = `/api/v1/afc-requests/${PENDING_REPORT_TO}`;
  const rejection = await call(route, 'uid-admin', 'POST', `${path}/reject`, { ...signature('uid-admin'), rejectionReason });
  assert.equal(rejection.status, 200);
  assert.equal(rejection.body.afcRequest.rejectionReason, rejectionReason);
  assert.equal(store.tables.extra.afcRequests.find(row => row.afcRequestId === PENDING_REPORT_TO).approvals.at(-1).stage, 'admin');
  const reloaded = setup({ storage }).route;
  const mine = await call(reloaded, 'uid-fac-002', 'GET', '/api/v1/afc-requests');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.afcRequests.find(row => row.afcRequestId === PENDING_REPORT_TO).rejectionReason, rejectionReason);
  const unrelated = await call(reloaded, 'uid-fac-003', 'GET', '/api/v1/afc-requests');
  assert.equal(unrelated.status, 200);
  assert.equal(unrelated.body.afcRequests.some(row => row.afcRequestId === PENDING_REPORT_TO), false);
});

test('Teaching Assignment actions accept an empty (null) note', async () => {
  const { route } = setup({ roles: { 'uid-fac-001': 'hicc' } });
  const draft = (await call(route, 'uid-fac-001', 'GET', DRAFT_PATH)).body;
  const sessionId = draft.revisions.at(-1).sessions[0].sessionId;
  const suggestion = { revisionNumber: 1, sessionId, candidateKey: 'candidate-qa', suggestedDisplayName: 'Synthetic candidate', note: null };
  assert.equal((await call(route, 'uid-fac-001', 'POST', `${DRAFT_PATH}/contributions`, suggestion)).status, 200);
  const save = { expectedWorkingRevision: 1, sessions: [], revisionNote: null };
  assert.equal((await call(route, 'uid-fac-001', 'POST', `${DRAFT_PATH}/draft`, save)).status, 200);
  assert.equal((await call(route, 'uid-fac-001', 'POST', `${DRAFT_PATH}/submit`, { expectedWorkingRevision: 2 })).status, 200);
  assert.equal((await call(route, 'uid-visc-1', 'POST', `${DRAFT_PATH}/reviews`, { revisionNumber: 2, decision: 'approved', comment: null })).status, 200);
  const pkg = (await call(route, 'uid-owner', 'GET', `/api/v1/teaching-assignments/packages/${ADFAD}`)).body;
  const assignments = pkg.revisions.at(-1).sessions.flatMap(s => (s.assignments || []).filter(a => a.facultyId).map(a => ({ sessionId: s.sessionId, facultyId: a.facultyId, teachingRole: a.teachingRole || '' })));
  assert.equal((await call(route, 'uid-owner', 'POST', `/api/v1/teaching-assignments/packages/${ADFAD}/finalization`, { expectedWorkingRevision: pkg.workingRevision, assignments, finalNote: null })).status, 200);
  assert.equal((await call(route, 'uid-owner', 'POST', '/api/v1/teaching-assignments/publications', { academicYear: '2026-27', publicationNote: null })).status, 200);
});

test('push back still requires a reason, and a non-string note is still refused', async () => {
  const { route } = setup();
  const pushBack = await call(route, 'uid-visc-1', 'POST', `${DRAFT_PATH}/reviews`, { revisionNumber: 2, decision: 'push_back', comment: null });
  assert.equal(pushBack.status, 400);
  assert.equal(pushBack.body.error.code, 'INVALID_REVIEW');
  const numeric = await call(route, 'uid-visc-1', 'POST', `${DRAFT_PATH}/reviews`, { revisionNumber: 2, decision: 'approved', comment: 5 });
  assert.equal(numeric.status, 400);
  assert.equal(numeric.body.error.code, 'INVALID_REVIEW');
});
