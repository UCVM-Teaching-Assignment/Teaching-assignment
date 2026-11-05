'use strict';
// "Reset demo data" must clear both demo stores: accounts/sign-in data and the
// PAWS tables (sessions, AFC, SWAP, DOE...). UCVM_PAGES_DEMO is frozen, so the
// PAWS reset is called from its reset() instead of being patched in later.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStore, STORAGE_KEY } = require('../tools/pages-demo-api/store.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('UCVM_PAGES_DEMO.reset also resets the PAWS demo data', () => {
  const runtime = read('tools/pages-demo-runtime.js');
  assert.match(runtime, /reset:\(\)=>\{try\{root\.UCVM_PAWS_DEMO_API\?\.reset\?\.\(\)\}catch\(error\)\{[^}]*\}return runtime\.reset\(\)\}/);
});

test('the PAWS API no longer tries to patch the frozen demo object', () => {
  const browser = read('tools/pages-demo-api/browser.js');
  assert.doesNotMatch(browser, /defineProperty\(demo, 'reset'/);
  assert.match(browser, /UCVM_PAWS_DEMO_API = Object\.freeze\(\{ store, reset: \(\) => store\.reset\(\)/);
});

test('a PAWS store reset removes saved changes from browser storage', () => {
  const map = new Map();
  const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
  const store = createStore({ storage });
  store.tables.sessions.push({ id: 'reset-test', topic: 'RESETTEST', assignments: [] });
  store.commit();
  assert.ok(map.get(STORAGE_KEY).includes('RESETTEST'));
  store.reset();
  assert.equal(map.has(STORAGE_KEY), false);
  assert.ok(!createStore({ storage }).tables.sessions.some(s => s.topic === 'RESETTEST'));
});
