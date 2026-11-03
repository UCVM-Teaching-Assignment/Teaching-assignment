'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createEngine,STORAGE_KEY}=require('../frontend/scripts/multi-year-demo-model.js');
const owner={uid:'owner',role:'owner'},adfa={uid:'adfa',role:'adfa_general'};
const facultyActor={uid:'faculty',role:'faculty',facultyId:'partial'};
const source={
 faculty:[
  {facultyId:'partial',displayName:'Partial Year Tester',active:true,appointmentValid:true},
  {facultyId:'invalid',displayName:'Invalid Appointment',active:true,appointmentValid:false},
  {facultyId:'future',displayName:'Future Appointment',active:true,appointmentValid:true,activationDate:'2027-06-01'},
  {facultyId:'inactive',displayName:'Inactive Person',active:false,appointmentValid:true},
  {facultyId:'complete',displayName:'Full Year',active:true,appointmentValid:true}
 ],
 users:[
  {firebaseUid:'owner',baseRole:'owner'},
  {firebaseUid:'adfa',baseRole:'adfa_general'},
  {firebaseUid:'faculty',baseRole:'faculty',facultyId:'partial'}
 ],
 courses:[{courseCode:'VTMD 123',courseName:'Synthetic Course'}],
 sessions:[],
 roles:[
  {roleAssignmentId:'r-partial',facultyId:'partial',roleType:'HICC',courseOrSubjectOrRotation:'VTMD 123',
   effectiveDate:'2026-07-01',expirationDate:'2026-12-31'},
  {roleAssignmentId:'r-invalid',facultyId:'invalid',roleType:'HICC',courseOrSubjectOrRotation:'VTMD 123',
   effectiveDate:'2026-05-01',expirationDate:'2026-12-31'},
  {roleAssignmentId:'r-future',facultyId:'future',roleType:'HICC',courseOrSubjectOrRotation:'VTMD 123',
   effectiveDate:'2026-05-01',expirationDate:'2027-04-30'},
  {roleAssignmentId:'r-inactive',facultyId:'inactive',roleType:'VISC',courseOrSubjectOrRotation:'Anatomy',
   effectiveDate:'2026-05-01',expirationDate:'2026-12-31'},
  {roleAssignmentId:'r-complete',facultyId:'complete',roleType:'HICC',courseOrSubjectOrRotation:'VTMD 123',
   effectiveDate:'2026-05-01',expirationDate:'2027-04-30'}
 ]
};
function engine(storage=null){
 const m=createEngine({source,storage,now:()=>new Date('2026-11-03T10:00:00Z')});
 m.createYear(owner,'2027-28');
 return m;
}
test('ADFAD bulk review previews every Draft and skips invalid/inactive/future Faculty',()=>{
 const m=engine(),p=m.previewRoleConfirmations(adfa,'2027-28');
 assert.equal(p.pending,4);
 assert.equal(p.alreadyConfirmed,1);
 assert.deepEqual(p.eligibleIds,['renew-2027-28-0']);
 assert.equal(p.partialYear,1);
 assert.equal(p.skipped.length,3);
 assert.deepEqual(new Set(p.skipped.map(x=>x.reason)),
  new Set(['Invalid Faculty appointment','Faculty starts after role start','Inactive Faculty']));
 assert.deepEqual(m.getState().roles['2027-28'].map(x=>x.status),
  ['draft','draft','draft','draft','confirmed']);
});
test('one action confirms all eligible Drafts and audits once without touching DOE or published Courses',()=>{
 const m=engine(),before=m.getState(),p=m.previewRoleConfirmations(adfa,'2027-28');
 const result=m.confirmRolesBulk(adfa,'2027-28',p.eligibleIds);
 assert.deepEqual(result,{confirmed:1,skipped:3,pending:4});
 const after=m.getState();
 assert.deepEqual(after.roles['2027-28'].map(x=>x.status),
  ['confirmed','draft','draft','draft','confirmed']);
 assert.deepEqual(after.roles['2026-27'],before.roles['2026-27']);
 assert.deepEqual(after.doe,before.doe);
 assert.deepEqual(after.annual,before.annual);
 const receipts=after.audit.filter(x=>x.event==='annual_roles_confirmed_bulk');
 assert.equal(receipts.length,1);
 assert.deepEqual(receipts[0].detail,{count:1,roleIds:['renew-2027-28-0'],skipped:3,partialYearReviewed:1});
});
test('single confirmation validates the same Faculty eligibility and keeps existing approved roles unchanged',()=>{
 const m=engine();
 for(const id of ['renew-2027-28-1','renew-2027-28-2','renew-2027-28-3'])
  assert.throws(()=>m.confirmRole(adfa,'2027-28',id),/Cannot confirm this Role/);
 assert.throws(()=>m.confirmRole(adfa,'2027-28','renew-2027-28-4'),/not draft/i);
 assert.equal(m.confirmRole(adfa,'2027-28','renew-2027-28-0').status,'confirmed');
});
test('bulk confirmation refuses stale selection and is idempotent when no eligible Drafts remain',()=>{
 const m=engine(),p=m.previewRoleConfirmations(adfa,'2027-28');
 m.confirmRole(adfa,'2027-28',p.eligibleIds[0]);
 assert.throws(()=>m.confirmRolesBulk(adfa,'2027-28',p.eligibleIds),/changed/i);
 const before=m.getState().audit.length;
 assert.deepEqual(m.confirmRolesBulk(adfa,'2027-28',[]),{confirmed:0,skipped:3,pending:3});
 assert.equal(m.getState().audit.length,before);
 assert.throws(()=>m.confirmRolesBulk(adfa,'2027-28',[p.eligibleIds[0],p.eligibleIds[0]]),/Invalid bulk/);
});
test('archived years and non-ADFAD roles cannot bulk confirm or expose approval preview',()=>{
 const m=engine(),p=m.previewRoleConfirmations(adfa,'2027-28');
 assert.throws(()=>m.previewRoleConfirmations(facultyActor,'2027-28'),/ADFAD approval required/);
 assert.throws(()=>m.confirmRolesBulk(facultyActor,'2027-28',p.eligibleIds),/ADFAD approval required/);
 m.retireYear(owner,'2027-28',true);
 assert.throws(()=>m.confirmRolesBulk(adfa,'2027-28',p.eligibleIds),/Archived academic year/);
});
test('all eligible Drafts are processed including the rows beyond the UI table limit of 200',()=>{
 const many=structuredClone(source);
 many.roles=Array.from({length:210},(_,i)=>({
  roleAssignmentId:'r-'+i,facultyId:'partial',roleType:'HICC',courseOrSubjectOrRotation:'VTMD 123',
  effectiveDate:'2026-06-01',expirationDate:'2026-10-31'
 }));
 const m=createEngine({source:many,now:()=>new Date('2026-11-03T12:00:00Z')});
 m.createYear(owner,'2027-28');
 const p=m.previewRoleConfirmations(adfa,'2027-28');
 assert.equal(p.eligibleIds.length,210);
 assert.equal(m.confirmRolesBulk(adfa,'2027-28',p.eligibleIds).confirmed,210);
 assert.equal(m.getState().roles['2027-28'].every(x=>x.status==='confirmed'),true);
});
test('bulk role actions are visible only to ADFAD and preserve existing per-role review',()=>{
 const sourceJs=fs.readFileSync(path.join(__dirname,'../frontend/scripts/multi-year-demo.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(sourceJs));
 assert.match(sourceJs,/Confirm All Eligible Drafts/);
 assert.match(sourceJs,/UCVM_TESTING_ONLY/);
 assert.match(sourceJs,/data-my-action="confirm-all-roles"/);
 assert.match(sourceJs,/previewRoleConfirmations/);
 assert.match(sourceJs,/confirmRolesBulk/);
 assert.match(sourceJs,/data-my-confirm-role=/);
 assert.match(sourceJs,/including rows beyond the 200 visible/);
 assert.match(sourceJs,/Ineligible, missing or future-start appointments are skipped/);
});
