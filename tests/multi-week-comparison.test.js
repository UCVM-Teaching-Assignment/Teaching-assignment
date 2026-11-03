'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {create,validate,key,SEMESTERS}=require('../frontend/scripts/multi-week-comparison');
const root=path.join(__dirname,'..');
const file=name=>fs.readFileSync(path.join(root,name),'utf8');

test('Fall Week 1 and Winter Week 5 can coexist and remain in selection order',()=>{
 const state=create({weekCount:17});
 assert.equal(state.add('fall',1),true);
 assert.equal(state.add('winter',5),true);
 assert.deepEqual(state.list(),[
  {semester:'fall',week:1,key:'fall:1'},
  {semester:'winter',week:5,key:'winter:5'}
 ]);
 assert.equal(state.size(),2);
});
test('removing X from one period does not modify other selected weeks',()=>{
 const state=create();
 state.add('fall',1);state.add('winter',5);state.add('spring',14);
 assert.equal(state.remove('winter:5'),true);
 assert.deepEqual(state.list().map(x=>x.key),['fall:1','spring:14']);
 assert.equal(state.remove('winter:5'),false);
 assert.equal(state.add('winter',5),true);
 assert.deepEqual(state.list().map(x=>x.key),['fall:1','spring:14','winter:5']);
});
test('chronological sorting spans Spring, Fall and Winter and sorts week numbers numerically',()=>{
 const model=create();
 for(const [term,week] of [['winter',5],['fall',10],['spring',7],['fall',2],['winter',1]])model.add(term,week);
 assert.deepEqual(model.sort('asc'),['spring:7','fall:2','fall:10','winter:1','winter:5']);
 assert.deepEqual(model.list().map(x=>x.key),['spring:7','fall:2','fall:10','winter:1','winter:5']);
 assert.deepEqual(model.sort('desc'),['winter:5','winter:1','fall:10','fall:2','spring:7']);
 assert.throws(()=>model.sort('sideways'),/Invalid week sort direction/);
 assert.equal(model.size(),5);
});
test('admin-facing arrow model moves only one selected card, respecting boundaries and missing keys',()=>{
 const model=create();
 model.add('fall',1);model.add('winter',5);model.add('spring',14);
 assert.equal(model.move('fall:1','up'),false);
 assert.equal(model.move('spring:14','down'),false);
 assert.equal(model.move('winter:5','up'),true);
 assert.deepEqual(model.list().map(x=>x.key),['winter:5','fall:1','spring:14']);
 assert.equal(model.move('winter:5','down'),true);
 assert.deepEqual(model.list().map(x=>x.key),['fall:1','winter:5','spring:14']);
 assert.equal(model.move('spring:14','up'),true);
 assert.deepEqual(model.list().map(x=>x.key),['fall:1','spring:14','winter:5']);
 assert.equal(model.move('not-selected','up'),false);
 assert.throws(()=>model.move('fall:1','diagonal'),/Invalid week move direction/);
 assert.equal(model.size(),3);
 assert.deepEqual(model.sort('asc'),['spring:14','fall:1','winter:5']);
 assert.equal(model.move('fall:1','up'),true);
 assert.deepEqual(model.list().map(x=>x.key),['fall:1','spring:14','winter:5']);
});
test('selection has no arbitrary UI cap: all 17 weeks in each academic semester can be added',()=>{
 const state=create();
 for(const semester of SEMESTERS)for(let w=1;w<=17;w++)assert.equal(state.add(semester,w),true);
 assert.equal(state.size(),51);
 assert.equal(new Set(state.list().map(x=>x.key)).size,51);
 assert.equal(state.remove('fall:7'),true);
 assert.equal(state.size(),50);
});
test('duplicate weeks are rejected without changing selection, invalid weeks fail closed',()=>{
 const state=create();
 state.add('fall',1);
 assert.equal(state.add('FALL','01'),false);
 assert.equal(state.size(),1);
 for(const period of [['fall',0],['winter',18],['bad',1],['spring',1.5],['fall',NaN]]){
  assert.throws(()=>state.add(...period),/valid semester and academic week/);
 }
 assert.equal(key('winter',5),'winter:5');
 assert.deepEqual(validate('WINTER','5',17),{semester:'winter',week:5,key:'winter:5'});
});
test('list is defensive copy and clearing selection never mutates other module instances',()=>{
 const a=create(),b=create();a.add('fall',1);b.add('winter',5);
 a.list()[0].week=11;
 assert.equal(a.list()[0].week,1);
 a.clear();
 assert.equal(a.size(),0);assert.equal(b.size(),1);
});
test('Testing Calendar exposes one Compare Weeks mode plus branded test marker',()=>{
 const html=file('frontend/pages/index.html');
 const script=file('frontend/scripts/timetable.js');
 const manifest=JSON.parse(file('tools/static-assets.paws.json'));
 const style=file('frontend/styles/multi-week-comparison.css');
 assert.equal((html.match(/id="cal-compare-btn"/g)||[]).length,1);
 assert.ok(html.includes('Compare Weeks <span class="testing-only-badge"'));
 assert.ok(html.includes('src="multi-week-comparison.js"'));
 assert.ok(html.indexOf('src="multi-week-comparison.js"')<html.indexOf('src="timetable.js"'));
 for(const asset of ['multi-week-comparison.js','multi-week-comparison.css'])assert.ok(manifest.includes(asset));
 assert.match(style,/\.multi-week-stack\{display:flex;flex-direction:column/);
 assert.match(script,/function renderMultiWeekComparison\(/);
 assert.match(script,/data-week-remove/);
 assert.match(script,/aria-label="Close /);
 assert.match(script,/data-week-retry/);
 assert.match(script,/id="comparison-order"/);
 assert.match(script,/multiWeekModel\.sort\(comparisonOrder\)/);
 assert.match(script,/multiWeekModel\.move\(periodKey,direction\)/);
 assert.match(script,/data-week-move/);
 assert.match(script,/data-week-direction="up"/);
 assert.match(script,/data-week-direction="down"/);
 assert.match(script,/canReorder=UCVM\.admin\(currentUser\)/);
 assert.match(script,/if\(!UCVM\.admin\(currentUser\)\)return/);
 assert.match(style,/\.multi-week-move:disabled/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('the comparison reuses the exact Week grid renderer and each week loads independently',()=>{
 const script=file('frontend/scripts/timetable.js');
 assert.match(script,/function weekGridMarkup\(start,data/);
 assert.match(script,/weekGridMarkup\(start,data,\{showCheckNeeded:!window.PAWS_TASKS\}\)/);
 assert.match(script,/weekGridMarkup\(start,rows,\{showCheckNeeded:true\}\)/);
 assert.match(script,/fetchPawsSessions\(\{start,end:ymd\(addDays\(parseYmd\(end\),1\)\)\}\)/);
 assert.match(script,/comparisonIdentity\(\)!==identity/);
 assert.match(script,/comparisonEpoch!==epoch/);
 assert.match(script,/comparisonPending\.get\(key\)!==request/);
 assert.match(script,/syncComparisonIdentity\(\)/);
 assert.match(script,/if\(viewMode==='compare'\)\{render\(\);return Promise\.resolve\(true\)\}/);
});
test('comparison honors existing filters and does not run normal export or write workflows against old scope',()=>{
 const script=file('frontend/scripts/timetable.js');
 assert.match(script,/semesterOverride:period\.semester,ignoreMonth:true,skipTypeRebuild:true/);
 assert.match(script,/selectedCourses\.has\(String\(s\.course\)\)/);
 assert.match(script,/sessionBelongsToCurrentFaculty\(s\)/);
 assert.match(script,/for\(const id of \['export-csv','export-calendar','outlook-invite-btn'\]\)/);
 assert.match(script,/Return to the Week view to select and edit sessions/);
 assert.match(script,/multiWeekModel\.clear\(\); clearComparisonCache\(\);comparisonScope=''/);
 assert.match(script,/This view shows scheduled sessions and enabled closures/);
});
