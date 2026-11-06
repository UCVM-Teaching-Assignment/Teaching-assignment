'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../frontend/scripts/afc-special-leave-policy.js');
const source = {fte:1,doe:{teaching:40,service:30,research:30}};
const leaf = (o={}) => ({id:'A',reasonCode:'special',availability:'available',approved:true,active:true,startDate:'2026-11-01',endDate:'2026-11-30',approvedAt:'2026-10-01',fteDeduction:0.25,allocationsByYear:{'2026-27':{teaching:15,service:5,research:5}},...o});
test('a 0.25 FTE deduction maps exactly to 25 DOE and is date-bound',()=>{
 const current=policy.evaluate({date:'2026-11-12',source,leaves:[leaf()]});
 assert.equal(current.effectiveFte,0.75);assert.deepEqual(current.effectiveDoe,{teaching:25,service:25,research:25});
 assert.equal(policy.evaluate({date:'2026-12-01',source,leaves:[leaf()]}).effectiveFte,1);
});
test('zero deduction is valid, but mismatched split is rejected',()=>{
 assert.equal(policy.validateAllocation(0,{teaching:0,service:0,research:0},source).valid,true);
 assert.equal(policy.validateAllocation(.25,{teaching:15,service:5,research:4},source).valid,false);
 assert.equal(policy.validateAllocation(.25,{teaching:41,service:-21,research:5},source).valid,false);
});
test('source mismatch is a warning, not a rejection',()=>{
 const v=policy.validateAllocation(.25,{teaching:15,service:5,research:5},{fte:.8,doe:{teaching:40,service:30,research:20}});
 assert.equal(v.valid,true);assert.equal(v.warnings.includes('FTE_DOE_MISMATCH'),true);
});
test('a missing category source produces Pending and no deduction',()=>{
 const v=policy.evaluate({date:'2026-11-10',source:{fte:1,doe:{teaching:40,service:null,research:null}},leaves:[leaf()]});
 assert.equal(v.effectiveFte,1);assert.equal(v.flags.includes('Pending Deduction'),true);
});
test('overlap pauses the later leave only on dates with overage',()=>{
 const a=leaf({fteDeduction:.3,allocationsByYear:{'2026-27':{teaching:20,service:5,research:5}}});
 const b=leaf({id:'B',startDate:'2026-11-15',endDate:'2026-12-15',approvedAt:'2026-10-02',fteDeduction:.8,allocationsByYear:{'2026-27':{teaching:20,service:30,research:30}}});
 const overlap=policy.evaluate({date:'2026-11-18',source,leaves:[b,a]});
 assert.equal(overlap.effectiveFte,.7);assert.equal(overlap.flags.includes('Partial Adjustment Required'),true);
 const alone=policy.evaluate({date:'2026-12-04',source,leaves:[b,a]});
 assert.equal(alone.effectiveFte,.2);
});
test('academic year changes on May 1 and missing year remains pending',()=>{
 const a=leaf({startDate:'2027-04-20',endDate:'2027-05-20'});
 assert.equal(policy.academicYearForDate('2027-04-30'),'2026-27');
 assert.equal(policy.academicYearForDate('2027-05-01'),'2027-28');
 assert.equal(policy.evaluate({date:'2027-05-01',source,leaves:[a]}).flags.includes('Pending Deduction'),true);
});
test('Unavailable AFC overrides Available Special Leave',()=>{
 const a=leaf();const other={id:'X',active:true,availability:'unavailable',startDate:'2026-11-10',endDate:'2026-11-18'};
 assert.equal(policy.availabilityAt('2026-11-12',[a,other]),'unavailable');
 assert.equal(policy.availabilityAt('2026-11-19',[a,other]),'available');
});
test('FTE at zero remains Available and warns',()=>{
 const a=leaf({fteDeduction:1,allocationsByYear:{'2026-27':{teaching:40,service:30,research:30}}});
 const v=policy.evaluate({date:'2026-11-03',source,leaves:[a]});
 assert.equal(v.effectiveFte,0);assert.equal(v.availability,'available');assert.equal(v.flags.includes('Zero Effective FTE'),true);
});
