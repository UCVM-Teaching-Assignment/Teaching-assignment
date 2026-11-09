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
const PENDING_REPORT_TO = '29c09fc2-2ac0-4155-97c0-9c9c28c09e2f'; // Rowan, Reports To = Avery
const VISC_REVIEW = '1694a114-1794-42a7-b894-a43a1994a5cd'; // VTMD 202
const ADFAD = '3713f4a9-3613-4316-a513-f1833413eff0'; // VTMD 211 submitted_to_adfad

function setup() {
  const store = createStore({ autoLoadFixture: true });
  store.accountOverlay = uid => (seed.find(d => d.path === 'users/' + uid) || {}).data || null;
  return { store, route: createDemoRuntime(store) };
}
const call = async (route, uid, method, url, body) => {
  const r = await route(new Request('https://pages-demo.invalid' + url, { method, headers: { authorization: 'Bearer demo-token-' + uid, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { status: r.status, body: r.jsonBody };
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
  await call(route, 'uid-admin', 'POST', `/api/v1/afc-requests/${PENDING_REPORT_TO}/recommend`, signature('uid-admin'));
  const request = store.tables.extra.afcRequests ? store.tables.extra.afcRequests.find(q => q.afcRequestId === PENDING_REPORT_TO) : null;
  const rows = request ? [request] : Object.values(store.tables.extra).flatMap(v => (Array.isArray(v) ? v : Array.isArray(v?.requests) ? v.requests : [])).filter(q => q && q.afcRequestId === PENDING_REPORT_TO);
  assert.ok(rows.length, 'request found in Demo store');
  const approval = rows[0].approvals.find(a => a.stage === 'report_to');
  assert.equal(approval.signedOnBehalf, true);
  assert.equal(approval.approverFirebaseUid, 'uid-admin');
});

test('Teaching Assignment actions accept an empty (null) note', async () => {
  const { route } = setup();
  assert.equal((await call(route, 'uid-visc-1', 'POST', `/api/v1/teaching-assignments/packages/${VISC_REVIEW}/reviews`, { revisionNumber: 2, decision: 'approved', comment: null })).status, 200);
  const pkg = (await call(route, 'uid-owner', 'GET', `/api/v1/teaching-assignments/packages/${ADFAD}`)).body;
  const assignments = pkg.revisions.at(-1).sessions.flatMap(s => (s.assignments || []).filter(a => a.facultyId).map(a => ({ sessionId: s.sessionId, facultyId: a.facultyId, teachingRole: a.teachingRole || '' })));
  assert.equal((await call(route, 'uid-owner', 'POST', `/api/v1/teaching-assignments/packages/${ADFAD}/finalization`, { expectedWorkingRevision: pkg.workingRevision, assignments, finalNote: null })).status, 200);
});

test('push back still requires a reason, and a non-string note is still refused', async () => {
  const { route } = setup();
  const pushBack = await call(route, 'uid-visc-1', 'POST', `/api/v1/teaching-assignments/packages/${VISC_REVIEW}/reviews`, { revisionNumber: 2, decision: 'push_back', comment: null });
  assert.equal(pushBack.status, 400);
  assert.equal(pushBack.body.error.code, 'INVALID_REVIEW');
  const numeric = await call(route, 'uid-visc-1', 'POST', `/api/v1/teaching-assignments/packages/${VISC_REVIEW}/reviews`, { revisionNumber: 2, decision: 'approved', comment: 5 });
  assert.equal(numeric.status, 400);
});
