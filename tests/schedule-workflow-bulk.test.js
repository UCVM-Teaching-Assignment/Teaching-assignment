'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createScheduleWorkflow}=require('../tools/pages-demo-api/schedule-workflow.js');
function fixture(){
 const tables={academicYear:'2026-27',courses:[{courseCode:'VTMD 304',courseName:'Anatomy',curriculumYear:2},{courseCode:'VETM 505',courseName:'Clinical Skills III',curriculumYear:3}],
 faculty:[{facultyId:'f1',displayName:'Synthetic Teacher One',active:true,appointmentValid:true}],
 users:['adc','adfa','developer','owner','lab','faculty'].map(x=>({firebaseUid:x,baseRole:x==='adfa'?'adfa_general':x,active:true,mustChangePassword:false})),
 sessions:[],history:[],afcRecords:[],activities:[],extra:{}};
 let commits=0;const store={tables,nowIso:()=>new Date('2026-11-02T20:00:00Z').toISOString(),commit(){commits++},audit(r){tables.history.push(r)},bag(n,f){return tables.extra[n]||(tables.extra[n]=f())}};
 return {tables,service:createScheduleWorkflow({store}),get commits(){return commits}};
}
const rows=[{courseNumber:'VTMD 304',year:'2',date:'2026-11-04',startTime:'08:30',endTime:'10:30',sessionType:'LEC'},
 {courseNumber:'VTMD 304',year:'2',date:'2026-11-05',time:'13:00-14:00',sessionType:'SRL',title:'Special Topic',room:'CSB 101',suggestedFacultyIds:['f1']}];
test('ADC previews bulk rows without writes and sees absent titles/rooms and ADFAD assignments',()=>{
 const f=fixture(),preview=f.service.previewBulk('adc',{rows});
 assert.equal(preview.readyCount,2);
 assert.equal(preview.valid,true);
 assert.equal(preview.invalidCount,0);
 assert.equal(preview.adcTodoCount,1);
 assert.equal(preview.adfadTodoCount,2);
 assert.equal(f.tables.sessions.length,0);assert.equal(f.commits,0);
});
test('publishBulk is atomic, creates two calendar sessions, and only missing options become tasks',()=>{
 const f=fixture(),result=f.service.publishBulk('adc',{batchId:'batch-1',rows,expectedRulesVersion:1});
 assert.equal(result.createdCount,2);assert.equal(f.tables.sessions.length,2);
 assert.deepEqual(f.tables.sessions[0].assignments,[]);
 assert.equal(f.tables.sessions[0].topic,'');
 assert.equal(f.tables.sessions[0].room,null);
 assert.deepEqual(f.tables.sessions[1].suggestedFacultyIds,['f1']);
 const adc=f.service.list('adc').workItems;
 assert.equal(adc.length,1);assert.deepEqual(adc[0].missing,['Session title','Room number']);
 const adfa=f.service.list('adfa').workItems;
 assert.equal(adfa.length,2);assert.ok(adfa.every(x=>x.stage==='adfa'));
 assert.equal(adfa[0].missing[0],'Assign faculty (no suggestion)');
 assert.equal(adfa[1].missing[0],'Confirm suggested faculty');
 assert.equal(f.service.list('developer').workItems.length,3);
 assert.throws(()=>f.service.list('faculty'),e=>e.code==='ROLE_DENIED');
});
test('duplicate batch retry is no-op and changing payload under same batch ID fails',()=>{
 const f=fixture(),first=f.service.publishBulk('developer',{batchId:'one',rows,expectedRulesVersion:1}),written=f.commits;
 const same=f.service.publishBulk('developer',{batchId:'one',rows,expectedRulesVersion:1});
 assert.deepEqual(same.sessionIds,first.sessionIds);assert.equal(f.commits,written);
 assert.throws(()=>f.service.publishBulk('developer',{batchId:'one',rows:[{...rows[0],date:'2026-11-06'}],expectedRulesVersion:1}),e=>e.code==='IMPORT_CONFLICT');
});
test('invalid dates, curriculum year, course and time block all rows without partial writes',()=>{
 const f=fixture();
 const bad=[...rows,{courseNumber:'VETM 505',year:'2',date:'2026-11-04',startTime:'18:00',endTime:'16:30'}];
 const preview=f.service.previewBulk('adc',{rows:bad});
 assert.equal(preview.invalidCount,1);assert.equal(preview.items[2].rowNumber,3);
 assert.ok(preview.items[2].errors.length>0);
 assert.throws(()=>f.service.publishBulk('adc',{batchId:'bad',rows:bad,expectedRulesVersion:1}),e=>e.code==='IMPORT_VALIDATION');
 assert.equal(f.tables.sessions.length,0);assert.equal(f.commits,0);
 for(const who of ['lab','adfa','faculty'])assert.throws(()=>f.service.previewBulk(who,{rows}),e=>e.code==='ROLE_DENIED');
});
test('developer dashboard updates optional field rules and enforces exact version, core fields remain mandatory',()=>{
 const f=fixture(),original=f.service.getRules('developer');assert.equal(original.version,1);
 assert.equal(original.fields.topic.required,false);
 const next=f.service.setRules('developer',{expectedVersion:1,fields:{
  topic:{required:true,todoOwner:'adc',label:'Session title'},
  room:{required:false,todoOwner:'adfa',label:'Room number'}
 },maxRows:50,defaultSessionType:'SRL'});
 assert.equal(next.version,2);assert.equal(next.fields.topic.required,true);assert.equal(next.fields.room.todoOwner,'adfa');
 assert.throws(()=>f.service.setRules('developer',{expectedVersion:1,fields:{topic:{required:false}}}),e=>e.code==='STALE_REVISION');
 assert.throws(()=>f.service.setRules('adc',{expectedVersion:2,fields:{topic:{required:false}}}),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.service.setRules('developer',{expectedVersion:2,requiredFields:['courseNumber']}),e=>e.code==='RULES_INVALID');
 assert.equal(f.service.previewBulk('adc',{rows:[rows[0]]}).valid,false,'required title now prevents publishing');
 assert.equal(f.service.previewBulk('adc',{rows:[{...rows[0],title:'Added'}]}).valid,true);
});
test('missing option to-do closes when owner completes it, without changing Faculty or DOE',()=>{
 const f=fixture(),first=f.service.publishBulk('adc',{batchId:'a',rows:[rows[0]],expectedRulesVersion:1});
 const id=first.sessionIds[0];
 const updated=f.service.completeDetails('adc',{sessionId:id,expectedVersion:1,title:'Practice 1',room:'CSB Wards'});
 assert.equal(updated.scheduleVersion,2);
 assert.equal(f.service.list('adc').workItems.length,0);
 assert.equal(f.service.list('adfa').workItems.length,1);
 assert.deepEqual(f.tables.sessions[0].assignments,[]);
 assert.throws(()=>f.service.completeDetails('adc',{sessionId:id,expectedVersion:1,title:'overwrite'}),e=>e.code==='STALE_REVISION');
 assert.throws(()=>f.service.completeDetails('faculty',{sessionId:id,expectedVersion:2,title:'overwrite'}),e=>e.code==='ROLE_DENIED');
});
test('role ownership changes on Developer Dashboard immediately move missing-room task',()=>{
 const f=fixture();f.service.publishBulk('adc',{batchId:'b',rows:[rows[0]],expectedRulesVersion:1});
 f.service.setRules('developer',{expectedVersion:1,fields:{room:{required:false,todoOwner:'adfa',label:'Room number'}}});
 assert.deepEqual(f.service.list('adc').workItems[0].missing,['Session title']);
 assert.equal(f.service.list('adfa').workItems.length,1);
 assert.ok(f.service.list('adfa').workItems[0].missing.some(x=>x==='Room number'));
});
test('LAB published room satisfies missing room task without altering ADC source or rosters',()=>{
 const f=fixture(),id=f.service.publishBulk('adc',{batchId:'lab-1',rows:[{...rows[0],courseNumber:'VETM 505',year:'3',sessionType:'LAB'}],expectedRulesVersion:1}).sessionIds[0];
 const session=f.tables.sessions[0],key=JSON.stringify({academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505',date:session.date});
 f.tables.extra.labScheduling={blocks:{[key]:{publications:[{public:{stations:[{sessionId:id,runs:[{room:'CSB Wards'}]}]}}]}}};
 assert.equal(f.service.list('adc').workItems[0].missing.includes('Room number'),false);
 assert.equal(session.room,null);
});
