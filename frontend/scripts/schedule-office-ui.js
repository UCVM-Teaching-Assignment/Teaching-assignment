(function(root,factory){
 'use strict';
 const api=factory(root,typeof module==='object'&&module.exports?require('./schedule-bulk-csv.js'):root?.PAWS_SCHEDULE_BULK_CSV);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PAWS_SCHEDULE_OFFICE_UI=api;
})(typeof window==='undefined'?null:window,function(root,csv){
 'use strict';
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const val=v=>String(v==null?'':v).trim();
 const LAB=['lab','developer','owner','administrator','admin'];
 const ADFAD=['adfa_general','adfa_regular','administrator','admin','developer','owner'];
 const ADC=['adc','developer','owner'];
 const can=(role,office)=>office==='lab'?LAB.includes(role):office==='adfa'?ADFAD.includes(role):ADC.includes(role);
 const pendingBadge=()=>root?.UCVM_TESTING_ONLY?.pendingBadge?.()||'';
 let dialog=null,office='',exported=[],allRows=[],editor='',preview=null,parsed=null,batchId='',busy=false,notice='',focusId='',faculty=[];
 function identity(){
  const demo=root?.UCVM_PAWS_DEMO_API,user=root?.firebase?.auth?.().currentUser;
  const row=demo?.store?.tables?.users?.find(x=>x.firebaseUid===user?.uid);
  if(!row||row.active!==true||row.mustChangePassword!==false||demo.authoritative!==false)return null;
  return {uid:row.firebaseUid,role:val(row.baseRole).toLowerCase()};
 }
 async function request(path='',body){
  const current=identity();if(!current)throw Error('Sign in with an active PAWS Testing Demo account.');
  const origin=root.PAWS_API_ORIGIN_CONFIG?.apiOrigin;
  if(!origin)throw Error('Testing API is not available.');
  const token=await root.firebase.auth().currentUser.getIdToken();
  const response=await root.fetch(origin+'/api/v1/schedule-workflow'+path,{
   method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
   credentials:'omit',body:body?JSON.stringify(body):undefined
  });
  let data={};try{data=await response.json()}catch(_){}
  if(!response.ok){const e=Error(data.error?.message||'Office operation failed (HTTP '+response.status+').');e.code=data.error?.code||'HTTP_'+response.status;throw e;}
  return data;
 }
 function report(e){return (e?.code?e.code+': ':'')+(e?.message||String(e))}
 function resetPreview(){preview=null;parsed=null;batchId=''}
 function download(text,filename){
  const url=root.URL.createObjectURL(new root.Blob([text],{type:'text/csv;charset=utf-8'}));
  const a=root.document.createElement('a');a.href=url;a.download=filename;root.document.body.append(a);a.click();a.remove();
  root.URL.revokeObjectURL(url);
 }
 function render(){
  if(!dialog)return;
  const isLab=office==='lab';
  const instructions=isLab
   ?'One CSV row per student group per run. Same Run Key = same run; for All, list every assigned group in that run. Fill Room, optional Subspace, Capacity, Group Code and Student IDs separated with semicolons. Run time must remain inside ADC-approved Session time. No Faculty/DOE edits here.'
   :'One CSV row per Faculty per Session. Duplicate Session ID rows are allowed for Primary and Secondary teachers. Fill Faculty ID, Teaching Role and Credited Hours. Existing appointments, AFC, time conflicts and work activities are checked on preview. Any conflict blocks the entire batch.';
  const errors=preview?.errors||[];
  const previewHtml=preview?'<p role="status">'+(preview.valid?'All rows passed validation':'Upload BLOCKED')+
   ' · '+esc(preview.readyCount)+' ready Sessions · '+esc(preview.invalidCount)+' issue(s)</p>'+
   (errors.length?'<div class="paws-stage-list">'+errors.slice(0,100).map(e=>
     '<p class="paws-office-error"><strong>Row '+esc(e.rowNumber)+' · '+esc(e.code)+'</strong>: '+esc(e.message)+
     (e.issues?.length?'<br>'+esc(e.issues.join('; ')):'')+'</p>').join('')+'</div>':''):'';
  dialog.innerHTML='<header class="paws-stage-header"><h2>'+esc(isLab?'LAB Work Queue · Bulk Allocations':'ADFAD Work Queue · Bulk Faculty Assignments')+
   pendingBadge()+'</h2><button type="button" data-office-close>Close</button></header>'+
   '<div class="paws-stage-body"><p class="paws-stage-banner">Synthetic Testing Demo. This is an office task queue, not ADC Schedule Workflow. Do not upload real student names, UCIDs or private employee records.</p>'+
   '<p>'+esc(instructions)+'</p>'+(notice?'<p class="paws-stage-status" role="status">'+esc(notice)+'</p>':'')+
   '<div class="paws-stage-flow"><span>Pending '+esc(isLab?'LAB':'ADFAD')+' Sessions: <strong>'+esc(new Set(exported.map(x=>x.sessionId)).size)+'</strong></span>'+
   '<span>Rows in downloadable template: <strong>'+esc(exported.length)+'</strong></span></div>'+
   '<section class="paws-stage-card"><h3>Download assigned work / Upload completed template</h3>'+
   '<p>The template is prefilled from the published ADC Sessions, including Session IDs, dates, times and revision tokens. Download all pending work before editing.</p>'+
   '<div class="paws-stage-actions"><button type="button" data-office-download>Download prefilled '+esc(isLab?'LAB':'ADFAD')+' CSV</button>'+
   '<button type="button" data-office-reset>Reload current work</button>'+
   (isLab&&focusId?'<button type="button" data-office-manual>Open single LAB editor</button>':'')+'</div>'+
   '<label>Upload completed CSV/TSV<input data-office-file type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"></label>'+
   '<label>Or edit/paste Excel cells here<textarea data-office-content rows="11" spellcheck="false" class="paws-office-textarea">'+esc(editor)+'</textarea></label>'+
   (isLab?'<p><strong>LAB:</strong> For a rotating Group 1/2/3, use three Run Keys/times. For All, repeat the same Run Key for each assigned group. Room/student conflicts and capacity must pass.</p>':
    '<details><summary>Faculty ID lookup (active synthetic directory)</summary><div class="paws-office-directory">'+faculty.slice(0,200).map(f=>'<p>'+esc(f.facultyId)+' · '+esc(f.name)+'</p>').join('')+'</div></details>')+
   '<div class="paws-stage-actions"><button type="button" data-office-preview>Validate & Preview conflicts</button>'+
   '<button type="button" data-office-publish '+(!preview?.valid?'disabled':'')+'>Publish '+esc(isLab?'LAB allocations':'Faculty assignments')+'</button></div>'+
   previewHtml+'</section></div>';
  dialog.querySelector('[data-office-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-office-download]').onclick=()=>download(csv.officeTemplate(office,exported),'paws_'+office+'_pending_'+new Date().toISOString().slice(0,10)+'.csv');
  dialog.querySelector('[data-office-reset]').onclick=()=>load(false);
  dialog.querySelector('[data-office-manual]')?.addEventListener('click',()=>{dialog.close();root.PAWS_LAB_SCHEDULING?.open?.(focusId);});
  dialog.querySelector('[data-office-file]').onchange=async e=>{
   try{const file=e.target.files?.[0];if(!file)return;
    if(!/\.(csv|tsv)$/i.test(file.name)||file.size>1048576)throw Error('Upload .csv/.tsv less than 1 MB, or paste Excel cells.');
    editor=await file.text();resetPreview();notice='Loaded '+file.name+'. Validate before publishing.';render();
   }catch(err){notice=report(err);render();}
  };
  dialog.querySelector('[data-office-content]').oninput=e=>{editor=e.target.value;resetPreview();dialog.querySelector('[data-office-publish]').disabled=true};
  dialog.querySelector('[data-office-preview]').onclick=()=>withBusy(async()=>{
   const data=csv.parseOfficeCsv(office,editor);parsed=data.rows;
   preview=await request('/preview-office-bulk',{office,rows:parsed});
   batchId=office+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
   notice=preview.valid?'Validated. Review assignments before confirming publication.':'Resolve every listed issue and revalidate. No data was saved.';
  });
  dialog.querySelector('[data-office-publish]').onclick=()=>withBusy(async()=>{
   if(!preview?.valid||!parsed)throw Error('Validate the latest CSV data before publishing.');
   if(!root.confirm('Publish '+preview.readyCount+' '+office.toUpperCase()+' schedule groups? Any later changes require another reviewed import.'))return;
   const result=await request('/publish-office-bulk',{office,rows:parsed,batchId});
   notice='Published '+result.publishedCount+' '+office.toUpperCase()+' Session(s). The Work Queue was updated.';
   await load(true);
   root.UCVM_TIMETABLE_TESTING_HOOKS?.refresh?.();root.PAWS_TASKS?.refresh?.();
  });
 }
 async function withBusy(fn){
  if(busy)return;busy=true;
  try{await fn()}catch(e){preview=null;parsed=null;notice=report(e)}
  finally{busy=false;render();}
 }
 async function load(keepNotice=false){
  if(!dialog?.open)return;
  const data=await request('/office-export?office='+office);
  exported=data.rows||[];
  const rows=focusId?(office==='lab'?exported.filter(x=>{
   // Keep the whole Course/date group so unrelated stations are not omitted.
   const focused=exported.find(r=>r.sessionId===focusId);
   return focused?x.courseNumber===focused.courseNumber&&x.date===focused.date:false;
  }):exported.filter(x=>x.sessionId===focusId)):exported;
  allRows=rows;
  editor=csv.officeTemplate(office,rows);resetPreview();
  if(!keepNotice)notice='';
  if(office==='adfa'){try{const view=await request();faculty=view.faculty||[]}catch(_){faculty=[]}}
  render();
 }
 async function open(officeName,{sessionId=''}={}){
  const user=identity(),target=val(officeName);
  if(!user||!can(user.role,target)){root?.alert?.('Use a scoped LAB or ADFAD Demo role.');return}
  if(dialog?.open)dialog.close();
  office=target;focusId=sessionId;notice='';preview=null;parsed=null;editor='';faculty=[];
  dialog=root.document.createElement('dialog');dialog.className='paws-stage-dialog';dialog.setAttribute('aria-label',target.toUpperCase()+' Work Queue');
  const currentDialog=dialog;root.document.body.append(currentDialog);
  currentDialog.addEventListener('close',()=>{currentDialog.remove();if(dialog===currentDialog)dialog=null},{once:true});
  dialog.showModal();dialog.innerHTML='<p role="status">Loading assigned office work…</p>';
  try{await load()}catch(e){dialog.innerHTML='<p role="alert">'+esc(report(e))+'</p><button type="button" data-close>Close</button>';dialog.querySelector('[data-close]').onclick=()=>dialog.close()}
 }
 async function workQueue(){
  const who=identity();if(!who||!['adc','lab','adfa_general','adfa_regular','developer','owner','administrator','admin'].includes(who.role))return [];
  const state=await request();return state.workItems||[]
 }
 function mount(){
  if(!root?.document||!root.UCVM_PAWS_DEMO_API)return;
  const host=root.document.querySelector('.timetable-top-actions');if(!host)return;
  const user=identity();
  for(const name of ['lab','adfa']){
   const id='paws-office-'+name+'-queue';
   let b=root.document.getElementById(id);
   if(!b){b=root.document.createElement('button');b.id=id;b.className='masthead-link';b.type='button';b.innerHTML=(name==='lab'?'LAB Work Queue':'ADFAD Work Queue')+pendingBadge();b.onclick=()=>open(name);host.prepend(b)}
   b.hidden=!user||!can(user.role,name);
  }
  if(dialog?.open&&(!user||!can(user.role,office)))dialog.close();
 }
 if(root?.document){
  const init=()=>{mount();root.firebase?.auth?.().onAuthStateChanged?.(mount)};
  if(root.document.readyState==='complete')init();else root.addEventListener('load',init,{once:true});
  root.addEventListener('paws-profile',mount);root.addEventListener('ucvm-timetable-user',mount);
 }
 return Object.freeze({open,workQueue,can,parseOfficeCsv:csv.parseOfficeCsv});
});
