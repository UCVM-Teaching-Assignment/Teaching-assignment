'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{createEngine}=require('../frontend/scripts/multi-year-demo-model.js');
test('Future Faculty are not assigned before their official activation date in a new year',()=>{
 const source={faculty:[{facultyId:'future',displayName:'Future Faculty',active:true,appointmentValid:true,activationDate:'2027-06-01'}],
 users:[{firebaseUid:'owner',baseRole:'owner'},{firebaseUid:'adfa',baseRole:'adfa_general'}],
 courses:[{courseCode:'VTMD 123',courseName:'Example Course'}],sessions:[],
 roles:[{roleAssignmentId:'r1',facultyId:'future',roleType:'HICC',courseOrSubjectOrRotation:'VTMD 123',effectiveDate:'2026-05-01',expirationDate:'2027-04-30'}]};
 const demo=createEngine({source,storage:null,now:()=>new Date('2026-11-01T00:00:00Z')});
 const owner={uid:'owner',role:'owner'},adfa={uid:'adfa',role:'adfa_general'};
 demo.createYear(owner,'2027-28');
 assert.equal(demo.getState().roles['2027-28'][0].status,'draft');
 assert.equal(demo.getState().roles['2027-28'][0].rolloverReason,'future Faculty activation');
 demo.addCourse(adfa,'2027-28','VTMD 123');
 assert.throws(()=>demo.addSession(adfa,'2027-28','VTMD 123',{date:'2027-05-20',assignments:[{facultyId:'future',doeCredit:3}]}),/activation date/);
 const early=demo.addSession(adfa,'2027-28','VTMD 123',{date:'2027-05-20',assignments:[]});
 assert.throws(()=>demo.editAssignment(adfa,'2027-28','VTMD 123',early,'future'),/activation date/);
 assert.ok(demo.addSession(adfa,'2027-28','VTMD 123',{date:'2027-06-03',assignments:[{facultyId:'future',doeCredit:3}]}));
});

test('fresh inactive/ineligible Faculty cannot be assigned in synthetic editor',()=>{
 const source={faculty:[{facultyId:'eligible',displayName:'Eligible Tester',active:true},
  {facultyId:'retired',displayName:'Retired Tester',active:false},
  {facultyId:'invalid',displayName:'Invalid appointment',active:true,appointmentValid:false}],
  users:[{firebaseUid:'owner',baseRole:'owner'}],
  courses:[{courseCode:'VTMD 123',courseName:'Synthetic Course'}],
  sessions:[]};
 const actor={uid:'owner',role:'owner'};
 const demo=createEngine({source});
 demo.createYear(actor,'2027-28');demo.addCourse(actor,'2027-28','VTMD 123');
 assert.throws(()=>demo.addSession(actor,'2027-28','VTMD 123',{date:'2027-09-01',
  assignments:[{facultyId:'retired',doeCredit:1}]}),/inactive|ineligible/i);
 assert.throws(()=>demo.addSession(actor,'2027-28','VTMD 123',{date:'2027-09-01',
  assignments:[{facultyId:'invalid',doeCredit:1}]}),/inactive|ineligible/i);
 const id=demo.addSession(actor,'2027-28','VTMD 123',{date:'2027-09-01',
  assignments:[{facultyId:'eligible',doeCredit:2}]});
 assert.throws(()=>demo.editAssignment(actor,'2027-28','VTMD 123',id,'retired'),/inactive|ineligible/i);
 assert.deepEqual(demo.getState().annual['2027-28']['VTMD 123'].working[0].assignments.map(x=>x.facultyId),['eligible']);
});
