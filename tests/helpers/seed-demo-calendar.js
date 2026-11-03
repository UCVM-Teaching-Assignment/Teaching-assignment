'use strict';
// Explicit test-only fixture. The PAWS Testing site itself starts with zero
// Calendar Sessions; workflow/availability regression tests opt into the
// historic synthetic timetable when exercising existing assigned teaching.
const {sessionRows}=require('../../tools/pages-demo-api/dataset');
function seedDemoCalendar(store){
  if(!store?.tables?.courses||!store.tables.faculty||!Array.isArray(store.tables.sessions))
    throw Error('A PAWS synthetic Demo store is required');
  if(store.tables.sessions.length)throw Error('Only seed an empty test fixture store');
  store.tables.sessions.push(...sessionRows(store.tables.courses,store.tables.faculty));
  return store;
}
module.exports={seedDemoCalendar};
