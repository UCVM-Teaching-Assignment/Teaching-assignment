'use strict';
// PAWS Frontend Demo only. Canonical Course Sessions are created only when ADC
// publishes; suggestions never create Teaching Assignments or DOE.
const {resolveTeachingDoe}=require('../../server/src/domain/doe-calculator');
const {uuidFor}=require('./ids.js');
const {createOfficeBulk}=require('./schedule-office-bulk');
const clone=x=>JSON.parse(JSON.stringify(x));
const arr=x=>Array.isArray(x)?x:[];
const value=x=>String(x==null?'':x).trim();
const normClock=x=>{const t=value(x);return /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(t)?t.slice(0,5):'';};
const mins=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));
const validDate=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const t=Date.parse(x+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x;};
const ADC=new Set(['adc','developer','owner']);
const ADFAD=new Set(['adfa_general','adfa_regular','administrator','admin','developer','owner']);
const TYPES=new Set(['LEC','SRL','LAB','Exam','OSCE','Quiz/Midterm']);
const DEFAULT_BULK_RULES={
 version:1, coreRequired:['courseNumber','year','date','time'],
 fields:{topic:{required:false,todoOwner:'adc',label:'Session title'},
         room:{required:false,todoOwner:'adc',label:'Room number'},
         facultySuggestion:{required:false,todoOwner:'adfa',label:'Faculty assignment'}},
 maxRows:500,defaultSessionType:'LEC'
};

function createScheduleWorkflow({store}={}){
 if(!store||typeof store.bag!=='function')throw Error('Synthetic Demo store required');
 const bag=()=>store.bag('adcScheduleWorkflow',()=>({version:1,next:0,drafts:{}}));
 const error=(code,message)=>{throw Object.assign(Error(message),{code})};
 const find=u=>arr(store.tables.users).find(x=>x.firebaseUid===u);
 function actor(uid){const a=find(uid);if(!a||a.active!==true||a.mustChangePassword!==false)error('ROLE_DENIED','Choose an active ready Demo role');return a}
 const role=a=>value(a.baseRole).toLowerCase();
 function requireADC(uid){const a=actor(uid);if(!ADC.has(role(a)))error('ROLE_DENIED','ADC or Developer is required to publish schedule');return a}
 function requireADFAD(uid){const a=actor(uid);if(!ADFAD.has(role(a)))error('ROLE_DENIED','ADFAD or Developer must confirm faculty');return a}
 const year=()=>store.tables.academicYear;
 function course(code){
  const key=value(code).toUpperCase(),all=arr(store.tables.courses);
  const exact=all.find(x=>value(x.courseCode).toUpperCase()===key);
  if(exact)return exact;
  if(/^\d{3,4}$/.test(key)){
   const matches=all.filter(x=>new RegExp('(?:^|\\s)'+key+'$').test(value(x.courseCode).toUpperCase()));
   if(matches.length===1)return matches[0];
   if(matches.length>1)error('AMBIGUOUS_COURSE','Ambiguous Course number '+key+'. Use the full Course code.');
  }
  return null;
 }
 const idKey=x=>value(x).toUpperCase();
 const rules=()=>clone(bag().bulkRules||DEFAULT_BULK_RULES);
 function requireDeveloper(uid){const a=actor(uid);if(!['developer','owner'].includes(role(a)))error('ROLE_DENIED','Developer Dashboard access required.');}
 function getRules(uid){requireDeveloper(uid);return rules();}
 function setRules(uid,p){
  requireDeveloper(uid);
  const before=rules();
  if(p?.expectedVersion!==before.version)error('STALE_REVISION','Import rules changed; reload the Developer Dashboard.');
  if(Object.prototype.hasOwnProperty.call(p||{},'requiredFields')||Object.prototype.hasOwnProperty.call(p||{},'coreRequired'))error('RULES_INVALID','The four core Calendar fields must remain required.');
  const next=clone(before);
  if(p.maxRows!==undefined){if(!Number.isInteger(p.maxRows)||p.maxRows<1||p.maxRows>500)error('RULES_INVALID','Max rows must be between 1 and 500.');next.maxRows=p.maxRows;}
  if(p.defaultSessionType!==undefined){if(!TYPES.has(p.defaultSessionType))error('RULES_INVALID','Choose a supported Session Type.');next.defaultSessionType=p.defaultSessionType;}
  if(p.fields!==undefined){
   if(!p.fields||Array.isArray(p.fields)||typeof p.fields!=='object')error('RULES_INVALID','Invalid field policy.');
   for(const [key,change] of Object.entries(p.fields)){
    if(!['topic','room','facultySuggestion'].includes(key)||!change||typeof change!=='object'||Array.isArray(change))error('RULES_INVALID','Unsupported import rule field.');
    for(const prop of Object.keys(change))if(!['required','todoOwner','label'].includes(prop))error('RULES_INVALID','Unsupported import rule setting.');
    if(Object.prototype.hasOwnProperty.call(change,'required')&&typeof change.required!=='boolean')error('RULES_INVALID','Required setting must be a checkbox.');
    if(Object.prototype.hasOwnProperty.call(change,'todoOwner')&&!['adc','adfa'].includes(change.todoOwner))error('RULES_INVALID','Missing detail owner must be ADC or ADFAD.');
    if(Object.prototype.hasOwnProperty.call(change,'label')&&(typeof change.label!=='string'||!value(change.label)||value(change.label).length>60))error('RULES_INVALID','A rule label must be 1-60 characters.');
    if(key==='facultySuggestion'&&(change.todoOwner&&change.todoOwner!=='adfa'||change.required===true))error('RULES_INVALID','Faculty assignment is always owned by ADFAD and never an ADC publication blocker.');
    Object.assign(next.fields[key],change);
   }
  }
  next.fields.facultySuggestion.required=false;next.fields.facultySuggestion.todoOwner='adfa';
  next.version=before.version+1;
  bag().bulkRules=next;
  store.audit({domain:'scheduling',changeType:'bulk_import_rules_updated',actorFirebaseUid:uid,before,after:clone(next)});
  store.commit();return clone(next);
 }
 const extraRequired=d=>{
  const r=rules();
  if(r.fields.topic.required&&!d.topic)error('INVALID_SCHEDULE','Session title is required by the current Developer rules.');
  if(r.fields.room.required&&!d.room)error('INVALID_SCHEDULE','Room number is required by the current Developer rules.');
 };

 function canonical(raw){
  const d=raw||{};
  return {academicYear:value(d.academicYear||year()),courseCode:idKey(course(d.courseCode)?.courseCode||d.courseCode),date:value(d.date),
   startTime:normClock(d.startTime),endTime:normClock(d.endTime),sessionType:value(d.sessionType||'LEC'),
   topic:value(d.topic).slice(0,400),room:value(d.room).slice(0,160),
   suggestedFacultyIds:[...new Set(arr(d.suggestedFacultyIds).map(value).filter(Boolean))]};
 }
 function validate(d){
  const c=course(d.courseCode);
  if(!c||!value(c.curriculumYear))error('INVALID_COURSE','Select an existing Course with a curriculum year.');
  if(d.academicYear!==year())error('INVALID_SCHEDULE','The shared Calendar currently supports only the active Demo academic year.');
  const start=Number(d.academicYear.slice(0,4));if(!/^\d{4}-\d{2}$/.test(d.academicYear)||!Number.isInteger(start)||d.date<start+'-05-01'||d.date>=(start+1)+'-05-01'||!validDate(d.date))
   error('INVALID_SCHEDULE','Choose a valid Session date within its academic year.');
  if(!d.startTime||!d.endTime||mins(d.startTime)>=mins(d.endTime))error('INVALID_SCHEDULE','Start and end time are required; end must be after start.');
  if(!TYPES.has(d.sessionType))error('INVALID_SCHEDULE','Select an approved Session type.');
  for(const id of d.suggestedFacultyIds)if(!arr(store.tables.faculty).some(f=>f.facultyId===id))error('INVALID_SCHEDULE','A suggested Faculty ID does not exist.');
  return c;
 }
 function saveDraft(uid,p){
  requireADC(uid);const b=bag(),existing=p&&p.draftId?b.drafts[p.draftId]:null;
  if(p&&p.draftId&&!existing)error('NOT_FOUND','ADC draft not found.');
  if(existing&&(existing.revision!==p.expectedRevision||existing.publishedSessionId))error('STALE_REVISION','Reload the current ADC draft.');
  const d=canonical(p);
  if(d.suggestedFacultyIds.length>30)error('INVALID_SCHEDULE','Too many suggestions.');
  if(existing){existing.values=d;existing.revision++;existing.updatedBy=uid;store.commit();return clone(existing);}
  const n=++b.next,id=uuidFor('adc-schedule:'+n+':'+store.nowIso());
  const row={id,revision:1,values:d,createdBy:uid,updatedBy:uid,publishedSessionId:null};
  b.drafts[id]=row;store.audit({domain:'scheduling',changeType:'adc_draft_saved',actorFirebaseUid:uid,draftId:id});store.commit();return clone(row);
 }
 function makePublishedSession(d,c,id,uid){
  return {id,academicYear:d.academicYear,curriculumYear:String(c.curriculumYear),courseCode:c.courseCode,courseName:c.courseName,
   date:d.date,startTime:d.startTime+':00',endTime:d.endTime+':00',sessionType:d.sessionType,
   topic:d.topic,room:d.room||null,assignments:[],suggestedFacultyIds:clone(d.suggestedFacultyIds),
   scheduleStatus:'published',scheduleVersion:1,schedulePublishedAt:store.nowIso(),
   schedulePublishedBy:uid,facultyStatus:'pending',facultyRevision:0,updatedAtUtc:store.nowIso()};
 }
 function allowBuiltInLabTesters(session){
  if(session.sessionType!=='LAB')return;
  for(const user of store.tables.users){
   if(!['uid-lab-1','uid-lab-2'].includes(user.firebaseUid)||value(user.baseRole).toLowerCase()!=='lab'||user.active!==true)continue;
   const scopes=arr(user.labScopes),scope={academicYear:session.academicYear,curriculumYear:String(session.curriculumYear),courseCode:session.courseCode};
   if(!scopes.some(x=>['academicYear','curriculumYear','courseCode'].every(k=>String(x[k])===String(scope[k]))))scopes.push(scope);
   user.labScopes=scopes;
  }
 }
 function publish(uid,p){
  requireADC(uid);const b=bag(),draft=b.drafts[p?.draftId];
  if(!draft)error('NOT_FOUND','ADC draft not found.');
  if(draft.revision!==p.expectedRevision)error('STALE_REVISION','Reload the current ADC draft before publishing.');
  if(draft.publishedSessionId)error('DUPLICATE_SESSION','This ADC draft has already been published.');
  const d=draft.values,c=validate(d);extraRequired(d);
  // Two independently approved LAB stations may share the same Course, date
  // and interval, especially when Topic and room are still blank. Only the
  // originating draft ID is idempotent: the same draft cannot publish twice.
  const id=uuidFor('adc-published:'+draft.id);
  const session=makePublishedSession(d,c,id,uid);
  store.tables.sessions.push(session);
  allowBuiltInLabTesters(session);
  draft.publishedSessionId=id;
  store.audit({domain:'scheduling',changeType:'adc_schedule_published',actorFirebaseUid:uid,academicYear:session.academicYear,sessionId:id,
    after:{courseCode:session.courseCode,date:session.date,startTime:session.startTime,endTime:session.endTime,sessionType:session.sessionType}});
  store.commit();
  return {session:clone(session),status:'published'};
 }
 function suggest(uid,p){
  requireADC(uid);const s=store.tables.sessions.find(x=>x.id===p?.sessionId);
  if(!s)error('NOT_FOUND','The published Session is missing.');
  if(s.facultyRevision>0)error('FACULTY_REVIEW_REQUIRED','ADFAD has confirmed faculty; send a new suggestion through its approval process.');
  if(Number(p.expectedVersion||0)!==Number(s.scheduleVersion||0))error('STALE_REVISION','Session changed; reload.');
  const d=canonical({...s,suggestedFacultyIds:p.suggestedFacultyIds});validate(d);
  s.suggestedFacultyIds=d.suggestedFacultyIds;s.scheduleVersion=Number(s.scheduleVersion||0)+1;s.updatedAtUtc=store.nowIso();
  store.audit({domain:'scheduling',changeType:'adc_faculty_suggested',actorFirebaseUid:uid,sessionId:s.id,after:{count:s.suggestedFacultyIds.length}});
  store.commit();return {sessionId:s.id,suggestedFacultyIds:clone(s.suggestedFacultyIds),scheduleVersion:s.scheduleVersion};
 }
 function confirmFaculty(uid,p){
  requireADFAD(uid);
  const s=store.tables.sessions.find(x=>x.id===p?.sessionId);
  if(!s)error('NOT_FOUND','An existing published Course Session is required.');
  // New ADC-published LAB Sessions must complete operational booking before
  // ADFAD confirms instructors. Legacy Sessions retain their prior approval flow.
  if(s.sessionType==='LAB'&&s.scheduleStatus==='published'){
   const key=JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
   const release=store.tables.extra?.labScheduling?.blocks?.[key]?.publications?.at(-1);
   if(!release)error('LAB_NOT_PUBLISHED','LAB must publish the room, runs and assigned students before ADFAD confirms Faculty.');
  }
  if(p.expectedRevision!==Number(s.facultyRevision||0))error('STALE_REVISION','Faculty assignments changed. Reload to confirm.');
  const items=arr(p.assignments);
  if(!items.length||items.length>30)error('INVALID_ASSIGNMENT','Assign at least one Faculty member.');
  const assigned=new Set(),out=[],warnings=[];
  const note=value(p.reviewNote);
  for(let index=0;index<items.length;index++){
   const item=items[index]||{},fid=value(item.facultyId),role=value(item.teachingRole)||({LAB:'Lab Primary',SRL:'SRL',LEC:'Lecture'}[s.sessionType]||'Instructor');
   if(!fid||assigned.has(fid))error('INVALID_ASSIGNMENT','Choose distinct Faculty members.');
   assigned.add(fid);
   if(s.sessionType==='LAB'&&!['Lab Primary','Lab Secondary'].includes(role))error('INVALID_ASSIGNMENT','LAB teaching roles must be Lab Primary or Lab Secondary.');
   const f=arr(store.tables.faculty).find(x=>x.facultyId===fid);
   if(!f||f.active!==true||f.appointmentValid===false||(f.activationDate&&s.date<f.activationDate)||(f.appointmentEndDate&&s.date>f.appointmentEndDate))
    error('FACULTY_UNAVAILABLE','The selected Faculty member is not eligible on this date.');
   if(arr(store.tables.afcRecords).some(x=>x.facultyId===fid&&x.active!==false&&x.startDate<=s.date&&x.endDate>=s.date))
    error('FACULTY_UNAVAILABLE','The Faculty member has an Away from Campus conflict.');
   for(const other of store.tables.sessions){
    if(other.id===s.id||other.academicYear!==s.academicYear||other.date!==s.date||!arr(other.assignments).some(x=>x.facultyId===fid))continue;
    const a=normClock(other.startTime),b=normClock(other.endTime),c=normClock(s.startTime),d=normClock(s.endTime);
    if(a&&b&&c&&d&&mins(c)<mins(b)&&mins(a)<mins(d))error('FACULTY_UNAVAILABLE','The Faculty member has an overlapping Session.');
    if(!a||!b)warnings.push('Another Faculty Session has unconfirmed time.');
   }
   for(const activity of arr(store.tables.activities).filter(x=>(x.facultyKey||x.facultyId)===fid&&x.active!==false&&x.category!=='teaching_excellence'&&(x.startDate||x.date)<=s.date&&(x.endDate||x.date)>=s.date)){
    const evidence=arr(activity.timeEvidence).filter(e=>e.date===s.date);
    if(!evidence.length){warnings.push('A working activity has unconfirmed time.');continue;}
    for(const e of evidence){const a=normClock(e.startTime),b=normClock(e.endTime),c=normClock(s.startTime),d=normClock(s.endTime);
     if(!a||!b)warnings.push('Working activity time evidence needs review.');
     else if(mins(c)<mins(b)&&mins(a)<mins(d))error('FACULTY_UNAVAILABLE','The Faculty member has another overlapping working activity.');
    }
   }
   if(arr(store.tables.extra?.afcRequests).some(x=>x.facultyId===fid&&['pending_report_to','pending_admin'].includes(x.status)&&x.startDate<=s.date&&x.endDate>=s.date))
    warnings.push('An availability request is pending.');
   const hasHours=item.creditedHours!==null&&item.creditedHours!==undefined&&value(item.creditedHours)!=='';
   const hours=hasHours?Number(item.creditedHours):null;
   if(hasHours&&(!Number.isFinite(hours)||hours<0||hours>48))error('INVALID_ASSIGNMENT','Credited hours must be a nonnegative number or blank.');
   const rule=resolveTeachingDoe({sessionType:s.sessionType,teachingRole:role,creditedHours:hours});
   out.push({sessionAssignmentId:uuidFor('schedule-faculty:'+s.id+':'+fid+':'+index+':'+(s.facultyRevision||0)),
    facultyId:fid,teachingRole:role,labLead:role==='Lab Primary'?'Yes':'',
    creditedHours:hours,doeRate:rule.rate??null,doeQuantity:hours,doeUnit:hours===null?null:'credited hour',
    doeCredit:hours===null?null:rule.calculatedDoe??null,
    doeStatus:hours===null?'needs_review':rule.calculatedDoe===null?'needs_review':'calculated',
    sourceFacultyName:f.displayName});
  }
  if(warnings.length&&note.length<10)error('FACULTY_REVIEW_REQUIRED','Confirm unknown availability with a review note before assigning Faculty.');
  const before=clone(s.assignments);
  s.assignments=out;s.facultyStatus='confirmed';s.facultyRevision=Number(s.facultyRevision||0)+1;s.updatedAtUtc=store.nowIso();
  store.audit({domain:'teaching',changeType:'adfad_faculty_confirmed',actorFirebaseUid:uid,sessionId:s.id,academicYear:s.academicYear,
    before:before.map(x=>({facultyId:x.facultyId,role:x.teachingRole,creditedHours:x.creditedHours})),
    after:{assigned:out.map(x=>({facultyId:x.facultyId,role:x.teachingRole,creditedHours:x.creditedHours})),availabilityReviewed:warnings.length>0,reviewNote:note}});
  store.commit();
  return {sessionId:s.id,facultyRevision:s.facultyRevision,facultyStatus:'confirmed',assignments:clone(out),availabilityWarnings:[...new Set(warnings)]};
 }

 function splitRange(raw){
  const normalized=value(raw).replace(/[\u2013\u2014]/g,'-').replace(/\s+to\s+/gi,'-');
  const found=normalized.match(/^\s*(\d{1,2}:[0-5]\d(?::00)?\s*(?:AM|PM)?)\s*-\s*(\d{1,2}:[0-5]\d(?::00)?\s*(?:AM|PM)?)\s*$/i);
  return found?[found[1],found[2]]:['',''];
 }
 const clock=v=>{
  const match=value(v).match(/^(\d{1,2}):([0-5]\d)(?::00)?\s*(AM|PM)?$/i);
  if(!match)return'';
  const hour=Number(match[1]),period=value(match[3]).toUpperCase();
  if(period&&(!hour||hour>12))return'';
  let h=hour;
  if(period==='AM')h=hour===12?0:hour;
  if(period==='PM')h=hour===12?12:hour+12;
  if(h<0||h>23)return'';
  return String(h).padStart(2,'0')+':'+match[2];
 };
 const dateValue=x=>{
  const s=value(x),match=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match?match[3]+'-'+match[1].padStart(2,'0')+'-'+match[2].padStart(2,'0'):s;
 };
 function normalizeImported(row){
  const time=splitRange(row.time||row.Time||'');
  const sourceYear=value(row.year||row.curriculumYear||row.Year);
  const ids=arr(row.suggestedFacultyIds);
  const d=canonical({courseCode:row.courseNumber||row.courseCode,date:dateValue(row.date),
   academicYear:row.academicYear||year(),sessionType:row.sessionType||rules().defaultSessionType,
   startTime:clock(row.startTime||time[0]),endTime:clock(row.endTime||time[1]),
   topic:row.title??row.topic??row.courseTitle??'',room:row.room??row.roomNumber??'',
   suggestedFacultyIds:ids});
  return {d,sourceYear};
 }
 function previewBulk(uid,p){
  requireADC(uid);
  if(!p||!Array.isArray(p.rows)||p.rows.length<1||p.rows.length>rules().maxRows)error('IMPORT_VALIDATION','Import needs 1-'+rules().maxRows+' rows.');
  const r=rules(),items=[],errors=[];
  for(let i=0;i<p.rows.length;i++){
   const row=p.rows[i],rowNumber=i+1,problems=[];
   if(!row||Array.isArray(row)||typeof row!=='object')problems.push('Expected a row of course fields.');
   let d=null,c=null;
   if(!problems.length){
    try{
     const normalized=normalizeImported(row);d=normalized.d;
     if(!/^[1-4]$/.test(normalized.sourceYear))problems.push('Curriculum Year (1-4) is required.');
     else {c=validate(d);if(String(c.curriculumYear)!==normalized.sourceYear)problems.push('Curriculum Year does not match the Course Catalog.');}
     if(!problems.length)extraRequired(d);
    }catch(e){problems.push(e.message);}
   }
   const item={rowNumber,normalized:d?{...d,curriculumYear:c?String(c.curriculumYear):''}:null,errors:problems};
   items.push(item);
   if(problems.length)errors.push({rowNumber,messages:problems});
  }
  const accepted=items.filter(x=>!x.errors.length);
  const adcTodoCount=accepted.filter(item=>(!item.normalized.topic&&r.fields.topic.todoOwner==='adc')||(!item.normalized.room&&r.fields.room.todoOwner==='adc')).length;
  return {valid:errors.length===0,readyCount:accepted.length,invalidCount:errors.length,items,errors,rulesVersion:r.version,
   adcTodoCount,adfadTodoCount:accepted.length};
 }
 function publishBulk(uid,p){
  requireADC(uid);const batchId=value(p?.batchId);
  if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(batchId))error('IMPORT_VALIDATION','Provide a unique batch ID (letters, digits, colon, dot, hyphen or underscore).');
  const b=bag(),signature=JSON.stringify(p.rows);
  const previous=(b.bulkImports||{})[batchId];
  if(previous){
   if(previous.signature!==signature)error('IMPORT_CONFLICT','This batch ID has already been used for different rows.');
   return clone(previous.response);
  }
  if(p.expectedRulesVersion!==rules().version)error('STALE_REVISION','Developer rules changed after preview; preview this file again.');
  const preview=previewBulk(uid,p);
  if(!preview.valid)error('IMPORT_VALIDATION',preview.invalidCount+' invalid row(s). Review the preview before publishing.');
  const prepared=preview.items.map((item,i)=>{
   const d=item.normalized,c=course(d.courseCode),id=uuidFor('adc-bulk:'+batchId+':'+(i+1));
   return makePublishedSession(d,c,id,uid);
  });
  // In-memory staging is complete. Commit all rows in one transaction to
  // browser-local Demo storage; never overwrite old Sessions or create DOE.
  store.tables.sessions.push(...prepared);
  for(const session of prepared)allowBuiltInLabTesters(session);
  const response={batchId,createdCount:prepared.length,sessionIds:prepared.map(x=>x.id),adcTodoCount:preview.adcTodoCount,adfadTodoCount:preview.adfadTodoCount};
  if(!b.bulkImports)b.bulkImports={};
  b.bulkImports[batchId]={signature,response:clone(response),rulesVersion:preview.rulesVersion,actor:uid,at:store.nowIso()};
  store.audit({domain:'scheduling',changeType:'adc_bulk_import_published',actorFirebaseUid:uid,batchId,academicYear:year(),createdCount:prepared.length,sessionIds:response.sessionIds});
  store.commit();
  return clone(response);
 }
 function labBookedRoom(s){
  if(s.sessionType!=='LAB')return false;
  const key=JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
  const releases=arr(store.tables.extra?.labScheduling?.blocks?.[key]?.publications),published=releases[releases.length-1]?.public;
  return Boolean(arr(published?.stations).find(st=>st.sessionId===s.id&&arr(st.runs).some(run=>value(run.room||run.roomId))));
 }
 function workItemsFor(uid){
  const u=actor(uid),r=role(u),isLAB=r==='lab'||arr(u.officeAccess).includes('lab');
  const visible=r==='developer'||r==='owner'?['adc','lab','adfa']:r==='adc'?['adc']:isLAB?['lab']:ADFAD.has(r)?['adfa']:[];
  const policy=rules(),items=[];
  const scoped=s=>arr(u.labScopes).some(scope=>scope.academicYear===s.academicYear&&String(scope.curriculumYear)===String(s.curriculumYear)&&scope.courseCode===s.courseCode);
  for(const s of arr(store.tables.sessions)){
   if(s.academicYear!==year()||s.scheduleStatus!=='published')continue;
   const groups={},key=JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
   const release=store.tables.extra?.labScheduling?.blocks?.[key]?.publications?.at(-1)?.public;
   const labPublished=arr(release?.stations).some(st=>st.sessionId===s.id);
   const add=(stage,label)=>{
    if(!visible.includes(stage)||stage==='lab'&&!['developer','owner'].includes(r)&&!scoped(s))return;
    if(!groups[stage])groups[stage]={sessionId:s.id,stage,courseCode:s.courseCode,date:s.date,sessionType:s.sessionType,
     status:'ready',missing:[],scheduleVersion:Number(s.scheduleVersion||1)};
    groups[stage].missing.push(label);
   };
   if(s.sessionType==='LAB'&&!labPublished)add('lab','Book room, assign student groups and roster');
   if(!value(s.topic))add(policy.fields.topic.todoOwner,policy.fields.topic.label);
   if(!value(s.room)&&!labBookedRoom(s))add(policy.fields.room.todoOwner,policy.fields.room.label);
   if(!arr(s.assignments).length){
    const custom=policy.fields.facultySuggestion.label,hasSuggestion=arr(s.suggestedFacultyIds).length>0;
    add('adfa',custom==='Faculty assignment'
     ?(hasSuggestion?'Confirm suggested faculty':'Assign faculty (no suggestion)')
     :custom+(hasSuggestion?' — Confirm suggestion':' — Assign faculty (no suggestion)'));
   }
   if(groups.adfa&&s.sessionType==='LAB'&&!labPublished)groups.adfa.status='waiting_for_lab';
   items.push(...Object.values(groups));
  }
  return items.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.courseCode).localeCompare(String(b.courseCode))||a.stage.localeCompare(b.stage));
 }
 function completeDetails(uid,p){
  const a=actor(uid),s=arr(store.tables.sessions).find(x=>x.id===p?.sessionId&&x.scheduleStatus==='published'&&x.academicYear===year());
  if(!s)error('NOT_FOUND','Published Course Session not found.');
  if(p.expectedVersion!==Number(s.scheduleVersion||1))error('STALE_REVISION','Course details changed; reload Work Queue.');
  const settings=rules(),changed={};
  for(const [from,to] of [['title','topic'],['room','room']]){
   if(!Object.prototype.hasOwnProperty.call(p,from))continue;
   const owner=settings.fields[to].todoOwner;
   if(!['developer','owner'].includes(role(a))&&!(owner==='adc'&&role(a)==='adc')&&!(owner==='adfa'&&ADFAD.has(role(a))))
    error('ROLE_DENIED','Only the responsible office may complete '+from+'.');
   const next=value(p[from]).slice(0,to==='topic'?400:160);
   if(!next)error('INVALID_SCHEDULE','Cannot complete '+from+' with an empty value.');
   if(next!==value(s[to]))changed[to]=next;
  }
  if(!Object.keys(changed).length)error('INVALID_SCHEDULE','Enter a title or room to complete.');
  if(s.sessionType==='LAB'&&Object.prototype.hasOwnProperty.call(changed,'room')){
   const key=JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
   if(arr(store.tables.extra?.labScheduling?.blocks?.[key]?.publications).length)error('LAB_CHANGE_REQUIRED','Published LAB room allocations belong to the LAB booking workflow.');
  }
  const before={topic:s.topic,room:s.room};
  Object.assign(s,changed);s.scheduleVersion=Number(s.scheduleVersion||1)+1;s.updatedAtUtc=store.nowIso();
  store.audit({domain:'scheduling',changeType:'adc_schedule_details_completed',actorFirebaseUid:uid,sessionId:s.id,before,after:{topic:s.topic,room:s.room}});
  store.commit();return {sessionId:s.id,scheduleVersion:s.scheduleVersion,topic:s.topic,room:s.room};
 }
 function listing(uid){
  const a=actor(uid),r=role(a),canADC=ADC.has(r),canADFAD=ADFAD.has(r),canLAB=r==='lab'||arr(a.officeAccess).includes('lab');
  if(!canADC&&!canADFAD&&!canLAB)error('ROLE_DENIED','Only ADC, LAB, ADFAD and Developer office queues can be accessed.');
  const courses=arr(store.tables.courses).map(c=>({courseCode:c.courseCode,courseName:c.courseName,curriculumYear:String(c.curriculumYear||'')}));
  const faculty=arr(store.tables.faculty).filter(f=>f.active===true).map(f=>({facultyId:f.facultyId,name:f.displayName||f.facultyId,
   activationDate:f.activationDate||null}));
  const lab=store.tables.extra?.labScheduling?.blocks||{};
  const labOnly=canLAB&&!canADC&&!canADFAD;
  const authorized=s=>arr(a.labScopes).some(scope=>scope.academicYear===s.academicYear&&String(scope.curriculumYear)===String(s.curriculumYear)&&scope.courseCode===s.courseCode);
  const sessions=arr(store.tables.sessions).filter(s=>s.academicYear===year()&&(!labOnly||s.sessionType==='LAB'&&authorized(s))).map(s=>{
   const k=JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
   const release=lab[k]?.publications?.at(-1)?.public;
   const ready=arr(release?.stations).some(st=>st.sessionId===s.id);
   return {id:s.id,academicYear:s.academicYear,courseCode:s.courseCode,curriculumYear:String(s.curriculumYear),
    date:s.date,startTime:s.startTime,endTime:s.endTime,sessionType:s.sessionType,topic:s.topic||'',room:s.room||'',
    scheduleStatus:s.scheduleStatus||'published',scheduleVersion:Number(s.scheduleVersion||1),
    suggestedFacultyIds:labOnly?[]:clone(s.suggestedFacultyIds||[]),facultyStatus:s.facultyStatus||(arr(s.assignments).length?'confirmed':'pending'),
    facultyRevision:Number(s.facultyRevision||0),assignments:labOnly?[]:arr(s.assignments).map(x=>({facultyId:x.facultyId,teachingRole:x.teachingRole,creditedHours:x.creditedHours})),
    labStatus:s.sessionType==='LAB'?(ready?'published':'pending'):'not-applicable'};
  }).sort((a,b)=>String(a.date??'').localeCompare(String(b.date??''))||String(a.startTime??'').localeCompare(String(b.startTime??''))||String(a.courseCode??'').localeCompare(String(b.courseCode??'')));
  return {capabilities:{canADC,canADFAD,canLAB,canDeveloper:r==='developer',canEditRules:['developer','owner'].includes(r)},academicYear:year(),courses,faculty:labOnly?[]:faculty,
   rules:rules(),workItems:workItemsFor(uid),drafts:canADC?Object.values(bag().drafts).filter(x=>!x.publishedSessionId).map(clone):[],sessions};
 }
 const office=createOfficeBulk({store});
 return Object.freeze({list:listing,saveDraft,publish,suggest,confirmFaculty,previewBulk,publishBulk,getRules,setRules,completeDetails,
  officeExport:office.officeExport,previewOfficeBulk:office.previewOfficeBulk,publishOfficeBulk:office.publishOfficeBulk});

}
module.exports={createScheduleWorkflow};
