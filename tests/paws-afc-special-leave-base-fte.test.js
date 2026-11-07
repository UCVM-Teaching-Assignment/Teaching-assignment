'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSpecialLeaveEditor,renderRows}=require('../frontend/scripts/faculty-admin-afc-records.js');
const policy=require('../frontend/scripts/afc-special-leave-policy.js');

function editorFixture(){
  const nodes={
    'afc-special-options':{classList:{toggle(){}}},
    'afc-special-deduction':{classList:{toggle(){}}},
    'afc-special-years':{innerHTML:'',querySelectorAll(){return[];}},
    'afc-special-source-status':{textContent:''},
    'afc-special-base-fte':{textContent:''},
    'afc-reason':{value:'special'},
    'afc-special-availability':{value:'available'},
    'afc-faculty':{value:'f-01'},
    'afc-start-date':{value:''},
    'afc-end-date':{value:''},
    'afc-special-fte':{value:'0.25'}
  };
  const roster={'f-01':0.80,'f-02':0.50};
  let detailCalls=0;
  const editor=createSpecialLeaveEditor({
    api:{async dashboardFacultyById(){detailCalls++;return {faculty:{fte:0.80},contractDoe:{allocations:[]}};}},
    $:id=>nodes[id],policy,
    getFacultyBaseFte:id=>Object.prototype.hasOwnProperty.call(roster,id)?roster[id]:null
  });
  return {editor,nodes,roster,get detailCalls(){return detailCalls;}};
}

test('Special Leave shows stored Base FTE beside deduction immediately after choosing Faculty, before dates',async()=>{
  const f=editorFixture();
  await f.editor.refresh();
  assert.match(f.nodes['afc-special-base-fte'].textContent,/Base FTE[^\n]*0\.80/);
});

test('Base FTE reflects the selected Faculty and clears stale values when changing selection',async()=>{
  const f=editorFixture();
  await f.editor.refresh();
  f.nodes['afc-faculty'].value='f-02';
  await f.editor.refresh();
  assert.match(f.nodes['afc-special-base-fte'].textContent,/0\.50/);
  f.nodes['afc-faculty'].value='';
  await f.editor.refresh();
  assert.doesNotMatch(f.nodes['afc-special-base-fte'].textContent,/0\.50|0\.80/);
});

test('Existing Special Leave edit shows stored Base FTE separately from deduction',()=>{
  const row={afcRecordId:'11111111-1111-4111-8111-111111111111',facultyId:'f-01',startDate:'2026-11-10',endDate:'2026-11-20',reasonCode:'special',availability:'available',active:true,sourceKind:'manual',versionToken:'0000000000000001',specialLeave:{fteDeduction:.25,allocationsByYear:{'2026-27':{teaching:15,service:5,research:5}},confirmedYears:{'2026-27':true}}};
  const key='manual:'+row.afcRecordId;
  const html=renderRows([row],{facultyName:()=> 'Faculty A',canEdit:true,editingSpecialKey:key,busy:()=>false,renderPdf:()=>'',getFacultyBaseFte:()=>.80});
  assert.match(html,/Base FTE[^<]*0\.80/);
  assert.match(html,/FTE Deduction/);
});
