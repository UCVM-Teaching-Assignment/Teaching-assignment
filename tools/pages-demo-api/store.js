'use strict';
// In-memory PAWS tables for the Frontend Demo, persisted to the tester's own
// browser (localStorage) so edits survive a reload. "Reset demo data" clears it.
const base = require('./dataset.js');
const more = require('./dataset-more.js');

const STORAGE_KEY = 'ucvm-pages-demo-paws-v1';
// Old releases preloaded generated teaching sessions. Only exact, pristine starter
// records may be cleaned. A staff edit can retain the original deterministic ID;
// matching that ID alone is NOT evidence that a row is safe to delete.
let pristineStarterById = null;
function stripLegacyCalendarStarters(tables){
  if(!tables||!Array.isArray(tables.sessions)||tables.sessions.length===0)return false;
  if(!pristineStarterById){
    const faculty=base.facultyRows(),courses=base.courseRows();
    pristineStarterById=new Map(base.sessionRows(courses,faculty).map(row=>[String(row.id),JSON.stringify(row)]));
  }
  const before=tables.sessions.length;
  tables.sessions=tables.sessions.filter(row=>{
    const pristine=pristineStarterById.get(String(row?.id||''));
    return pristine===undefined||JSON.stringify(row)!==pristine;
  });
  return before!==tables.sessions.length;
}

// The 1,937 teaching and 413 CCC synthetic records are DETERMINISTIC test
// fixtures, not unique user data. Persisting all their verbose payloads in
// localStorage can exceed a browser's per-origin quota (especially when a
// previous Testing release also stored documents). Persist a compact seed
// marker plus ONLY edits/deletions to synthetic rows. Other user-created rows,
// workspace state, approvals, histories and edits remain verbatim.
const FIXTURE='beta-density-synthetic-v1';
const PACK_KEY='testingDemoPackedFixture';
const clone=value=>JSON.parse(JSON.stringify(value));
const synthetic=row=>row?.syntheticFixture===FIXTURE;
const rowKey=(row,type)=>String(type==='sessions'?row.id:row.activityId);
function generateFixture(tables){require('./dense-fixture.js').applyDenseFixture(tables);return tables;}
function packTestingTables(tables){
  if(tables?.extra?.testingDemoFixtureVersion!==FIXTURE)return tables;
  const base=clone(tables);
  base.sessions=base.sessions.filter(row=>!synthetic(row));
  base.activities=base.activities.filter(row=>!synthetic(row));
  delete base.extra[PACK_KEY];
  const generated=generateFixture(clone(base));
  const differences=(field)=>{
    const baseline=new Map(generated[field].filter(synthetic).map(row=>[rowKey(row,field),row]));
    const current=new Map(tables[field].filter(synthetic).map(row=>[rowKey(row,field),row]));
    return {
      edits:[...current].filter(([id,row])=>!baseline.has(id)||JSON.stringify(row)!==JSON.stringify(baseline.get(id))).map(([,row])=>row),
      deleted:[...baseline.keys()].filter(id=>!current.has(id))
    };
  };
  base.extra[PACK_KEY]={version:1,sessions:differences('sessions'),activities:differences('activities')};
  return base;
}
function unpackTestingTables(saved){
  const patch=saved?.extra?.[PACK_KEY];
  if(!patch)return saved;
  if(patch.version!==1)throw Error('Unknown synthetic fixture storage version.');
  const tables=clone(saved);
  delete tables.extra[PACK_KEY];
  generateFixture(tables);
  for(const field of ['sessions','activities']){
    const diff=patch[field]||{};
    const deleted=new Set(diff.deleted||[]);
    const edited=new Map((diff.edits||[]).map(row=>[rowKey(row,field),row]));
    const found=new Set();
    tables[field]=tables[field].filter(row=>!synthetic(row)||!deleted.has(rowKey(row,field))).map(row=>{
      const id=rowKey(row,field);
      if(synthetic(row)&&edited.has(id)){found.add(id);return edited.get(id);}
      return row;
    });
    for(const [id,row] of edited)if(!found.has(id)&&!deleted.has(id))tables[field].push(row);
  }
  tables.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.startTime||'').localeCompare(String(b.startTime||'')));
  return tables;
}
function seedTestingFixtureOnce(current){
  if(current.extra?.testingDemoFixtureVersion===FIXTURE||current.extra?.testingDemoFixtureDisabled===true)return current;
  const candidate=clone(current);
  if(!candidate.extra||typeof candidate.extra!=='object')candidate.extra={};
  generateFixture(candidate);
  candidate.extra.testingDemoFixtureVersion=FIXTURE;
  return candidate;
}

function buildTables(legacyUsers = []) {
  const faculty = base.facultyRows();
  const courses = base.courseRows();
  // Empty by default. ADC Schedule Workflow / Bulk Import is the only
  // initial creator of Calendar Sessions in the Frontend Demo.
  const sessions = [];
  const roles = more.roleRows(courses, faculty);
  return {
    version: 1,
    academicYear: base.ACADEMIC_YEAR,
    faculty,
    users: base.userRows(faculty),
    courses,
    sessions,
    roles,
    afcRecords: more.afcRows(faculty),
    activities: more.activityRows(roles, faculty),
    targets: more.targetRows(faculty),
    history: [],
    extra: {}
  };
}

function createStore({ storage = null, legacyUsers = [], now = () => new Date(), autoLoadFixture = false } = {}) {
  let tables = null, persistenceError = '';
  const persist = value => {
    if(!storage)return true;
    try{
      storage.setItem(STORAGE_KEY,JSON.stringify(packTestingTables(value)));
      persistenceError='';
      return true;
    }catch(error){
      persistenceError=String(error?.message||error);
      return false;
    }
  };
  const load = () => {
    if (tables) return tables;
    try {
      const saved = storage && storage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.version === 1) {
          tables = unpackTestingTables(parsed);
          if (stripLegacyCalendarStarters(tables)) persist(tables);
        }
      }
    } catch (error) {
      // Preserve any retrievable original rows instead of replacing an
      // unrecognized user store with an empty fresh demo.
      persistenceError='Could not read stored Testing data: '+String(error?.message||error);
      console.warn('[PAWS Testing] Stored data requires review; refusing automatic replacement.',persistenceError);
      throw error;
    }
    if (!tables) tables = buildTables(legacyUsers);
    if(autoLoadFixture){
      try{
        const seeded=seedTestingFixtureOnce(tables);
        if(seeded!==tables){
          // Keep the generated rows available in memory even if the browser
          // rejects persistence. Never silently present an empty timetable.
          tables=seeded;
          if(!persist(tables))console.warn('[PAWS Testing] Synthetic timetable is visible but browser storage is full.',persistenceError);
        }
      }catch(error){
        console.warn('[PAWS Testing] Synthetic fixture generation failed; original data retained.',error?.message||error);
        persistenceError=String(error?.message||error);
      }
    }
    return tables;
  };
  const save = () => {
    if(!persist(tables))throw Object.assign(new Error('Browser storage is full. Your latest Testing edit is not saved. Export/back up existing test data before closing this tab.'),{code:'DEMO_STORAGE_UNAVAILABLE'});
  };
  return {
    get tables() { return load(); },
    densityStatus(){
      const t=load();
      return {
        totalSessions:t.sessions.filter(row=>row.academicYear==='2026-27').length,
        syntheticSessions:t.sessions.filter(row=>row.syntheticFixture===FIXTURE).length,
        syntheticCCC:t.activities.filter(row=>row.category==='ccc'&&row.syntheticFixture===FIXTURE).length,
        storageOk:!persistenceError,
        storageError:persistenceError
      };
    },
    now,
    nowIso: () => now().toISOString(),
    commit: save,
    reset() { tables = null; try { storage && storage.removeItem(STORAGE_KEY); } catch (_) {} },
    // Records a change in the shared history used by Change History / Dashboard History.
    audit(entry) {
      const t = load();
      t.history.unshift({ changeId: `chg-${t.history.length + 1}-${Date.now().toString(36)}`, changedAtUtc: now().toISOString(), ...entry });
    },
    // Lazily created bag for areas that keep extra state (SWAP, TA packages, …).
    bag(name, init) { const t = load(); if (!t.extra[name]) t.extra[name] = init(); return t.extra[name]; }
  };
}

module.exports = { createStore, buildTables, STORAGE_KEY, stripLegacyCalendarStarters };
