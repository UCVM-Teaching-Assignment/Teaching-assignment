'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTables } = require('../tools/pages-demo-api/store.js');
const { applyDenseFixture, COURSE_TARGET, CCC_TARGET, CCC_LOCUM_TARGET, WEEKS, weekOf } = require('../tools/pages-demo-api/dense-fixture.js');
const { sessionRows } = require('../tools/pages-demo-api/dataset.js');
const { createCccScheduleRepository } = require('../tools/pages-demo-api/repos/calendar.js');

function countByWeek(tables, termName, week) {
  return tables.sessions.filter(row => row.academicYear === '2026-27'
    && weekOf(row.date)?.term.term === termName && weekOf(row.date)?.week === week).length;
}

test('Beta-density fixture matches synthetic weekly profile and preserves current seeded sessions', () => {
  const t = buildTables();
  const beforeSessions = t.sessions.map(row => row.id);
  const originalCount = t.sessions.length;
  const beforeCCC = t.activities.filter(row => row.category === 'ccc').length;
  const result = applyDenseFixture(t);
  assert.equal(result.expectedSessions, COURSE_TARGET);
  assert.equal(COURSE_TARGET, 1937);
  assert.equal(CCC_TARGET, 413);
  assert.equal(result.totalSessions, 1937);
  assert.equal(result.totalCCC, CCC_TARGET);
  assert.equal(result.addedSessions, 1937 - originalCount);
  assert.equal(result.addedCCC, CCC_TARGET - beforeCCC);
  for (const id of beforeSessions) assert.ok(t.sessions.some(row => row.id === id), 'Existing session must be preserved');
  for (const term of WEEKS) term.counts.forEach((expected, week) => {
    assert.equal(countByWeek(t, term.term, week), expected, term.term + ' W' + (week + 1));
  });
  assert.equal(countByWeek(t, 'fall', 0), 77);
  assert.equal(countByWeek(t, 'fall', 4), 69);
  assert.equal(countByWeek(t, 'fall', 5), 79);
  assert.equal(countByWeek(t, 'spring', 3), 17);
  // Beta's historical grid/check-needed partition anchors, using missing
  // source times as the synthetic, explicitly reviewable example.
  for (const [term, week, checkNeeded] of [['fall', 0, 25], ['fall', 4, 9], ['fall', 5, 19], ['spring', 3, 7]]) {
    const actual = t.sessions.filter(row => row.academicYear === '2026-27'
      && weekOf(row.date)?.term.term === term && weekOf(row.date)?.week === week
      && (!row.startTime || !row.endTime)).length;
    assert.equal(actual, checkNeeded, term + ' W' + (week + 1) + ' check needed');
  }
  const kinds = new Set(t.sessions.map(row => row.sessionType));
  for (const kind of ['LEC', 'LAB', 'SRL', 'Exam', 'OSCE']) assert.ok(kinds.has(kind), kind + ' coverage');
  const ccc = t.activities.filter(row => row.category === 'ccc');
  assert.equal(ccc.filter(row => row.staffingKind === 'unassigned' || row.facultyDisplayName === 'Locum').length, CCC_LOCUM_TARGET);
  assert.ok(ccc.every(row => row.academicYear === '2026-27'));
  assert.ok(ccc.every(row => row.timeEvidence?.every(e => e.startTime >= '08:30' && e.endTime <= '16:30')));
  assert.ok(ccc.some(row => row.syntheticFixture), 'Additional CCC staffing slots exist');
  const unknown = t.sessions.filter(row => row.syntheticFixture && !row.startTime);
  assert.ok(unknown.length > 0, 'Check Needed example must exist');
  assert.ok(unknown.every(row => row.assignments.every(a => a.creditedHours === null && a.doeCredit === null)));
  assert.ok(t.sessions.filter(row => row.syntheticFixture).every(row => row.assignments.every(a => a.facultyId && a.sessionAssignmentId)));
});

test('fixture is idempotent and does not overwrite manually edited sessions or CCC activities', () => {
  const t = buildTables();
  if (!t.sessions.length) t.sessions.push(...sessionRows(t.courses, t.faculty).slice(0, 2)); // PR #107 starts empty
  const original = t.sessions[0];
  const edit = { ...original, topic: 'Staff-edited test topic', room: 'Staff test room' };
  t.sessions[0] = edit;
  const ccc = t.activities.find(row => row.category === 'ccc');
  ccc.label = 'Staff-edited CCC note';
  applyDenseFixture(t);
  const snapshot = { sessions: t.sessions.length, ccc: t.activities.length };
  const second = applyDenseFixture(t);
  assert.equal(second.addedSessions, 0);
  assert.equal(second.addedCCC, 0);
  assert.equal(t.sessions.length, snapshot.sessions);
  assert.equal(t.activities.length, snapshot.ccc);
  assert.equal(t.sessions.find(row => row.id === edit.id).topic, edit.topic);
  assert.equal(t.sessions.find(row => row.id === edit.id).room, edit.room);
  assert.equal(t.activities.find(row => row.activityId === ccc.activityId).label, ccc.label);
});

test('CCC schedule API receives Beta-shaped half-day rows and full synthetic coverage', async () => {
  const t = buildTables();
  applyDenseFixture(t);
  const result = await createCccScheduleRepository({ tables: t }).list({ academicYear: '2026-27' });
  assert.equal(result.entries.length, CCC_TARGET);
  assert.ok(result.entries.every(row => row.date && row.endDate && row.blockLabel && row.courseCode === 'CCC' && typeof row.facultyName === 'string' && typeof row.halfDay === 'boolean'));
  assert.ok(result.entries.some(row => row.halfDay === true));
  assert.ok(result.entries.some(row => row.halfDay === false), 'Full-day CCC rotation example expected');
});

test('empty calendar baseline from PR #107 can load complete dense fixture', () => {
  const t = buildTables();
  t.sessions = [];
  t.activities = t.activities.filter(row => row.category !== 'ccc');
  const result = applyDenseFixture(t);
  assert.equal(result.addedSessions, COURSE_TARGET);
  assert.equal(result.addedCCC, CCC_TARGET);
  assert.equal(result.totalSessions, COURSE_TARGET);
  assert.equal(result.totalCCC, CCC_TARGET);
  assert.equal(t.sessions.filter(row => row.syntheticFixture).length, COURSE_TARGET);
});
test('browser-demo store persists dense fixture through reload and a second load is idempotent',()=>{
  const { createStore, STORAGE_KEY } = require('../tools/pages-demo-api/store.js');
  const { createTestingOnly } = require('../tools/pages-demo-api/testing-only.js');
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,val)=>values.set(key,val),removeItem:key=>values.delete(key)};
  const original=createStore({storage});
  assert.equal(original.tables.sessions.length,0,'PR #107 requires an empty Calendar until user loads data');
  const outcome=createTestingOnly(original).loadDenseCalendar('uid-developer');
  assert.equal(outcome.totalSessions,COURSE_TARGET);
  assert.equal(outcome.totalCCC,CCC_TARGET);
  const serialized=values.get(STORAGE_KEY);
  assert.equal(typeof serialized,'string','test data must persist to localStorage');
  assert.ok(serialized.length<4500000,'fixture should fit within common browser localStorage limits');
  const reloaded=createStore({storage});
  assert.equal(reloaded.tables.sessions.length,COURSE_TARGET);
  assert.equal(reloaded.tables.activities.filter(a=>a.category==='ccc').length,CCC_TARGET);
  const repeat=createTestingOnly(reloaded).loadDenseCalendar('uid-developer');
  assert.equal(repeat.addedSessions,0);
  assert.equal(repeat.addedCCC,0);
  assert.equal(reloaded.tables.sessions.length,COURSE_TARGET);
  assert.equal(reloaded.tables.activities.filter(a=>a.category==='ccc').length,CCC_TARGET);
});

test('dense fixture Week 1 matches the actual Calendar semester dates and stays within the academic year',()=>{
  const t=buildTables();applyDenseFixture(t);
  const spring=WEEKS.find(x=>x.term==='spring'),winter=WEEKS.find(x=>x.term==='winter');
  assert.equal(spring.start,'2026-04-27');
  assert.equal(winter.start,'2027-01-04');
  assert.ok(t.sessions.every(x=>x.date>='2026-05-01'&&x.date<='2027-04-30'));
  assert.equal(t.sessions.filter(x=>x.date>='2027-01-04'&&x.date<='2027-01-08').length,37);
});

test('compact synthetic fixture persists 1,937 teaching sessions without storing thousands of duplicated rows',()=>{
  const {createStore,STORAGE_KEY}=require('../tools/pages-demo-api/store.js');
  const records=new Map(),storage={getItem:key=>records.get(key)||null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)};
  const store=createStore({storage,autoLoadFixture:true});
  assert.equal(store.tables.sessions.filter(s=>s.academicYear==='2026-27').length,1937);
  const persisted=JSON.parse(records.get(STORAGE_KEY));
  assert.ok(persisted.sessions.length<50,'Deterministic synthetic rows should not be repeated in localStorage');
  assert.equal(persisted.extra.testingDemoPackedFixture.version,1);
  assert.ok(records.get(STORAGE_KEY).length<1000000,'Compact browser data must fit substantially below typical storage quota');
  const recovered=createStore({storage,autoLoadFixture:true});
  assert.equal(recovered.tables.sessions.length,1937);
  assert.equal(recovered.tables.activities.filter(row=>row.category==='ccc').length,413);
  assert.equal(recovered.densityStatus().storageOk,true);
});

test('synthetic Session edits, removals, CCC edits and real user-created rows survive compact reload',()=>{
  const {createStore}=require('../tools/pages-demo-api/store.js');
  const records=new Map(),storage={getItem:key=>records.get(key)||null,setItem:(key,val)=>records.set(key,val),removeItem:key=>records.delete(key)};
  const store=createStore({storage,autoLoadFixture:true});
  const session=store.tables.sessions.find(row=>row.syntheticFixture==='beta-density-synthetic-v1');
  const ccc=store.tables.activities.find(row=>row.syntheticFixture==='beta-density-synthetic-v1'&&row.category==='ccc');
  assert.ok(session&&ccc);
  session.topic='Manually edited [Synthetic] topic';ccc.label='Manually edited CCC';
  const removed=store.tables.sessions.find(row=>row.syntheticFixture==='beta-density-synthetic-v1'&&row.id!==session.id);
  store.tables.sessions=store.tables.sessions.filter(row=>row.id!==removed.id);
  store.tables.sessions.push({id:'manual-course-session',academicYear:'2026-27',curriculumYear:'2',courseCode:'VTMD 304',date:'2026-11-03',startTime:'08:30',endTime:'09:30',sessionType:'LEC',assignments:[],topic:'Own import',room:'Demo Room'});
  store.commit();
  const again=createStore({storage,autoLoadFixture:true}).tables;
  assert.equal(again.sessions.find(row=>row.id===session.id).topic,'Manually edited [Synthetic] topic');
  assert.equal(again.activities.find(row=>row.activityId===ccc.activityId).label,'Manually edited CCC');
  assert.ok(!again.sessions.some(row=>row.id===removed.id),'Explicitly removed synthetic row must remain removed');
  assert.ok(again.sessions.some(row=>row.id==='manual-course-session'&&row.topic==='Own import'));
});

test('strict localStorage quota accepts packed fixture where full payload is too large',()=>{
  const {createStore,STORAGE_KEY}=require('../tools/pages-demo-api/store.js');
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,val)=>{
    if(val.length>1000000)throw Error('QuotaExceededError');
    data.set(key,val);
  },removeItem:key=>data.delete(key)};
  const initial=createStore({storage,autoLoadFixture:true});
  assert.equal(initial.tables.sessions.length,1937);
  assert.equal(initial.densityStatus().storageOk,true);
  assert.ok(data.get(STORAGE_KEY).length<1000000);
  const again=createStore({storage,autoLoadFixture:true});
  assert.equal(again.tables.sessions.length,1937);
});

test('manually loading test data also writes compact fixture and survives page reload',()=>{
  const {createStore,STORAGE_KEY}=require('../tools/pages-demo-api/store.js');
  const {createTestingOnly}=require('../tools/pages-demo-api/testing-only.js');
  const m=new Map(),storage={getItem:key=>m.get(key)||null,setItem:(key,val)=>m.set(key,val),removeItem:key=>m.delete(key)};
  const store=createStore({storage});
  assert.equal(store.tables.sessions.length,0);
  assert.equal(createTestingOnly(store).loadDenseCalendar().totalSessions,1937);
  assert.ok(JSON.parse(m.get(STORAGE_KEY)).extra.testingDemoPackedFixture);
  assert.equal(createStore({storage}).tables.sessions.length,1937);
});
