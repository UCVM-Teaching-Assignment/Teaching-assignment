'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLabService}=require('../tools/pages-demo-api/lab-scheduling.js');
function fixture(){
 const users=[
  {firebaseUid:'uid-lab-1',baseRole:'lab',active:true,mustChangePassword:false},
  {firebaseUid:'uid-lab-2',baseRole:'lab',active:true,mustChangePassword:false,labScopes:[{academicYear:'2027-28',curriculumYear:'2',courseCode:'VTMD 399'}]},
  {firebaseUid:'custom-lab',baseRole:'lab',active:true,mustChangePassword:false},
  {firebaseUid:'faculty',baseRole:'faculty',active:true,mustChangePassword:false}
 ];
 const session=(id,year,curriculumYear,courseCode,date,type='LAB')=>({id,academicYear:year,curriculumYear,courseCode,date,sessionType:type,topic:'Synthetic '+id,startTime:'08:30:00',endTime:'10:30:00',room:'Demo Room',updatedAtUtc:'v1',assignments:[]});
 const tables={academicYear:'2026-27',users,faculty:[],sessions:[
  session('lab-y1','2026-27','1','VTMD 212','2026-09-01'),
  session('lab-y3','2026-27','3','VTMD 422','2026-11-03'),
  session('lab-next','2027-28','3','VTMD 422','2027-11-03'),
  session('lecture','2026-27','2','VTMD 304','2026-10-05','LEC')
 ],extra:{},history:[],afcRecords:[],activities:[]};
 let commits=0;
 const store={tables,nowIso:()=> '2026-11-02T20:00:00.000Z',commit(){commits++},audit(x){tables.history.push(x)},bag(n,f){return tables.extra[n]||(tables.extra[n]=f())}};
 return {tables,service:createLabService({store}),get commits(){return commits}};
}
test('two seeded Demo LAB accounts can edit existing 2026-27 LABs without Owner setup',()=>{
 const f=fixture();
 for(const uid of ['uid-lab-1','uid-lab-2']){
  assert.deepEqual(f.service.list(uid).filter(x=>x.canEdit).map(x=>x.sessionId),['lab-y1','lab-y3']);
  assert.equal(f.service.read(uid,'lab-y3').capabilities.canEdit,true);
  assert.equal(f.service.read(uid,'lab-next').capabilities.canEdit,false);
 }
 assert.equal(f.tables.users[0].labScopes.length,2);
 assert.equal(f.tables.users[1].labScopes.length,3);
 assert.ok(f.commits>0,'save the bootstrap into old browser-local data');
});
test('ordinary LAB users and Faculty do not receive implicit scopes',()=>{
 const f=fixture();f.service.list('uid-lab-1');
 assert.equal(f.service.read('custom-lab','lab-y1').capabilities.canEdit,false);
 assert.equal(f.service.read('faculty','lab-y1').capabilities.canEdit,false);
 assert.throws(()=>f.service.save('custom-lab',{sessionId:'lab-y1',requestId:'no',expectedRevision:0,draft:{}}),e=>e.code==='ROLE_DENIED');
 assert.throws(()=>f.service.save('uid-lab-1',{sessionId:'lab-next',requestId:'no',expectedRevision:0,draft:{}}),e=>e.code==='ROLE_DENIED');
});
test('scope bootstrap occurs once and respects revocations and new-course grant requirements',()=>{
 const f=fixture();f.service.list('uid-lab-1');const count=f.commits;
 assert.ok(f.tables.users[1].labScopes.some(s=>s.courseCode==='VTMD 399'));
 f.service.list('uid-lab-1');assert.equal(f.commits,count);
 f.tables.users[0].labScopes=[];
 assert.equal(f.service.read('uid-lab-1','lab-y1').capabilities.canEdit,false);
 f.tables.sessions.push({...f.tables.sessions[0],id:'new-lab',courseCode:'VTMD 213'});
 assert.equal(f.service.read('uid-lab-1','new-lab').capabilities.canEdit,false);
});
test('non-LAB role conversion is never granted Demo LAB scopes',()=>{
 const f=fixture();f.tables.users[0].baseRole='faculty';f.service.list('uid-lab-2');
 assert.equal(f.tables.users[0].labScopes,undefined);
});
