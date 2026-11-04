'use strict';
// UX-05: an account saved in User Management keeps its faculty link, shows a
// message when the form cannot be saved, and the saved role/status is what the
// PAWS API reads back after a refresh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createUserRepository } = require('../tools/pages-demo-api/repos/core.js');

const faculty = [{ facultyId: 'uuid-1', legacyId: 'fac-001', ucid: '30001001', active: true }, { facultyId: 'uuid-2', legacyId: 'fac-002', ucid: '30001002', active: true }];
const store = overlay => ({
  now: () => new Date('2026-11-04T12:00:00Z'),
  tables: { faculty, users: [{ firebaseUid: 'uid-fac-001', email: 'a@example.test', displayName: 'Avery', baseRole: 'faculty', facultyId: 'uuid-1', active: true, mustChangePassword: false }] },
  accountOverlay: overlay
});

test('without a saved account the API row is unchanged', async () => {
  const user = await createUserRepository(store(() => null)).findByUid('uid-fac-001');
  assert.equal(user.baseRole, 'faculty');
  assert.equal(user.active, true);
});

test('saved role, status, name and email are read back', async () => {
  const saved = { role: 'hicc', active: false, mustChangePassword: true, name: 'Avery L', email: 'Avery.L@Example.test', facultyId: 'fac-001' };
  const user = await createUserRepository(store(() => saved)).findByUid('uid-fac-001');
  assert.equal(user.baseRole, 'hicc');
  assert.equal(user.active, false);
  assert.equal(user.mustChangePassword, true);
  assert.equal(user.displayName, 'Avery L');
  assert.equal(user.email, 'avery.l@example.test');
  assert.equal(user.facultyId, 'uuid-1');
});

test('a changed faculty link resolves by legacy key or UCID', async () => {
  for (const id of ['fac-002', '30001002', 'uuid-2']) {
    const user = await createUserRepository(store(() => ({ role: 'faculty', active: true, facultyId: id }))).findByUid('uid-fac-001');
    assert.equal(user.facultyId, 'uuid-2', id);
  }
  const cleared = await createUserRepository(store(() => ({ role: 'owner', active: true, facultyId: '' }))).findByUid('uid-fac-001');
  assert.equal(cleared.facultyId, null);
});

test('an inactive faculty record still blocks a saved active account', async () => {
  const s = store(() => ({ role: 'faculty', active: true }));
  s.tables.faculty = [{ ...faculty[0], active: false, endDate: '2020-01-01' }];
  const user = await createUserRepository(s).findByUid('uid-fac-001');
  assert.equal(user.active, false);
});

test('User Management matches the faculty record by id, legacy key, UCID or email', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/scripts/user-management.js'), 'utf8');
  assert.match(source, /function facultyForUser\(user\)/);
  assert.match(source, /\$\('account-faculty'\)\.value=facultyForUser\(user\)\?\.id\|\|''/);
  assert.match(source, /addEventListener\('invalid'/);
  assert.match(source, /delete base\.ucid/);
});

test('the browser demo API reads the saved account from the demo Firestore', () => {
  const browser = fs.readFileSync(path.join(__dirname, '../tools/pages-demo-api/browser.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(__dirname, '../tools/pages-demo-runtime.js'), 'utf8');
  assert.match(browser, /store\.accountOverlay\s*=/);
  assert.match(runtime, /account:uid=>runtime\.store\.read\(`users\/\$\{uid\}`\)/);
});
