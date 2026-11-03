'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const badge='<span class="testing-only-badge" title="Testing in progress - not yet accepted" aria-label="Testing in progress - not yet accepted">T</span>';
const modified=[
 'frontend/scripts/testing-only-features.js',
 'frontend/scripts/schedule-workflow.js',
 'frontend/scripts/lab-scheduling-entry.js',
 'frontend/scripts/lab-scheduling-editor.js',
 'frontend/scripts/schedule-office-ui.js',
 'frontend/scripts/schedule-bulk-ui.js',
 'frontend/scripts/workspace-tasks.js'
];

test('all modified UI scripts are valid JavaScript',()=>{
 for(const file of modified)assert.doesNotThrow(()=>new vm.Script(source(file),{filename:file}));
});

test('pending T badge reuses existing Testing badge styling and has clear tooltip',()=>{
 const window={document:{readyState:'loading',addEventListener(){}}};
 vm.runInNewContext(source(modified[0]),{window,console});
 assert.equal(window.UCVM_TESTING_ONLY.pendingBadge(),badge);
 assert.equal(window.UCVM_TESTING_ONLY.selectSessions,true);
});

function mount(file,role){
 const buttons=new Map(),handlers={};
 const host={prepend:button=>buttons.set(button.id,button)};
 const auth={currentUser:{uid:'test-uid'},onAuthStateChanged:fn=>{handlers.auth=fn;}};
 const document={
  readyState:'complete',body:{},
  addEventListener(){},
  querySelector:q=>q==='.timetable-top-actions'?host:null,
  querySelectorAll:()=>[],
  getElementById:id=>id==='calendar-body'?{}:(buttons.get(id)||null),
  createElement:tag=>({tag,innerHTML:'',textContent:'',setAttribute(){},addEventListener(){}})
 };
 const window={
  document,firebase:{auth:()=>auth},
  UCVM_PAWS_DEMO_API:{authoritative:false,store:{tables:{users:[{
   firebaseUid:'test-uid',baseRole:role,active:true,mustChangePassword:false
  }]}}},
  UCVM_TESTING_ONLY:{pendingBadge:()=>badge},
  PAWS_SCHEDULE_BULK_CSV:{},
  addEventListener:(event,fn)=>{handlers[event]=fn;}
 };
 vm.runInNewContext(source(file),{window,MutationObserver:class{observe(){}},console});
 return {buttons,handlers};
}

test('four scheduling toolbar controls receive one T badge even after re-render',()=>{
 const cases=[
  ['frontend/scripts/schedule-workflow.js','adc',['paws-schedule-workflow-open']],
  ['frontend/scripts/lab-scheduling-entry.js','lab',['paws-lab-scheduling-open']],
  ['frontend/scripts/schedule-office-ui.js','developer',['paws-office-adfa-queue']],
  ['frontend/scripts/schedule-bulk-ui.js','developer',['paws-developer-dashboard-open']]
 ];
 for(const [file,role,ids] of cases){
  const {buttons,handlers}=mount(file,role);
  for(const id of ids){
   assert.ok(buttons.has(id),file+' must create '+id);
   assert.ok(buttons.get(id).innerHTML.includes(badge),id+' missing T badge');
  }
  handlers.auth?.();
  for(const id of ids){
   assert.equal(buttons.get(id).innerHTML.split('testing-only-badge').length-1,1,id+' duplicated T badge');
  }
 }
});

test('workflow tasks, bulk import and dialogs have T; original Tasks remains unchanged',()=>{
 const tasks=source('frontend/scripts/workspace-tasks.js');
 const bulk=source('frontend/scripts/schedule-bulk-ui.js');
 const office=source('frontend/scripts/schedule-office-ui.js');
 const workflow=source('frontend/scripts/schedule-workflow.js');
 const lab=source('frontend/scripts/lab-scheduling-editor.js');
 const published=source('frontend/scripts/lab-scheduling-entry.js');
 assert.match(tasks,/esc\(item\.courseCode\)\+pendingBadge\(\)/);
 assert.match(tasks,/Download \/ Import ADFAD template/);
 assert.match(tasks,/Open Lab Scheduling · Bulk CSV/);
 assert.match(tasks,/button\.textContent=loading\?'Tasks/);
 assert.match(bulk,/action\.innerHTML='Bulk Import CSV \/ Excel Paste'\+pendingBadge\(\)/);
 assert.match(bulk,/const heading=.*pendingBadge\(\)/);
 assert.match(office,/pendingBadge\(\)\+'<\/h2>/);
 assert.match(workflow,/Schedule Workflow · Testing'\+pendingBadge\(\)/);
 assert.ok((lab.match(/Lab Scheduling'\+pendingBadge\(\)/g)||[]).length>=3,'Every LAB scheduling tab must retain a T badge');
 assert.match(published,/Published v'\+escape\(p\.version\).*pendingBadge/);
});
