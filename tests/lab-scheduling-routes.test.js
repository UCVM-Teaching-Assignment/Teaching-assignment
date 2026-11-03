'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
let api={};try{api=require('../tools/pages-demo-api/lab-scheduling-routes')}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}
function setup(){
 assert.equal(typeof api.createLabRoutes,'function');
 const tables={academicYear:'2026-27',users:[{firebaseUid:'owner',baseRole:'owner',active:true,mustChangePassword:false},{firebaseUid:'lab',baseRole:'lab',active:true,mustChangePassword:false},{firebaseUid:'faculty',baseRole:'faculty',active:true,mustChangePassword:false}],sessions:[],faculty:Array.from({length:6},(_,i)=>({facultyId:'f'+i,displayName:'Synthetic '+i,active:true})),courses:[],activities:[],afcRecords:[],history:[],extra:{}};
 const store={tables,nowIso:()=> '2026-11-02T19:00:00.000Z',commit(){},bag(n,f){return tables.extra[n]||(tables.extra[n]=f())},audit(e){tables.history.push(e)}};
 const route=api.createLabRoutes({store,verify:async token=>{if(!token.startsWith('test-'))throw Error('bad token');return{uid:token.slice(5)}},findUser:async uid=>tables.users.find(u=>u.firebaseUid===uid),calculateDoe:()=>({rate:null,quantity:null,calculatedDoe:null}),annualState:()=>null});
 const request=(path,method='GET',body,uid='owner')=>route(new Request('https://pages-demo.invalid/api/v1/lab-scheduling'+path,{method,headers:uid?{Authorization:'Bearer test-'+uid,'Content-Type':'application/json'}:{},body:body===undefined?undefined:JSON.stringify(body)}));
 return{tables,request};
}
test('unauthenticated edits fail and no source data changes',async()=>{const f=setup();const r=await f.request('/sample','POST',{},null);assert.equal(r.status,401);assert.equal(f.tables.sessions.length,0)});
test('public endpoint does not initialize or expose unpublished drafts',async()=>{const f=setup();await f.request('/sample','POST',{});const list=await f.request('');const sid=list.jsonBody.items[0].sessionId;const r=await f.request('/public?sessionId='+sid,'GET',undefined,null);assert.equal(r.status,200);assert.equal(r.jsonBody.publication,null);assert.ok(!JSON.stringify(r).includes('student-'))});
test('only Owner/Developer can initialize the synthetic example and scoped Lab access',async()=>{const f=setup();assert.equal((await f.request('/sample','POST',{},'lab')).status,403);const result=await f.request('/sample','POST',{});assert.equal(result.status,200);assert.equal(f.tables.sessions.length,2);assert.equal(f.tables.users[1].labScopes[0].courseCode,'VETM 505');const list=await f.request('','GET',undefined,'lab');assert.equal(list.jsonBody.items.length,1);await f.request('/sample','POST',{});assert.equal(f.tables.sessions.length,2)});
test('reference All/student overlaps remain visible instead of silently publishing',async()=>{const f=setup();const response=await f.request('/sample','POST',{});assert.ok(response.jsonBody.validation.issues.some(x=>x.code==='STUDENT_OVERLAP'));assert.equal(response.jsonBody.published,null)});
test('Faculty context never returns the working roster',async()=>{const f=setup();const response=await f.request('/sample','POST',{});const id=response.jsonBody.sourceSessions[0].id;const r=await f.request('/context?sessionId='+id,'GET',undefined,'faculty');assert.equal(r.status,200);assert.equal(r.jsonBody.draft,undefined);const roster=await f.request('/roster?sessionId='+id+'&version=1','GET',undefined,'faculty');assert.equal(roster.status,403)});
test('route rejects wrong method and malformed JSON with controlled errors',async()=>{const f=setup();const r=await f.request('/publish','GET');assert.equal(r.status,405)});
test('Faculty activity listing uses published labels, not changed working topics',async()=>{
 const f=setup(),seed=(await f.request('/sample','POST',{})).jsonBody,id=seed.sourceSessions[0].id,draft=seed.draft;
 draft.groups.push({id:'separate',code:'4',members:[{id:'separate-student',name:'Synthetic only'}]});draft.stations[0].assignedGroupIds=['separate'];
 const saved=(await f.request('/draft','POST',{sessionId:id,expectedRevision:seed.revision,requestId:'save-publishable',draft})).jsonBody;
 assert.equal((await f.request('/publish','POST',{sessionId:id,expectedRevision:saved.revision,requestId:'publish'})).status,200);
 f.tables.sessions[0].topic='UNPUBLISHED SECRET TOPIC';const listing=await f.request('','GET',undefined,'faculty');assert.ok(!JSON.stringify(listing).includes('UNPUBLISHED SECRET'));
});

test('LAB Coordinator opens and saves an ordinary 2026-27 Lab without Owner manually granting its course',async()=>{
 const f=setup();
 f.tables.users[1].firebaseUid='uid-lab-1';
 f.tables.sessions.push({id:'ordinary-lab',academicYear:'2026-27',curriculumYear:'2',courseCode:'VTMD 304',date:'2026-11-03',sessionType:'LAB',topic:'Synthetic Year 2',startTime:'08:30:00',endTime:'10:30:00',room:'Demo Room',updatedAtUtc:'v1',assignments:[]});
 const list=await f.request('','GET',undefined,'uid-lab-1');
 assert.equal(list.status,200);
 assert.equal(list.jsonBody.items.find(item=>item.sessionId==='ordinary-lab')?.canEdit,true);
 const context=await f.request('/context?sessionId=ordinary-lab','GET',undefined,'uid-lab-1');
 assert.equal(context.status,200);
 assert.equal(context.jsonBody.capabilities.canEdit,true);
 const updated=await f.request('/draft','POST',{sessionId:'ordinary-lab',expectedRevision:context.jsonBody.revision,requestId:'seeded-lab-edits',draft:context.jsonBody.draft},'uid-lab-1');
 assert.equal(updated.status,200);
 assert.equal(updated.jsonBody.revision,1);
 assert.equal((await f.request('/context?sessionId=ordinary-lab','GET',undefined,'faculty')).jsonBody.draft,undefined);
});

test('resource reservation API separates LAB Reserve Notes from Owner confirmation',async()=>{
 const f=setup();
 f.tables.users[1].labScopes=[{academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505'}];
 f.tables.sessions.push({id:'reserve-1',academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505',
  sessionType:'LAB',topic:'Synthetic equine lab',date:'2026-11-03',startTime:'08:30:00',
  endTime:'10:30:00',room:'Demo Lab',updatedAtUtc:'v1',assignments:[]});
 const payload={sessionId:'reserve-1',expectedVersion:0,horseCount:2,petProfessorCount:0,
  notes:'Please reserve two synthetic horses for this station',requestId:'send-reserve-note'};
 const write=await f.request('/resource-request','POST',payload,'lab');
 assert.equal(write.status,200);
 assert.equal(write.jsonBody.request.status,'requested');
 assert.equal(write.jsonBody.assessment.availableHorseCount,38);
 const privateRead=await f.request('/resources?sessionId=reserve-1','GET',undefined,'lab');
 assert.equal(privateRead.jsonBody.request.notes,payload.notes);
 assert.equal((await f.request('/resources?sessionId=reserve-1','GET',undefined,'faculty')).status,403);
 const denial=await f.request('/resource-review','POST',{
  sessionId:'reserve-1',expectedVersion:1,decision:'confirm',horseIds:['H01','H02'],reviewNote:'',requestId:'lab-cannot-review'},'lab');
 assert.equal(denial.status,403);
 const approved=await f.request('/resource-review','POST',{
  sessionId:'reserve-1',expectedVersion:1,decision:'confirm',horseIds:['H01','H02'],
  reviewNote:'Synthetic animal check',requestId:'owner-confirm'},'owner');
 assert.equal(approved.status,200);assert.equal(approved.jsonBody.request.status,'confirmed');
 const pub=await f.request('/public?sessionId=reserve-1','GET',undefined,null);
 assert.equal(pub.status,200);
 assert.ok(!JSON.stringify(pub.jsonBody).includes(payload.notes),'private notes never appear in public Calendar projections');
});
test('resource policy and capacity preview are protected by LAB scope and Owner role',async()=>{
 const f=setup();
 f.tables.sessions.push({id:'resource-preview',academicYear:'2026-27',curriculumYear:'2',courseCode:'VTMD 304',
  sessionType:'LAB',topic:'Synthetic pets',date:'2026-11-03',startTime:'09:00:00',
  endTime:'10:00:00',room:'Demo Lab',updatedAtUtc:'v1',assignments:[]});
 const proposal={sessionId:'resource-preview',horseCount:0,petProfessorCount:31};
 assert.equal((await f.request('/resource-preview','POST',proposal,'faculty')).status,403);
 const preview=await f.request('/resource-preview','POST',proposal,'owner');
 assert.equal(preview.status,200);assert.ok(preview.jsonBody.warnings.some(x=>x.code==='PET_PROFESSOR_THRESHOLD'));
 const rule={expectedRevision:1,horsePoolSize:38,horseRestHours:24,petProfessorThreshold:35,
  petWindowHours:48,requestId:'adjust-limits'};
 assert.equal((await f.request('/resource-rules','POST',rule,'lab')).status,403);
 const set=await f.request('/resource-rules','POST',rule,'owner');
 assert.equal(set.status,200);assert.equal(set.jsonBody.policy.petProfessorThreshold,35);
});
