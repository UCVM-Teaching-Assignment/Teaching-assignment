'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildTables,createStore,STORAGE_KEY}=require('../tools/pages-demo-api/store');
const dataset=require('../tools/pages-demo-api/dataset');
const {createScheduleWorkflow}=require('../tools/pages-demo-api/schedule-workflow');
const actor=(uid,role,labScopes=[])=>({firebaseUid:uid,baseRole:role,active:true,mustChangePassword:false,labScopes});
const memory=()=>{const map=new Map();return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)}};
test('new Frontend Demo opens an EMPTY Calendar while retaining catalogs, faculty and users',()=>{
 const source=buildTables();
 assert.deepEqual(source.sessions,[]);
 assert.ok(source.courses.length>0);
 assert.ok(source.faculty.length>0);
 assert.ok(source.users.length>0);
 assert.ok(source.roles.length>0);
 assert.equal(source.version,1);
 const store=createStore({storage:memory()});
 assert.equal(store.tables.sessions.length,0);
});
test('previous persisted fixture rows are removed by exact deterministic ID, not by broad type/date',()=>{
 const storage=memory(),saved=buildTables();
 const fixture=dataset.sessionRows(saved.courses,saved.faculty);
 assert.ok(fixture.length>20);
 const exactId=fixture[0].id;
 const imported={...fixture[0],id:'user-imported-session-1',scheduleStatus:'published',
  topic:'Custom ADC import that must survive',assignments:[],courseCode:'VTMD 304'};
 saved.sessions=[fixture[0],fixture[1],imported];
 saved.extra={...saved.extra,adcScheduleWorkflow:{version:1,next:1,drafts:{'draft-user':{
  id:'draft-user',revision:1,values:{courseCode:'VTMD 304',date:'2026-11-04'},publishedSessionId:null
 }}}};
 storage.setItem(STORAGE_KEY,JSON.stringify(saved));
 const loaded=createStore({storage}).tables;
 assert.equal(loaded.sessions.length,1);
 assert.equal(loaded.sessions[0].id,'user-imported-session-1');
 assert.equal(loaded.extra.adcScheduleWorkflow.drafts['draft-user'].id,'draft-user');
 assert.ok(!loaded.sessions.some(s=>s.id===exactId));
 const reloaded=createStore({storage}).tables;
 assert.deepEqual(reloaded.sessions,loaded.sessions);
});
test('empty calendar creates ONE actionable ADC import task but LAB/ADFAD have none until publication',()=>{
 const store=createStore({storage:memory()});
 store.tables.users.push(actor('wf-adc','adc'),actor('wf-lab','lab'),actor('wf-adfa','adfa_general'),actor('wf-dev','developer'),actor('wf-fac','faculty'));
 const flow=createScheduleWorkflow({store});
 const adc=flow.list('wf-adc').workItems;
 assert.equal(adc.length,1);
 assert.equal(adc[0].kind,'import_adc_schedule');
 assert.equal(adc[0].stage,'adc');
 assert.equal(adc[0].sessionId,'');
 assert.match(adc[0].missing[0],/Schedule Workflow/);
 assert.deepEqual(flow.list('wf-lab').workItems,[]);
 assert.deepEqual(flow.list('wf-adfa').workItems,[]);
 assert.equal(flow.list('wf-dev').workItems.length,1);
 assert.throws(()=>flow.list('wf-fac'),/Only ADC, LAB, ADFAD/);
});
test('ADC draft stays OUT of Calendar but becomes an outstanding publish task',()=>{
 const store=createStore({storage:memory()});
 store.tables.users.push(actor('wf-adc','adc'),actor('wf-lab','lab'),actor('wf-adfa','adfa_general'));
 const flow=createScheduleWorkflow({store});
 const course=store.tables.courses.find(c=>String(c.curriculumYear)==='2');
 assert.ok(course);
 const payload={academicYear:'2026-27',courseCode:course.courseCode,date:'2026-11-04',
  startTime:'08:30',endTime:'09:30',sessionType:'LAB',topic:'',room:''};
 const draft=flow.saveDraft('wf-adc',payload);
 assert.equal(store.tables.sessions.length,0);
 assert.equal(flow.list('wf-adc').workItems.length,1);
 assert.equal(flow.list('wf-adc').workItems[0].kind,'publish_adc_draft');
 assert.deepEqual(flow.list('wf-lab').workItems,[]);
 assert.deepEqual(flow.list('wf-adfa').workItems,[]);
 const published=flow.publish('wf-adc',{draftId:draft.id,expectedRevision:draft.revision});
 assert.equal(store.tables.sessions.length,1);
 assert.equal(store.tables.sessions[0].id,published.session.id);
 assert.equal(flow.list('wf-adc').workItems.some(x=>x.kind==='import_adc_schedule'||x.kind==='publish_adc_draft'),false);
 const adfa=flow.list('wf-adfa').workItems;
 assert.ok(adfa.some(x=>x.stage==='adfa'&&x.sessionId===published.session.id));
});
test('LAB tasks start only after ADC publishes; no preassigned faculty/DOE',()=>{
 const store=createStore({storage:memory()});
 const course=store.tables.courses.find(c=>String(c.curriculumYear)==='2');
 store.tables.users.push(actor('wf-adc','adc'),actor('wf-lab','lab',[{academicYear:'2026-27',curriculumYear:String(course.curriculumYear),courseCode:course.courseCode}]),actor('wf-adfa','adfa_general'));
 const flow=createScheduleWorkflow({store});
 const draft=flow.saveDraft('wf-adc',{academicYear:'2026-27',courseCode:course.courseCode,date:'2026-11-05',startTime:'09:00',endTime:'10:00',sessionType:'LAB'});
 const session=flow.publish('wf-adc',{draftId:draft.id,expectedRevision:draft.revision}).session;
 const lab=flow.list('wf-lab').workItems;
 assert.ok(lab.some(x=>x.stage==='lab'&&x.sessionId===session.id));
 assert.deepEqual(session.assignments,[]);
 assert.equal(session.facultyStatus,'pending');
 const adfa=flow.list('wf-adfa').workItems;
 assert.ok(adfa.some(x=>x.status==='waiting_for_lab'&&x.sessionId===session.id));
});
test('Testing Work Queue exposes assigned ADC bootstrapping and a shared visible queue for all teams',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const read=name=>fs.readFileSync(path.join(__dirname,'../frontend/scripts',name),'utf8');
 const tasks=read('workspace-tasks.js'),testing=read('testing-only-features.js');
 assert.match(tasks,/Work Queue/);
 assert.match(tasks,/data-workflow-adc/);
 assert.match(tasks,/PAWS_SCHEDULE_WORKFLOW\?\.open/);
 assert.match(tasks,/No office tasks yet\. Waiting for ADC/);
 assert.match(testing,/root\.PAWS_TASKS\?\.open/);
 assert.match(testing,/role==='adc'\|\|role==='lab'/);
 assert.match(testing,/showClosures: false/);
});
