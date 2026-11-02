'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../frontend/scripts/schedule-bulk-ui.js');
const fields={topic:{label:'Session title',todoOwner:'adc'},room:{label:'Room number',todoOwner:'adfa'}};
test('ADFAD work with missing room must open the details editor before faculty confirmation',()=>{
 assert.equal(ui.taskActionFor({stage:'adfa',missing:['Room number','Assign faculty (no suggestion)']},fields),'details');
});
test('ADFAD work with only missing faculty routes to the assignment editor',()=>{
 assert.equal(ui.taskActionFor({stage:'adfa',missing:['Assign faculty (no suggestion)']},fields),'faculty');
});
test('ADC missing title and room opens details and never faculty assignment',()=>{
 assert.equal(ui.taskActionFor({stage:'adc',missing:['Session title','Room number']},fields),'details');
});
test('Developer role may edit rule versions while ADC role cannot',()=>{
 assert.equal(ui.roleAllowed('developer','rules'),true);
 assert.equal(ui.roleAllowed('adc','rules'),false);
});
test('unknown Faculty names fail preview mapping rather than silently dropping suggested instructors',()=>{
 assert.throws(()=>ui.mapFacultySuggestions([{courseNumber:'VTMD 304',suggestedFaculty:'Unknown Person'}],[{facultyId:'f1',name:'Known Person'}]),/Row 2/);
 assert.deepEqual(ui.mapFacultySuggestions([{suggestedFaculty:'Known Person; f1'}],[{facultyId:'f1',name:'Known Person'}]),[{suggestedFacultyIds:['f1']}]);
});

test('two Faculty with identical display names require a unique Faculty ID',()=>{
 assert.throws(()=>ui.mapFacultySuggestions([{suggestedFaculty:'Alex Smith'}],[{facultyId:'f1',name:'Alex Smith'},{facultyId:'f2',name:'Alex Smith'}]),/ambiguous/i);
 assert.deepEqual(ui.mapFacultySuggestions([{suggestedFaculty:'f2'}],[{facultyId:'f1',name:'Alex Smith'},{facultyId:'f2',name:'Alex Smith'}]),[{suggestedFacultyIds:['f2']}]);
});
