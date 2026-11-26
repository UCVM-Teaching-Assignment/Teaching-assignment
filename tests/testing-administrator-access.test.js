'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PDFDocument } = require('../server/node_modules/pdf-lib');
const { createStore } = require('../tools/pages-demo-api/store');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime');
const { buildDataset } = require('../tools/seed/dataset');
const { requestActions } = require('../frontend/scripts/afc-workflow-sql');

function setup() {
  const store = createStore({ autoLoadFixture: true });
  const accounts = buildDataset().documents;
  store.accountOverlay = uid => accounts.find(row => row.path === 'users/' + uid)?.data ?? null;
  const route = createDemoRuntime(store);
  const call = (method, path, body, uid = 'uid-admin') => route(new Request('https://demo.invalid/api/v1' + path, {
    method, headers: { authorization: 'Bearer demo-token-' + uid, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }));
  const signature = {
    mode: 'typed', name: 'Testing Administrator', uid: 'uid-admin',
    email: store.accountOverlay('uid-admin').email, account: store.accountOverlay('uid-admin').email,
    signedAt: '2026-11-26T17:00:00Z', attested: true, fingerprint: 'a'.repeat(64)
  };
  return { store, call, signature };
}

test('Testing Administrator retains operational reads and loses session, import, approval and DOE writes', async () => {
  const { call, store } = setup();
  const readPaths = [
    '/sessions', '/dashboard/faculty', '/calendar-activities/capabilities',
    '/teaching-assignments/write-capabilities', '/swaps/queue',
    '/scheduling-tasks?academicYear=2026-27', '/dashboard/faculty-admin/write-capabilities',
    '/doe/write-capabilities', '/afc-forms/capabilities'
  ];
  for (const path of readPaths) {
    const response = await call('GET', path);
    assert.equal(response.status, 200, path);
    for (const value of Object.values(response.jsonBody.writeCapabilities || {})) assert.equal(value, false, path);
  }
  const gates = await call('GET', '/afc-requests/write-capabilities');
  assert.equal(gates.jsonBody.writeCapabilities.sessionEdit, false);
  assert.equal(gates.jsonBody.writeCapabilities.sessionCreate, false);
  assert.equal(gates.jsonBody.writeCapabilities.decisions, true);
  const swap = await call('GET', '/swaps/capabilities');
  assert.equal(swap.jsonBody.canPreviewDoe, false);
  assert.ok(Object.values(swap.jsonBody.writeCapabilities).every(value => !value));
  assert.equal((await call('GET', '/afc-forms/capabilities')).jsonBody.upload, true);
  assert.equal((await call('GET', '/afc-requests/write-capabilities', undefined, 'uid-owner')).jsonBody.writeCapabilities.sessionCreate, true);
  assert.equal((await call('POST', '/reports/query', {})).status, 400, 'reports reach normal validation');

  const id = store.tables.sessions[0].id;
  const auditCount = store.tables.history.length;
  for (const [method, path] of [
    ['POST', '/sessions'], ['POST', '/sessions/batch'], ['PATCH', '/sessions/' + id],
    ['PATCH', '/sessions/' + id + '/assignments'], ['POST', '/calendar-activity-imports'],
    ['POST', '/ccc-replacements'], ['POST', '/scheduling-tasks/' + 'a'.repeat(64) + '/review'],
    ['POST', '/teaching-assignments/packages/' + id + '/finalization'],
    ['POST', '/teaching-assignments/publications'], ['POST', '/swaps'],
    ['PUT', '/swaps/' + id], ['POST', '/swaps/' + id + '/withdraw'],
    ['POST', '/swaps/' + id + '/decisions'], ['GET', '/swaps/faculty-preview'],
    ['POST', '/schedule-workflow/publish-office-bulk'], ['POST', '/doe/workflow-preview'],
    ['PATCH', '/dashboard/faculty/' + id], ['POST', '/dashboard/afc-records/batch'],
    ['POST', '/afc-requests/' + id + '/dates'], ['POST', '/dashboard/afc-records/' + id + '/cancel']
  ]) {
    const result = await call(method, path, method === 'GET' ? undefined : { overrideReason: 'Testing override' });
    assert.equal(result.status, 403, method + ' ' + path);
    assert.equal(result.jsonBody.error.code, 'ROLE_DENIED', path);
  }
  assert.equal(store.tables.history.length, auditCount);
});

test('Testing Administrator may recommend or reject a designated AFC request only at its Reports To stage', async () => {
  for (const action of ['recommend', 'reject']) {
    const { call, store, signature } = setup();
    const { jsonBody } = await call('GET', '/afc-requests');
    const pending = jsonBody.afcRequests.filter(row => row.status === 'pending_report_to');
    const assigned = pending.find(row => row.reportToFirebaseUid === 'uid-admin');
    const other = pending.find(row => row.reportToFirebaseUid !== 'uid-admin');
    const final = jsonBody.afcRequests.find(row => row.status === 'pending_admin');
    assert.ok(assigned && other && final);
    const actor = { uid: 'uid-admin', role: 'administrator', designatedOnly: true };
    assert.equal(requestActions(assigned, actor).canRecommend, true);
    assert.equal(requestActions(other, actor).canReject, false);
    assert.equal(requestActions(final, actor).canApprove, false);

    const request = (row, operation) => call('POST', '/afc-requests/' + row.afcRequestId + '/' + operation, {
      signature, ...(operation === 'reject' ? { rejectionReason: 'Synthetic review' } : {})
    });
    assert.equal((await request(other, action)).status, 403);
    assert.equal((await request(final, 'reject')).status, 403);
    assert.equal((await request(final, 'approve')).status, 403);
    const result = await request(assigned, action);
    assert.equal(result.status, 200, JSON.stringify(result.jsonBody));
    const stored = store.tables.extra.afcRequests.find(row => row.afcRequestId === assigned.afcRequestId);
    assert.equal(stored.approvals.at(-1).stage, 'report_to');
    assert.equal(stored.approvals.at(-1).approverFirebaseUid, 'uid-admin');
    assert.notEqual(stored.approvals.at(-1).signedOnBehalf, true);
    assert.equal((await request(assigned, action)).status, 409, 'the stage has moved on');
  }
});

test('Testing Administrator can upload an original PDF and attach it to a single AFC entry', async () => {
  const { call, store } = setup();
  const facultyId = store.tables.faculty[0].facultyId;
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const fileBase64 = Buffer.from(await pdf.save()).toString('base64');
  const upload = await call('POST', '/afc-forms', {
    requestId: randomUUID(), facultyId, fileName: 'test-afc.pdf',
    contentType: 'application/pdf', fileBase64
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.jsonBody));
  const documentId = upload.jsonBody.document.documentId;
  const entry = { facultyId, startDate: '2027-01-28', endDate: '2027-01-29', reasonCode: 'vacation', documentId };
  const record = await call('POST', '/dashboard/afc-records', entry);
  assert.equal(record.status, 201, JSON.stringify(record.jsonBody));
  assert.equal((await call('GET', '/afc-forms/' + documentId + '/document')).status, 200);
  assert.equal((await call('POST', '/dashboard/afc-records', {
    ...entry, reasonCode: 'special', availability: 'available'
  })).status, 403);
});
