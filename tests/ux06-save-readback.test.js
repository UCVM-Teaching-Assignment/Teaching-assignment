'use strict';
// UX-06: success messages must match saved data. Every successful Demo write is
// committed to browser storage, and the Calendar's Demo session count refreshes
// after a saved change instead of waiting for a reload.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createStore, STORAGE_KEY } = require('../tools/pages-demo-api/store.js');
const { createDemoRuntime } = require('../tools/pages-demo-api/runtime.js');

const memoryStorage = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const call = (route, uid, method, url, body) => route(new Request('https://pages-demo.invalid' + url, { method, headers: { authorization: 'Bearer demo-token-' + uid, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));

test('a saved session survives a reload of the Demo store', async () => {
  const storage = memoryStorage();
  const store = createStore({ storage });
  const route = createDemoRuntime(store);
  const created = await call(route, 'uid-owner', 'POST', '/api/v1/sessions', { academicYear: '2026-27', curriculumYear: '1', courseCode: 'VTMD 200', sessionType: 'LEC', date: '2026-11-05', startTime: '09:00', endTime: '10:00', topic: 'UX06 readback', room: 'R1', assignments: [] });
  assert.ok(created.status < 300, 'create status ' + created.status);
  assert.ok(storage.getItem(STORAGE_KEY), 'Demo data was written to storage');
  const reloaded = createStore({ storage });
  assert.ok(reloaded.tables.sessions.some(s => s.topic === 'UX06 readback'), 'session is still there after reload');
});

test('the browser Demo API announces saved changes', () => {
  const browser = fs.readFileSync(path.join(__dirname, '../tools/pages-demo-api/browser.js'), 'utf8');
  assert.match(browser, /new root\.CustomEvent\('paws-demo-data-changed'/);
  assert.match(browser, /Number\(result && result\.status\) < 400/);
});

test('the Demo session count refreshes after saved changes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/scripts/testing-only-features.js'), 'utf8');
  assert.match(source, /addEventListener\('paws-demo-data-changed', updateDensityStatus\)/);
  assert.match(source, /addEventListener\('ucvm:sessions-updated', updateDensityStatus\)/);
});
