'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLabResourceReservations,DEFAULT_POLICY}=require('../tools/pages-demo-api/lab-resource-reservations');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const users=[
  {firebaseUid:'owner',baseRole:'owner',active:true,mustChangePassword:false},
  {firebaseUid:'developer',baseRole:'developer',active:true,mustChangePassword:false},
  {firebaseUid:'lab',baseRole:'lab',active:true,mustChangePassword:false},
  {firebaseUid:'faculty',baseRole:'faculty',active:true,mustChangePassword:false}
 ];
 const session=(id,date,start='08:30',end='10:30')=>({id,academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505',date,start,end});
 const sessions=[
  session('a','2026-11-03'),
  session('b','2026-11-04','10:29','12:29'),
  session('c','2026-11-04','10:30','12:30'),
  session('d','2026-11-05','08:30','10:30'),
  session('e','2026-11-04','08:30','10:30')
 ];
 const tables={users,sessions,extra:{},history:[],faculty:[],academicYear:'2026-27'};
 const store={tables,commit(){},audit(row){tables.history.push(copy(row))},nowIso:()=> '2026-11-02T18:40:00.000Z',
  bag(key,init){return tables.extra[key]||(tables.extra[key]=init())}};
 const labService={read(uid,id){
  const s=tables.sessions.find(x=>x.id===id);
  if(!s)throw Object.assign(Error('Unknown LAB'),{code:'NOT_FOUND'});
  const can=['owner','developer','lab'].includes(uid);
  return {scope:{academicYear:s.academicYear,curriculumYear:s.curriculumYear,courseCode:s.courseCode,date:s.date},
   sourceSessions:[s],capabilities:{canEdit:can,canRoster:can}};
 }};
 return {tables,store,service:createLabResourceReservations({store,labService})};
}
let n=0;const rid=()=> 'operation-'+(++n);
const submit=(f,sessionId,horseCount,petProfessorCount,notes='Reserve Notes')=>f.service.submit('lab',{
 sessionId,expectedVersion:f.service.read('lab',sessionId).request?.version||0,
 horseCount,petProfessorCount,notes,requestId:rid()
});
const confirm=(f,sessionId,horseIds,decision='confirm',reviewNote='Checked')=>f.service.review('owner',{
 sessionId,expectedVersion:f.service.read('owner',sessionId).request.version,horseIds,decision,reviewNote,requestId:rid()
});
test('defaults: 38 horses, minimum 24h rest, pet warning >30 per 48h',()=>{
 assert.deepEqual(DEFAULT_POLICY,{horsePoolSize:38,horseRestHours:24,petProfessorThreshold:30,petWindowHours:48});
 const f=fixture(),snapshot=f.service.read('lab','a');
 assert.equal(snapshot.request,null);assert.equal(snapshot.assessment.availableHorseCount,38);
 assert.match(snapshot.notice,/does not notify/);
});
test('LAB must send Reserve Notes for animals; none-needed is explicitly recorded',()=>{
 const f=fixture();
 assert.throws(()=>submit(f,'a',1,0,''),e=>e.code==='RESERVE_NOTES_REQUIRED');
 const saved=submit(f,'a',0,0,'');
 assert.equal(saved.request.status,'not_required');
 assert.equal(saved.request.version,1);
 assert.equal(f.tables.history.length,1);
});
test('requests remain pending; only Owner/Developer can confirm a horse by synthetic ID',()=>{
 const f=fixture(),raw=copy(f.tables.sessions);
 const q=submit(f,'a',1,0);
 assert.equal(q.request.status,'requested');assert.equal(q.request.horseIds.length,0);
 assert.throws(()=>f.service.review('lab',{sessionId:'a',expectedVersion:1,horseIds:['H01'],decision:'confirm',reviewNote:'',requestId:rid()}),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>confirm(f,'a',[]),e=>e.code==='HORSE_ASSIGNMENT');
 assert.equal(confirm(f,'a',['H01']).request.status,'confirmed');
 assert.deepEqual(f.tables.sessions,raw,'reservations must not change timetable or DOE inputs');
});
test('24h after each individual horse use ends, not after its start; exact boundary is permitted',()=>{
 const f=fixture();
 submit(f,'a',1,0);confirm(f,'a',['H01']);
 submit(f,'b',1,0);
 assert.throws(()=>confirm(f,'b',['H01']),e=>e.code==='HORSE_REST_CONFLICT');
 confirm(f,'b',['H02']);
 const c=submit(f,'c',1,0);
 assert.ok(c.assessment.availableHorseIds.includes('H01'));
 assert.ok(!c.assessment.availableHorseIds.includes('H02'));
 assert.equal(confirm(f,'c',['H01']).request.status,'confirmed');
});
test('horse request capacity warns on 20+20 same time; confirmation cannot double-book',()=>{
 const f=fixture(),a=submit(f,'a',20,0);
 assert.equal(a.request.horseCount,20);
 confirm(f,'a',Array.from({length:20},(_,i)=>'H'+String(i+1).padStart(2,'0')));
 const second=submit(f,'e',20,0);
 assert.equal(second.assessment.availableHorseCount,18);
 assert.ok(second.assessment.warnings.some(w=>w.code==='HORSE_CAPACITY'));
 assert.throws(()=>confirm(f,'e',Array.from({length:20},(_,i)=>'H'+String(i+19).padStart(2,'0'))),e=>e.code==='HORSE_REST_CONFLICT'||e.code==='HORSE_ASSIGNMENT');
});
test('rolling 48h Pet Professor demand above 30 creates warning without blocking submission',()=>{
 const f=fixture();
 const a=submit(f,'a',0,18);
 assert.equal(a.assessment.petWindowDemand,18);
 const b=submit(f,'e',0,14);
 assert.equal(b.request.status,'requested');
 assert.equal(b.assessment.petWindowDemand,32);
 assert.ok(b.assessment.warnings.some(w=>w.code==='PET_PROFESSOR_THRESHOLD'));
 assert.equal(f.service.read('lab','a').assessment.petWindowDemand,32);
 // At the exact 48-hour boundary a prior request leaves the rolling window.
 const d=submit(f,'d',0,14);
 assert.equal(d.assessment.petWindowDemand,28);
 assert.ok(!d.assessment.warnings.some(w=>w.code==='PET_PROFESSOR_THRESHOLD'));
});
test('stale version and request-ID reuse are rejected; identical retry adds no audit',()=>{
 const f=fixture();
 const p={sessionId:'a',expectedVersion:0,horseCount:1,petProfessorCount:0,notes:'For equine lab',requestId:'fixed'};
 const first=f.service.submit('lab',p),before=f.tables.history.length;
 assert.deepEqual(f.service.submit('lab',p),first);
 assert.equal(f.tables.history.length,before);
 assert.throws(()=>f.service.submit('lab',{...p,notes:'Different'}),e=>e.code==='REQUEST_REUSE');
 assert.throws(()=>f.service.submit('lab',{...p,requestId:rid()}),e=>e.code==='STALE_REVISION');
});
test('ADC rescheduling makes existing request stale; prior confirmation cannot be reused',()=>{
 const f=fixture();submit(f,'a',1,0);f.tables.sessions[0].start='09:00';
 assert.equal(f.service.read('lab','a').sourceChanged,true);
 assert.throws(()=>confirm(f,'a',['H01']),e=>e.code==='SOURCE_CHANGED');
 const newer=submit(f,'a',1,0,'Updated Reserve Notes');
 assert.equal(newer.request.status,'requested');assert.equal(newer.sourceChanged,false);
});
test('policy cannot lower rest below 24h or invalidate already confirmed assignments',()=>{
 const f=fixture();
 assert.throws(()=>f.service.setPolicy('lab',{requestId:rid(),expectedRevision:1,horsePoolSize:38,horseRestHours:24,petProfessorThreshold:30,petWindowHours:48}),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.service.setPolicy('owner',{requestId:rid(),expectedRevision:1,horsePoolSize:38,horseRestHours:23,petProfessorThreshold:30,petWindowHours:48}),e=>e.code==='INVALID_POLICY');
 const p=f.service.setPolicy('owner',{requestId:rid(),expectedRevision:1,horsePoolSize:40,horseRestHours:30,petProfessorThreshold:25,petWindowHours:48});
 assert.equal(p.policy.horseRestHours,30);
 assert.equal(f.service.read('lab','a').policy.horsePoolSize,40);
});
test('unauthorized Faculty cannot inspect private Reserve Notes or mutate requests',()=>{
 const f=fixture();submit(f,'a',1,1,'Synthetic sensitive animal handling notes');
 assert.throws(()=>f.service.read('faculty','a'),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.service.preview('faculty',{sessionId:'a',horseCount:0,petProfessorCount:0}),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.service.submit('faculty',{sessionId:'a',expectedVersion:1,horseCount:0,petProfessorCount:0,notes:'',requestId:rid()}),e=>e.code==='ROLE_DENIED');
 assert.ok(!JSON.stringify(f.tables.history).includes('Synthetic sensitive animal handling notes'));
});
