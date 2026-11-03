(function(root){
 'use strict';
 const api=()=>root.PAWS_LAB_SCHEDULING,E=value=>api().escape(value),id=()=>root.crypto.randomUUID();
 const pendingBadge=()=>root?.UCVM_TESTING_ONLY?.pendingBadge?.()||'';
 let dialog=null,context=null,resource=null,items=[],accounts=[],canSeed=false,selected='',owner='',generation=0,busy=false,dirty=false,notice='',tab='resources';
 const name=value=>root.PAWS_FACULTY_NAME?.format(value)||value;
 function clear(){generation++;root.PAWS_SCHEDULE_OFFICE_UI?.unmountLab?.();context=null;resource=null;items=[];accounts=[];selected='';owner='';if(dialog){dialog.close();dialog.replaceChildren()}}
 function syncIdentity(){if(owner&&owner!==api().identity()?.key)clear()}
 function shell(){if(!dialog){dialog=root.document.createElement('dialog');dialog.className='paws-lab-dialog';dialog.setAttribute('aria-labelledby','paws-lab-title');root.document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();clear()})}if(!dialog.open)dialog.showModal()}
 function options(rows,value,label,current){return rows.map(r=>'<option value="'+E(value(r))+'" '+(String(value(r))===String(current)?'selected':'')+'>'+E(label(r))+'</option>').join('')}
 const input=(label,key,value,type='text',extra='')=>'<label>'+E(label)+'<input data-field="'+E(key)+'" type="'+type+'" value="'+E(value)+'" '+extra+'></label>';
 function groupsPicker(groups,chosen,key){return '<div class="lab-checks">'+groups.map(g=>'<label><input type="checkbox" data-field="'+key+'" value="'+E(g.id)+'" '+(chosen.includes(g.id)?'checked':'')+'> '+E(g.code||'Unlabelled')+'</label>').join('')+'</div>'}
 function message(error){notice=error?.message||String(error);if(error?.details&&context)context.validation=error.details;const status=dialog?.querySelector('[data-notice]');if(status&&dialog.querySelector('[data-lab-form]')){status.textContent=notice;status.setAttribute('role','alert');renderButtons();return}render()}
 async function refresh(){const token=++generation;const result=selected?await api().request('/context?sessionId='+encodeURIComponent(selected)):null;const reservation=result?.capabilities?.canRoster?await api().request('/resources?sessionId='+encodeURIComponent(selected)):null;if(token!==generation||owner!==api().identity()?.key||!dialog.open)return;context=result;resource=reservation;dirty=false;render()}
 async function open(sessionId,options={}){
  clear();tab=options.tab==='bulk'?'bulk':options.tab==='single'?'single':'resources';owner=api().identity()?.key||'';if(!owner)throw Error('Sign in before opening Lab scheduling.');shell();dialog.innerHTML='<h2 id="paws-lab-title">Lab Scheduling'+pendingBadge()+'</h2><p role="status">Loading activity scopes...</p>';const token=++generation;
  try{const result=await api().request('');if(token!==generation||owner!==api().identity()?.key||!dialog.open)return;items=result.items||[];accounts=result.labAccounts||[];canSeed=result.canSeed===true;selected=items.some(x=>x.sessionId===sessionId)?sessionId:items[0]?.sessionId||'';notice='';await refresh()}catch(error){message(error)}
 }
 function capture(){
  if(!context?.draft)return null;const draft=JSON.parse(JSON.stringify(context.draft)),form=dialog.querySelector('[data-lab-form]');if(!form)return draft;
  const value=(node,key)=>node.querySelector('[data-field="'+key+'"]')?.value||'';
  const checked=(node,key)=>[...node.querySelectorAll('[data-field="'+key+'"]:checked')].map(x=>x.value);
  draft.groups=[...form.querySelectorAll('[data-group-id]')].map(node=>({id:node.dataset.groupId,code:value(node,'code'),members:api().parseRoster(value(node,'members'))}));
  draft.rooms=[...form.querySelectorAll('[data-room-id]')].map(node=>({id:node.dataset.roomId,label:value(node,'label'),resourceKey:value(node,'resourceKey'),subspace:value(node,'subspace'),capacity:value(node,'capacity')===''?null:Number(value(node,'capacity'))}));
  draft.stations=[...form.querySelectorAll('[data-station-id]')].map(node=>{const prior=draft.stations.find(s=>s.id===node.dataset.stationId);return{id:prior.id,sessionId:prior.sessionId,label:value(node,'stationLabel'),assignedGroupIds:checked(node,'audience'),runs:[...node.querySelectorAll('[data-run-id]')].map(r=>({id:r.dataset.runId,start:value(r,'start'),end:value(r,'end'),roomId:value(r,'roomId'),mode:value(r,'mode'),groupIds:checked(r,'allocation')}))}});
  return draft;
 }
 function localChange(fn){try{context.draft=capture();fn(context.draft);dirty=true;notice='Unsaved changes. Save Draft to validate before publishing.';render()}catch(error){message(error)}}
 async function mutate(path,payload){
  if(busy)return;busy=true;renderButtons();const token=generation;
  try{const result=await api().request(path,{method:'POST',body:{...payload,requestId:id()}});if(token!==generation||owner!==api().identity()?.key||!dialog.open)return;notice=path==='/publish'?'Published. Public View now shows this revision.':'Saved in this browser Demo only.';if(result.draft){context=result;dirty=false;render()}else await refresh();if(path==='/publish'){root.dispatchEvent(new CustomEvent('paws-lab-published',{detail:{sessionId:selected}}));root.UCVM_TIMETABLE_TESTING_HOOKS?.refresh?.()}}
  catch(error){if(token===generation)message(error)}finally{busy=false;renderButtons()}
 }
 function renderButtons(){if(!dialog)return;const fields=dialog.querySelector('[data-lab-form] fieldset');if(fields)fields.disabled=busy||context?.capabilities.canEdit!==true;dialog.querySelectorAll('[data-mutation]').forEach(b=>{b.disabled=busy||context?.capabilities.canEdit===false});const pub=dialog.querySelector('[data-action="publish"]');if(pub)pub.disabled=busy||dirty||context?.validation?.canPublish!==true}
 function resourceWarnings(items){
  return items?.length?'<div class="lab-resource-warnings" role="alert">'+items.map(w=>
   '<p><strong>'+E(w.code)+'</strong> · '+E(w.message)+'</p>').join('')+'</div>':'<p class="lab-muted">No capacity warning from the saved requests. Animal availability is not confirmed.</p>';
 }
 function renderResources(){
  const editable=resource?.capabilities?.canEdit===true,canReview=resource?.capabilities?.canReview===true,
   request=resource?.request,policy=resource?.policy||{horsePoolSize:38,horseRestHours:24,petProfessorThreshold:30,petWindowHours:48},
   check=resource?.assessment,haveSource=!!resource?.session,disabled=editable?'':' disabled',
   status=request?.status||'not submitted';
  const selectedOptions=options(items,x=>x.sessionId,x=>x.academicYear+' / Year '+x.curriculumYear+' / '+x.courseCode+' / '+x.date+' / '+x.topic,selected);
  const resourceForm=haveSource?
   '<section class="lab-resource-panel"><div class="lab-resource-summary"><strong>Reservation status: '+E(status)+'</strong><span>'+E(resource.session.date)+' · '+E(resource.session.start)+'–'+E(resource.session.end)+'</span></div>'+
   (resource.sourceChanged?'<p class="lab-resource-warnings" role="alert">ADC changed the approved Session. Resubmit the request before confirming animal assignments.</p>':'')+
   '<p class="lab-muted">Step 1: Send Reserve Notes before organizing the lab groups. Use 0 for a resource you do not need. A request is not an animal-use approval.</p>'+
   '<div class="lab-resource-grid"><label>Horses required (synthetic pool '+E(policy.horsePoolSize)+')<input data-resource-horses type="number" min="0" max="'+E(policy.horsePoolSize)+'" step="1" value="'+E(request?.horseCount||0)+'"'+disabled+'></label>'+
   '<label>Pet Professors required<input data-resource-pet type="number" min="0" max="1000" step="1" value="'+E(request?.petProfessorCount||0)+'"'+disabled+'></label></div>'+
   '<label>Reserve Notes<textarea data-resource-notes rows="4" maxlength="2000" placeholder="Animal type, procedure, number of groups, handling/equipment needs and specific instructions"'+disabled+'>'+E(request?.notes||'')+'</textarea></label>'+
   '<p class="lab-muted">Horse IDs are assigned only by a resource reviewer. A horse cannot be confirmed again until at least '+E(policy.horseRestHours)+' hours after its previous use ends.</p>'+
   '<div class="lab-resource-actions"><button type="button" data-resource-preview'+disabled+'>Preview availability</button><button type="button" data-resource-submit'+disabled+'>Send Reservation Request</button></div>'+
   '<div data-resource-feedback role="status">'+E(notice)+'</div><div data-resource-preview-result aria-live="polite"></div>'+
   '<div class="lab-resource-summary"><span>Synthetic horses currently unallocated for this time and rest window: <strong>'+E(check?.availableHorseCount??'—')+'</strong></span><span>Pet Professor demand in rolling '+E(policy.petWindowHours)+' hours: <strong>'+E(check?.petWindowDemand??0)+'</strong> / warning above '+E(policy.petProfessorThreshold)+'</span></div>'+
   resourceWarnings(check?.warnings)+
   (canReview&&request&&['requested','confirmed','rejected'].includes(status)?
    '<details class="lab-resource-review"><summary>Owner / Developer: review reservation (Testing simulation)</summary>'+
    '<p class="lab-muted">Confirming horses requires exact synthetic IDs H01–H'+E(policy.horsePoolSize)+'. Staff must validate animal care eligibility separately. No email is sent.</p>'+
    '<label>Assigned Demo Horse IDs (comma separated)<input data-resource-horse-ids value="'+E((request.horseIds||[]).join(', '))+'"></label>'+
    '<label>Review Notes<textarea data-resource-review-note rows="2" maxlength="1000">'+E(request.reviewNote||'')+'</textarea></label>'+
    '<div class="lab-resource-actions"><button type="button" data-resource-confirm'+disabled+'>Confirm synthetic reservation</button><button type="button" data-resource-reject'+disabled+'>Reject request</button></div>'+
    '<p class="lab-muted">Available horse IDs (simulation): '+E((check?.availableHorseIds||[]).join(', '))+'</p></details>':'')+
   (canReview&&editable?'<details class="lab-resource-review"><summary>Owner / Developer: editable resource rules</summary>'+
    '<div class="lab-resource-grid"><label>Horse pool<input type="number" min="1" max="200" step="1" data-resource-pool value="'+E(policy.horsePoolSize)+'"></label>'+
    '<label>Minimum horse rest (hours)<input type="number" min="24" max="168" step="1" data-resource-rest value="'+E(policy.horseRestHours)+'"></label>'+
    '<label>Pet Professor warning above<input type="number" min="1" max="1000" step="1" data-resource-threshold value="'+E(policy.petProfessorThreshold)+'"></label>'+
    '<label>Rolling window (hours)<input type="number" min="1" max="168" step="1" data-resource-window value="'+E(policy.petWindowHours)+'"></label></div>'+
    '<button type="button" data-resource-policy>Save synthetic resource rules</button></details>':'')+
   '</section>':'<p>No authorized LAB resource details available. Select a LAB Session within your course scope.</p>';
  dialog.innerHTML='<header class="lab-dialog-header"><h2 id="paws-lab-title">Lab Scheduling'+pendingBadge()+'</h2><button type="button" data-action="close">Close</button></header>'+
   '<div class="lab-dialog-body"><nav class="lab-tabs" aria-label="Lab Scheduling modes"><button type="button" data-lab-tab="resources" aria-selected="true">1. Resource Request</button><button type="button" data-lab-tab="single" aria-selected="false">2. Student Groups / Runs</button><button type="button" data-lab-tab="bulk" aria-selected="false">Bulk CSV</button></nav>'+
   '<p class="lab-warning">Testing Demo only — synthetic horses and pet counts. Submission is stored in this browser; it does not send an email, make a real booking or authorize animal use.</p>'+
   '<label class="lab-wide">Course / LAB Session<select data-resource-select><option value="">Select a LAB Session</option>'+selectedOptions+'</select></label>'+
   resourceForm+'<button type="button" data-resource-continue>Continue to Student Groups / Runs</button></div>';
  bindResources();
 }
 async function resourceAction(route,payload,success){
  if(busy||!resource?.capabilities?.canEdit)return;
  busy=true;const token=generation;
  const buttons=dialog.querySelectorAll('[data-resource-submit],[data-resource-preview],[data-resource-confirm],[data-resource-reject],[data-resource-policy]');
  buttons.forEach(node=>node.disabled=true);
  try{
   const response=await api().request(route,{method:'POST',body:{...payload,requestId:id()}});
   if(token!==generation||owner!==api().identity()?.key||!dialog.open)return;
   if(route==='/resource-preview'){
    const result=dialog.querySelector('[data-resource-preview-result]');
    if(result)result.innerHTML='<p class="lab-muted">Available synthetic horses: '+E(response.availableHorseCount)+'; Pet Professor demand: '+E(response.petWindowDemand)+'</p>'+resourceWarnings(response.warnings);
   }else{
    resource=route==='/resource-rules'?await api().request('/resources?sessionId='+encodeURIComponent(selected)):response;
    notice=success;render();
   }
  }catch(e){
   const error=dialog.querySelector('[data-resource-feedback]');
   if(error){error.textContent=e.message;error.setAttribute('role','alert')}else message(e);
  }finally{busy=false;buttons.forEach(node=>{if(node.isConnected)node.disabled=false})}
 }
 function bindResources(){
  dialog.querySelector('[data-action="close"]').onclick=clear;
  const next=t=>{tab=t;render()};
  dialog.querySelector('[data-lab-tab="single"]').onclick=()=>next('single');
  dialog.querySelector('[data-lab-tab="bulk"]').onclick=()=>next('bulk');
  dialog.querySelector('[data-resource-continue]').onclick=()=>next('single');
  dialog.querySelector('[data-resource-select]').onchange=async e=>{selected=e.target.value;notice='';try{await refresh()}catch(err){message(err)}};
  const valueFor=name=>dialog.querySelector('[data-resource-'+name+']')?.value;
  const draft=()=>({sessionId:selected,expectedVersion:resource?.request?.version||0,
   horseCount:Number(valueFor('horses')),petProfessorCount:Number(valueFor('pet')),
   notes:valueFor('notes')||''});
  dialog.querySelector('[data-resource-preview]')?.addEventListener('click',()=>resourceAction('/resource-preview',draft(),''));
  dialog.querySelector('[data-resource-submit]')?.addEventListener('click',()=>resourceAction('/resource-request',draft(),'Reserve Notes submitted to the synthetic queue. Awaiting animal resource confirmation; no external message sent.'));
  const review=decision=>resourceAction('/resource-review',{
   sessionId:selected,expectedVersion:resource?.request?.version||0,decision,
   horseIds:(valueFor('horse-ids')||'').split(/[\s,;]+/).filter(Boolean),
   reviewNote:valueFor('review-note')||''
  },decision==='confirm'?'Synthetic reservation confirmed. Actual animal care approval is still required.':'Resource request rejected. LAB may revise and resubmit.');
  dialog.querySelector('[data-resource-confirm]')?.addEventListener('click',()=>review('confirm'));
  dialog.querySelector('[data-resource-reject]')?.addEventListener('click',()=>review('reject'));
  dialog.querySelector('[data-resource-policy]')?.addEventListener('click',()=>resourceAction('/resource-rules',{
   sessionId:selected,expectedRevision:resource.policyRevision,
   horsePoolSize:Number(valueFor('pool')),horseRestHours:Number(valueFor('rest')),
   petProfessorThreshold:Number(valueFor('threshold')),petWindowHours:Number(valueFor('window'))
  },'Synthetic resource rules updated.'));
 }
 function render(){
  if(!dialog?.open)return;
  const editable=context?.capabilities?.canEdit===true,draft=context?.draft;
  if(tab==='bulk'&&root.PAWS_SCHEDULE_OFFICE_UI?.can?.(api().identity()?.role,'lab')){
   dialog.innerHTML='<header class="lab-dialog-header"><h2 id="paws-lab-title">Lab Scheduling'+pendingBadge()+'</h2><button type="button" data-action="close">Close</button></header><div class="lab-dialog-body"><nav class="lab-tabs" aria-label="Lab Scheduling modes"><button type="button" data-lab-tab="single" aria-selected="false">Single Activity</button><button type="button" data-lab-tab="bulk" aria-selected="true">Bulk CSV</button></nav><section data-lab-bulk-host></section></div>';
   dialog.querySelector('[data-action="close"]').onclick=clear;
   dialog.querySelector('[data-lab-tab="single"]').onclick=()=>{root.PAWS_SCHEDULE_OFFICE_UI?.unmountLab?.();tab='single';render()};
   root.PAWS_SCHEDULE_OFFICE_UI.mountLab(dialog.querySelector('[data-lab-bulk-host]'));
   return;
  }
  dialog.innerHTML='<header class="lab-dialog-header"><h2 id="paws-lab-title">Lab Scheduling'+pendingBadge()+'</h2><button type="button" data-action="close" aria-label="Close Lab scheduling">Close</button></header><div class="lab-dialog-body"><nav class="lab-tabs" aria-label="Lab Scheduling modes"><button type="button" data-lab-tab="single" aria-selected="true">Single Activity</button><button type="button" data-lab-tab="bulk" aria-selected="false">Bulk CSV</button></nav><p class="lab-warning">Testing Demo: synthetic, browser-local data only. Do not enter real student records.</p><label class="lab-wide">Academic year / cohort / course / activity<select data-select-session><option value="">Select a Lab activity</option>'+options(items,x=>x.sessionId,x=>x.academicYear+' / Year '+x.curriculumYear+' / '+x.courseCode+' / '+x.date+' / '+x.topic,selected)+'</select></label>'+(canSeed?'<button type="button" data-action="sample">Load synthetic 505 example</button>':'')+'<p data-notice role="status">'+E(notice)+'</p>'+(context?'<section><h3>Published schedule</h3>'+api().renderPublished(context.published,name)+(context.capabilities.canRoster&&context.published?'<button type="button" data-action="roster">View published group roster v'+E(context.published.version)+'</button>':'')+'</section>':'<p>No authorized LAB activities are available. An Owner must grant a course scope.</p>')+
   (draft?'<section><h3>Working Draft &middot; revision '+E(context.revision)+'</h3><p class="lab-muted">All = the full audience explicitly assigned to this station. Changing group order does not modify teacher assignments or DOE.</p><form data-lab-form><fieldset '+(!editable?'disabled':'')+'><details open><summary>Student groups and restricted rosters</summary><p class="lab-muted">One row per student: Student ID, then a TAB, then name. Use consistent synthetic IDs across activities for conflict checks.</p>'+draft.groups.map(g=>'<div class="lab-group-editor" data-group-id="'+E(g.id)+'">'+input('Group label','code',g.code)+'<label>Restricted roster<textarea data-field="members" rows="3" placeholder="student-id&#9;Student name">'+E(g.members.map(m=>m.id+'\t'+m.name).join('\n'))+'</textarea></label><label>Import TSV<input type="file" accept=".tsv,.txt" data-import-roster="'+E(g.id)+'"></label><button type="button" data-remove-group="'+E(g.id)+'">Remove group</button></div>').join('')+'<button type="button" data-action="add-group">Add group</button></details><details><summary>Rooms, subspaces and capacity</summary>'+draft.rooms.map(r=>'<div class="lab-room-editor" data-room-id="'+E(r.id)+'">'+input('Room label','label',r.label)+input('Resource key','resourceKey',r.resourceKey)+input('Subspace','subspace',r.subspace)+input('Student capacity','capacity',r.capacity,'number','min="0" step="1"')+'<button type="button" data-remove-room="'+E(r.id)+'">Remove room</button></div>').join('')+'<button type="button" data-action="add-room">Add room / subspace</button></details>'+draft.stations.map(st=>{
    const source=context.sourceSessions.find(s=>s.id===st.sessionId);
    return '<section class="lab-station-editor" data-station-id="'+E(st.id)+'"><h4>'+E(source?.topic||st.label)+'</h4><p>'+((source?.instructors||[]).map(f=>E(name(f.name))+' <strong>'+E(f.role)+'</strong>').join('; '))+'</p><p class="lab-muted">Approved envelope: '+E(source?.start)+' - '+E(source?.end)+'. Teacher coverage is rechecked at publication.</p>'+input('Activity display label','stationLabel',st.label)+'<strong>Assigned activity audience</strong>'+groupsPicker(draft.groups,st.assignedGroupIds,'audience')+'<div class="lab-runs">'+st.runs.map(r=>'<div class="lab-run-editor" data-run-id="'+E(r.id)+'">'+input('Start','start',r.start,'time')+input('End','end',r.end,'time')+'<label>Room<select data-field="roomId"><option value="">Choose room</option>'+options(draft.rooms,x=>x.id,x=>x.label+(x.subspace?' / '+x.subspace:''),r.roomId)+'</select></label><label>Attendance<select data-field="mode">'+options(['groups','all'],x=>x,x=>x==='all'?'All assigned students':'Selected groups',r.mode)+'</select></label>'+groupsPicker(draft.groups,r.groupIds,'allocation')+'<button type="button" data-remove-run="'+E(r.id)+'">Remove run</button></div>').join('')+'</div><button type="button" data-add-run="'+E(st.id)+'">Add run</button> <button type="button" data-change-source="'+E(st.sessionId)+'">Request course / teacher change</button></section>';
   }).join('')+'</fieldset></form><section class="lab-validation" aria-live="polite"><h4>Publication checks</h4>'+(context.validation.issues.length?'<ul>'+context.validation.issues.map(i=>'<li><strong>'+E(i.code)+'</strong>: '+E(i.message)+'</li>').join('')+'</ul>':'<p>Current saved draft passed the checks. Publication rechecks the current source and availability.</p>')+'</section>'+(editable?'<div class="lab-actions"><button type="button" data-action="save" data-mutation>Save Draft</button><button type="button" data-action="publish" data-mutation>Publish Changes</button><button type="button" data-action="reload">Reload Draft</button><button type="button" data-action="refresh" data-mutation>Reload approved source</button></div><details><summary>Copy structure from a published Lab</summary><select data-copy-source>'+options(items.filter(x=>x.sessionId!==selected&&x.publishedVersion),x=>x.sessionId,x=>x.academicYear+' / '+x.courseCode+' / '+x.date,'')+'</select><button type="button" data-action="copy" data-mutation>Copy into empty draft</button><p>Copies group structure only. Student memberships and publications are not copied.</p></details>':'<p>Archived schedule: read-only.</p>')+'</section>':'')+
   (canSeed&&context?'<details><summary>Owner: grant this course scope to a LAB account</summary><select data-scope-account>'+options(accounts,x=>x.id,x=>x.name,'')+'</select><button type="button" data-action="grant">Grant LAB scope</button><p>Only this academic year, cohort and course. No change to base role or DOE permissions.</p></details>':'')+'</div>';
  bind();renderButtons();
 }
 function bind(){
  const action=(name,fn)=>{const el=dialog.querySelector('[data-action="'+name+'"]');if(el)el.onclick=fn};
  action('close',clear);dialog.querySelector('[data-lab-tab="bulk"]')?.addEventListener('click',()=>{if(dirty&&!root.confirm('Discard unsaved Lab edits?'))return;tab='bulk';render()});dialog.querySelector('[data-select-session]').onchange=async event=>{if(dirty&&!root.confirm('Discard unsaved Lab edits?')){event.target.value=selected;return}selected=event.target.value;notice='';try{await refresh()}catch(e){message(e)}};
  const form=dialog.querySelector('[data-lab-form]');if(form){form.onsubmit=e=>e.preventDefault();form.oninput=()=>{dirty=true;renderButtons()};form.onchange=()=>{dirty=true;renderButtons()}}
  action('save',()=>{try{const draft=capture();mutate('/draft',{sessionId:selected,expectedRevision:context.revision,draft})}catch(e){message(e)}});
  action('publish',()=>{if(!dirty&&root.confirm('Publish this saved Lab revision to Public View?'))mutate('/publish',{sessionId:selected,expectedRevision:context.revision})});
  action('reload',()=>{if(!dirty||root.confirm('Discard unsaved changes?'))refresh().catch(message)});
  action('refresh',()=>{if(root.confirm('Reset draft runs and rooms from the current approved Sessions? Student groups are retained; the published schedule is unchanged.'))mutate('/refresh-source',{sessionId:selected,expectedRevision:context.revision})});
  action('copy',()=>{const fromSessionId=dialog.querySelector('[data-copy-source]').value;if(fromSessionId)mutate('/copy-structure',{fromSessionId,toSessionId:selected,expectedRevision:context.revision})});
  action('grant',async()=>{const userId=dialog.querySelector('[data-scope-account]').value;if(!userId)return;try{await api().request('/scope',{method:'POST',body:{sessionId:selected,userId,requestId:id()}});notice='Explicit LAB scope granted in this Demo.';render()}catch(e){message(e)}});
  action('sample',async()=>{if(!root.confirm('Add a synthetic two-station example? Its All/rotation overlap remains a visible conflict.'))return;try{const result=await api().request('/sample',{method:'POST',body:{requestId:id()}});await open(result.sourceSessions[0].id)}catch(e){message(e)}});
  action('roster',async()=>{const token=generation;try{const result=await api().request('/roster?'+new URLSearchParams({sessionId:selected,version:context.published.version}));if(token!==generation||!dialog.open)return;notice='';const node=root.document.createElement('section');node.className='lab-private-roster';node.innerHTML='<h3>Restricted roster &middot; Published v'+E(result.version)+'</h3>'+result.groups.map(g=>'<h4>Group '+E(g.code)+'</h4><pre>'+E(g.members.map(m=>m.id+'\t'+m.name).join('\n'))+'</pre>').join('');dialog.querySelector('.lab-private-roster')?.remove();dialog.querySelector('.lab-dialog-body').append(node);node.scrollIntoView({block:'nearest'})}catch(e){message(e)}});
  action('add-group',()=>localChange(d=>d.groups.push({id:id(),code:String(d.groups.length+1),members:[]})));
  action('add-room',()=>localChange(d=>d.rooms.push({id:id(),label:'',resourceKey:'',subspace:'',capacity:null})));
  dialog.querySelectorAll('[data-remove-group]').forEach(b=>b.onclick=()=>localChange(d=>{d.groups=d.groups.filter(g=>g.id!==b.dataset.removeGroup)}));
  dialog.querySelectorAll('[data-remove-room]').forEach(b=>b.onclick=()=>localChange(d=>{d.rooms=d.rooms.filter(r=>r.id!==b.dataset.removeRoom)}));
  dialog.querySelectorAll('[data-add-run]').forEach(b=>b.onclick=()=>localChange(d=>d.stations.find(s=>s.id===b.dataset.addRun).runs.push({id:id(),start:'',end:'',roomId:'',mode:'groups',groupIds:[]})));
  dialog.querySelectorAll('[data-remove-run]').forEach(b=>b.onclick=()=>localChange(d=>{d.stations.forEach(s=>{s.runs=s.runs.filter(r=>r.id!==b.dataset.removeRun)})}));
  dialog.querySelectorAll('[data-import-roster]').forEach(el=>el.onchange=async()=>{const file=el.files?.[0];if(!file)return;try{if(file.size>200000)throw Error('TSV file exceeds 200 KB.');const members=api().parseRoster(await file.text());localChange(d=>{d.groups.find(g=>g.id===el.dataset.importRoster).members=members})}catch(e){message(e)}});
  dialog.querySelectorAll('[data-change-source]').forEach(b=>b.onclick=()=>{const sessionId=b.dataset.changeSource;if(root.PAWS_SWAP?.openSession){clear();root.PAWS_SWAP.openSession(sessionId)}else{notice='Use the existing SWAP & Approvals / Teaching Assignments tools to approve source changes, then reload approved source here.';render()}});
 }
 root.PAWS_LAB_EDITOR=Object.freeze({open,clear,syncIdentity});
})(window);
