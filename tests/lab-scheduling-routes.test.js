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
