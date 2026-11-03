'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const rootPath=path.join(__dirname,'..');
const source=file=>fs.readFileSync(path.join(rootPath,file),'utf8');
const model=require('../frontend/scripts/teaching-lists.js');

function fixture(){
 const calls=[],events={};
 let authenticatedUid='demo-user';
 const launcher={isConnected:true,focus(){doc.activeElement=launcher;}};
 const doc={activeElement:launcher,getElementById(id){return ids[id]||null;}};
 const tabs=['ccc','visc','hicc'].map(kind=>({
  dataset:{teachingTab:kind},tabIndex:-1,attributes:{},isConnected:true,
  addEventListener(k,fn){events['tab:'+kind+':'+k]=fn;},
  setAttribute(k,v){this.attributes[k]=String(v);},
  focus(){doc.activeElement=this;},
  getClientRects(){return [1];},
  closest(selector){return selector==='[data-teaching-tab]'?this:null;}
 }));
 const shell={
  hidden:true,attributes:{},
  setAttribute(k,v){this.attributes[k]=String(v);},
  addEventListener(k,fn){events['overlay:'+k]=fn;},
  querySelector(selector){return tabs.find(t=>selector==='[data-teaching-tab="'+t.dataset.teachingTab+'"]')||null;},
  querySelectorAll(selector){
   if(selector==='[data-teaching-tab]')return tabs;
   if(selector.includes('button:not([disabled])'))return [ids['teaching-lists-close'],...tabs];
   return [];
  }
 };
 const closeButton={
  isConnected:true,
  getClientRects(){return [1];},
  closest(){return null;},
  addEventListener(k,fn){events['close:'+k]=fn;},
  focus(){doc.activeElement=this;}
 };
 const ccc={
  hidden:true,
  setAttribute(k,v){this[k]=v;}
 };
 const leaders={
  hidden:true,
  setAttribute(k,v){this[k]=v;}
 };
 const ids={'teaching-lists-overlay':shell,'teaching-lists-close':closeButton,'ccc-schedule-overlay':ccc,'leadership-directory-overlay':leaders};
 const auth={get currentUser(){return authenticatedUid?{uid:authenticatedUid}:null;},onAuthStateChanged(fn){events.auth=fn;}};
 const root={
  document:doc,firebase:{auth:()=>auth},
  addEventListener(k,fn){events['root:'+k]=fn;},
  UCVM_PAGE_DATA:{academicYear:()=> '2026-27'},
  PAWS_CCC_SCHEDULE:{open(){calls.push('ccc open');ccc.hidden=false;},close(){calls.push('ccc close');ccc.hidden=true;}},
  PAWS_LEADERSHIP_DIRECTORY:{
   open(kind,year){calls.push(kind+' open '+year);leaders.hidden=false;},
   close(){calls.push('leadership close');leaders.hidden=true;}
  }
 };
 vm.runInNewContext(source('frontend/scripts/teaching-lists.js'),{window:root,console,Intl,Date});
 assert.equal(typeof root.PAWS_TEACHING_LISTS?.open,'function');
 return {doc,root,shell,ccc,leaders,tabs,launcher,calls,events,
  setUid(value){authenticatedUid=value;},
  command:root.PAWS_TEACHING_LISTS};
}
test('exactly CCC, VISC, HICC tabs with wraparound and Home/End navigation',()=>{
 assert.deepEqual(model.tabs,['ccc','visc','hicc']);
 assert.equal(model.normalize('hicc-cc'),null);
 assert.equal(model.keyboardTab('ccc','ArrowLeft'),'hicc');
 assert.equal(model.keyboardTab('ccc','ArrowRight'),'visc');
 assert.equal(model.keyboardTab('visc','End'),'hicc');
 assert.equal(model.keyboardTab('hicc','Home'),'ccc');
});
test('a single shared modal swaps authenticated existing data readers, without nested dialogs',()=>{
 const f=fixture();
 assert.equal(f.command.open('ccc'),true);
 assert.equal(f.shell.hidden,false);
 assert.equal(f.ccc.hidden,false);
 assert.equal(f.leaders.hidden,true);
 assert.equal(f.tabs[0].attributes['aria-selected'],'true');
 assert.equal(f.command.select('visc'),true);
 assert.equal(f.ccc.hidden,true);
 assert.equal(f.leaders.hidden,false);
 assert.equal(f.tabs[1].attributes['aria-selected'],'true');
 assert.equal(f.leaders['aria-labelledby'],'teaching-tab-visc');
 assert.equal(f.command.select('hicc'),true);
 assert.equal(f.leaders['aria-labelledby'],'teaching-tab-hicc');
 assert.equal(f.tabs[2].attributes['aria-selected'],'true');
 assert.deepEqual(f.calls,[
  'ccc open','ccc close','visc open 2026-27','leadership close','hicc-cc open 2026-27'
 ]);
 f.events['close:click']();
 assert.equal(f.command.isOpen(),false);
 assert.equal(f.shell.hidden,true);
 assert.equal(f.ccc.hidden,true);
 assert.equal(f.leaders.hidden,true);
 assert.equal(f.doc.activeElement,f.launcher,'focus returns to launcher');
});
test('keyboard switches pages and Escape closes entire popup, not one inner panel',()=>{
 const f=fixture();f.command.open('ccc');
 let prevented=0,stopped=0;
 f.events['overlay:keydown']({key:'ArrowRight',target:f.tabs[0],preventDefault(){prevented++;}});
 assert.equal(f.tabs[1].attributes['aria-selected'],'true');
 f.events['overlay:keydown']({key:'Escape',target:f.tabs[1],preventDefault(){prevented++;},stopPropagation(){stopped++;}});
 assert.equal(f.command.isOpen(),false);
 assert.equal(f.doc.activeElement,f.launcher);
 assert.equal(prevented,2);
 assert.equal(stopped,1);
});
test('sign-out/account switch closes dialog and clears current private panel',()=>{
 const f=fixture();f.command.open('visc');
 f.setUid('another-account');
 f.events['root:paws-profile']();
 assert.equal(f.command.isOpen(),false);
 assert.equal(f.leaders.hidden,true);
 assert.equal(f.command.open('ccc'),true);
 f.events.auth(null);
 assert.equal(f.command.isOpen(),false);
 assert.equal(f.ccc.hidden,true);
 f.setUid('');
 assert.equal(f.command.open('visc'),false,'signed-out user cannot reopen');
});
test('one navigation control and two reused read-only panels are packaged in the PAWS Demo',()=>{
 const html=source('frontend/pages/index.html');
 const timetable=source('frontend/scripts/timetable.js');
 const manifest=JSON.parse(source('tools/static-assets.paws.json'));
 assert.equal((html.match(/id="teaching-lists-overlay"/g)||[]).length,1);
 assert.equal((html.match(/data-teaching-tab=/g)||[]).length,3);
 assert.equal((html.match(/id="teaching-lists-btn"/g)||[]).length,1);
 for(const old of ['id="ccc-schedule-btn"','id="hicc-cc-list-btn"','id="visc-list-btn"'])assert.ok(!html.includes(old),old);
 for(const old of ["entry('ccc-schedule-btn'","entry('hicc-cc-list-btn'","entry('visc-list-btn'"])assert.ok(!timetable.includes(old),old);
 assert.equal((timetable.match(/entry\('teaching-lists-btn'/g)||[]).length,1);
 const pos=html.indexOf('id="teaching-lists-overlay"');
 assert.ok(pos>=0&&pos<html.indexOf('id="ccc-schedule-overlay"')&&pos<html.indexOf('id="leadership-directory-overlay"'));
 assert.ok(html.indexOf('src="teaching-lists.js"')>html.indexOf('src="leadership-directory.js"'));
 for(const asset of ['teaching-lists.js','teaching-lists.css'])assert.ok(manifest.includes(asset),asset);
 assert.match(source('frontend/scripts/workspace-navigation.js'),/\.teaching-lists-overlay:not\(\[hidden\]\)/);
});
test('existing CCC and leadership readers keep their projections, search and refresh',()=>{
 const ccc=source('frontend/scripts/ccc-schedule.js');
 const leadership=source('frontend/scripts/leadership-directory.js');
 for(const term of ['cccSchedule(selected)','filterEntries(entries,search.value)','groupEntries(filtered)'])assert.ok(ccc.includes(term),term);
 for(const term of ['leadershipDirectory(year)','viewRows(all,{kind','validateResponse(response,year)'])assert.ok(leadership.includes(term),term);
 assert.ok(ccc.includes("if(!embedded)closeButton.focus()"),'legacy CCC focus is delegated');
 assert.ok(leadership.includes("if(!embedded)closeButton.focus()"),'legacy leadership focus is delegated');
});
