'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('../tools/pages-demo-api/store.js');
const {createAfcWriteRepository}=require('../tools/pages-demo-api/repos/admin-write.js');
const {createDashboardRepository}=require('../tools/pages-demo-api/repos/core.js');
const {createDashboardApi,validateAfcInput}=require('../server/src/data/dashboard-api.js');
const {isAdministratorRole}=require('../server/src/auth/role-policy.js');
const {uuidFor}=require('../tools/pages-demo-api/ids.js');
const leavePolicy=require('../frontend/scripts/afc-special-leave-policy.js');
const DATE='2026-11-06T18:00:00.000Z';
const fte25={fteDeduction:.25,allocationsByYear:{'2026-27':{teaching:15,service:5,research:5}}};
function fixture(){
  const store=createStore({now:()=>new Date(DATE)});
  const writer=createAfcWriteRepository(store);
  const admin=store.tables.users.find(u=>u.active===true&&isAdministratorRole(u.baseRole));
  assert.ok(admin);
  return {store,writer,admin,faculty:store.tables.faculty[0]};
}
async function create(f,override={}){
  const id=uuidFor('special-test-'+(override.key||'default'));
  const options={afcRecordId:id,facultyId:f.faculty.facultyId,startDate:'2026-11-10',endDate:'2026-11-20',reasonCode:'special',notes:'Approved leave',availability:'available',specialLeave:fte25,actorFirebaseUid:f.admin.firebaseUid,...override};
  delete options.key;
  await f.writer.createAfcRecord(options);
  return f.store.tables.afcRecords.find(r=>r.afcRecordId===id);
}
function source(f,year='2026-27'){
  const target=f.store.tables.targets.find(x=>x.facultyId===f.faculty.facultyId&&x.academicYear===year);
  return {fte:f.faculty.fte,doe:{teaching:target?.contractTeachingDoe??null,service:target?.serviceDoe??null,research:target?.researchDoe??null}};
}
function project(f,date){
  return leavePolicy.evaluate({date,source:source(f,leavePolicy.academicYearForDate(date)),leaves:f.store.tables.afcRecords.filter(r=>r.facultyId===f.faculty.facultyId).map(r=>({...r,...(r.specialLeave||{}),id:r.afcRecordId,approved:true,approvedAt:r.approvedAtUtc}))});
}
test('Admin creates an approved Available Leave while original Faculty FTE and DOE remain unchanged',async()=>{
 const f=fixture(),before=JSON.stringify(source(f));
 const row=await create(f);
 assert.equal(row.active,true);assert.equal(row.availability,'available');
 assert.equal(row.specialLeave.confirmedYears['2026-27'],true);
 assert.equal(project(f,'2026-11-15').effectiveFte,.75);
 assert.equal(project(f,'2026-11-21').effectiveFte,1);
 assert.equal(JSON.stringify(source(f)),before);
 assert.equal(f.store.tables.history.some(x=>x.changeType==='afc_record_created'),true);
 const own=await createDashboardRepository(f.store).facultyById({facultyId:f.faculty.facultyId,academicYear:'2026-27'});
 assert.equal(own.afcRecords.find(x=>x.afcRecordId===row.afcRecordId).specialLeave,undefined);
 const admin=await createDashboardRepository(f.store).listAfcRecords({limit:1000});
 assert.equal(admin.find(x=>x.afcRecordId===row.afcRecordId).specialLeave.fteDeduction,.25);
});
test('Missing Service/Research source creates an approved Pending record without applying deductions',async()=>{
 const f=fixture();f.faculty=f.store.tables.faculty[1];
 const row=await create(f);
 assert.equal(row.specialLeave.confirmedYears['2026-27'],false);
 assert.equal(project(f,'2026-11-15').effectiveFte,1);
 assert.equal(project(f,'2026-11-15').flags.includes('Pending Deduction'),true);
});
test('An AFC crossing May 1 applies separately in each year, leaving absent second-year sources pending',async()=>{
 const f=fixture();
 const row=await create(f,{startDate:'2027-04-20',endDate:'2027-05-09',specialLeave:fte25});
 assert.equal(row.specialLeave.confirmedYears['2026-27'],true);
 assert.equal(row.specialLeave.confirmedYears['2027-28'],false);
 assert.equal(project(f,'2027-04-30').effectiveFte,.75);
 assert.equal(project(f,'2027-05-01').effectiveFte,1);
});
test('A later overlapping Leave pauses conflicting dates until explicit Admin application',async()=>{
 const f=fixture();
 const first=await create(f,{key:'earlier',startDate:'2026-11-10',endDate:'2026-11-20',specialLeave:{fteDeduction:.7,allocationsByYear:{'2026-27':{teaching:30,service:20,research:20}}}});
 const second=await create(f,{key:'later',startDate:'2026-11-15',endDate:'2026-11-25',specialLeave:{fteDeduction:.5,allocationsByYear:{'2026-27':{teaching:20,service:15,research:15}}}});
 assert.equal(second.specialLeave.suspendedIntervals.length>0,true);
 assert.equal(project(f,'2026-11-16').effectiveFte,.3);
 assert.equal(project(f,'2026-11-23').effectiveFte,.5);
 first.active=false;
 assert.equal(project(f,'2026-11-16').flags.includes('Ready to Apply'),true);
 const before=second.versionToken;
 await f.writer.updateAfcSpecialLeave({afcRecordId:second.afcRecordId,expectedVersion:before,specialLeave:second.specialLeave,actorFirebaseUid:f.admin.firebaseUid});
 assert.notEqual(second.versionToken,before);
 assert.equal(project(f,'2026-11-16').effectiveFte,.5);
 await assert.rejects(f.writer.updateAfcSpecialLeave({afcRecordId:second.afcRecordId,expectedVersion:before,specialLeave:second.specialLeave,actorFirebaseUid:f.admin.firebaseUid}),err=>err.number===56404);
});
test('Available Special Leave is rejected on a writer without trusted deduction support',async()=>{
 let writes=0;
 const api=createDashboardApi({verifyToken:async()=>({uid:'admin'}),findUser:async()=>({baseRole:'administrator',active:true,mustChangePassword:false}),repository:{},writeRepository:{createAfcRecord:async()=>{writes++;}},writeGates:{afcSingle:true}});
 const body={facultyId:'11111111-1111-4111-8111-111111111111',startDate:'2026-11-10',endDate:'2026-11-20',reasonCode:'special',notes:'Approved',availability:'available',specialLeave:fte25};
 const reply=await api.createAfcRecord('token',body);
 assert.equal(reply.status,501);assert.equal(writes,0);
 assert.equal(validateAfcInput({...body,specialLeave:{fteDeduction:.25,allocationsByYear:{'2026-27':{teaching:15,service:5,research:4}}}}).status,400);
});
