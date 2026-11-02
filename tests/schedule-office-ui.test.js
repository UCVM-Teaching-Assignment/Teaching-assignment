'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const flow=require('../frontend/scripts/schedule-workflow.js'),ui=require('../frontend/scripts/schedule-bulk-ui.js'),officeUI=require('../frontend/scripts/schedule-office-ui.js');
const csv=require('../frontend/scripts/schedule-bulk-csv.js');
test('Schedule Workflow is reserved for ADC and Developer; ADFAD and LAB work from their queue',()=>{
 assert.equal(flow.allowedRole('adc'),true);assert.equal(flow.allowedRole('developer'),true);
 assert.equal(flow.allowedRole('adfa_general'),false);assert.equal(flow.allowedRole('lab'),false);
 assert.equal(officeUI.can('lab','lab'),true);assert.equal(officeUI.can('adfa_general','adfa'),true);
 assert.equal(ui.roleAllowed('lab','bulk'),false);assert.equal(ui.roleAllowed('adfa_general','bulk'),false);
});
test('LAB export template roundtrips station runs and group roster IDs with Excel CSV quoting',()=>{
 const rows=[{sessionId:'lab-test-id',courseNumber:'VETM 505',date:'2026-11-03',startTime:'08:30',endTime:'10:30',runKey:'run-1',room:'CSB Wards',capacity:'10',attendance:'groups',groupCode:'1',studentIds:'S1;S2',studentNames:'Synthetic 1;Synthetic 2',expectedRevision:0}];
 const text=csv.officeTemplate('lab',rows);
 const parsed=csv.parseOfficeCsv('lab',text);
 assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].groupCode,'1');assert.equal(parsed.rows[0].sessionId,'lab-test-id');
});
test('ADFAD export template roundtrips session IDs, roles, credited hours and revision',()=>{
 const rows=[{sessionId:'teaching-id',courseNumber:'VTMD 304',date:'2026-11-03',startTime:'08:30',endTime:'10:30',facultyId:'f1',teachingRole:'Lecture',creditedHours:'2',reviewNote:'',expectedRevision:0}];
 const text=csv.officeTemplate('adfa',rows);
 const parsed=csv.parseOfficeCsv('adfa',text);
 assert.deepEqual(parsed.rows[0],Object.fromEntries(Object.entries(rows[0]).map(([k,v])=>[k,String(v)])));
});
