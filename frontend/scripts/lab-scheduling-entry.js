(function(root,factory){
 'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PAWS_LAB_SCHEDULING=api;
})(typeof window==='undefined'?null:window,function(root){
 'use strict';
 const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function renderPublished(p,format=value=>String(value||'')){
  if(!p)return '<p class="lab-muted">Lab group allocations are not published yet.</p>';
  return '<p class="lab-muted">Published v'+escape(p.version)+(root?.UCVM_TESTING_ONLY?.pendingBadge?.()||'')+' &middot; '+escape(p.scope.academicYear)+' &middot; '+escape(p.scope.date)+'</p>'+(p.stations||[]).map(st=>{
   const times=[...new Set(st.runs.map(r=>r.start+' - '+r.end))];
   const instructors=(st.instructors||[]).map(f=>'<span>'+escape(format(f.name))+' <strong>'+escape(f.role)+'</strong>'+(f.participantCategory?' <small>'+escape(f.participantCategory)+'</small>':'')+'</span>').join('<br>');
   const rooms=[...new Set(st.runs.map(r=>r.room+(r.subspace?' / '+r.subspace:'')))];
   return '<div class="lab-grid-scroll"><table class="lab-grid"><thead><tr><th>Station / Instructor</th><th>Room</th>'+times.map(t=>'<th>'+escape(t)+'</th>').join('')+'</tr></thead><tbody><tr><th scope="row">'+escape(st.topic)+'<div class="lab-instructors">'+instructors+'</div></th><td>'+rooms.map(escape).join('<br>')+'</td>'+times.map(t=>'<td>'+st.runs.filter(r=>r.start+' - '+r.end===t).map(r=>r.groups.map(g=>'<span class="lab-group-chip">'+escape(g)+'</span>').join(' ')+'<small>'+escape(r.studentCount)+' assigned</small>').join('<br>')+'</td>').join('')+'</tr></tbody></table></div>';
  }).join('');
 }
 function parseRoster(value){
  const lines=String(value||'').split(/\r?\n/).filter(line=>line.trim());
  if(lines.length>1000)throw Error('Limit each group to 1000 roster rows.');
  const seen=new Set();return lines.map((line,i)=>{const parts=line.split('\t'),id=parts.shift().trim(),name=parts.join('\t').trim();if(!id)throw Error('Student ID required on roster row '+(i+1)+'.');if(seen.has(id))throw Error('Duplicate student ID on roster row '+(i+1)+'.');if(id.length>160||name.length>160)throw Error('Roster ID/name exceeds 160 characters.');seen.add(id);return{id,name}});
 }
 function identity(){
  const current=root?.firebase?.auth?.().currentUser,store=root?.UCVM_PAWS_DEMO_API?.store;
  if(!current||!store)return null;const user=store.tables.users.find(u=>u.firebaseUid===current.uid);
  return user&&user.active===true&&user.mustChangePassword===false?{uid:user.firebaseUid,role:user.baseRole,key:JSON.stringify([user.firebaseUid,user.baseRole,user.officeAccess,user.labScopes])}:null;
 }
 async function request(path,{method='GET',body,publicRead=false}={}){
  if(!root?.UCVM_PAWS_DEMO_API||root.UCVM_PAWS_DEMO_API.authoritative!==false)throw Error('Lab scheduling is available only in the synthetic Testing Demo.');
  const owner=identity(),headers={Accept:'application/json'};
  if(!publicRead){if(!owner)throw Error('Sign in to an active Demo account.');headers.Authorization='Bearer '+await root.firebase.auth().currentUser.getIdToken()}
  if(body!==undefined)headers['Content-Type']='application/json';
  const origin=root.PAWS_API_ORIGIN_CONFIG?.apiOrigin;if(!origin)throw Error('The Demo API has not initialized.');
  const response=await root.fetch(origin+'/api/v1/lab-scheduling'+path,{method,headers,credentials:'omit',body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();if(!publicRead&&identity()?.key!==owner.key)throw Object.assign(Error('Account or permissions changed. Reopen Lab scheduling.'),{code:'IDENTITY_CHANGED'});
  if(!response.ok)throw Object.assign(Error(data.error?.message||'The Lab operation failed.'),{code:data.error?.code,status:response.status,details:data.error?.details});return data;
 }
 function styles(){if(!root.document.querySelector('[data-paws-lab-css]')){const link=root.document.createElement('link');link.rel='stylesheet';link.href='lab-scheduling.css';link.dataset.pawsLabCss='1';root.document.head.append(link)}}
 async function open(sessionId){
  styles();try{const loader=root.UCVM_ASSETS;if(!loader?.loadScriptOnce)throw Error('Reload PAWS to initialize the shared dialog loader.');const editor=await loader.loadScriptOnce('lab-scheduling-editor.js','PAWS_LAB_EDITOR');await editor.open(sessionId)}catch(error){root.alert(error.message)}
 }
 function install(){
  if(!root?.document||!root.UCVM_PAWS_DEMO_API||!root.document.getElementById('calendar-body'))return;
  const doc=root.document,host=doc.querySelector('.timetable-top-actions');
  if(host&&!doc.getElementById('paws-lab-scheduling-open')){const button=doc.createElement('button');button.id='paws-lab-scheduling-open';button.type='button';button.className='masthead-link';button.innerHTML='Lab Scheduling'+(root?.UCVM_TESTING_ONLY?.pendingBadge?.()||'');button.onclick=()=>open();host.prepend(button)}
  const button=doc.getElementById('paws-lab-scheduling-open');if(button)button.hidden=!identity();
  hydrate();
 }
 async function hydrate(){
  if(!root?.UCVM_PAWS_DEMO_API)return;
  for(const node of root.document.querySelectorAll('[data-paws-lab-published]:not([data-lab-loaded])')){
   node.dataset.labLoaded='1';const id=node.dataset.pawsLabPublished;try{const result=await request('/public?sessionId='+encodeURIComponent(id),{publicRead:true});if(!node.isConnected)continue;styles();node.innerHTML=renderPublished(result.publication,value=>root.PAWS_FACULTY_NAME?.format(value)||value);const fallback=node.parentElement.querySelector('[data-paws-lab-source]');if(fallback&&result.publication)fallback.open=false}catch(_){node.textContent='Published group schedule could not be loaded. Reopen to retry.'}
  }
 }
 if(root?.document){
  root.document.addEventListener('click',event=>{const button=event.target.closest?.('[data-paws-lab-open]');if(button){event.preventDefault();open(button.dataset.pawsLabOpen)}});
  const start=()=>{install();const observer=new MutationObserver(hydrate);observer.observe(root.document.body,{childList:true,subtree:true});root.firebase?.auth?.().onAuthStateChanged?.(()=>{root.PAWS_LAB_EDITOR?.clear();install()})};
  if(root.document.readyState==='complete')start();else root.addEventListener('load',start,{once:true});
  root.addEventListener('paws-lab-published',()=>{root.document.querySelectorAll('[data-paws-lab-published]').forEach(n=>n.removeAttribute('data-lab-loaded'));hydrate()});
  root.addEventListener('ucvm:sessions-updated',install);root.addEventListener('paws-profile',()=>{root.PAWS_LAB_EDITOR?.syncIdentity();install()});
 }
 return Object.freeze({escape,renderPublished,parseRoster,identity,request,open});
});
