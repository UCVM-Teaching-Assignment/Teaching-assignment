'use strict';
// Browser smoke for the PAWS Frontend Demo staged in .deploy-static.
// Opens each PAWS page as several demo roles in headless Chrome and checks
// that the page renders, shows the test banner, throws no script errors and
// never sends a request to the real PAWS API.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {findChrome,createStaticServer}=require('./browser-smoke');

const root=path.resolve(__dirname,'..');
const site=path.join(root,'.deploy-static');
const USER_KEY='ucvm-pages-demo-user-v2';
// Compare browser-visible release notes with the current source record, not a fixed title.
const expectedChangeLogTitle=JSON.parse(fs.readFileSync(path.join(root,'CHANGELOG.json'),'utf8')).entries[0]?.title;
if(typeof expectedChangeLogTitle!=='string'||!expectedChangeLogTitle.trim())throw Error('CHANGELOG.json needs a current title');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

const CHECKS=Object.freeze([
 {page:'index.html',uid:'uid-developer',text:['Teaching Schedule','Week','DEMO ROLE TESTER','Change Log','Academic Years · Demo']},
 {page:'index.html',uid:'uid-owner',text:['Teaching Schedule','Academic Years · Demo']},
 {page:'index.html',uid:'uid-admin',text:['Teaching Schedule','Admin tools']},
 {page:'index.html',uid:'uid-hicc-1',text:['Teaching Schedule']},
 {page:'index.html',uid:'uid-fac-001',text:['Teaching Schedule','My Teaching']},
 {page:'faculty-admin.html',uid:'uid-developer',text:['Faculty Dashboard','Lookup','DOE Overview','AFC Records','Academic Years · Demo']},
 {page:'faculty-admin.html',uid:'uid-admin',text:['Faculty Dashboard','Teaching Summary']},
 {page:'teaching-assignments.html',uid:'uid-admin',text:['Teaching Assignments','Academic Years · Demo']},
 {page:'teaching-assignments.html',uid:'uid-fac-001',text:['Teaching Assignments']},
 {page:'user-management.html',uid:'uid-owner',text:['User Management','Accounts']},
 {page:'password.html',uid:'uid-fac-001',text:['Change Password']}
]);

function apiOrigin(){
 const config=fs.readFileSync(path.join(site,'paws-api-origin.js'),'utf8');
 const match=config.match(/https?:\/\/[^'"\s]+/);
 return match?new URL(match[0]).origin:'';
}

async function connect(wsUrl){
 const ws=new WebSocket(wsUrl);let id=0;const pending=new Map(),listeners=new Set();
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id&&pending.has(msg.id)){const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(Error(msg.error.message)):resolve(msg.result)}else listeners.forEach(fn=>fn(msg))};
 return{send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))}),on:fn=>listeners.add(fn),close:()=>ws.close()};
}

async function waitForText(cdp,texts,timeoutMs=20000){
 const started=Date.now();let body='';
 while(Date.now()-started<timeoutMs){
  const result=await cdp.send('Runtime.evaluate',{expression:'document.body?document.body.innerText:""',returnByValue:true});
  body=String(result.result?.value||'');
  if(texts.every(text=>body.includes(text)))return {ok:true,body};
  await wait(250);
 }
 return {ok:false,body};
}

async function main(){
 if(!fs.existsSync(path.join(site,'pages-demo-api.js')))throw Error('Run tools/build-paws-pages.js and stage with --mode paws first.');
 const chrome=findChrome();if(!chrome)throw Error('Chrome or Chromium is required for the PAWS browser smoke.');
 const server=createStaticServer(site);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`,blockedOrigin=apiOrigin();
 const userDataDir=fs.mkdtempSync(path.join(os.tmpdir(),'paws-smoke-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${userDataDir}`,'about:blank'],{stdio:'ignore'});
 const problems=[];
 try{
  const activePort=path.join(userDataDir,'DevToolsActivePort');let port=0;
  for(let i=0;i<150&&!port;i++){if(fs.existsSync(activePort))port=Number(fs.readFileSync(activePort,'utf8').split(/\r?\n/)[0])||0;if(!port)await wait(100)}
  if(!port)throw Error('Chrome DevTools did not start.');
  for(const check of CHECKS){
   const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`,{method:'PUT'})).json();
   const cdp=await connect(target.webSocketDebuggerUrl);const errors=[],apiCalls=[];
   cdp.on(msg=>{
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails?.exception?.description||msg.params.exceptionDetails?.text||'exception');
    if(msg.method==='Network.requestWillBeSent'&&blockedOrigin&&msg.params.request.url.startsWith(blockedOrigin))apiCalls.push(msg.params.request.url);
   });
   await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Page.enable');
   await cdp.send('Page.navigate',{url:`${origin}/index.html?emptyCalendar=1`});await wait(500);
   await cdp.send('Runtime.evaluate',{expression:`localStorage.setItem(${JSON.stringify(USER_KEY)},${JSON.stringify(check.uid)})`});
   await cdp.send('Page.navigate',{url:`${origin}/${check.page}${check.page==='index.html'?'?emptyCalendar=1':''}`});
   const label=`${check.page} as ${check.uid}`;
   const {ok,body}=await waitForText(cdp,['PAWS Frontend Demo',...check.text]);
   if(!ok)problems.push(`${label}: missing ${check.text.filter(text=>!body.includes(text)).join(', ')||'banner'}`);
   if(errors.length)problems.push(`${label}: script error ${errors[0].split('\n')[0]}`);
   if(apiCalls.length)problems.push(`${label}: request reached the real PAWS API ${apiCalls[0]}`);
   if(check.page==='index.html'&&check.uid==='uid-owner'&&ok){
     // Empty academic years are created deliberately; no automatic sample Sessions.
     const probe=await cdp.send('Runtime.evaluate',{expression:"(function verifyEmptyAcademicYear(){\n  try{\n    const launcher=document.getElementById('paws-multi-year-open');\n    if(!launcher)return{ok:false,error:'Academic Year launcher missing'};\n    launcher.click();\n    const dialog=document.getElementById('paws-multi-year-demo');\n    if(!dialog?.open)return{ok:false,error:'Academic Year dialog did not open'};\n    const model=window.PAWS_MULTI_YEAR_DEMO_MODEL;\n    const initial=JSON.parse(localStorage.getItem(model.STORAGE_KEY)||'null');\n    if(Object.keys(initial?.annual?.['2026-27']||{}).length)return{ok:false,error:'Initial Academic Year has example Sessions'};\n    if(initial?.annual?.['2027-28']&&Object.keys(initial.annual['2027-28']).length)return{ok:false,error:'2027-28 sample should not be preloaded'};\n    if(dialog.querySelector('[data-my-action=\"load-2027-28-sample\"]'))return{ok:false,error:'Sample loading shortcut should not be visible'};\n    const create=dialog.querySelector('[data-my-action=\"create-year\"]');\n    if(!create)return{ok:false,error:'Create Next Year unavailable'};\n    create.click();\n    const selected=dialog.querySelector('[data-my-year]');\n    const next=JSON.parse(localStorage.getItem(model.STORAGE_KEY)||'null');\n    if(selected?.value!=='2027-28'||next?.years?.['2027-28']?.status!=='planning')\n      return{ok:false,error:'2027-28 planning year was not created'};\n    if(Object.keys(next.annual['2027-28']||{}).length)return{ok:false,error:'New academic year contains sample Courses'};\n    if(!dialog.querySelector('[data-my-tab=\"review\"]'))return{ok:false,error:'Publish Review tab unavailable'};\n    dialog.querySelector('[data-my-tab=\"compare\"]').click();\n    if(!dialog.textContent.includes('Cross-year Teaching / DOE Comparison'))return{ok:false,error:'Year Comparison missing'};\n    const header=document.getElementById('paws-global-academic-year');\n    if(header?.value!=='2027-28')return{ok:false,error:'Global Academic Year not synchronized'};\n    const notice=document.getElementById('paws-year-preview-notice');\n    if(!notice||notice.hidden||!document.body.classList.contains('paws-my-year-preview-required'))\n      return{ok:false,error:'Future year did not mask original Calendar'};\n    return{ok:true};\n  }catch(error){return{ok:false,error:String(error?.message||error)}}\n})()",returnByValue:true});
     if(!probe.result?.value?.ok)problems.push(label+': empty Academic Year browser probe failed: '+JSON.stringify(probe.result?.value||probe.exceptionDetails||'no result'));
     else console.log('ok   Empty annual workspace, Create Next Year, no auto-samples, Year Comparison and future-year mask');
   }
   if(check.page==='index.html'&&check.uid==='uid-developer'&&ok){
     const changelog=await cdp.send('Runtime.evaluate',{expression:"(async function verifyChangeLogDialog(){\n  const open=document.getElementById('site-changelog-open');\n  const dialog=document.getElementById('site-changelog-dialog');\n  const close=document.getElementById('site-changelog-close');\n  if(!open||!dialog||!close)return {ok:false,error:'Missing Change Log controls'};\n  open.click();\n  let body='';\n  for(let i=0;i<40;i++){\n    await new Promise(resolve=>setTimeout(resolve,100));\n    body=document.getElementById('site-changelog-entries')?.textContent||'';\n    if(body.includes(__EXPECTED_CHANGELOG_TITLE__))break;\n  }\n  const wasOpen=dialog.open;\n  const width=dialog.getBoundingClientRect().width;\n  close.click();\n  return {ok:wasOpen&&!dialog.open&&width>=600&&body.includes(__EXPECTED_CHANGELOG_TITLE__),\n    opened:wasOpen,closed:!dialog.open,width,loaded:body.includes(__EXPECTED_CHANGELOG_TITLE__)};\n})()".replaceAll('__EXPECTED_CHANGELOG_TITLE__',JSON.stringify(expectedChangeLogTitle)),awaitPromise:true,returnByValue:true});
     const result=changelog.result?.value;
     if(!result?.ok)problems.push(label+': Change Log dialog open/load/close failed '+JSON.stringify(result||changelog.exceptionDetails||'no result').slice(0,300));
     else console.log('ok   homepage Change Log opens as a large window, shows PR updates and closes');
   }
   if(check.page==='index.html'&&check.uid==='uid-developer'&&ok){
     const startup=await cdp.send('Runtime.evaluate',{expression:"(async function verifyEmptyCalendarHandoff(){\n  try{\n    const rows=window.UCVM_PAWS_DEMO_API?.store?.tables?.sessions;\n    if(!Array.isArray(rows)||rows.length!==0)return {ok:false,error:'Startup Calendar is not empty',count:rows?.length};\n    const tasks=await window.PAWS_SCHEDULE_OFFICE_UI?.workQueue?.();\n    if(!Array.isArray(tasks)||!tasks.some(t=>t.kind==='import_adc_schedule'&&t.stage==='adc'))\n      return {ok:false,error:'ADC initial import task is missing',tasks};\n    if(!document.getElementById('workspace-tasks-toggle'))return {ok:false,error:'Shared Work Queue missing'};\n    return {ok:true};\n  }catch(error){return {ok:false,error:String(error?.message||error)}}\n})()",awaitPromise:true,returnByValue:true});
     if(!startup.result?.value?.ok)problems.push(label+': empty Calendar/ADC handoff failed: '+JSON.stringify(startup.result?.value||startup.exceptionDetails||'no result').slice(0,500));
     else console.log('ok   Opt-in empty Calendar startup and ADC Schedule Workflow import task');
   }
   if(check.page==='index.html'&&check.uid==='uid-developer'&&ok){
     // Multi-Week Comparison: independently selected Fall/Winter weeks, stacked and closable.
     const result=await cdp.send('Runtime.evaluate',{expression:"(async function verifyMultiWeekComparison(){\n"+
       " try{\n"+
       " const toggle=document.getElementById('cal-compare-btn');\n"+
       " if(!toggle)return {ok:false,error:'Compare Weeks button missing'};\n"+
       " toggle.click();\n"+
       " document.querySelectorAll('[data-week-remove]').forEach(button=>button.click());\n"+
       " function add(semester,week){\n"+
       "   const term=document.getElementById('comparison-semester'),number=document.getElementById('comparison-week');\n"+
       "   if(!term||!number)return false;\n"+
       "   term.value=semester;term.dispatchEvent(new Event('change'));\n"+
       "   number.value=String(week);number.dispatchEvent(new Event('change'));\n"+
       "   document.getElementById('comparison-add-week')?.click();return true;\n"+
       " }\n"+
       " if(!add('fall',1)||!add('winter',5))return {ok:false,error:'Add Week controls missing'};\n"+
       " let keys=[...document.querySelectorAll('[data-comparison-period]')].map(x=>x.dataset.comparisonPeriod);\n"+
       " if(keys.join(',')!=='fall:1,winter:5')return {ok:false,error:'Fall/Winter periods not stacked in order',keys};\n"+
       " const chooseSort=value=>{const control=document.getElementById('comparison-order');if(!control)return false;control.value=value;control.dispatchEvent(new Event('change'));return true;};\n"+
       " if(!chooseSort('desc'))return {ok:false,error:'Sort weeks control missing'};\n"+
       " keys=[...document.querySelectorAll('[data-comparison-period]')].map(x=>x.dataset.comparisonPeriod);\n"+
       " if(keys.join(',')!=='winter:5,fall:1')return {ok:false,error:'Latest-first sorting failed',keys};\n"+
       " const up=document.querySelector('[data-week-move=\\\"fall:1\\\"][data-week-direction=\\\"up\\\"]');\n"+
       " if(!up||up.disabled)return {ok:false,error:'Admin Move Up arrow missing'};\n"+
       " up.click();keys=[...document.querySelectorAll('[data-comparison-period]')].map(x=>x.dataset.comparisonPeriod);\n"+
       " if(keys.join(',')!=='fall:1,winter:5')return {ok:false,error:'Manual Move Up failed',keys};\n"+
       " if(document.getElementById('comparison-order')?.value!=='custom')return {ok:false,error:'Manual moves did not enter Custom order'};\n"+
       " const down=document.querySelector('[data-week-move=\\\"fall:1\\\"][data-week-direction=\\\"down\\\"]');\n"+
       " if(!down||down.disabled)return {ok:false,error:'Admin Move Down arrow missing'};\n"+
       " down.click();keys=[...document.querySelectorAll('[data-comparison-period]')].map(x=>x.dataset.comparisonPeriod);\n"+
       " if(keys.join(',')!=='winter:5,fall:1')return {ok:false,error:'Manual Move Down failed',keys};\n"+
       " if(!chooseSort('asc'))return {ok:false,error:'Ascending sort control missing'};\n"+
       " keys=[...document.querySelectorAll('[data-comparison-period]')].map(x=>x.dataset.comparisonPeriod);\n"+
       " if(keys.join(',')!=='fall:1,winter:5')return {ok:false,error:'Earliest-first sorting failed',keys};\n"+
       " for(let i=0;i<60;i++){\n"+
       "  const cards=[...document.querySelectorAll('[data-comparison-period]')];\n"+
       "  if(cards.every(card=>card.querySelector('.tg-body')||card.querySelector('.multi-week-error')))break;\n"+
       "  await new Promise(resolve=>setTimeout(resolve,100));\n"+
       " }\n"+
       " const cards=[...document.querySelectorAll('[data-comparison-period]')];\n"+
       " if(!cards.every(card=>card.querySelector('.tg-body')))return {ok:false,error:'Weekly grid missing after loading',statuses:cards.map(x=>x.textContent.slice(0,130))};\n"+
       " const close=document.querySelector('[data-week-remove=\"fall:1\"]');\n"+
       " if(!close||!close.getAttribute('aria-label').includes('Fall Week 1'))return {ok:false,error:'Close X missing'};\n"+
       " close.click();keys=[...document.querySelectorAll('[data-comparison-period]')].map(x=>x.dataset.comparisonPeriod);\n"+
       " if(keys.join(',')!=='winter:5')return {ok:false,error:'Closing one week removed the wrong card',keys};\n"+
       " document.getElementById('cal-week-btn').click();\n"+
       " if(document.getElementById('cal-compare-btn').classList.contains('active'))return {ok:false,error:'Week view not restored'};\n"+
       " return {ok:true};\n"+
       " }catch(error){return {ok:false,error:String(error?.message||error)}}\n"+
       "})()",awaitPromise:true,returnByValue:true});
     if(!result.result?.value?.ok)problems.push(label+': Multi-Week Comparison browser check failed: '+JSON.stringify(result.result?.value||result.exceptionDetails||'no result').slice(0,500));
     else console.log('ok   Multi-Week Comparison stacks Fall W1 / Winter W5; removing one week preserves the other');
   }
   if(check.page==='index.html'&&check.uid==='uid-fac-001'&&ok){
     // A prior Owner test may leave the global year in future-year preview.
     // Wait for the actual Faculty identity and restore the regular 2026-27
     // Calendar before asserting permission-scoped comparison controls.
     const result=await cdp.send('Runtime.evaluate',{expression:"(async function verifyFacultyComparisonPermissions(){\n  try {\n    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));\n    const hooks=window.UCVM_TIMETABLE_TESTING_HOOKS;\n    for(let i=0;i<40&&!hooks?.currentUser?.();i++)await sleep(100);\n    const user=hooks?.currentUser?.();\n    if(!user)return{ok:false,error:'Faculty role profile did not initialize'};\n    const picker=document.getElementById('paws-global-academic-year');\n    if(picker&&picker.value!=='2026-27'){\n      picker.value='2026-27';\n      picker.dispatchEvent(new Event('change',{bubbles:true}));\n      await sleep(250);\n    }\n    const button=document.getElementById('cal-compare-btn');\n    if(!button)return{ok:false,error:'Compare Weeks missing'};\n    button.click();\n    let control=null;\n    for(let i=0;i<25;i++){\n      control=document.getElementById('comparison-order');\n      if(control)break;\n      await sleep(100);\n    }\n    if(!control)return{ok:false,error:'Faculty sort selector missing after waiting for profile and year',role:user.role,active:button.classList.contains('active'),year:picker?.value};\n    if(document.querySelectorAll('[data-week-move]').length)return{ok:false,error:'Admin-only move arrows visible to Faculty'};\n    return{ok:true};\n  }catch(error){return{ok:false,error:String(error?.message||error)}}\n})()",awaitPromise:true,returnByValue:true});
     if(!result.result?.value?.ok)problems.push(label+': Faculty week comparison permissions failed: '+JSON.stringify(result.result?.value||result.exceptionDetails||'no result').slice(0,500));
     else console.log('ok   Faculty can sort comparison weeks but cannot manually move cards');
   }
   if(check.page==='index.html'&&check.uid==='uid-developer'&&ok){
     // Real staged-browser test: approve a seeded ADFA SWAP with synthetic data.
     const executed=await cdp.send('Runtime.evaluate',{expression:"(async function demoApprovalBrowserProbe(){\n  try{\n    const api=window.UCVM_PAWS_DATA,swap=window.PAWS_SWAP;\n    if(!api?.swapQueue||!swap?.openDetail)return{ok:false,error:'SWAP client not ready'};\n    const queue=await api.swapQueue();\n    const request=(queue.requests||[]).find(r=>r.nextStage==='adfa'&&r.status==='pending'&&r.changes?.replacementCandidateKey);\n    if(!request&&window.UCVM_PAWS_DEMO_API?.store?.tables?.sessions?.length===0)return{ok:true,empty:true};\n    if(!request)return{ok:false,error:'No seeded final ADFA request'};\n    await swap.openDetail(request.requestId);\n    const approve=document.querySelector('.sql-swap-approval-dialog [data-decision=\"approve\"]');\n    if(!approve)return{ok:false,error:'Approve button not rendered'};\n    if(approve.disabled)return{ok:false,error:'Approve disabled',preview:document.querySelector('[data-approval-doe]')?.innerText||''};\n    const reason=document.querySelector('.sql-swap-approval-dialog [data-override]');\n    if(reason)reason.value='Synthetic conflict reviewed by Developer';\n    approve.click();\n    const confirm=document.querySelector('.sql-swap-approval-dialog [data-confirm-action]');\n    if(!confirm)return{ok:false,error:'Approval confirmation not shown'};\n    confirm.click();\n    for(let i=0;i<50;i++){\n      await new Promise(resolve=>setTimeout(resolve,150));\n      const detail=await api.swapDetail(request.requestId);\n      if(detail.request?.status==='applied')return{ok:true,status:'applied',requestId:request.requestId};\n    }\n    return{ok:false,error:'Approval did not reach applied state'};\n  }catch(error){return{ok:false,error:String(error?.message||error)};}\n})()",awaitPromise:true,returnByValue:true});
     const result=executed.result?.value;
     if(!result?.ok)problems.push(`${label}: ADFA demo approval failed: ${JSON.stringify(result||executed.exceptionDetails||'no result').slice(0,450)}`);
     else console.log(result.empty?'ok   SWAP fixture skipped: Calendar intentionally empty; route tests cover approval':'ok   ADFA SWAP final approval applies to browser-local timetable');
   }
   if(check.page==='index.html'&&check.uid==='uid-developer'&&ok){
     // End-to-end Data Load button acceptance on the exact published PAWS Demo.
     // Run after empty-start, comparison and SWAP checks. Clean demo storage
     // afterwards so later role checks keep their intentional zero-session baseline.
     const before=await cdp.send('Runtime.evaluate',{expression:"(function(){try{const api=window.UCVM_PAWS_DEMO_API,button=document.getElementById('testing-only-load-density-btn');if(!api?.testingOnly?.loadDenseCalendar||!button||button.classList.contains('hidden'))return{ok:false,error:'Data loader unavailable or hidden for Developer'};if(api.store.tables.sessions.length!==0)return{ok:false,error:'Expected empty Calendar before load',count:api.store.tables.sessions.length};window.confirm=()=>true;setTimeout(()=>button.click(),50);return{ok:true};}catch(e){return{ok:false,error:String(e.message||e)}}})()",returnByValue:true});
     if(!before.result?.value?.ok)problems.push(label+': Data Load button availability failed: '+JSON.stringify(before.result?.value||before.exceptionDetails||'no result'));
     else{
       await wait(1100);
       let observed=null;
       for(let i=0;i<35;i++){
         try{
           const probe=await cdp.send('Runtime.evaluate',{expression:"(function(){try{const api=window.UCVM_PAWS_DEMO_API,stored=JSON.parse(localStorage.getItem('ucvm-pages-demo-paws-v1')||'null');if(!api||!stored)return{ready:false};const sessions=api.store.tables.sessions,activities=api.store.tables.activities.filter(x=>x.category==='ccc');return{ready:true,sessions:sessions.length,ccc:activities.length,persistedSessions:stored.sessions?.length,persistedCcc:stored.activities?.filter(x=>x.category==='ccc').length,lab:sessions.filter(s=>s.sessionType==='LAB').length,srl:sessions.filter(s=>s.sessionType==='SRL').length}}catch(e){return{ready:false,error:String(e.message||e)}}})()",returnByValue:true});
           if(probe.result?.value?.ready&&probe.result.value.sessions===1937){observed=probe.result.value;break;}
         }catch(_){}
         await wait(250);
       }
       if(!observed||observed.sessions!==1937||observed.ccc!==413||observed.persistedSessions!==1937||observed.persistedCcc!==413||!observed.lab||!observed.srl)
         problems.push(label+': Data Load did not persist Beta-density Teaching/CCC records: '+JSON.stringify(observed));
       else console.log('ok   Load Test Data persisted 1937 Course Sessions (LAB/SRL) and 413 CCC slots after reload');
       try{
         const reset=await cdp.send('Runtime.evaluate',{expression:"(function(){try{const api=window.UCVM_PAWS_DEMO_API;const again=api.testingOnly.loadDenseCalendar('uid-developer');api.reset();return{ok:again.addedSessions===0&&again.addedCCC===0}}catch(e){return{ok:false,error:String(e.message||e)}}})()",returnByValue:true});
         if(!reset.result?.value?.ok)problems.push(label+': Data Load idempotence/reset failed: '+JSON.stringify(reset.result?.value));
       }catch(e){problems.push(label+': Data Load reset failed: '+String(e.message||e))}
     }
   }
   if(check.page==='index.html'&&check.uid==='uid-developer'&&ok){
     // Regression for PR #109: the emptyCalendar smoke path never exercised
     // the ordinary browser startup, where old localStorage quota errors left
     // all 1,937 simulated teaching sessions invisible despite successful CI.
     await cdp.send('Runtime.evaluate',{expression:"window.UCVM_PAWS_DEMO_API?.reset?.()",returnByValue:true});
     await cdp.send('Page.navigate',{url:`${origin}/index.html`});
     await waitForText(cdp,['PAWS Frontend Demo','Teaching Schedule']);
     const probe=await cdp.send('Runtime.evaluate',{expression:"(async function verifyDefaultSyntheticTeaching(){\n"+
       " try{const sleep=ms=>new Promise(r=>setTimeout(r,ms));\n"+
       " const store=window.UCVM_PAWS_DEMO_API?.store;\n"+
       " if(!store)return{ok:false,error:'Demo store unavailable'};\n"+
       " const density=store.densityStatus();\n"+
       " const saved=JSON.parse(localStorage.getItem('ucvm-pages-demo-paws-v1')||'null');\n"+
       " if(density.totalSessions!==1937||!density.storageOk||!saved?.extra?.testingDemoPackedFixture)return{ok:false,error:'Synthetic fixture not compactly persisted on default startup',density,storedRows:saved?.sessions?.length};\n"+
       " let weekly=[];for(let i=0;i<60;i++){try{weekly=await window.UCVM_PAWS_DATA.listSessions({start:'2026-11-02',end:'2026-11-07'});if(weekly.length>=60)break;}catch(_){}await sleep(100);}\n"+
       " if(weekly.length!==74)return{ok:false,error:'November Course Sessions not readable through Calendar API',count:weekly.length,density};\n"+
       " document.getElementById('cal-month-btn')?.click();\n"+
       " for(let i=0;i<40;i++){if([...document.querySelectorAll('.cal-event')].some(e=>e.textContent.includes('[Synthetic]')))break;await sleep(100);}\n"+
       " const showing=[...document.querySelectorAll('.cal-event')].filter(e=>e.textContent.includes('[Synthetic]')).length;\n"+
       " return{ok:showing>=10,error:showing>=10?'':'Month grid does not show synthetic teaching sessions',showing,weekly:weekly.length,storedRows:saved.sessions.length};\n"+
       " }catch(error){return{ok:false,error:String(error?.message||error)}}\n"+
       "})()",awaitPromise:true,returnByValue:true});
     if(!probe.result?.value?.ok)problems.push(label+': default synthetic calendar unavailable: '+JSON.stringify(probe.result?.value||probe.exceptionDetails||'no result').slice(0,700));
     else console.log('ok   Default PAWS Testing loads packed synthetic data, 74 Fall W11 sessions via API and visible November Month teaching blocks');
     await cdp.send('Runtime.evaluate',{expression:"window.UCVM_PAWS_DEMO_API?.reset?.()",returnByValue:true});
   }
   console.log(`${ok&&!errors.length&&!apiCalls.length?'ok  ':'FAIL'} ${label}`);
   cdp.close();await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(()=>{});
  }
 }finally{
  const exited=new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve)});
  child.kill();server.close();await Promise.race([exited,wait(5000)]);
  try{fs.rmSync(userDataDir,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
 }
 if(problems.length){console.error(problems.join('\n'));process.exitCode=1}
 else console.log(`PAWS browser smoke passed (${CHECKS.length} page/role checks).`);
}

if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exit(1)});
module.exports={CHECKS};
