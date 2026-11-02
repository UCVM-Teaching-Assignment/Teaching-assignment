'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createScheduleWorkflow}=require('../tools/pages-demo-api/schedule-workflow.js');
const {createLabService}=require('../tools/pages-demo-api/lab-scheduling.js');
function fixture(){
 const user=(uid,role,scopes=[])=>({firebaseUid:uid,baseRole:role,active:true,mustChangePassword:false,labScopes:scopes});
 const users=[user('adc','adc'),user('adfa','adfa_general'),user('developer','developer'),
  user('lab','lab',[{academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505'}]),
  user('outsider-lab','lab',[]),user('faculty','faculty')];
 const tables={academicYear:'2026-27',users,courses:[{courseCode:'VETM 505',courseName:'Skills',curriculumYear:3},{courseCode:'VTMD 304',courseName:'Anatomy',curriculumYear:2}],
  faculty:[{facultyId:'f1',displayName:'Dr Alpha',active:true,appointmentValid:true},{facultyId:'f2',displayName:'Dr Beta',active:true,appointmentValid:true}],
  sessions:[],activities:[],afcRecords:[],extra:{},history:[]};
 let commits=0;
 const store={tables,bag:(n,init)=>tables.extra[n]||(tables.extra[n]=init()),nowIso:()=> '2026-11-02T20:00:00.000Z',commit(){commits++},audit(row){tables.history.push(row)}};
 return {tables,store,workflow:createScheduleWorkflow({store}),lab:createLabService({store}),get commits(){return commits}};
}
function publish(f,{type='LAB',course='VETM 505',date='2026-11-03',start='08:30',end='10:30',suggestions=[]}={}){
 const draft=f.workflow.saveDraft('adc',{academicYear:'2026-27',courseCode:course,sessionType:type,date,startTime:start,endTime:end,suggestedFacultyIds:suggestions});
 return f.workflow.publish('adc',{draftId:draft.id,expectedRevision:draft.revision}).session;
}
function labRow(rows, overrides={}){
 return {...rows[0],runKey:'run-1',startTime:'08:30',endTime:'10:30',room:'CSB Wards',
  capacity:'10',attendance:'groups',groupCode:'1',studentIds:'TEST-01;TEST-02',
  studentNames:'Synthetic One;Synthetic Two',...overrides};
}
test('ADC publish automatically creates LAB and ADFAD Work Queue tasks, even without suggestions',()=>{
 const f=fixture(),s=publish(f);
 const lab=f.workflow.list('lab');assert.equal(lab.capabilities.canADC,false);
 assert.deepEqual(lab.workItems.map(x=>x.stage),['lab']);
 assert.equal(lab.workItems[0].sessionId,s.id);
 const adfa=f.workflow.list('adfa').workItems;
 assert.equal(adfa.length,1);assert.equal(adfa[0].stage,'adfa');assert.equal(adfa[0].status,'waiting_for_lab');
 assert.ok(adfa[0].missing.join(' ').includes('Assign faculty'));
 const adc=f.workflow.list('adc').workItems;
 assert.ok(adc.every(x=>x.stage==='adc'),'ADC never owns LAB/Faculty tasks');
 assert.ok(f.workflow.list('developer').workItems.some(x=>x.stage==='lab'));
 assert.ok(f.workflow.list('developer').workItems.some(x=>x.stage==='adfa'));
});
test('non-LAB session sends directly to ADFAD queue without a LAB task',()=>{
 const f=fixture();publish(f,{type:'LEC',course:'VTMD 304'});
 assert.equal(f.workflow.list('developer').workItems.some(x=>x.stage==='lab'),false);
 assert.equal(f.workflow.list('adfa').workItems[0].status,'ready');
});
test('LAB export contains only authorized, prefilled LAB schedule runs, no other-course roster leakage',()=>{
 const f=fixture(),labSession=publish(f);
 publish(f,{course:'VTMD 304',date:'2026-11-04'});
 const e=f.workflow.officeExport('lab','lab');
 assert.equal(e.office,'lab');assert.equal(e.rows.length,1);assert.equal(e.rows[0].sessionId,labSession.id);
 assert.equal(e.rows[0].courseNumber,'VETM 505');assert.equal(e.rows[0].date,'2026-11-03');
 assert.equal(e.rows[0].expectedRevision,0);
 assert.throws(()=>f.workflow.officeExport('faculty','lab'),x=>x.code==='ROLE_DENIED');
 assert.throws(()=>f.workflow.officeExport('adfa','lab'),x=>x.code==='ROLE_DENIED');
});
test('LAB user can bulk preview then publish room, capacity and synthetic roster; ADFAD remains pending',()=>{
 const f=fixture(),s=publish(f);
 const rows=[labRow(f.workflow.officeExport('lab','lab').rows)];
 const previous=f.commits,preview=f.workflow.previewOfficeBulk('lab',{office:'lab',rows});
 assert.equal(preview.valid,true,JSON.stringify(preview.errors));
 assert.equal(f.commits,previous,'preview must be read-only');
 assert.equal(f.tables.extra.labScheduling?.blocks?.length||0,0);
 const result=f.workflow.publishOfficeBulk('lab',{office:'lab',rows,batchId:'lab-batch-1'});
 assert.equal(result.publishedCount,1);
 assert.equal(f.lab.publicView(s.id).stations[0].runs[0].room,'CSB Wards');
 assert.equal(f.lab.publicView(s.id).stations[0].runs[0].studentCount,2);
 assert.equal(f.workflow.list('lab').workItems.length,0);
 assert.equal(f.workflow.list('adfa').workItems[0].status,'ready');
 assert.ok(f.workflow.list('adc').workItems.every(x=>!x.missing.includes('Room number')));
});
test('LAB batch with invalid capacity is blocked without any partial publication or roster writes',()=>{
 const f=fixture();publish(f);
 const rows=[labRow(f.workflow.officeExport('lab','lab').rows,{capacity:'1'})];
 const preview=f.workflow.previewOfficeBulk('lab',{office:'lab',rows});
 assert.equal(preview.valid,false);assert.match(JSON.stringify(preview.errors),/CAPACITY_EXCEEDED/);
 assert.throws(()=>f.workflow.publishOfficeBulk('lab',{office:'lab',rows,batchId:'bad-lab'}),x=>x.code==='IMPORT_VALIDATION');
 assert.equal(f.workflow.list('lab').workItems.length,1);
});
test('LAB cannot bulk publish an unscoped LAB session',()=>{
 const f=fixture();const s=publish(f,{course:'VTMD 304',date:'2026-11-04'});
 const row=labRow([{sessionId:s.id,expectedRevision:0}],{sessionId:s.id});
 assert.equal(f.workflow.previewOfficeBulk('lab',{office:'lab',rows:[row]}).valid,false);
 assert.throws(()=>f.workflow.publishOfficeBulk('lab',{office:'lab',rows:[row],batchId:'outside'}),e=>e.code==='IMPORT_VALIDATION');
});
test('ADFAD export prepopulates suggestions; cannot publish LAB assignments until LAB finishes',()=>{
 const f=fixture(),s=publish(f,{suggestions:['f1']});
 const exportRows=f.workflow.officeExport('adfa','adfa').rows;
 assert.equal(exportRows.length,1);assert.equal(exportRows[0].sessionId,s.id);
 assert.equal(exportRows[0].facultyId,'f1');
 const rows=[{...exportRows[0],teachingRole:'Lab Primary',creditedHours:'2'}];
 const preview=f.workflow.previewOfficeBulk('adfa',{office:'adfa',rows});
 assert.equal(preview.valid,false);assert.match(JSON.stringify(preview.errors),/LAB_NOT_PUBLISHED/);
});
test('ADFAD import performs full conflict check, blocks the entire batch and preserves DOE until resolved',()=>{
 const f=fixture();
 const a=publish(f,{type:'LEC',course:'VTMD 304',date:'2026-11-04',start:'08:30',end:'10:30'});
 const b=publish(f,{type:'LEC',course:'VTMD 304',date:'2026-11-04',start:'09:00',end:'11:00'});
 const exported=f.workflow.officeExport('adfa','adfa').rows;
 const rows=exported.map(x=>({...x,facultyId:'f1',teachingRole:'Lecture',creditedHours:'2'}));
 const before=f.commits,preview=f.workflow.previewOfficeBulk('adfa',{office:'adfa',rows});
 assert.equal(preview.valid,false);assert.match(JSON.stringify(preview.errors),/FACULTY_UNAVAILABLE|overlap/i);
 assert.equal(f.commits,before);assert.equal(f.tables.sessions[0].assignments.length,0);
 assert.throws(()=>f.workflow.publishOfficeBulk('adfa',{office:'adfa',rows,batchId:'bad-faculty'}),e=>e.code==='IMPORT_VALIDATION');
 assert.equal(f.tables.sessions[0].assignments.length,0);assert.equal(f.tables.sessions[1].assignments.length,0);
 const fixed=[{...rows[0],facultyId:'f1'},{...rows[1],facultyId:'f2'}];
 assert.equal(f.workflow.previewOfficeBulk('adfa',{office:'adfa',rows:fixed}).valid,true);
 const applied=f.workflow.publishOfficeBulk('adfa',{office:'adfa',rows:fixed,batchId:'good-faculty'});
 assert.equal(applied.publishedCount,2);
 assert.equal(f.tables.sessions[0].assignments[0].doeCredit!==null,true);
 assert.equal(f.workflow.list('adfa').workItems.length,0);
});
test('ADFAD import blocks AFC and inactive Faculty with source-specific row errors',()=>{
 const f=fixture();publish(f,{type:'LEC',course:'VTMD 304'});
 const rows=f.workflow.officeExport('adfa','adfa').rows.map(x=>({...x,facultyId:'f1',teachingRole:'Lecture',creditedHours:'2'}));
 f.tables.afcRecords.push({facultyId:'f1',active:true,startDate:'2026-11-01',endDate:'2026-11-05'});
 assert.equal(f.workflow.previewOfficeBulk('adfa',{office:'adfa',rows}).valid,false);
 assert.match(JSON.stringify(f.workflow.previewOfficeBulk('adfa',{office:'adfa',rows}).errors),/Away from Campus/i);
});
test('ADFAD import rejects stale Session revision, unauthorized submission and repeat different payload',()=>{
 const f=fixture();publish(f,{type:'LEC',course:'VTMD 304'});
 const rows=f.workflow.officeExport('adfa','adfa').rows.map(x=>({...x,facultyId:'f1',teachingRole:'Lecture',creditedHours:'2'}));
 assert.throws(()=>f.workflow.publishOfficeBulk('lab',{office:'adfa',rows,batchId:'unauthorized'}),e=>e.code==='ROLE_DENIED');
 const published=f.workflow.publishOfficeBulk('adfa',{office:'adfa',rows,batchId:'repeat-1'});
 assert.equal(published.publishedCount,1);
 const after=f.commits;
 assert.deepEqual(f.workflow.publishOfficeBulk('adfa',{office:'adfa',rows,batchId:'repeat-1'}).sessionIds,published.sessionIds);
 assert.equal(f.commits,after);
 assert.throws(()=>f.workflow.publishOfficeBulk('adfa',{office:'adfa',rows:[{...rows[0],facultyId:'f2'}],batchId:'repeat-1'}),e=>e.code==='IMPORT_CONFLICT');
 const preview=f.workflow.previewOfficeBulk('adfa',{office:'adfa',rows});
 assert.equal(preview.valid,false);assert.match(JSON.stringify(preview.errors),/STALE_REVISION/);
});
test('LAB role may not access ADC publishing or private ADFAD export',()=>{
 const f=fixture();publish(f);
 assert.throws(()=>f.workflow.saveDraft('lab',{}),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.workflow.officeExport('lab','adfa'),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.workflow.previewOfficeBulk('adfa',{office:'lab',rows:[]}),e=>e.code==='ROLE_DENIED');
});

test('LAB office can publish a second reviewed batch with a newer draft revision and new operation receipt',()=>{
 const f=fixture(),s=publish(f),source=f.workflow.officeExport('lab','lab').rows;
 const first=[labRow(source)];
 f.workflow.publishOfficeBulk('lab',{office:'lab',batchId:'first-lab-edit',rows:first});
 const update=[{...first[0],expectedRevision:1,room:'CSB Skills 2'}];
 assert.equal(f.workflow.previewOfficeBulk('lab',{office:'lab',rows:update}).valid,true);
 const result=f.workflow.publishOfficeBulk('lab',{office:'lab',batchId:'second-lab-edit',rows:update});
 assert.equal(result.publishedCount,1);
 assert.equal(f.lab.publicView(s.id).stations[0].runs[0].room,'CSB Skills 2');
});
