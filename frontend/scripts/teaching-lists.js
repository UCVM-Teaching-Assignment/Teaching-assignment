(function(root,factory){
 'use strict';
 const model=factory();
 if(typeof module==='object'&&module.exports)module.exports=model;
 if(!root?.document)return;
 const doc=root.document,overlay=doc.getElementById('teaching-lists-overlay');
 if(!overlay)return;
 const closeButton=doc.getElementById('teaching-lists-close');
 const controls=[...overlay.querySelectorAll('[data-teaching-tab]')];
 const cccPanel=doc.getElementById('ccc-schedule-overlay');
 const leadersPanel=doc.getElementById('leadership-directory-overlay');
 let active='ccc',previousFocus=null,activeUid='';
 const uid=()=>{try{return root.firebase?.auth?.().currentUser?.uid||''}catch(_){return ''}};
 const isOpen=()=>!overlay.hidden;
 const selectedTab=kind=>overlay.querySelector('[data-teaching-tab="'+kind+'"]');
 const year=()=>root.UCVM_PAGE_DATA?.academicYear?.()||model.calgaryYear();
 const moduleFor=kind=>kind==='ccc'?root.PAWS_CCC_SCHEDULE:root.PAWS_LEADERSHIP_DIRECTORY;
 function clearPanel(kind){moduleFor(kind)?.close?.();}
 function showPanel(kind){
  if(kind==='ccc')root.PAWS_CCC_SCHEDULE?.open?.();
  else root.PAWS_LEADERSHIP_DIRECTORY?.open?.(kind==='hicc'?'hicc-cc':'visc',year());
 }
 function syncTabs(){
  controls.forEach(button=>{
   const on=button.dataset.teachingTab===active;
   button.setAttribute('aria-selected',String(on));
   button.tabIndex=on?0:-1;
  });
  // Both leadership tabs reuse one authorized, read-only directory projection.
  leadersPanel?.setAttribute('aria-labelledby',active==='hicc'?'teaching-tab-hicc':'teaching-tab-visc');
 }
 function activate(kind,{focus=false}={}){
  const target=model.normalize(kind);
  if(!target||!isOpen())return false;
  if(target!==active){
   clearPanel(active);active=target;
   cccPanel.hidden=true;leadersPanel.hidden=true;
   syncTabs();showPanel(active);
  }else syncTabs();
  if(focus)selectedTab(active)?.focus();
  return true;
 }
 function open(kind='ccc'){
  const next=model.normalize(kind),account=uid();
  if(!next||!account)return false;
  if(isOpen()&&account!==activeUid)close({restore:false});
  if(isOpen())return activate(next,{focus:true});
  previousFocus=doc.activeElement;activeUid=account;active=next;
  overlay.hidden=false;overlay.setAttribute('aria-hidden','false');
  syncTabs();showPanel(active);selectedTab(active)?.focus();
  return true;
 }
 function close({restore=true}={}){
  if(!isOpen())return;
  clearPanel(active);
  cccPanel.hidden=true;leadersPanel.hidden=true;
  overlay.hidden=true;overlay.setAttribute('aria-hidden','true');
  activeUid='';const focus=previousFocus;previousFocus=null;
  if(restore&&focus?.isConnected)focus.focus();
 }
 closeButton.addEventListener('click',()=>close());
 controls.forEach(button=>button.addEventListener('click',()=>activate(button.dataset.teachingTab,{focus:true})));
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
 // Capture first: the former individual windows must not also consume Escape/Tab.
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  const tab=event.target.closest?.('[data-teaching-tab]');
  if(tab&&['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){
   event.preventDefault();
   activate(model.keyboardTab(tab.dataset.teachingTab,event.key),{focus:true});
   return;
  }
  if(event.key!=='Tab')return;
  const candidates=[...overlay.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
  const focusable=candidates.filter(el=>!el.closest('[hidden]')&&el.getClientRects().length>0);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
 },true);
 // Never retain another account's private CCC/leadership response.
 root.addEventListener('paws-profile',()=>{if(isOpen()&&(!uid()||uid()!==activeUid))close({restore:false});});
 try{root.firebase?.auth?.().onAuthStateChanged(user=>{
  if(isOpen()&&(!user||user.uid!==activeUid))close({restore:false});
 });}catch(_){/* Auth may not be initialized when this script loads. */}
 root.PAWS_TEACHING_LISTS=Object.freeze({open,close,select:kind=>activate(kind,{focus:true}),isOpen});
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const tabs=Object.freeze(['ccc','visc','hicc']);
 function normalize(value){return tabs.includes(value)?value:null;}
 function keyboardTab(kind,key){
  const i=tabs.indexOf(kind);
  if(i<0)return 'ccc';
  if(key==='Home')return tabs[0];
  if(key==='End')return tabs[tabs.length-1];
  return tabs[(i+(key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length];
 }
 function calgaryYear(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit'}).formatToParts(now);
  const y=Number(parts.find(x=>x.type==='year').value),m=Number(parts.find(x=>x.type==='month').value),start=m<5?y-1:y;
  return start+'-'+String((start+1)%100).padStart(2,'0');
 }
 return Object.freeze({tabs,normalize,keyboardTab,calgaryYear});
});
