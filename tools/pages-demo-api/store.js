'use strict';
// In-memory PAWS tables for the Frontend Demo, persisted to the tester's own
// browser (localStorage) so edits survive a reload. "Reset demo data" clears it.
const base = require('./dataset.js');
const more = require('./dataset-more.js');

const STORAGE_KEY = 'ucvm-pages-demo-paws-v1';
// Prior Demo versions preloaded generated calendar sessions. Remove ONLY those
// deterministic starter IDs; never discard a real user-created browser-local
// ADC draft/import, LAB publication, Faculty assignment or unrelated history.
let knownStarterIds = null;
function stripLegacyCalendarStarters(tables){
  if(!tables||!Array.isArray(tables.sessions)||tables.sessions.length===0)return false;
  if(!knownStarterIds){
    const faculty=base.facultyRows(),courses=base.courseRows();
    knownStarterIds=new Set(base.sessionRows(courses,faculty).map(row=>String(row.id)));
  }
  const before=tables.sessions.length;
  tables.sessions=tables.sessions.filter(row=>!knownStarterIds.has(String(row?.id||'')));
  return before!==tables.sessions.length;
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

function createStore({ storage = null, legacyUsers = [], now = () => new Date() } = {}) {
  let tables = null;
  const load = () => {
    if (tables) return tables;
    try {
      const saved = storage && storage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.version === 1) {
          tables = parsed;
          if (stripLegacyCalendarStarters(tables)) {
            try { storage.setItem(STORAGE_KEY,JSON.stringify(tables)); } catch (_) { /* retain in memory */ }
          }
        }
      }
    } catch (_) { tables = null; }
    if (!tables) tables = buildTables(legacyUsers);
    return tables;
  };
  const save = () => { try { storage && storage.setItem(STORAGE_KEY, JSON.stringify(tables)); } catch (_) { /* quota: keep in memory only */ } };
  return {
    get tables() { return load(); },
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
