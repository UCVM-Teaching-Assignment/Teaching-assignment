'use strict';
// PAWS Frontend Demo only. Canonical Course Sessions are created only when ADC
// publishes; suggestions never create Teaching Assignments or DOE.
const {resolveTeachingDoe}=require('../../server/src/domain/doe-calculator');
const {uuidFor}=require('./ids.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const arr=x=>Array.isArray(x)?x:[];
const value=x=>String(x==null?'':x).trim();
const normClock=x=>{const t=value(x);return /^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(t)?t.slice(0,5):'';};
const mins=x=>Number(x.slice(0,2))*60+Number(x.slice(3,5));
const validDate=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const t=Date.parse(x+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===x;};
const ADC=new Set(['adc','developer','owner']);
const ADFAD=new Set(['adfa_general','adfa_regular','administrator','admin','developer','owner']);
const TYPES=new Set(['LEC','SRL','LAB','Exam','OSCE','Quiz/Midterm']);
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
 const course=code=>arr(store.tables.courses).find(x=>value(x.courseCode).toUpperCase()===value(code).toUpperCase());
 const idKey=x=>value(x).toUpperCase();
 function canonical(raw){
  const d=raw||{};
  return {academicYear:value(d.academicYear||year()),courseCode:idKey(d.courseCode),date:value(d.date),
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
 function publish(uid,p){
  requireADC(uid);const b=bag(),draft=b.drafts[p?.draftId];
  if(!draft)error('NOT_FOUND','ADC draft not found.');
  if(draft.revision!==p.expectedRevision)error('STALE_REVISION','Reload the current ADC draft before publishing.');
  if(draft.publishedSessionId)error('DUPLICATE_SESSION','This ADC draft has already been published.');
  const d=draft.values,c=validate(d);
  if(store.tables.sessions.some(x=>x.academicYear===d.academicYear&&idKey(x.courseCode)===d.courseCode&&x.date===d.date&&normClock(x.startTime)===d.startTime&&normClock(x.endTime)===d.endTime&&x.sessionType===d.sessionType&&value(x.topic)===d.topic))
   error('DUPLICATE_SESSION','A matching Session is already on Calendar; choose a different topic or time.');
  const id=uuidFor('adc-published:'+draft.id);
  const session={id,academicYear:d.academicYear,curriculumYear:String(c.curriculumYear),courseCode:c.courseCode,courseName:c.courseName,
    date:d.date,startTime:d.startTime+':00',endTime:d.endTime+':00',sessionType:d.sessionType,
    topic:d.topic,room:d.room||null,assignments:[],suggestedFacultyIds:clone(d.suggestedFacultyIds),
    scheduleStatus:'published',scheduleVersion:1,schedulePublishedAt:store.nowIso(),
    schedulePublishedBy:uid,facultyStatus:'pending',facultyRevision:0,updatedAtUtc:store.nowIso()};
  store.tables.sessions.push(session);
  // These two built-in LAB tester accounts must receive Stage 2 course
  // access immediately, even when ADC publishes a previously unseen Course.
  // Other LAB accounts and future years remain explicitly Owner-scoped.
  if(session.sessionType==='LAB')for(const user of store.tables.users){
   if(!['uid-lab-1','uid-lab-2'].includes(user.firebaseUid)||value(user.baseRole).toLowerCase()!=='lab'||user.active!==true)continue;
   const scopes=arr(user.labScopes),scope={academicYear:session.academicYear,curriculumYear:String(session.curriculumYear),courseCode:session.courseCode};
   if(!scopes.some(x=>['academicYear','curriculumYear','courseCode'].every(k=>String(x[k])===String(scope[k]))))scopes.push(scope);
   user.labScopes=scopes;
  }
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
 function listing(uid){
  const a=actor(uid),r=role(a),canADC=ADC.has(r),canADFAD=ADFAD.has(r);
  if(!canADC&&!canADFAD)error('ROLE_DENIED','Only ADC, ADFAD and Developer can access the scheduling workflow.');
  const courses=arr(store.tables.courses).map(c=>({courseCode:c.courseCode,courseName:c.courseName,curriculumYear:String(c.curriculumYear||'')}));
  const faculty=arr(store.tables.faculty).filter(f=>f.active===true).map(f=>({facultyId:f.facultyId,name:f.displayName||f.facultyId,
   activationDate:f.activationDate||null}));
  const lab=store.tables.extra?.labScheduling?.blocks||{};
  const sessions=arr(store.tables.sessions).filter(s=>s.academicYear===year()).map(s=>{
   const k=JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
   const labRelease=lab[k]?.publications?.at(-1);
   return {id:s.id,academicYear:s.academicYear,courseCode:s.courseCode,curriculumYear:String(s.curriculumYear),
    date:s.date,startTime:s.startTime,endTime:s.endTime,sessionType:s.sessionType,topic:s.topic||'',room:s.room||'',
    scheduleStatus:s.scheduleStatus||'published',scheduleVersion:Number(s.scheduleVersion||1),
    suggestedFacultyIds:clone(s.suggestedFacultyIds||[]),facultyStatus:s.facultyStatus||(arr(s.assignments).length?'confirmed':'pending'),
    facultyRevision:Number(s.facultyRevision||0),assignments:arr(s.assignments).map(x=>({facultyId:x.facultyId,teachingRole:x.teachingRole,creditedHours:x.creditedHours})),
    labStatus:s.sessionType==='LAB'?(labRelease?'published':'pending'):'not-applicable'};
  }).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.courseCode.localeCompare(b.courseCode));
  return {capabilities:{canADC,canADFAD,canDeveloper:r==='developer'},academicYear:year(),courses,faculty,
    drafts:canADC?Object.values(bag().drafts).filter(x=>!x.publishedSessionId).map(clone):[],sessions};
 }
 return Object.freeze({list:listing,saveDraft,publish,suggest,confirmFaculty});
}
module.exports={createScheduleWorkflow};
