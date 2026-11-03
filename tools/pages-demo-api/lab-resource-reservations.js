'use strict';
// PAWS Frontend Demo only: simulated reservations are not animal-care approval.
const copy=x=>JSON.parse(JSON.stringify(x));
const value=x=>String(x==null?'':x).trim();
const list=x=>Array.isArray(x)?x:[];
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const DAY=24*60*60*1000;
const DEFAULT_POLICY=Object.freeze({
 horsePoolSize:38,horseRestHours:24,petProfessorThreshold:30,petWindowHours:48
});
const ADMIN=new Set(['developer','owner']);
function timeOf(date,clock){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(clock))fail('INVALID_TIME','A published LAB date and start/end time are required.');
 const d=new Date(date+'T'+clock+':00Z');
 if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==date||d.toISOString().slice(11,16)!==clock)fail('INVALID_TIME','The published LAB time is invalid.');
 return d.getTime();
}
function createLabResourceReservations({store,labService}={}){
 if(!store?.bag||!labService?.read)throw Error('Demo store and LAB scheduling service are required.');
 const state=()=>store.bag('labResourceReservations',()=>({revision:1,policy:copy(DEFAULT_POLICY),requests:{},receipts:{}}));
 const policy=()=>({...DEFAULT_POLICY,...state().policy});
 const user=uid=>{
  const u=list(store.tables.users).find(row=>row.firebaseUid===uid);
  if(!u||u.active!==true||u.mustChangePassword!==false)fail('ROLE_DENIED','An active Testing account is required.');
  return u;
 };
 function source(uid,sessionId,editing=false){
  user(uid);
  const context=labService.read(uid,sessionId);
  if(!context.capabilities?.canRoster&&!context.capabilities?.canEdit)fail('ROLE_DENIED','This LAB course is outside your authorized scope.');
  if(editing&&!context.capabilities?.canEdit)fail('ROLE_DENIED','LAB resource changes require an editable, authorized course.');
  const row=context.sourceSessions?.find(s=>s.id===sessionId);
  if(!row)fail('NOT_FOUND','Select an existing LAB Session.');
  const start=timeOf(context.scope.date,row.start);
  const end=timeOf(context.scope.date,row.end);
  if(end<=start)fail('INVALID_TIME','LAB end time must be later than start time.');
  return {scope:context.scope,sessionId,date:context.scope.date,start:row.start,end:row.end,
   startMs:start,endMs:end,
   sourceToken:JSON.stringify([context.scope.academicYear,sessionId,context.scope.date,row.start,row.end])};
 }
 const validCount=(x,max,label)=>{
  const n=Number(x);
  if(x===undefined||x===null||x===''||!Number.isInteger(n)||n<0||n>max)fail('INVALID_REQUEST',label+' must be a whole number from 0 to '+max+'.');
  return n;
 };
 const horseIds=()=>Array.from({length:policy().horsePoolSize},(_,i)=>'H'+String(i+1).padStart(2,'0'));
 const interval=r=>{const start=timeOf(r.date,r.start),end=timeOf(r.date,r.end);return {start,end};};
 const conflicts=(a,b,hours)=>a.start<b.end+hours*3600000&&b.start<a.end+hours*3600000;
 const active=r=>r&&['requested','confirmed'].includes(r.status);
 function available(src){
  const rest=policy().horseRestHours,now={start:src.startMs,end:src.endMs};
  const unavailable=new Set();
  for(const r of Object.values(state().requests)){
   if(r.sessionId===src.sessionId||r.status!=='confirmed'||!r.horseIds?.length)continue;
   if(conflicts(now,interval(r),rest))for(const horse of r.horseIds)unavailable.add(horse);
  }
  return horseIds().filter(id=>!unavailable.has(id));
 }
 function petDemand(src,quantity){
  const windowMs=policy().petWindowHours*3600000;
  const requests=Object.values(state().requests).filter(r=>r.sessionId!==src.sessionId&&active(r)&&r.petProfessorCount>0)
   .map(r=>({ms:timeOf(r.date,r.start),quantity:r.petProfessorCount}));
  if(quantity>0)requests.push({ms:src.startMs,quantity});
  requests.sort((a,b)=>a.ms-b.ms);
  let max=quantity;
  for(let i=0;i<requests.length;i++){
   const beginning=requests[i].ms;
   if(src.startMs<beginning||src.startMs>=beginning+windowMs)continue;
   let count=0;
   for(let j=i;j<requests.length&&requests[j].ms<beginning+windowMs;j++)count+=requests[j].quantity;
   max=Math.max(max,count);
  }
  return max;
 }
 function assessment(src,horseCount,petProfessorCount){
  const free=available(src),peak=petDemand(src,petProfessorCount),p=policy(),warnings=[];
  if(horseCount>free.length)warnings.push({code:'HORSE_CAPACITY',severity:'warning',message:'Only '+free.length+' of '+p.horsePoolSize+' synthetic horses are unallocated with the '+p.horseRestHours+'-hour rest buffer; requested '+horseCount+'. Animal staff must resolve before confirmation.'});
  if(peak>p.petProfessorThreshold)warnings.push({code:'PET_PROFESSOR_THRESHOLD',severity:'warning',message:'Pet Professor requests total '+peak+' within a rolling '+p.petWindowHours+'-hour window (warning threshold '+p.petProfessorThreshold+'). Coordinate availability before proceeding.'});
  return {availableHorseCount:free.length,availableHorseIds:free,petWindowDemand:peak,warnings};
 }
 function snapshot(uid,sessionId){
  const src=source(uid,sessionId);
  const record=state().requests[sessionId]||null;
  const changed=record?.sourceToken!==src.sourceToken;
  const countHorse=record&&active(record)?record.horseCount:0,countPet=record&&active(record)?record.petProfessorCount:0;
  return {
   scope:copy(src.scope),session:{sessionId,date:src.date,start:src.start,end:src.end},
   policy:copy(policy()),policyRevision:state().revision,
   request:record?copy(record):null,sourceChanged:!!changed,
   assessment:assessment(src,countHorse,countPet),
   capabilities:{canReview:ADMIN.has(value(user(uid).baseRole).toLowerCase()),canEdit:labService.read(uid,sessionId).capabilities?.canEdit===true},
   notice:'Synthetic resource request only. This does not notify animal staff or authorize animal use.'
  };
 }
 function preview(uid,p){
  const src=source(uid,p.sessionId,true),horse=validCount(p.horseCount,policy().horsePoolSize,'Horse quantity'),
   pet=validCount(p.petProfessorCount,1000,'Pet Professor quantity');
  return {...assessment(src,horse,pet),policy:copy(policy())};
 }
 function receipt(uid,kind,p){
  if(!value(p.requestId)||value(p.requestId).length>160)fail('REQUEST_ID','A unique request ID is required.');
  const key=JSON.stringify([uid,kind,p.requestId]),payload=JSON.stringify(p),old=state().receipts[key];
  if(old&&old.payload!==payload)fail('REQUEST_REUSE','This request ID was used with another payload.');
  return {key,payload,old};
 }
 function saveReceipt(proof,result){state().receipts[proof.key]={payload:proof.payload,result:copy(result)};store.commit();return result;}
 function audit(uid,action,src,previous,next){
  store.audit({domain:'lab-resource',academicYear:src.scope.academicYear,courseCode:src.scope.courseCode,
   sessionId:src.sessionId,changeType:action,actorFirebaseUid:uid,
   before:previous?{version:previous.version,status:previous.status}:null,
   after:{version:next.version,status:next.status,horseCount:next.horseCount,petProfessorCount:next.petProfessorCount}});
 }
 function submit(uid,p){
  const src=source(uid,p.sessionId,true),prev=state().requests[src.sessionId]||null;
  const proof=receipt(uid,'submit',p);if(proof.old)return copy(proof.old.result);
  if(Number(p.expectedVersion)!==(prev?.version||0))fail('STALE_REVISION','Resource request changed; reload before submitting.');
  const horse=validCount(p.horseCount,policy().horsePoolSize,'Horse quantity'),
    pet=validCount(p.petProfessorCount,1000,'Pet Professor quantity'),notes=value(p.notes);
  if(notes.length>2000)fail('INVALID_REQUEST','Reserve Notes must be at most 2000 characters.');
  if((horse||pet)&&!notes)fail('RESERVE_NOTES_REQUIRED','Explain animal needs in Reserve Notes.');
  const next={sessionId:src.sessionId,academicYear:src.scope.academicYear,courseCode:src.scope.courseCode,
   date:src.date,start:src.start,end:src.end,sourceToken:src.sourceToken,
   horseCount:horse,petProfessorCount:pet,notes,horseIds:[],reviewNote:'',
   version:(prev?.version||0)+1,status:horse||pet?'requested':'not_required',
   requestedBy:uid,requestedAt:store.nowIso()};
  state().requests[src.sessionId]=next;
  audit(uid,'resource_request_submitted',src,prev,next);
  return saveReceipt(proof,snapshot(uid,src.sessionId));
 }
 function review(uid,p){
  if(!ADMIN.has(value(user(uid).baseRole).toLowerCase()))fail('ROLE_DENIED','Only Owner/Developer can simulate resource confirmation.');
  const src=source(uid,p.sessionId,true),prev=state().requests[src.sessionId];
  if(!prev)fail('NOT_FOUND','LAB must submit a resource request first.');
  const proof=receipt(uid,'review',p);if(proof.old)return copy(proof.old.result);
  if(Number(p.expectedVersion)!==prev.version)fail('STALE_REVISION','The resource request has changed. Reload.');
  if(prev.sourceToken!==src.sourceToken)fail('SOURCE_CHANGED','ADC schedule changed. LAB must resubmit the reservation.');
  if(!['confirm','reject'].includes(p.decision))fail('INVALID_REQUEST','Choose confirm or reject.');
  if(prev.status==='not_required')fail('INVALID_REQUEST','No animal resources were requested.');
  const note=value(p.reviewNote);
  if(note.length>1000||p.decision==='reject'&&!note)fail('INVALID_REQUEST','A rejection reason is required (up to 1000 characters).');
  let ids=[];
  if(p.decision==='confirm'){
   ids=list(p.horseIds).map(value);
   if(ids.length!==prev.horseCount||new Set(ids).size!==ids.length)fail('HORSE_ASSIGNMENT','Specify one unique Demo Horse ID for each requested horse.');
   const avail=available(src);
   if(ids.some(id=>!avail.includes(id)))fail('HORSE_REST_CONFLICT','Selected horse is unavailable or needs at least '+policy().horseRestHours+' hours of rest after another confirmed LAB.');
  }
  const next={...prev,horseIds:ids,reviewNote:note,
   version:prev.version+1,status:p.decision==='confirm'?'confirmed':'rejected',
   reviewedBy:uid,reviewedAt:store.nowIso()};
  state().requests[src.sessionId]=next;
  audit(uid,'resource_request_'+next.status,src,prev,next);
  return saveReceipt(proof,snapshot(uid,src.sessionId));
 }
 function setPolicy(uid,p){
  if(!ADMIN.has(value(user(uid).baseRole).toLowerCase()))fail('ROLE_DENIED','Only Owner/Developer can edit synthetic resource rules.');
  const proof=receipt(uid,'policy',p);if(proof.old)return copy(proof.old.result);
  if(Number(p.expectedRevision)!==state().revision)fail('STALE_REVISION','Resource rules changed; reload.');
  const old=copy(policy()),next={
   horsePoolSize:validCount(p.horsePoolSize,200,'Horse pool size'),
   horseRestHours:validCount(p.horseRestHours,168,'Horse rest hours'),
   petProfessorThreshold:validCount(p.petProfessorThreshold,1000,'Pet Professor threshold'),
   petWindowHours:validCount(p.petWindowHours,168,'Pet Professor window')
  };
  if(next.horsePoolSize<1||next.horseRestHours<24||next.petProfessorThreshold<1||next.petWindowHours<1)fail('INVALID_POLICY','Horse rest must be at least 24 hours; pool and warning settings must be positive.');
  for(const r of Object.values(state().requests)){
   if(r.status==='confirmed'&&list(r.horseIds).some(id=>!Array.from({length:next.horsePoolSize},(_,i)=>'H'+String(i+1).padStart(2,'0')).includes(id)))fail('POLICY_CONFLICT','Reduce confirmed horse assignments before shrinking the pool.');
  }
  const confirmed=Object.values(state().requests).filter(r=>r.status==='confirmed');
  for(let i=0;i<confirmed.length;i++)for(let j=i+1;j<confirmed.length;j++){
   if(confirmed[i].horseIds.some(id=>confirmed[j].horseIds.includes(id))&&conflicts(interval(confirmed[i]),interval(confirmed[j]),next.horseRestHours))fail('POLICY_CONFLICT','The new rest interval conflicts with existing confirmed horse assignments.');
  }
  state().policy=next;state().revision++;
  store.audit({domain:'lab-resource',changeType:'resource_rules_updated',actorFirebaseUid:uid,before:old,after:copy(next)});
  return saveReceipt(proof,{policy:copy(next),policyRevision:state().revision});
 }
 return {read:snapshot,preview,submit,review,setPolicy};
}
module.exports={createLabResourceReservations,DEFAULT_POLICY};
