'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let mod={};try{mod=require('../tools/pages-demo-api/lab-scheduling.js')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const tables={academicYear:'2026-27',extra:{},history:[],
    users:[{firebaseUid:'lab',baseRole:'lab',active:true,mustChangePassword:false,labScopes:[{academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505'}]},{firebaseUid:'owner',baseRole:'owner',active:true,mustChangePassword:false},{firebaseUid:'faculty',baseRole:'faculty',facultyId:'f1',active:true,mustChangePassword:false},{firebaseUid:'otherLab',baseRole:'lab',active:true,mustChangePassword:false,labScopes:[{academicYear:'2027-28',curriculumYear:'3',courseCode:'VETM 505'}]}],
    faculty:[{facultyId:'f1',displayName:'Demo Lead',active:true},{facultyId:'f2',displayName:'Demo Partner',active:true}],afcRecords:[],activities:[],
    sessions:[{id:'s1',academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505',courseName:'Clinical Skills III',sessionType:'LAB',topic:'Casting',date:'2026-11-03',startTime:'08:30:00',endTime:'16:30:00',room:'Demo Lab',updatedAtUtc:'v1',labApprovedRuns:[['08:30','10:30'],['11:00','13:00'],['14:30','16:30']],assignments:[{sessionAssignmentId:'a1',facultyId:'f1',teachingRole:'Lab Primary',creditedHours:6,doeCredit:999},{sessionAssignmentId:'a2',facultyId:'f2',teachingRole:'Lab Secondary',creditedHours:6,doeCredit:888}]}]};
  let annual=null;
  const store={tables,nowIso:()=> '2026-11-02T19:00:00.000Z',commit(){},audit(x){tables.history.push(copy(x))},bag(name,init){return tables.extra[name]||(tables.extra[name]=init())}};
  assert.equal(typeof mod.createLabService,'function','operational Lab service must exist');
  const service=mod.createLabService({store,annualState:()=>annual});
  return {tables,store,service,archive(){annual={years:{'2026-27':{status:'archived'}}}}};
}
function ready(f){
  const c=f.service.read('lab','s1'),d=c.draft;
  d.groups=[1,2,3].map(i=>({id:'g'+i,code:String(i),members:[{id:'student-'+i,name:'PRIVATE Student '+i}]}));
  d.rooms=[{id:'r',label:'Demo Lab',resourceKey:'lab',subspace:'A',capacity:2}];
  d.stations[0].assignedGroupIds=['g1','g2','g3'];
  d.stations[0].runs=[['08:30','10:30'],['11:00','13:00'],['14:30','16:30']].map((t,i)=>({id:'run'+i,start:t[0],end:t[1],roomId:'r',mode:'groups',groupIds:['g'+(i+1)]}));
  return f.service.save('lab',{sessionId:'s1',expectedRevision:c.revision,requestId:'save-ready',draft:d});
}
const has=(result,code)=>result.issues.some(x=>x.code===code);
function saveAgain(f,c,id='change'){return f.service.save('lab',{sessionId:'s1',expectedRevision:c.revision,requestId:id,draft:c.draft})}
function publish(f,c,id='publish'){return f.service.publish('lab',{sessionId:'s1',expectedRevision:c.revision,requestId:id})}
test('three runs publish explicit group labels and Primary/Secondary without changing DOE',()=>{
 const f=fixture(),before=JSON.stringify(f.tables.sessions),c=ready(f);assert.equal(c.validation.canPublish,true);publish(f,c);
 const p=f.service.publicView('s1');assert.deepEqual(p.stations[0].runs.map(x=>x.groups),[['1'],['2'],['3']]);assert.deepEqual(p.stations[0].instructors.map(x=>x.role),['Primary','Secondary']);assert.equal(JSON.stringify(f.tables.sessions),before);
});
test('All resolves only explicitly assigned groups and never all groups in the scheme',()=>{
 const f=fixture(),c=ready(f);c.draft.stations[0].assignedGroupIds=['g1','g2'];c.draft.stations[0].runs.forEach(r=>{r.mode='all';r.groupIds=[]});const n=saveAgain(f,c);publish(f,n);const runs=f.service.publicView('s1').stations[0].runs;assert.ok(runs.every(r=>r.studentCount===2&&r.groups[0]==='All'));
});
test('empty All audience cannot publish',()=>{
 const f=fixture(),c=ready(f);c.draft.stations[0].assignedGroupIds=[];c.draft.stations[0].runs[0].mode='all';const n=saveAgain(f,c);assert.ok(has(n.validation,'EMPTY_AUDIENCE'));assert.throws(()=>publish(f,n),e=>e.code==='LAB_VALIDATION');
});
test('unknown group references and duplicated student membership are actionable errors',()=>{
 const f=fixture(),c=ready(f);c.draft.stations[0].runs[0].groupIds=['missing'];c.draft.groups[1].members=[{id:'student-1',name:'PRIVATE'}];const n=saveAgain(f,c);assert.ok(has(n.validation,'UNKNOWN_GROUP'));assert.ok(has(n.validation,'DUPLICATE_MEMBERSHIP'));
});
test('published audience, labels, roster and names stay frozen after later draft edits',()=>{
 const f=fixture(),c=ready(f);publish(f,c);const old=f.service.publicView('s1');c.draft.groups[0].code='New label';c.draft.groups[0].members.push({id:'new-student',name:'SECRET'});saveAgain(f,c);assert.deepEqual(f.service.publicView('s1'),old);assert.equal(f.service.roster('lab','s1',1).groups[0].members.length,1);
});
test('public projection excludes student identities, IDs, private notes and source credit',()=>{
 const f=fixture(),c=ready(f);c.draft.privateNotes='CONFIDENTIAL';const n=saveAgain(f,c);publish(f,n);const serialized=JSON.stringify(f.service.publicView('s1'));for(const s of ['PRIVATE','student-1','CONFIDENTIAL','creditedHours','doeCredit','facultyId','members','sourceToken'])assert.ok(!serialized.includes(s),s);
 assert.throws(()=>f.service.roster('faculty','s1',1),e=>e.code==='ROLE_DENIED');assert.equal(f.service.read('faculty','s1').draft,undefined);
});
test('wrong-course/year Lab scope, inactive and mandatory-password accounts cannot write',()=>{
 const f=fixture(),c=ready(f);assert.throws(()=>f.service.save('otherLab',{sessionId:'s1',expectedRevision:c.revision,draft:c.draft,requestId:'bad'}),e=>e.code==='ROLE_DENIED');f.tables.users[0].active=false;assert.throws(()=>f.service.read('lab','s1'),e=>e.code==='ROLE_DENIED');f.tables.users[0].active=true;f.tables.users[0].mustChangePassword=true;assert.throws(()=>publish(f,c),e=>e.code==='ROLE_DENIED');
});
test('actor-supplied role cannot turn a Faculty account into an owner',()=>{
 const f=fixture();assert.throws(()=>f.service.save({uid:'faculty',role:'owner'},{sessionId:'s1',expectedRevision:0,draft:{},requestId:'spoof'}));
});
test('LAB source changes are structural; ADFAD faculty changes do not invalidate operational publication',()=>{
 const f=fixture(),c=ready(f);
 assert.throws(()=>f.service.save('lab',{sessionId:'s1',expectedRevision:c.revision-1,draft:c.draft,requestId:'stale'}),e=>e.code==='STALE_REVISION');
 f.tables.sessions[0].assignments[0].teachingRole='Lab Secondary';
 publish(f,c);
 assert.equal(f.service.publicView('s1').stations[0].instructors[0].role,'Secondary');
 f.tables.sessions[0].startTime='09:00:00';
 assert.ok(has(f.service.read('lab','s1').validation,'SOURCE_CHANGED'));
});
test('request replay is exactly once and different payload reuse is denied',()=>{
 const f=fixture(),c=ready(f),p={sessionId:'s1',expectedRevision:c.revision,requestId:'same',draft:c.draft};const a=f.service.save('lab',p),count=f.tables.history.length;const b=f.service.save('lab',p);assert.equal(a.revision,b.revision);assert.equal(f.tables.history.length,count);p.draft.groups[0].code='changed';assert.throws(()=>f.service.save('lab',p),e=>e.code==='REQUEST_REUSE');
});
test('publication replay does not append a new release and revocation is rechecked',()=>{
 const f=fixture(),c=ready(f),p={sessionId:'s1',expectedRevision:c.revision,requestId:'p'};const a=f.service.publish('lab',p),b=f.service.publish('lab',p);assert.equal(a.version,b.version);f.tables.users[0].labScopes=[];assert.throws(()=>f.service.publish('lab',p),e=>e.code==='ROLE_DENIED');
});
test('LAB may book inside an approved ADC time envelope but must request ADC for extension',()=>{
 const f=fixture(),c=ready(f);c.draft.stations[0].runs[0].start='08:00';
 const n=saveAgain(f,c);
 assert.deepEqual(n.validation.requiredApprovals,['ADC']);
 assert.throws(()=>publish(f,n),e=>e.code==='LAB_VALIDATION');
});
test('operational writes cannot smuggle replacement instructors or teaching roles',()=>{
 const f=fixture(),c=ready(f);c.draft.stations[0].assignments=[{facultyId:'other',teachingRole:'Primary'}];assert.throws(()=>saveAgain(f,c),e=>e.code==='PROTECTED_ASSIGNMENT');
});
test('All does not exempt simultaneous students at two mandatory stations',()=>{
 const f=fixture();f.tables.sessions.push({...copy(f.tables.sessions[0]),id:'s2',topic:'Review',assignments:[],labApprovedRuns:[['08:30','16:30']]});let c=ready(f);const s=c.draft.stations.find(s=>s.sessionId==='s2');s.assignedGroupIds=['g1','g2','g3'];s.runs=[{id:'all-run',start:'08:30',end:'16:30',roomId:'r',mode:'all',groupIds:[]}];const n=saveAgain(f,c);assert.ok(has(n.validation,'STUDENT_OVERLAP'));assert.ok(has(n.validation,'ROOM_OVERLAP'));
});
test('unknown capacity and exceeded room capacity block publication',()=>{
 const f=fixture(),c=ready(f);c.draft.rooms[0].capacity=null;let n=saveAgain(f,c);assert.ok(has(n.validation,'CAPACITY_UNKNOWN'));n.draft.rooms[0].capacity=0;n=saveAgain(f,n,'capacity-zero');assert.ok(has(n.validation,'CAPACITY_EXCEEDED'));
});
test('LAB publication does not wait for Faculty approval or AFC clearance',()=>{
 const f=fixture(),c=ready(f);f.tables.faculty[0].activationDate='2026-12-01';
 f.tables.afcRecords.push({facultyId:'f1',active:true,startDate:'2026-11-03',endDate:'2026-11-03',reason:'SECRET'});
 assert.equal(f.service.read('lab','s1').validation.canPublish,true);publish(f,c);
 assert.equal(f.service.publicView('s1').version,1);
 assert.ok(!JSON.stringify(f.service.publicView('s1')).includes('SECRET'));
});
test('archiving freezes writes and hides historical Calendar publication',()=>{
 const f=fixture(),c=ready(f);publish(f,c);f.archive();assert.throws(()=>saveAgain(f,c),e=>e.code==='ARCHIVED_YEAR');assert.throws(()=>publish(f,c,'later'),e=>e.code==='ARCHIVED_YEAR');assert.equal(f.service.publicView('s1'),null);assert.equal(f.service.read('owner','s1').capabilities.canEdit,false);
});
test('invalid clock and reversed intervals are not silently converted or repaired',()=>{
 const f=fixture(),c=ready(f);c.draft.stations[0].runs[0].start='25:00';assert.ok(has(saveAgain(f,c).validation,'INVALID_TIME'));
});
test('arbitrary numbers of groups are accepted without multiplying teaching coverage',()=>{
 const f=fixture(),c=ready(f);c.draft.groups.push({id:'g4',code:'4',members:[{id:'student-4',name:'Private fourth'}]});c.draft.stations[0].assignedGroupIds.push('g4');c.draft.stations[0].runs[0].groupIds.push('g4');const n=saveAgain(f,c);assert.equal(n.validation.canPublish,true);publish(f,n);assert.deepEqual(f.service.publicView('s1').stations[0].runs[0].groups,['1','4']);
});
test('another published block catches student and room conflicts before ADFAD Faculty review',()=>{
 const f=fixture(),c=ready(f);publish(f,c);f.tables.sessions.push({...copy(f.tables.sessions[0]),id:'outside',courseCode:'VETM 599',topic:'Other lab'});const x=f.service.read('owner','outside');x.draft.groups=copy(c.draft.groups);x.draft.rooms=copy(c.draft.rooms);x.draft.stations[0].assignedGroupIds=['g1','g2','g3'];x.draft.stations[0].runs=copy(c.draft.stations[0].runs);const n=f.service.save('owner',{sessionId:'outside',expectedRevision:x.revision,requestId:'other',draft:x.draft});assert.ok(has(n.validation,'STUDENT_OVERLAP'));assert.ok(has(n.validation,'ROOM_OVERLAP'));assert.ok(!has(n.validation,'FACULTY_OVERLAP'));
});
test('new-year copy clears memberships and published releases and is still a draft',()=>{
 const f=fixture(),c=ready(f);publish(f,c);f.tables.sessions.push({...copy(f.tables.sessions[0]),id:'next',academicYear:'2027-28',date:'2027-11-03'});const n=f.service.copyStructure('owner',{fromSessionId:'s1',toSessionId:'next',expectedRevision:0,requestId:'copy'});assert.ok(n.draft.groups.every(g=>g.members.length===0));assert.equal(f.service.publicView('next'),null);assert.equal(n.draft.stations[0].sessionId,'next');assert.equal(n.scope.academicYear,'2027-28');
});
module.exports={fixture,ready};
test('faculty-free LAB stations can publish without creating substitute teaching records',()=>{
 const f=fixture();f.tables.sessions[0].assignments=[];const c=ready(f);
 assert.equal(c.validation.canPublish,true);publish(f,c);
 assert.deepEqual(f.service.publicView('s1').stations[0].instructors,[]);
});
test('archived authorized staff retain the immutable published schedule',()=>{
 const f=fixture(),c=ready(f);publish(f,c);f.archive();assert.equal(f.service.read('owner','s1').published.version,1);assert.equal(f.service.read('faculty','s1').published,null);
});
test('a room booked by another canonical course is unavailable even without Lab metadata',()=>{
 const f=fixture(),c=ready(f);f.tables.sessions.push({id:'lecture',academicYear:'2026-27',curriculumYear:'2',courseCode:'VTMD 304',sessionType:'LEC',topic:'Lecture',date:'2026-11-03',startTime:'09:00:00',endTime:'10:00:00',room:'lab',assignments:[]});assert.ok(has(f.service.read('lab','s1').validation,'ROOM_OVERLAP'));
});
test('faculty work conflicts do not block stage-2 LAB operational publication',()=>{
 const f=fixture();f.tables.activities.push({facultyKey:'f1',activityId:'work1',category:'clinical',startDate:'2026-11-03',endDate:'2026-11-03',timeEvidence:[{date:'2026-11-03',startTime:'09:00',endTime:'10:00'}]});
 assert.equal(ready(f).validation.canPublish,true);
});
test('pending AFC is reviewed when ADFAD assigns Faculty, not while LAB books a room',()=>{
 const f=fixture();ready(f);
 f.tables.extra.afcRequests=[{facultyId:'f1',status:'pending_admin',startDate:'2026-11-03',endDate:'2026-11-03',reason:'SECRET'}];
 const c=f.service.read('lab','s1');
 assert.equal(c.validation.canPublish,true);
 assert.ok(!JSON.stringify(c.validation).includes('SECRET'));
});
test('a removed canonical station returns source-changed instead of crashing the editor',()=>{
 const f=fixture();f.tables.sessions.push({...copy(f.tables.sessions[0]),id:'s2'});ready(f);f.tables.sessions.pop();const c=f.service.read('lab','s1');assert.ok(has(c.validation,'SOURCE_CHANGED'));assert.equal(c.validation.canPublish,false);
});
test('future working assignments cannot publish through an older Course release',()=>{
 const f=fixture();const row={...copy(f.tables.sessions[0]),id:'future',academicYear:'2027-28',date:'2027-11-03'};f.tables.sessions.push(row);
 const source={years:{'2027-28':{status:'active'}},annual:{'2027-28':{'VETM 505':{working:[row],revision:2,finalizedRevision:1,published:[{version:1,revision:1,sessions:[{...row,startTime:'09:30:00',assignments:[]}]}]}}}};
 const service=mod.createLabService({store:f.store,annualState:()=>source});assert.ok(has(service.read('owner','future').validation,'COURSE_CHANGED'));
});
test('only Owner grants explicit LAB course scopes without modifying base roles',()=>{
 const f=fixture();assert.equal(typeof f.service.grantScope,'function');assert.throws(()=>f.service.grantScope('lab',{sessionId:'s1',userId:'otherLab',requestId:'grant'}),e=>e.code==='ROLE_DENIED');f.service.grantScope('owner',{sessionId:'s1',userId:'otherLab',requestId:'grant'});assert.equal(f.service.read('otherLab','s1').capabilities.canEdit,true);assert.equal(f.tables.users[3].baseRole,'lab');
});
test('participant category remains distinct from the Primary or Secondary teaching role',()=>{
 const f=fixture();f.tables.sessions[0].assignments[0].participantCategory='Guest';const c=ready(f);publish(f,c);const teacher=f.service.publicView('s1').stations[0].instructors[0];assert.equal(teacher.role,'Primary');assert.equal(teacher.participantCategory,'Guest');
});
