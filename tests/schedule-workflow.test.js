'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createScheduleWorkflow}=require('../tools/pages-demo-api/schedule-workflow.js');
const {createLabService}=require('../tools/pages-demo-api/lab-scheduling.js');
const {createLabResourceReservations}=require('../tools/pages-demo-api/lab-resource-reservations.js');
const {createSessionRepository}=require('../tools/pages-demo-api/repos/core.js');
function fixture(){
 const people=['adc','lab','adfa','developer','owner','faculty'].map(role=>({firebaseUid:role,baseRole:role==='adfa'?'adfa_general':role,active:true,mustChangePassword:false,labScopes:role==='lab'?[{academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505'}]:[]}));
 const f=(id,name)=>({facultyId:id,displayName:name,active:true,appointmentValid:true});
 const tables={academicYear:'2026-27',courses:[{courseCode:'VETM 505',courseName:'Clinical Skills III',curriculumYear:3}],faculty:[f('f1','Alice Faculty'),f('f2','Bob Faculty')],users:people,sessions:[],activities:[],afcRecords:[],history:[],extra:{}};
 let commits=0;
 const store={tables,nowIso:()=>new Date(2026,10,2,12,0,0).toISOString(),commit(){commits++},audit(row){tables.history.push(row)},bag(name,init){return tables.extra[name]||(tables.extra[name]=init())}};
 return {store,tables,workflow:createScheduleWorkflow({store}),lab:createLabService({store}),get commits(){return commits}};
}
const proposal={academicYear:'2026-27',courseCode:'VETM 505',date:'2026-11-03',startTime:'08:30',endTime:'10:30',sessionType:'LAB',suggestedFacultyIds:['f1']};
function published(f,who='adc'){const d=f.workflow.saveDraft(who,proposal);return f.workflow.publish(who,{draftId:d.id,expectedRevision:d.revision})}
function reserveNone(f,session,who){
 const svc=createLabResourceReservations({store:f.store,labService:f.lab});
 return svc.submit(who,{sessionId:session.id,expectedVersion:0,horseCount:0,petProfessorCount:0,notes:'',requestId:'none-'+session.id});
}
test('ADC can publish a Course/date/time with no title, room or faculty, and Calendar receives one Session',async()=>{
 const f=fixture(),d=f.workflow.saveDraft('adc',proposal);
 assert.equal(f.tables.sessions.length,0,'Working Draft does not leak into Calendar');
 const p=f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision});
 assert.equal(p.session.courseCode,'VETM 505');assert.equal(p.session.date,'2026-11-03');
 assert.equal(p.session.topic,'');assert.equal(p.session.room,null);assert.deepEqual(p.session.assignments,[]);
 assert.deepEqual(p.session.suggestedFacultyIds,['f1']);
 const calendar=await createSessionRepository(f.store).list({academicYear:'2026-27'});
 assert.equal(calendar.length,1);assert.equal(calendar[0].id,p.session.id);assert.equal(calendar[0].instructorNames,'');
});
test('only ADC, Developer or Owner can publish schedule; no role can turn a suggestion into an assignment',()=>{
 const f=fixture();
 for(const uid of ['lab','adfa','faculty'])assert.throws(()=>f.workflow.saveDraft(uid,proposal),e=>e.code==='ROLE_DENIED');
 const s=published(f);
 assert.deepEqual(f.tables.sessions[0].assignments,[]);assert.ok(!JSON.stringify(s.session).includes('doeCredit'));
 for(const uid of ['adc','lab','faculty'])assert.throws(()=>f.workflow.confirmFaculty(uid,{sessionId:s.session.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lab Primary',creditedHours:2}]}),e=>e.code==='ROLE_DENIED');
 const d=f.workflow.saveDraft('developer',{...proposal,date:'2026-11-04'});assert.equal(f.workflow.publish('developer',{draftId:d.id,expectedRevision:d.revision}).session.date,'2026-11-04');
});
test('stage 1 validates required course, date and exact start/end; rejects stale drafts and duplicate publishes',()=>{
 const f=fixture();
 for(const change of [{courseCode:''},{date:''},{startTime:''},{endTime:''},{startTime:'14:00',endTime:'12:00'},{courseCode:'VETM 999'}]){
  const d=f.workflow.saveDraft('adc',{...proposal,...change});
  assert.throws(()=>f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision}),e=>['INVALID_SCHEDULE','INVALID_COURSE'].includes(e.code));
 }
 const d=f.workflow.saveDraft('adc',proposal);
 assert.throws(()=>f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision-1}),e=>e.code==='STALE_REVISION');
 const first=published(f);
 const second=f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision});
 assert.notEqual(first.session.id,second.session.id,'separate ADC drafts may be separate parallel stations');
 assert.equal(f.tables.sessions.length,2);
 assert.throws(()=>f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision}),e=>e.code==='DUPLICATE_SESSION');
});
test('LAB can publish group/room allocations before any faculty exists; ADFAD confirms a suggestion afterwards',async()=>{
 const f=fixture(),s=published(f).session;reserveNone(f,s,'lab');
 const ctx=f.lab.read('lab',s.id),d=ctx.draft;
 d.groups=[{id:'g1',code:'1',members:[{id:'s1',name:'Synthetic Student'}]}];
 d.rooms=[{id:'r1',label:'Room A',resourceKey:'room-a',subspace:'',capacity:10}];
 d.stations[0].assignedGroupIds=['g1'];
 d.stations[0].runs[0].roomId='r1';d.stations[0].runs[0].groupIds=['g1'];
 const saved=f.lab.save('lab',{sessionId:s.id,expectedRevision:ctx.revision,requestId:'save-1',draft:d});
 assert.equal(saved.validation.canPublish,true,JSON.stringify(saved.validation.issues));
 f.lab.publish('lab',{sessionId:s.id,expectedRevision:saved.revision,requestId:'pub-1'});
 assert.deepEqual(f.lab.publicView(s.id).stations[0].instructors,[]);
 const after=f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lab Primary',creditedHours:2}]});
 assert.equal(after.facultyStatus,'confirmed');assert.equal(f.tables.sessions[0].assignments[0].doeCredit,0.42);
 assert.equal(f.lab.read('lab',s.id).sourceChanged,false);
 assert.equal(f.lab.publicView(s.id).stations[0].instructors[0].role,'Primary');
 const calendar=await createSessionRepository(f.store).list({academicYear:'2026-27'});
 assert.equal(calendar[0].room,'Room A');assert.equal(calendar[0].instructorNames,'Alice Faculty');
});
test('Developer can publish ADC schedule, edit LAB booking and confirm teaching assignments',()=>{
 const f=fixture(),s=published(f,'developer').session;reserveNone(f,s,'developer');
 const ctx=f.lab.read('developer',s.id);
 assert.equal(ctx.capabilities.canEdit,true);
 assert.throws(()=>f.workflow.confirmFaculty('adc',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lab Secondary',creditedHours:6}]}),e=>e.code==='ROLE_DENIED');
 const draft=ctx.draft;draft.groups=[{id:'g1',code:'1',members:[{id:'test1',name:'Synthetic'}]}];draft.rooms=[{id:'room',label:'Room X',resourceKey:'room-x',subspace:'',capacity:4}];
 draft.stations[0].assignedGroupIds=['g1'];draft.stations[0].runs[0].roomId='room';draft.stations[0].runs[0].groupIds=['g1'];
 const saved=f.lab.save('developer',{sessionId:s.id,expectedRevision:ctx.revision,requestId:'developer-lab',draft});
 f.lab.publish('developer',{sessionId:s.id,expectedRevision:saved.revision,requestId:'developer-pub'});
 assert.equal(f.workflow.confirmFaculty('developer',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lab Secondary',creditedHours:6}]}).facultyStatus,'confirmed');
});
test('ADFAD can independently assign Faculty after ADC publishes a non-LAB Session',()=>{
 const f=fixture(),d=f.workflow.saveDraft('adc',{...proposal,sessionType:'LEC'}),s=f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision}).session;
 f.tables.faculty[0].activationDate='2026-12-01';
 assert.throws(()=>f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lecture'}]}),e=>e.code==='FACULTY_UNAVAILABLE');
 f.tables.faculty[0].activationDate=null;
 assert.throws(()=>f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lecture'},{facultyId:'f1',teachingRole:'Lecture'}]}),e=>e.code==='INVALID_ASSIGNMENT');
 const a=f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f2',teachingRole:'Lecture'}]});
 assert.equal(a.facultyStatus,'confirmed');assert.equal(f.tables.sessions[0].assignments[0].facultyId,'f2');assert.equal(f.tables.sessions[0].assignments[0].doeCredit,null,'hours remain pending, not silently zero');
});
test('unknown work time is reviewed by ADFAD after ADC publication, with an explicit note',()=>{
 const f=fixture(),d=f.workflow.saveDraft('adc',{...proposal,sessionType:'LEC'}),s=f.workflow.publish('adc',{draftId:d.id,expectedRevision:d.revision}).session;
 f.tables.activities.push({activityId:'a1',facultyKey:'f1',startDate:s.date,endDate:s.date,category:'clinical_day',timeEvidence:[],active:true});
 assert.throws(()=>f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lecture',creditedHours:2}]}),e=>e.code==='FACULTY_REVIEW_REQUIRED');
 const result=f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lecture',creditedHours:2}],reviewNote:'Verified separately; no conflict in the synthetic example.'});
 assert.equal(result.facultyStatus,'confirmed');
 assert.throws(()=>f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[],reviewNote:'irrelevant'}),e=>e.code==='STALE_REVISION');
});

test('LAB Session may not receive ADFAD faculty before a published LAB booking',()=>{
 const f=fixture(),s=published(f).session;
 assert.throws(()=>f.workflow.confirmFaculty('adfa',{sessionId:s.id,expectedRevision:0,assignments:[{facultyId:'f1',teachingRole:'Lab Primary',creditedHours:2}]}),e=>e.code==='LAB_NOT_PUBLISHED');
 assert.equal(f.tables.sessions[0].assignments.length,0);
});

test('ADC newly publishes a LAB Course and built-in LAB testers have Stage 2 scopes without an Owner grant',()=>{
 const f=fixture();
 f.tables.users.push({firebaseUid:'uid-lab-1',baseRole:'lab',active:true,mustChangePassword:false,labScopes:[]});
 f.tables.users.push({firebaseUid:'uid-lab-2',baseRole:'lab',active:true,mustChangePassword:false,labScopes:[]});
 f.tables.users.push({firebaseUid:'lab-external',baseRole:'lab',active:true,mustChangePassword:false,labScopes:[]});
 const s=published(f).session;
 for(const id of ['uid-lab-1','uid-lab-2']){
  assert.equal(f.lab.read(id,s.id).capabilities.canEdit,true);
  assert.deepEqual(f.tables.users.find(u=>u.firebaseUid===id).labScopes[0],{academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505'});
 }
 assert.equal(f.lab.read('lab-external',s.id).capabilities.canEdit,false);
 assert.deepEqual(f.tables.users.find(u=>u.firebaseUid==='lab-external').labScopes,[]);
});
