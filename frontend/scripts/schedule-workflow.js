(function(root,factory){
 'use strict';
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PAWS_SCHEDULE_WORKFLOW=api;
})(typeof window==='undefined'?null:window,function(root){
 'use strict';
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
 const ADC=['adc','developer','owner'];
 const ADFAD=['developer','owner','adfa_general','adfa_regular','administrator','admin'];
 const allowedRole=role=>ADC.includes(String(role||'').toLowerCase())||ADFAD.includes(String(role||'').toLowerCase());
 const dateTime=s=>(s.date||'')+' '+String(s.startTime||'').slice(0,5)+'–'+String(s.endTime||'').slice(0,5);
 let dialog=null,state=null,activeDraft='',activeSession='',facultyRows=[],busy=false,notice='';
 const selected=s=>state?.sessions?.find(x=>x.id===s)||null;
 const savedDraft=()=>state?.drafts?.find(x=>x.id===activeDraft)||null;
 function identity(){
  const demo=root?.UCVM_PAWS_DEMO_API,user=root?.firebase?.auth?.().currentUser;
  const row=demo?.store?.tables?.users?.find(x=>x.firebaseUid===user?.uid);
  return row&&row.active===true&&row.mustChangePassword===false?{uid:row.firebaseUid,role:String(row.baseRole||'').toLowerCase()}:null;
 }
 async function request(path='',body){
  const u=identity();
  if(!u)throw Error('Sign in with an active Demo account.');
  if(!root.UCVM_PAWS_DEMO_API||root.UCVM_PAWS_DEMO_API.authoritative!==false)throw Error('Only the PAWS Testing Demo supports this workflow.');
  const origin=root.PAWS_API_ORIGIN_CONFIG?.apiOrigin;
  if(!origin)throw Error('Testing API not initialized.');
  const token=await root.firebase.auth().currentUser.getIdToken();
  const res=await root.fetch(origin+'/api/v1/schedule-workflow'+path,{method:body?'POST':'GET',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},credentials:'omit',
   body:body?JSON.stringify(body):undefined});
  const data=await res.json();
  if(!res.ok){const err=Error(data?.error?.message||'The schedule operation failed.');err.code=data?.error?.code;throw err;}
  return data;
 }
 function option(value,label,current){return '<option value="'+esc(value)+'" '+(String(value)===String(current)?'selected':'')+'>'+esc(label)+'</option>';}
 function fields(rows,label){return rows.map((x,i)=>{
  const session=selected(activeSession),roleOptions=session?.sessionType==='LAB'?['Lab Primary','Lab Secondary']:session?.sessionType==='SRL'?['SRL']:['Lecture','SRL','Lab Primary','Lab Secondary'];
  const defaultRole=session?.sessionType==='LAB'?(i===0?'Lab Primary':'Lab Secondary'):session?.sessionType==='SRL'?'SRL':'Lecture';
  return '<div class="paws-stage-faculty-row" data-faculty-row="'+i+'"><label>Faculty<select data-field="facultyId">'+
    option('','Select Faculty',x.facultyId||'')+state.faculty.map(f=>option(f.facultyId,f.name+(f.activationDate?' · starts '+f.activationDate:''),x.facultyId)).join('')+
    '</select></label><label>Teaching role<select data-field="teachingRole">'+roleOptions.map(v=>option(v,v,x.teachingRole||defaultRole)).join('')+
    '</select></label><label>Credited hours (ADFAD)<input type="number" min="0" max="48" step="0.25" data-field="creditedHours" value="'+esc(x.creditedHours??'')+'" placeholder="Unconfirmed"></label>'+
    '<button type="button" data-remove-faculty="'+i+'" aria-label="Remove faculty row">Remove</button></div>';
 }).join('');}
 const summary=s=>'<strong>'+esc(s.courseCode)+' · '+esc(s.sessionType)+'</strong> '+esc(dateTime(s))+
   (s.topic?' · '+esc(s.topic):' · Topic pending')+
   '<div class="paws-stage-pills"><span>1. ADC: Published</span><span>2. LAB: '+esc(s.labStatus==='not-applicable'?'N/A':s.labStatus)+'</span><span>3. ADFAD: '+esc(s.facultyStatus)+'</span></div>';
 function render(){
  if(!dialog||!state)return;
  const draft=savedDraft(),d=draft?.values||{},canADC=state.capabilities.canADC,canADFAD=state.capabilities.canADFAD,s=selected(activeSession);
  const titleRequired=state.rules?.fields?.topic?.required===true,roomRequired=state.rules?.fields?.room?.required===true;
  dialog.innerHTML='<header class="paws-stage-header"><h2 id="paws-stage-title">Schedule Workflow · Testing</h2><button type="button" data-stage-action="close" aria-label="Close">Close</button></header>'+
   '<div class="paws-stage-body"><p class="paws-stage-banner">Synthetic, browser-local data only. One Course Session per approved ADC record. Never enter real student or staff data here.</p>'+
   '<div class="paws-stage-flow"><span><strong>1 ADC</strong> · Publish schedule</span><span><strong>2 LAB</strong> · Rooms & groups</span><span><strong>3 ADFAD</strong> · Confirm faculty</span></div>'+
   (notice?'<p class="paws-stage-status" role="status">'+esc(notice)+'</p>':'')+
   (canADC?'<section class="paws-stage-card"><h3>Stage 1 · ADC — Schedule publication</h3><p>Required: <strong>Course, curriculum year, date and start/end time</strong>'+
   (titleRequired?', Title':'')+(roomRequired?', Room':'')+'. Missing optional details enter the responsible work queue. Faculty suggestions never assign DOE.</p>'+
    '<label>Open draft<select data-stage-draft>'+option('','New schedule draft',draft?.id||'')+
      state.drafts.map(row=>option(row.id,row.values.courseCode+' '+dateTime(row.values)+' · revision '+row.revision,activeDraft)).join('')+'</select></label>'+
    '<form data-stage-draft-form class="paws-stage-grid"><label>Course code <select name="courseCode">'+
      option('','Choose Course',d.courseCode)+state.courses.map(c=>option(c.courseCode,c.courseCode+' · '+c.courseName,d.courseCode)).join('')+
      '</select></label><label>Session type <select name="sessionType">'+['LAB','LEC','SRL','Exam','OSCE','Quiz/Midterm'].map(v=>option(v,v,d.sessionType||'LAB')).join('')+
      '</select></label><label>Date <input name="date" type="date" value="'+esc(d.date||'')+'"></label>'+
      '<label>Start <input name="startTime" type="time" value="'+esc(d.startTime||'')+'"></label>'+
      '<label>End <input name="endTime" type="time" value="'+esc(d.endTime||'')+'"></label>'+
      '<label>Session title / Topic '+(titleRequired?'(required)':'(optional)')+' <input name="topic" value="'+esc(d.topic||'')+'" '+(titleRequired?'required':'')+'></label>'+
      '<label>Room '+(roomRequired?'(required)':'(optional; LAB can book later)')+' <input name="room" value="'+esc(d.room||'')+'" '+(roomRequired?'required':'')+'></label>'+
      '<label>Suggested faculty (optional; Ctrl-click to select several)<select name="suggestions" multiple size="4">'+
       state.faculty.map(f=>'<option value="'+esc(f.facultyId)+'" '+((d.suggestedFacultyIds||[]).includes(f.facultyId)?'selected':'')+'>'+esc(f.name)+'</option>').join('')+
      '</select></label><div class="paws-stage-actions"><button type="submit">Save ADC Draft</button>'+
      '<button type="button" data-stage-action="publish" '+(!draft?'disabled':'')+'>Publish saved schedule to Calendar</button></div></form>'+
      '<p class="paws-stage-muted">Save a draft before publishing. Published courses become visible in Calendar even when instructor and room are blank.</p></section>':'')+
   (canADFAD?'<section class="paws-stage-card"><h3>Stage 3 · ADFAD — Faculty assignment / confirmation</h3>'+
     '<p>LAB course must finish Stage 2 first. Confirm an ADC suggestion or choose another eligible Faculty. Enter credited hours explicitly; blank hours remain DOE pending.</p>'+
     '<label>Published Course Session<select data-stage-session>'+option('','Select published Session',activeSession)+
      state.sessions.map(item=>option(item.id,item.courseCode+' · '+dateTime(item)+' · '+item.sessionType+' · Faculty '+item.facultyStatus,activeSession)).join('')+'</select></label>'+
     (s?'<div class="paws-stage-session"><p>'+summary(s)+'</p><p>ADC suggested: '+esc(s.suggestedFacultyIds.length?s.suggestedFacultyIds.map(id=>state.faculty.find(f=>f.facultyId===id)?.name||id).join('; '):'None')+'</p>'+
       (s.sessionType==='LAB'&&s.labStatus!=='published'?'<p class="paws-stage-warning">LAB groups and rooms are not published yet. ADFAD confirmation will be blocked until Stage 2 is complete.</p>':'')+
       '<div class="paws-stage-actions"><button type="button" data-stage-action="use-suggestions" '+(!s.suggestedFacultyIds.length?'disabled':'')+'>Use ADC suggestions</button>'+
       '<button type="button" data-stage-action="add-faculty">Add faculty</button>'+
       (s.sessionType==='LAB'?'<button type="button" data-stage-action="lab-open">Open Stage 2 · Lab Scheduling</button>':'')+
       '</div><form data-stage-faculty-form>'+fields(facultyRows,'Faculty')+
       '<label class="paws-stage-note">Availability review note (required only if time evidence is unknown)<textarea name="reviewNote" rows="2" placeholder="ADFAD review and evidence"></textarea></label>'+
       '<div class="paws-stage-actions"><button type="submit">Confirm Faculty assignments</button></div></form></div>':'<p>Select a published Session to review suggestions or assign Faculty.</p>')+
     '</section>':'')+
   '<section class="paws-stage-card"><h3>Published timetable (current academic year)</h3><p>Stage 1 publication appears in Calendar immediately. LAB students and room allocations are shown only after LAB Publish Changes; ADFAD confirmed instructors appear last.</p>'+
   '<div class="paws-stage-list">'+state.sessions.slice(-80).reverse().map(s=>'<div>'+summary(s)+'</div>').join('')+'</div></section></div>';
  bind();
  root.PAWS_SCHEDULE_BULK_UI?.mountScheduleShortcut?.(dialog,state);
 }
 function snapshotFaculty(){
  if(!dialog)return[];
  return [...dialog.querySelectorAll('[data-faculty-row]')].map(node=>({
   facultyId:node.querySelector('[data-field="facultyId"]').value,
   teachingRole:node.querySelector('[data-field="teachingRole"]').value,
   creditedHours:node.querySelector('[data-field="creditedHours"]').value||null
  }));
 }
 const defaultFaculty=()=>{const s=selected(activeSession);return s?.assignments?.length?s.assignments.map(a=>({...a})):[]};
 async function refresh(msg){
  state=await request();notice=msg||'';
  if(activeDraft&&!state.drafts.some(x=>x.id===activeDraft))activeDraft='';
  if(activeSession&&!state.sessions.some(x=>x.id===activeSession))activeSession='';
  if(!activeSession&&state.capabilities.canADFAD){
   activeSession=state.sessions.find(x=>x.facultyStatus==='pending')?.id||state.sessions.at(-1)?.id||'';
   facultyRows=defaultFaculty();
  }
  render();
 }
 async function doAction(fn){
  if(busy)return;busy=true;
  try{await fn()}catch(error){notice=(error.code?error.code+': ':'')+error.message;render()}finally{busy=false}
 }
 async function onDraft(event){
  event.preventDefault();await doAction(async()=>{
   const f=event.currentTarget,data=new FormData(f),suggestions=[...f.querySelector('[name="suggestions"]').selectedOptions].map(x=>x.value);
   const input={academicYear:state.academicYear,courseCode:data.get('courseCode'),sessionType:data.get('sessionType'),
    date:data.get('date'),startTime:data.get('startTime'),endTime:data.get('endTime'),topic:data.get('topic'),
    room:data.get('room'),suggestedFacultyIds:suggestions};
   const d=savedDraft();if(d)Object.assign(input,{draftId:d.id,expectedRevision:d.revision});
   const saved=await request('/draft',input);
   activeDraft=saved.id;await refresh('ADC draft saved (revision '+saved.revision+'). This is not yet public.');
  });
 }
 async function onFaculty(event){
  event.preventDefault();await doAction(async()=>{
   const s=selected(activeSession);if(!s)throw Error('Select a Session.');
   const assignments=snapshotFaculty().filter(x=>x.facultyId);
   if(!assignments.length)throw Error('Choose at least one Faculty member.');
   const note=new FormData(event.currentTarget).get('reviewNote')||'';
   await request('/faculty',{sessionId:s.id,expectedRevision:s.facultyRevision,assignments,reviewNote:note});
   await refresh('ADFAD confirmed Faculty; Calendar teaching assignments updated.');
   facultyRows=defaultFaculty();render();root.UCVM_TIMETABLE_TESTING_HOOKS?.refresh?.();
  });
 }
 function bind(){
  dialog.querySelector('[data-stage-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('[data-stage-draft-form]')?.addEventListener('submit',onDraft);
  const selectDraft=dialog.querySelector('[data-stage-draft]');if(selectDraft)selectDraft.onchange=e=>{activeDraft=e.target.value;render()};
  const pub=dialog.querySelector('[data-stage-action="publish"]');
  if(pub)pub.onclick=()=>doAction(async()=>{
   const d=savedDraft();if(!d)throw Error('Save the ADC draft first.');
   if(!root.confirm('Publish Course, date and time to the shared Testing Calendar? This does not assign Faculty.'))return;
   const r=await request('/publish',{draftId:d.id,expectedRevision:d.revision});
   activeDraft='';activeSession=r.session.id;facultyRows=[];await refresh('ADC published '+r.session.courseCode+' · '+dateTime(r.session)+'. Open Calendar to see it.');
   root.UCVM_TIMETABLE_TESTING_HOOKS?.refresh?.();
  });
  const selectSession=dialog.querySelector('[data-stage-session]');
  if(selectSession)selectSession.onchange=e=>{activeSession=e.target.value;facultyRows=defaultFaculty();render()};
  const use=dialog.querySelector('[data-stage-action="use-suggestions"]');
  if(use)use.onclick=()=>{const s=selected(activeSession);
   facultyRows=s.suggestedFacultyIds.map((id,i)=>({facultyId:id,teachingRole:s.sessionType==='LAB'?(i===0?'Lab Primary':'Lab Secondary'):s.sessionType==='SRL'?'SRL':'Lecture',creditedHours:null}));render()};
  const add=dialog.querySelector('[data-stage-action="add-faculty"]');
  if(add)add.onclick=()=>{facultyRows=snapshotFaculty();facultyRows.push({facultyId:'',teachingRole:'',creditedHours:null});render()};
  dialog.querySelectorAll('[data-remove-faculty]').forEach(b=>b.onclick=()=>{facultyRows=snapshotFaculty();facultyRows.splice(Number(b.dataset.removeFaculty),1);render()});
  dialog.querySelector('[data-stage-faculty-form]')?.addEventListener('submit',onFaculty);
  const lab=dialog.querySelector('[data-stage-action="lab-open"]');if(lab)lab.onclick=()=>{
   const s=selected(activeSession);if(!s||s.sessionType!=='LAB')return;
   dialog.close();if(root.PAWS_LAB_SCHEDULING?.open)root.PAWS_LAB_SCHEDULING.open(s.id);
   else root.alert('Lab Scheduling is unavailable; reload PAWS Testing.');
  };
 }
 async function open(target){
  if(target?.sessionId&&target.stage==='adfa'){activeSession=target.sessionId;facultyRows=[];}
  if(!identity()||!allowedRole(identity()?.role)){root.alert('Use ADC, ADFAD, Developer or Owner Demo role.');return}
  if(!dialog){
   dialog=root.document.createElement('dialog');dialog.className='paws-stage-dialog';
   dialog.setAttribute('aria-labelledby','paws-stage-title');root.document.body.append(dialog);
  }
  if(!root.document.querySelector('link[data-stage-style]')){
   const link=root.document.createElement('link');link.rel='stylesheet';link.href='schedule-workflow.css';link.dataset.stageStyle='1';root.document.head.append(link);
  }
  if(!dialog.open)dialog.showModal();
  dialog.innerHTML='<p role="status">Loading three-stage schedule workflow…</p>';
  try{await refresh();if(target?.sessionId&&target.stage==='adfa'){facultyRows=defaultFaculty();render();}}catch(e){dialog.innerHTML='<p role="alert">'+esc(e.message)+'</p><button type="button" id="paws-stage-retry">Close</button>';dialog.querySelector('#paws-stage-retry').onclick=()=>dialog.close()}
 }
 function mount(){
  if(!root?.document||!root.UCVM_PAWS_DEMO_API)return;
  const host=root.document.querySelector('.timetable-top-actions');
  if(!host)return;
  let button=root.document.getElementById('paws-schedule-workflow-open');
  if(!button){button=root.document.createElement('button');button.id='paws-schedule-workflow-open';button.className='masthead-link';button.type='button';button.textContent='Schedule Workflow';button.onclick=open;host.prepend(button)}
  button.hidden=!allowedRole(identity()?.role);
  if(dialog?.open&&!allowedRole(identity()?.role))dialog.close();
 }
 if(root?.document){
  const start=()=>{mount();root.firebase?.auth?.().onAuthStateChanged?.(()=>{if(dialog?.open)dialog.close();mount()})};
  if(root.document.readyState==='complete')start();else root.addEventListener('load',start,{once:true});
  root.addEventListener('ucvm-timetable-user',mount);
  root.addEventListener('paws-profile',mount);
 }
 return Object.freeze({allowedRole,open,escape:esc});
});
