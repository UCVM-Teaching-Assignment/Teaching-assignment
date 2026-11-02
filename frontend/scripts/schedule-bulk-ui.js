(function(root,factory){
 'use strict';
 const api=factory(root,typeof module==='object'&&module.exports?require('./schedule-bulk-csv.js'):root?.PAWS_SCHEDULE_BULK_CSV);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PAWS_SCHEDULE_BULK_UI=api;
})(typeof window==='undefined'?null:window,function(root,parser){
 'use strict';
 const text=v=>String(v==null?'':v).trim();
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const ADMINS=['developer','owner'],ADC=['adc','developer','owner'],ADFAD=['developer','owner','adfa_general','adfa_regular','administrator','admin'];
 const roleAllowed=(role,which)=>which==='rules'?ADMINS.includes(role):which==='bulk'?ADC.includes(role):ADC.includes(role)||ADFAD.includes(role);
 let bulkDialog=null,rulesDialog=null,taskDialog=null,bulkText='',preview=null,parsedRows=null,batchId='',view=null,notice='',busy=false;
 function identity(){
  const demo=root?.UCVM_PAWS_DEMO_API,u=root?.firebase?.auth?.().currentUser;
  if(!demo||demo.authoritative!==false||!u)return null;
  const row=demo.store?.tables?.users?.find(x=>x.firebaseUid===u.uid);
  return row?.active===true&&row?.mustChangePassword===false?{uid:row.firebaseUid,role:text(row.baseRole).toLowerCase()}:null;
 }
 function requireRole(which){
  const user=identity();
  if(!user||!roleAllowed(user.role,which))throw Error('Your current Demo role is not authorized for '+which+'.');
  return user;
 }
 async function call(path='',body){
  requireRole(path==='/rules'||path==='/update-rules'?'rules':path.includes('bulk')?'bulk':'workflow');
  const origin=root?.PAWS_API_ORIGIN_CONFIG?.apiOrigin;
  if(!origin)throw Error('PAWS Testing API is unavailable.');
  const token=await root.firebase.auth().currentUser.getIdToken();
  const response=await root.fetch(origin+'/api/v1/schedule-workflow'+path,{method:body?'POST':'GET',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
   credentials:'omit',body:body?JSON.stringify(body):undefined});
  let data={};try{data=await response.json();}catch(_){}
  if(!response.ok){
   const error=Error(data.error?.message||'Schedule operation failed (HTTP '+response.status+').');
   error.code=data.error?.code||'HTTP_'+response.status;
   throw error;
  }
  return data;
 }
 function styles(){
  if(!root.document.querySelector('link[data-stage-style]')){
   const link=root.document.createElement('link');link.rel='stylesheet';link.href='schedule-workflow.css';link.dataset.stageStyle='1';root.document.head.append(link);
  }
 }
 const heading=(name,close)=>'<header class="paws-stage-header"><h2>'+esc(name)+'</h2><button type="button" data-close-stage="'+esc(close)+'">Close</button></header>';
 function newDialog(title){
  styles();
  const d=root.document.createElement('dialog');d.className='paws-stage-dialog';
  d.setAttribute('aria-label',title);root.document.body.append(d);
  d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return d;
 }
 function feedback(error){return (error?.code?error.code+': ':'')+(error?.message||String(error));}
 function dateTime(s){return [s.date,String(s.startTime||'').slice(0,5)+'–'+String(s.endTime||'').slice(0,5)].filter(Boolean).join(' ');}
 function option(value,label,selected){return '<option value="'+esc(value)+'"'+(String(value)===String(selected)?' selected':'')+'>'+esc(label)+'</option>';}
 function refreshScreens(){
  root.UCVM_TIMETABLE_TESTING_HOOKS?.refresh?.();
  root.PAWS_TASKS?.refresh?.();
 }
 function mapFacultySuggestions(rows,faculty){
  const pool=new Map();
  const ambiguous=new Set();
  for(const person of faculty||[]){
   pool.set(text(person.facultyId).toLowerCase(),person.facultyId);
   if(person.name){
    const alias=text(person.name).toLowerCase();
    if(pool.has(alias)&&pool.get(alias)!==person.facultyId)ambiguous.add(alias);
    else pool.set(alias,person.facultyId);
   }
  }
  return rows.map((row,index)=>{
   const field=text(row.suggestedFaculty);
   if(!field){const copy={...row};delete copy.suggestedFaculty;return copy;}
   const ids=field.split(/[;|]/).map(x=>text(x)).filter(Boolean).map(candidate=>{
    const token=candidate.toLowerCase();
    if(ambiguous.has(token))throw Error('Row '+(index+2)+': ambiguous suggested Faculty "'+candidate+'". Use a unique Faculty ID.');
    const match=pool.get(token);
    if(!match)throw Error('Row '+(index+2)+': suggested Faculty "'+candidate+'" is not in the active Faculty directory.');
    return match;
   });
   const copy={...row,suggestedFacultyIds:[...new Set(ids)]};delete copy.suggestedFaculty;return copy;
  });
 }
 function previewHtml(){
  if(!preview)return '';
  const info='<p role="status">'+(preview.valid?'Ready to publish ':'Cannot publish ')+' · '+esc(preview.readyCount)+' valid · '+esc(preview.invalidCount)+' invalid · ADC to-dos '+esc(preview.adcTodoCount)+' · ADFAD to-dos '+esc(preview.adfadTodoCount)+'</p>';
  const rows=preview.items.slice(0,80).map(item=>'<tr><td>'+esc(item.rowNumber)+'</td><td>'+esc(item.normalized?.courseCode||'—')+'</td><td>'+esc(item.normalized?.date||'—')+'</td><td>'+esc(item.normalized?.startTime||'')+'–'+esc(item.normalized?.endTime||'')+'</td><td>'+esc(item.errors.join('; ')||'Ready')+'</td></tr>').join('');
  return info+'<div class="paws-stage-list" style="max-height:280px"><table class="paws-bulk-table"><thead><tr><th>Row</th><th>Course</th><th>Date</th><th>Time</th><th>Validation</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(preview.items.length>80?'<p>First 80 rows shown; all rows are validated.</p>':'');
 }
 function renderBulk(){
  if(!bulkDialog)return;
  bulkDialog.innerHTML=heading('ADC · Bulk Schedule Import','bulk')+
   '<div class="paws-stage-body"><p class="paws-stage-banner">Testing Demo only. CSV/TSV files or paste directly from Excel. Required: Course Number, Year (DVM 1–4), Date and Time. Course/Session Title and Room are optional unless Developer rules change. Suggested Faculty never assigns DOE.</p>'+
   (notice?'<p class="paws-stage-status" role="status">'+esc(notice)+'</p>':'')+
   '<section class="paws-stage-card"><label>Choose CSV or TSV file<input type="file" data-bulk-file accept=".csv,.tsv,text/csv,text/tab-separated-values"></label>'+
   '<label>Paste Excel cells or CSV text<textarea data-bulk-source rows="8" placeholder="Course Number,Year,Date,Start Time,End Time,Session Title,Room Number">'+esc(bulkText)+'</textarea></label>'+
   '<div class="paws-stage-actions"><button data-bulk-template>Download CSV template</button><button data-bulk-preview>Validate & Preview</button><button data-bulk-publish '+(!preview?.valid?'disabled':'')+'>Publish all '+(preview?.readyCount||'')+' Sessions</button></div>'+
   previewHtml()+'</section></div>';
  bulkDialog.querySelector('[data-close-stage]').onclick=()=>bulkDialog.close();
  bulkDialog.querySelector('[data-bulk-file]').onchange=async event=>{
   try{
    const file=event.target.files?.[0];if(!file)return;
    if(!/\.(csv|tsv)$/i.test(file.name))throw Error('Use .csv or .tsv, or paste Excel cells. Save an .xlsx workbook as CSV first.');
    if(file.size>1048576)throw Error('Limit is 1 MB for this Demo.');
    bulkText=await file.text();preview=null;parsedRows=null;notice='Loaded '+file.name+'. Click Validate & Preview.';renderBulk();
   }catch(e){notice=feedback(e);renderBulk();}
  };
  bulkDialog.querySelector('[data-bulk-source]').oninput=e=>{bulkText=e.target.value;preview=null;parsedRows=null;batchId='';bulkDialog.querySelector('[data-bulk-publish]').disabled=true;};
  bulkDialog.querySelector('[data-bulk-template]').onclick=()=>{
   const blob=new Blob([parser.template()],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=root.document.createElement('a');
   a.href=url;a.download='paws_schedule_import_template.csv';root.document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
  };
  bulkDialog.querySelector('[data-bulk-preview]').onclick=async()=>{
   if(busy)return;busy=true;
   try{
    view=await call();const parsed=parser.parseBulkSchedule(bulkText);
    parsedRows=mapFacultySuggestions(parsed.rows,view.faculty);
    preview=await call('/preview-bulk',{rows:parsedRows});
    batchId='adc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
    notice=preview.valid?'Preview valid. Review row counts, then explicitly publish.':'Fix invalid rows before publishing.';
   }catch(e){preview=null;parsedRows=null;notice=feedback(e);}
   finally{busy=false;renderBulk();}
  };
  bulkDialog.querySelector('[data-bulk-publish]').onclick=async()=>{
   if(busy||!preview?.valid||!parsedRows)return;
   if(!root.confirm('Publish '+preview.readyCount+' Sessions to the Testing Calendar? No existing Sessions will be replaced.'))return;
   busy=true;
   try{
    const result=await call('/publish-bulk',{batchId,rows:parsedRows,expectedRulesVersion:preview.rulesVersion});
    notice='Published '+result.createdCount+' new Sessions. ADC to-dos: '+result.adcTodoCount+'; ADFAD to-dos: '+result.adfadTodoCount+'.';
    preview=null;parsedRows=null;bulkText='';batchId='';refreshScreens();
   }catch(e){notice=feedback(e);}
   finally{busy=false;renderBulk();}
  };
 }
 async function openBulk(){
  try{requireRole('bulk');}catch(e){root?.alert?.(e.message);return;}
  if(bulkDialog?.open)bulkDialog.close();bulkDialog=newDialog('ADC bulk import');notice='';preview=null;parsedRows=null;bulkText='';
  renderBulk();
 }
 function renderRules(rule,message=''){
  if(!rulesDialog)return;
  rulesDialog.innerHTML=heading('Developer Dashboard · Scheduling Import Rules','rules')+
   '<div class="paws-stage-body"><p class="paws-stage-banner">Changes are saved to the browser-local Testing Demo and audited. Rule version '+esc(rule.version)+'. Four core Calendar fields stay required to prevent invalid published schedules.</p>'+
   (message?'<p class="paws-stage-status" role="status">'+esc(message)+'</p>':'')+
   '<section class="paws-stage-card"><h3>Core required fields (locked)</h3><p>Course Number · Curriculum Year (1–4) · Date · Start/End Time</p>'+
   '<form data-bulk-rules-form class="paws-stage-grid">'+
   '<label>Import row limit (1–500)<input name="maxRows" type="number" min="1" max="500" step="1" required value="'+esc(rule.maxRows)+'"></label>'+
   '<label>Default Session Type<select name="defaultSessionType">'+['LEC','SRL','LAB','Exam','OSCE','Quiz/Midterm'].map(v=>option(v,v,rule.defaultSessionType)).join('')+'</select></label>'+
   ['topic','room'].map(key=>{
    const f=rule.fields[key];
    return '<fieldset class="paws-rule-field"><legend>'+esc(key==='topic'?'Title / Topic':'Room number')+'</legend>'+
     '<label>Work queue label<input name="'+key+'Label" maxlength="60" value="'+esc(f.label)+'" required></label>'+
     '<label><input type="checkbox" name="'+key+'Required" '+(f.required?'checked':'')+'> Required to publish</label>'+
     '<label>Missing field owner<select name="'+key+'Owner">'+option('adc','ADC',f.todoOwner)+option('adfa','ADFAD',f.todoOwner)+'</select></label></fieldset>';
   }).join('')+
   '<fieldset class="paws-rule-field"><legend>Faculty suggestion</legend><label>ADFAD queue label<input name="facultyLabel" maxlength="60" required value="'+esc(rule.fields.facultySuggestion.label)+'"></label>'+
   '<p>Suggestion is always optional. Confirm or assign Faculty belongs to ADFAD, not ADC.</p></fieldset>'+
   '<div class="paws-stage-actions"><button type="submit">Save Developer rules (new version)</button></div></form></section></div>';
  rulesDialog.querySelector('[data-close-stage]').onclick=()=>rulesDialog.close();
  rulesDialog.querySelector('[data-bulk-rules-form]').onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;
   try{
    const f=event.currentTarget,d=new FormData(f),fields={};
    for(const key of ['topic','room'])fields[key]={required:d.has(key+'Required'),todoOwner:d.get(key+'Owner'),label:d.get(key+'Label')};
    fields.facultySuggestion={label:d.get('facultyLabel')};
    const next=await call('/update-rules',{expectedVersion:rule.version,maxRows:Number(d.get('maxRows')),defaultSessionType:d.get('defaultSessionType'),fields});
    renderRules(next,'Rules saved as version '+next.version+'. New previews and existing to-dos now use these settings.');
    refreshScreens();
   }catch(e){renderRules(rule,feedback(e));}finally{busy=false;}
  };
 }
 async function openRules(){
  try{requireRole('rules');}catch(e){root?.alert?.(e.message);return;}
  if(rulesDialog?.open)rulesDialog.close();rulesDialog=newDialog('Developer scheduling rules');
  rulesDialog.innerHTML='<p>Loading Developer Dashboard rules…</p>';
  try{const r=await call('/rules');renderRules(r);}catch(e){rulesDialog.innerHTML=heading('Developer Dashboard','rules')+'<p role="alert">'+esc(feedback(e))+'</p>';rulesDialog.querySelector('[data-close-stage]').onclick=()=>rulesDialog.close();}
 }
 function taskActionFor(item,fields){
  const missing=Array.isArray(item?.missing)?item.missing:[];
  const details=missing.includes(fields?.topic?.label)||missing.includes(fields?.room?.label);
  return item?.stage==='adfa'&&!details?'faculty':'details';
 }
 async function openTask(item){
  const stage=item?.stage,sessionId=text(item?.sessionId);
  if(!sessionId)return;
  if(stage==='lab'){root.PAWS_SCHEDULE_OFFICE_UI?.open?.('lab',{sessionId});return;}
  try{requireRole('workflow');}catch(e){root?.alert?.(e.message);return;}
  try{
   const state=await call(),session=state.sessions.find(x=>x.id===sessionId);
   if(!session)throw Error('Published Session no longer exists.');
   const task=state.workItems.find(x=>x.sessionId===sessionId&&x.stage===stage);
   if(!task)throw Error('That task is no longer open. Refresh Tasks.');
   // ADFAD may download and prepare work while LAB is pending; import validation blocks early publication.
   const policy=state.rules.fields;
   if(taskActionFor(task,policy)==='faculty'){
    root.PAWS_SCHEDULE_OFFICE_UI?.open?.('adfa',{sessionId});return;
   }
   if(taskDialog?.open)taskDialog.close();taskDialog=newDialog('Complete schedule work');
   const canTopic=task.missing.includes(policy.topic.label),canRoom=task.missing.includes(policy.room.label);
   taskDialog.innerHTML=heading('Complete '+(stage==='adc'?'ADC':'ADFAD')+' schedule details','task')+
    '<div class="paws-stage-body"><p>'+esc(session.courseCode)+' · '+esc(dateTime(session))+' · version '+esc(session.scheduleVersion)+'</p>'+
    '<form data-task-complete class="paws-stage-grid">'+
    (canTopic?'<label>'+esc(policy.topic.label)+'<input name="title" maxlength="400" value="'+esc(session.topic||'')+'" required></label>':'')+
    (canRoom?'<label>'+esc(policy.room.label)+'<input name="room" maxlength="160" value="'+esc(session.room||'')+'" required></label>':'')+
    '<div class="paws-stage-actions"><button type="submit">Complete task</button></div></form></div>';
   taskDialog.querySelector('[data-close-stage]').onclick=()=>taskDialog.close();
   taskDialog.querySelector('[data-task-complete]').onsubmit=async event=>{
    event.preventDefault();if(busy)return;busy=true;
    try{
     const d=new FormData(event.currentTarget),payload={sessionId,expectedVersion:session.scheduleVersion};
     if(canTopic)payload.title=d.get('title');if(canRoom)payload.room=d.get('room');
     await call('/complete-details',payload);
     taskDialog.close();refreshScreens();
    }catch(e){taskDialog.querySelector('form').insertAdjacentHTML('beforebegin','<p role="alert">'+esc(feedback(e))+'</p>');}
    finally{busy=false;}
   };
  }catch(e){root?.alert?.(feedback(e));}
 }
 async function workQueue(){
  if(!identity()||!roleAllowed(identity().role,'workflow'))return [];
  const snapshot=await call();
  return snapshot.workItems||[];
 }
 function mountScheduleShortcut(dialog,state){
  if(!dialog||!state)return;
  const adc=dialog.querySelector('[data-stage-draft-form]')?.closest('section');
  if(adc){
   const action=root.document.createElement('button');action.type='button';action.className='paws-stage-bulk-open';action.textContent='Bulk Import CSV / Excel Paste';
   action.onclick=openBulk;adc.insertBefore(action,adc.querySelector('[data-stage-draft-form]'));
  }
  const tasks=(state.workItems||[]),holder=dialog.querySelector('.paws-stage-body');
  if(tasks.length&&holder){
   const section=root.document.createElement('section');section.className='paws-stage-card';
   section.innerHTML='<h3>ADC Work Queue ('+tasks.length+')</h3>'+
    '<div class="paws-stage-list">'+tasks.slice(0,100).map(t=>
     '<button type="button" class="paws-task-open-row" data-stage-task-id="'+esc(t.sessionId)+'" data-stage-task-role="'+esc(t.stage)+'">'+
     '<strong>'+esc(t.stage.toUpperCase())+'</strong> '+esc(t.courseCode)+' · '+esc(t.date)+' · '+esc(t.missing.join(', '))+
     (t.status==='waiting_for_lab'?' · Waiting for LAB':'')+'</button>').join('')+'</div>';
   holder.insertBefore(section,holder.lastElementChild);
   section.querySelectorAll('[data-stage-task-id]').forEach(button=>button.onclick=()=>openTask({sessionId:button.dataset.stageTaskId,stage:button.dataset.stageTaskRole}));
  }
 }
 function mount(){
  if(!root?.document||!root.UCVM_PAWS_DEMO_API)return;
  const host=root.document.querySelector('.timetable-top-actions');if(!host)return;
  let button=root.document.getElementById('paws-developer-dashboard-open');
  if(!button){button=root.document.createElement('button');button.type='button';button.id='paws-developer-dashboard-open';button.className='masthead-link';button.textContent='Developer Dashboard';button.onclick=openRules;host.prepend(button);}
  button.hidden=!identity()||!ADMINS.includes(identity().role);
  if(rulesDialog?.open&&button.hidden)rulesDialog.close();
 }
 if(root?.document){
  const start=()=>{mount();root.firebase?.auth?.().onAuthStateChanged?.(mount);};
  if(root.document.readyState==='complete')start();else root.addEventListener('load',start,{once:true});
  root.addEventListener('ucvm-timetable-user',mount);root.addEventListener('paws-profile',mount);
 }
 return Object.freeze({openBulk,openRules,openTask,mountScheduleShortcut,workQueue,roleAllowed,mapFacultySuggestions,taskActionFor});
});
