'use strict';
// Testing Demo only. These simulated permissions are not a trusted backend.
// Operational data link to canonical Sessions; never write Faculty/DOE here.
const clone=value=>JSON.parse(JSON.stringify(value));
const text=value=>String(value==null?'':value).trim();
const list=value=>Array.isArray(value)?value:[];
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
const clock=value=>text(value).slice(0,5);
const minutes=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(text(value))?Number(value.slice(0,2))*60+Number(value.slice(3,5)):NaN;
const overlaps=(a,b)=>a.date===b.date&&a.start<b.end&&b.start<a.end;
const distinct=values=>[...new Set(values)];
const ADMIN=new Set(['owner','developer','administrator','admin','adfa_general','adfa_regular']);
const sourceFields=s=>({id:s.id,academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date,topic:s.topic,startTime:s.startTime,endTime:s.endTime,room:s.room,updatedAtUtc:s.updatedAtUtc,assignments:s.assignments,labApprovedRuns:s.labApprovedRuns});
function intervals(rows){
 const sorted=rows.map(r=>[minutes(r.start),minutes(r.end)]).filter(r=>Number.isFinite(r[0])&&Number.isFinite(r[1])&&r[1]>r[0]).sort((a,b)=>a[0]-b[0]);
 const out=[];for(const r of sorted){const last=out.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else out.push(r.slice())}return out;
}
function createLabService({store,annualState=()=>null}={}){
 if(!store||typeof store.bag!=='function')throw Error('A Demo store is required.');
 const state=()=>store.bag('labScheduling',()=>({version:1,blocks:{},receipts:{}}));
 const annual=()=>annualState()||{};
 const stamp=()=>store.nowIso();
 function sources(){
  const result=list(store.tables.sessions).filter(s=>s.cancelled!==true).map(s=>({...s,curriculumYear:String(s.curriculumYear)}));
  // Future-year sessions come from the existing Academic Years workspace, not a
  // second course/session catalogue. Its publication still controls visibility.
  const years=annual();
  for(const [year,courses] of Object.entries(years.annual||{})){
   if(year===store.tables.academicYear)continue;
   for(const [code,course] of Object.entries(courses)){
    const catalog=list(years.catalog).find(c=>c.code===code);
    for(const row of list(course.working))if(!result.some(s=>s.id===row.id&&s.academicYear===year))result.push({...row,academicYear:year,courseCode:code,courseName:course.title,curriculumYear:String(row.curriculumYear||catalog?.curriculumYear||''),annualRevision:course.revision});
   }
  }
  return result;
 }
 function context(sessionId){
  const all=sources(),selected=all.find(s=>s.id===sessionId);
  if(!selected||selected.sessionType!=='LAB')fail('NOT_FOUND','Select an existing LAB Course Session.');
  const scope={academicYear:selected.academicYear,curriculumYear:String(selected.curriculumYear),courseCode:selected.courseCode,date:selected.date};
  const scopeMatch=s=>Object.entries(scope).every(([k,v])=>String(s[k])===String(v));
  const sessions=all.filter(s=>s.sessionType==='LAB'&&scopeMatch(s)).sort((a,b)=>text(a.id).localeCompare(text(b.id)));
  return {scope,sessions,all,key:JSON.stringify(scope),token:JSON.stringify(sessions.map(sourceFields)),archived:annual().years?.[scope.academicYear]?.status==='archived'};
 }
 // Provision explicit course scopes for the two existing synthetic LAB tester
 // accounts, including browsers that saved their Demo data before this feature.
 // Other LAB users and future-year courses still require an Owner grant.
 function ensureDemoLabFixtureScopes(){
  const bag=state();
  if(bag.demoLabFixtureScopesV1===true)return;
  const scopes=distinct(list(store.tables.sessions)
   .filter(s=>s.sessionType==='LAB'&&s.academicYear===store.tables.academicYear)
   .map(s=>JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode})))
   .map(value=>JSON.parse(value));
  for(const user of list(store.tables.users)){
   if(!['uid-lab-1','uid-lab-2'].includes(user.firebaseUid)||text(user.baseRole).toLowerCase()!=='lab'||user.active!==true)continue;
   const existing=list(user.labScopes);
   for(const scope of scopes)if(!existing.some(s=>['academicYear','curriculumYear','courseCode'].every(k=>String(s[k])===String(scope[k]))))existing.push(scope);
   user.labScopes=existing;
  }
  bag.demoLabFixtureScopesV1=true;
  store.commit();
 }
 function actor(uid){
  ensureDemoLabFixtureScopes();
  const u=typeof uid==='string'&&list(store.tables.users).find(x=>x.firebaseUid===uid);
  if(!u||u.active!==true||u.mustChangePassword!==false)fail('ROLE_DENIED','An active, ready Demo account is required.');
  return u;
 }
 function allowed(u,ctx){
  if(ADMIN.has(text(u.baseRole).toLowerCase()))return true;
  const lab=text(u.baseRole).toLowerCase()==='lab'||list(u.officeAccess).includes('lab');
  return lab&&list(u.labScopes).some(s=>['academicYear','curriculumYear','courseCode'].every(k=>String(s[k])===String(ctx.scope[k])));
 }
 function requireEdit(uid,ctx){const u=actor(uid);if(!allowed(u,ctx))fail('ROLE_DENIED','LAB editing requires this academic-year, cohort and course scope.');if(ctx.archived)fail('ARCHIVED_YEAR','Archived Lab schedules are read-only.');return u}
 function initial(ctx){
  const rooms=distinct(ctx.sessions.map(s=>text(s.room)).filter(Boolean)).map((label,i)=>({id:'room-'+(i+1),label,resourceKey:label.toLowerCase(),subspace:'',capacity:null}));
  return {groups:[],rooms,stations:ctx.sessions.map(s=>({id:s.id,sessionId:s.id,label:s.topic||'',assignedGroupIds:[],runs:(list(s.labApprovedRuns).length?s.labApprovedRuns:[[clock(s.startTime),clock(s.endTime)]]).map((t,i)=>({id:s.id+'-run-'+(i+1),start:t[0],end:t[1],roomId:rooms.find(r=>r.label===text(s.room))?.id||'',mode:'groups',groupIds:[]}))}))};
 }
 function record(ctx){const bag=state();return bag.blocks[ctx.key]||(bag.blocks[ctx.key]={revision:0,sourceToken:ctx.token,draft:initial(ctx),publications:[]})}
 function protectedFields(object){return ['assignments','instructors','facultyId','teachingRole','creditedHours','doeCredit','facultyCoverage'].some(k=>Object.prototype.hasOwnProperty.call(object||{},k))}
 function normalize(d,ctx){
  if(!d||!Array.isArray(d.groups)||!Array.isArray(d.rooms)||!Array.isArray(d.stations))fail('INVALID_DRAFT','Groups, rooms and stations are required.');
  if(d.groups.length>100||d.rooms.length>100||d.stations.length>200)fail('INVALID_DRAFT','Narrow the Lab activity before saving.');
  if(protectedFields(d)||d.stations.some(s=>protectedFields(s)||list(s.runs).some(protectedFields)))fail('PROTECTED_ASSIGNMENT','Change faculty, roles or credit through existing ADFAD approval tools, not Lab allocations.');
  const ids=d.stations.map(s=>s.sessionId);
  if(distinct(ids).length!==ids.length||ids.length!==ctx.sessions.length||ids.some(id=>!ctx.sessions.some(s=>s.id===id)))fail('SESSION_SCOPE','Stations must reference each existing LAB Session in this activity exactly once.');
  const cleanId=v=>{const id=text(v);if(!id||id.length>160)fail('INVALID_DRAFT','Each group, room, station, run and student needs an ID.');return id};
  const uniqueIds=(rows,label)=>{if(distinct(rows.map(x=>x.id)).length!==rows.length)fail('INVALID_DRAFT','Duplicate '+label+' IDs.');return rows};
  return {
   groups:uniqueIds(d.groups.map(g=>({id:cleanId(g.id),code:text(g.code).slice(0,80),members:uniqueIds(list(g.members).map(m=>({id:cleanId(m.id),name:text(m.name).slice(0,160)})),'student')})),'group'),
   rooms:uniqueIds(d.rooms.map(r=>({id:cleanId(r.id),label:text(r.label).slice(0,160),resourceKey:text(r.resourceKey||r.label).toLowerCase().slice(0,160),subspace:text(r.subspace).toLowerCase().slice(0,80),capacity:r.capacity===null||r.capacity===''||r.capacity===undefined?null:Number(r.capacity)})),'room'),
   stations:d.stations.map(s=>({id:cleanId(s.id),sessionId:s.sessionId,label:text(s.label).slice(0,400),assignedGroupIds:distinct(list(s.assignedGroupIds).map(text)),runs:uniqueIds(list(s.runs).map(r=>({id:cleanId(r.id),start:text(r.start),end:text(r.end),roomId:text(r.roomId),mode:r.mode==='all'?'all':'groups',groupIds:distinct(list(r.groupIds).map(text))})),'run')}))
  };
 }
 function instructorRows(s){return list(s.assignments).map(a=>{const f=list(store.tables.faculty).find(f=>f.facultyId===a.facultyId)||list(annual().faculty).find(f=>f.id===a.facultyId);return {assignmentId:a.sessionAssignmentId||null,facultyId:a.facultyId,name:f?.displayName||f?.name||a.sourceFacultyName||'Not provided',participantCategory:['Sessional','Guest','Other'].includes(a.participantCategory||f?.recordType)?(a.participantCategory||f.recordType):'',role:a.teachingRole==='Lab Primary'?'Primary':a.teachingRole==='Lab Secondary'?'Secondary':a.teachingRole||'Not provided'}})}
 function runsFor(draft,ctx){
  const groupMap=new Map(draft.groups.map(g=>[g.id,g])),rooms=new Map(draft.rooms.map(r=>[r.id,r]));
  return draft.stations.flatMap(st=>st.runs.map(run=>{
   const ids=run.mode==='all'?st.assignedGroupIds:run.groupIds;
   const students=distinct(ids.flatMap(id=>list(groupMap.get(id)?.members).map(m=>m.id)));
   const source=ctx.sessions.find(s=>s.id===st.sessionId);
   return {station:st,source,run,date:ctx.scope.date,start:minutes(run.start),end:minutes(run.end),studentIds:students,groupIds:ids,room:rooms.get(run.roomId),facultyIds:distinct(list(source?.assignments).map(a=>a.facultyId).filter(Boolean))};
  }));
 }
 function validate(draft,ctx){
  const issues=[],requiredApprovals=new Set(),groups=new Map(draft.groups.map(g=>[g.id,g]));
  const issue=(code,message,stationId=null,runId=null)=>issues.push({code,message,stationId,runId});
  if(ctx.archived)issue('ARCHIVED_YEAR','Archived Lab schedules are read-only.');
  const match=/^(\d{4})-(\d{2})$/.exec(ctx.scope.academicYear||'');
  if(!match||Number(match[2])!==(Number(match[1])+1)%100||ctx.scope.date<match[1]+'-05-01'||ctx.scope.date>=String(Number(match[1])+1)+'-05-01')issue('YEAR_SCOPE','The Session date must be inside its academic year.');
  const course=annual().annual?.[ctx.scope.academicYear]?.[ctx.scope.courseCode];
  if(ctx.scope.academicYear!==store.tables.academicYear){
   const release=list(course?.published).at(-1);
   if(!release)issue('COURSE_UNPUBLISHED','Publish the approved annual Course before publishing its Lab allocations.');
   else if(course.revision!==release.revision||course.finalizedRevision!==course.revision||ctx.sessions.some(s=>!list(release.sessions).some(p=>p.id===s.id&&JSON.stringify(p.assignments)===JSON.stringify(s.assignments)&&p.startTime===s.startTime&&p.endTime===s.endTime&&p.date===s.date)))issue('COURSE_CHANGED','Finalize and publish the current Course revision before publishing these Lab allocations.');
  }
  const seenStudents=new Set();
  for(const group of draft.groups){
   if(!group.code)issue('GROUP_LABEL','Give each student group a label.');
   for(const m of group.members){if(seenStudents.has(m.id))issue('DUPLICATE_MEMBERSHIP','A student belongs to more than one group in this grouping scheme.');seenStudents.add(m.id)}
  }
  const runs=runsFor(draft,ctx);
  for(const station of draft.stations){
   const source=ctx.sessions.find(s=>s.id===station.sessionId);
   if(!station.runs.length)issue('RUN_REQUIRED','Add a run for this activity.',station.id);
   if(!station.assignedGroupIds.length)issue('EMPTY_AUDIENCE','Assign the activity audience before choosing All or individual groups.',station.id);
   if(station.assignedGroupIds.some(id=>!groups.has(id)))issue('UNKNOWN_GROUP','The assigned audience references a missing group.',station.id);
   const expected=list(source.labApprovedRuns).length?source.labApprovedRuns.map(t=>({start:t[0],end:t[1]})):[{start:clock(source.startTime),end:clock(source.endTime)}];
   if(!Number.isFinite(minutes(clock(source.startTime)))||!Number.isFinite(minutes(clock(source.endTime))))issue('SOURCE_TIME_UNKNOWN','The approved Session needs verified start and end times.',station.id);
   if(JSON.stringify(intervals(station.runs))!==JSON.stringify(intervals(expected))&&list(source.assignments).length){requiredApprovals.add('ADFAD');issue('FACULTY_COVERAGE_CHANGE','Run times change approved faculty working intervals. Use the existing ADFAD change workflow.',station.id)}
   if(!list(source.assignments).length||list(source.assignments).some(a=>!a.facultyId))issue('INSTRUCTOR_UNKNOWN','Confirm the teaching assignments before publication.',station.id);
  }
  for(const row of runs){
   const {run,station,source,room}=row;
   if(!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.end<=row.start)issue('INVALID_TIME','Use valid 24-hour times with start before end.',station.id,run.id);
   if(row.start<minutes(clock(source.startTime))||row.end>minutes(clock(source.endTime))){requiredApprovals.add('ADC');issue('OUTSIDE_COURSE','Run extends beyond the approved Session. Submit the timing change to ADC.',station.id,run.id)}
   if(row.groupIds.some(id=>!groups.has(id)))issue('UNKNOWN_GROUP','Choose existing student groups.',station.id,run.id);
   if(run.mode!=='all'&&row.groupIds.some(id=>!station.assignedGroupIds.includes(id)))issue('AUDIENCE_SCOPE','Run groups must belong to this activity\'s assigned audience.',station.id,run.id);
   if(!row.studentIds.length)issue('EMPTY_AUDIENCE','This run has no explicitly assigned students. Add groups and their roster.',station.id,run.id);
   if(row.groupIds.some(id=>groups.has(id)&&!groups.get(id).members.length))issue('ROSTER_REQUIRED','Complete the selected group roster before publication.',station.id,run.id);
   if(!room||!room.label||!room.resourceKey)issue('ROOM_REQUIRED','Choose an identified room or subspace.',station.id,run.id);
   else if(room.capacity===null||!Number.isInteger(room.capacity)||room.capacity<0)issue('CAPACITY_UNKNOWN','Confirm the room/subspace student capacity.',station.id,run.id);
   else if(row.studentIds.length>room.capacity)issue('CAPACITY_EXCEEDED','Assigned student count exceeds room/subspace capacity.',station.id,run.id);
   for(const facultyId of row.facultyIds){
    const f=list(store.tables.faculty).find(x=>x.facultyId===facultyId)||list(annual().faculty).find(x=>x.id===facultyId);
    if(!f||f.active!==true||f.appointmentValid===false||(f.activationDate&&ctx.scope.date<f.activationDate)||(f.appointmentEndDate&&ctx.scope.date>f.appointmentEndDate))issue('FACULTY_UNAVAILABLE','A faculty appointment is inactive or not effective on the Session date.',station.id,run.id);
    if(list(store.tables.afcRecords).some(a=>a.facultyId===facultyId&&a.active!==false&&a.startDate<=row.date&&a.endDate>=row.date))issue('FACULTY_UNAVAILABLE','A faculty member is unavailable for this date. Check the existing availability tools.',station.id,run.id);
    for(const activity of list(store.tables.activities).filter(a=>(a.facultyKey||a.facultyId)===facultyId&&a.active!==false&&a.category!=='teaching_excellence'&&(a.startDate||a.date)<=row.date&&(a.endDate||a.date)>=row.date)){
     const evidence=list(activity.timeEvidence).filter(e=>e.date===row.date);
     if(!evidence.length)issue('AVAILABILITY_UNKNOWN','Another work activity has unconfirmed time on this date.',station.id,run.id);
     for(const e of evidence){const start=minutes(clock(e.startTime)),end=minutes(clock(e.endTime));if(!Number.isFinite(start)||!Number.isFinite(end)||overlaps(row,{date:row.date,start,end}))issue('FACULTY_UNAVAILABLE','Another work activity requires availability review.',station.id,run.id)}
    }
    if(list(store.tables.extra?.afcRequests).some(a=>a.facultyId===facultyId&&['pending_report_to','pending_admin'].includes(a.status)&&a.startDate<=row.date&&a.endDate>=row.date))issue('AVAILABILITY_UNKNOWN','A pending availability request requires review.',station.id,run.id);
   }
  }
  const occupied=[];
  for(const [key,b] of Object.entries(state().blocks))if(key!==ctx.key){const p=b.publications.at(-1);if(p&&p.scope.academicYear===ctx.scope.academicYear&&p.scope.date===ctx.scope.date)occupied.push(...p.occupancy)}
  function compare(a,b){
   if(!overlaps(a,b))return;
   if(a.studentIds.some(id=>b.studentIds.includes(id)))issue('STUDENT_OVERLAP','Assigned students overlap another mandatory run; All is not optional attendance.',a.station?.id,a.run?.id);
   if(a.facultyIds.some(id=>b.facultyIds.includes(id)))issue('FACULTY_OVERLAP','A faculty member is assigned to overlapping runs.',a.station?.id,a.run?.id);
   if(a.room&&b.room&&a.room.resourceKey===b.room.resourceKey&&(!a.room.subspace||!b.room.subspace||a.room.subspace===b.room.subspace))issue('ROOM_OVERLAP','Room/subspace is occupied by overlapping runs.',a.station?.id,a.run?.id);
  }
  runs.forEach((a,i)=>{runs.slice(i+1).forEach(b=>compare(a,b));occupied.forEach(b=>compare(a,b))});
  for(const run of runs)for(const other of ctx.all){
   if(ctx.sessions.some(s=>s.id===other.id)||other.date!==run.date||other.academicYear!==ctx.scope.academicYear)continue;
   const start=minutes(clock(other.startTime)),end=minutes(clock(other.endTime));
   if(run.room&&text(other.room).toLowerCase()===run.room.resourceKey&&overlaps(run,{date:other.date,start,end}))issue('ROOM_OVERLAP','Another Course Session reserves this room.',run.station.id,run.run.id);
   if(!list(other.assignments).some(a=>run.facultyIds.includes(a.facultyId)))continue;
   if(!Number.isFinite(start)||!Number.isFinite(end))issue('AVAILABILITY_UNKNOWN','Another assigned Session has unknown times. Check faculty availability.',run.station.id,run.run.id);
   else if(overlaps(run,{date:other.date,start,end}))issue('FACULTY_OVERLAP','A faculty member has another overlapping Course Session.',run.station.id,run.run.id);
  }
  return {canPublish:issues.length===0,requiredApprovals:[...requiredApprovals],issues};
 }
 function projected(draft,ctx,version,at){
  const actual=runsFor(draft,ctx);
  return {scope:clone(ctx.scope),version,publishedAt:at,stations:draft.stations.map(st=>({sessionId:st.sessionId,topic:st.label||ctx.sessions.find(s=>s.id===st.sessionId).topic||'',instructors:instructorRows(ctx.sessions.find(s=>s.id===st.sessionId)).map(({name,role,participantCategory})=>({name,role,participantCategory})),runs:actual.filter(r=>r.station===st).map(r=>({id:r.run.id,start:r.run.start,end:r.run.end,room:r.room?.label||'',subspace:r.room?.subspace||'',groups:r.run.mode==='all'?['All']:r.groupIds.map(id=>draft.groups.find(g=>g.id===id)?.code||''),studentCount:r.studentIds.length}))}))};
 }
 function publicView(sessionId){
  const ctx=context(sessionId),p=state().blocks[ctx.key]?.publications.at(-1);
  if(!p||ctx.archived)return null;
  if(ctx.scope.academicYear!==store.tables.academicYear&&!list(annual().annual?.[ctx.scope.academicYear]?.[ctx.scope.courseCode]?.published).length)return null;
  return clone(p.public);
 }
 function read(uid,sessionId){
  const u=actor(uid),ctx=context(sessionId),can=allowed(u,ctx),pub=can&&ctx.archived?clone(state().blocks[ctx.key]?.publications.at(-1)?.public||null):publicView(sessionId);
  if(!can)return {scope:clone(ctx.scope),capabilities:{canEdit:false,canRoster:false},published:pub};
  const r=record(ctx),sourceChanged=r.sourceToken!==ctx.token;
  const validation=sourceChanged?{canPublish:false,requiredApprovals:[],issues:[{code:'SOURCE_CHANGED',message:'Approved Sessions changed. Reload the approved source before saving or publishing.'}]}:validate(r.draft,ctx);
  return {scope:clone(ctx.scope),revision:r.revision,sourceChanged,draft:clone(r.draft),published:pub,publicationVersions:r.publications.map(p=>({version:p.public.version,at:p.public.publishedAt})),capabilities:{canEdit:!ctx.archived,canRoster:true},sourceSessions:ctx.sessions.map(s=>({id:s.id,topic:s.topic,start:clock(s.startTime),end:clock(s.endTime),instructors:instructorRows(s).map(({assignmentId,name,role,participantCategory})=>({assignmentId,name,role,participantCategory}))})),validation};
 }
 function verifyRevision(r,p,ctx){if(p.expectedRevision!==r.revision)fail('STALE_REVISION','Another edit was saved. Reload before retrying.');if(r.sourceToken!==ctx.token)fail('SOURCE_CHANGED','The approved Session or faculty assignments changed. Reload approved source.');}
 function receipt(uid,action,p){
  if(!text(p.requestId)||p.requestId.length>160)fail('REQUEST_ID','A unique operation ID is required.');
  const key=JSON.stringify([uid,action,p.requestId]),input=JSON.stringify(p),previous=state().receipts[key];
  if(previous&&previous.input!==input)fail('REQUEST_REUSE','This operation ID was already used with different values.');
  return {key,input,previous};
 }
 function finish(uid,ctx,action,before,result,proof){
  const after=clone(result);state().receipts[proof.key]={input:proof.input,result:after};
  // Public Change History gets only revision/version metadata, never rosters.
  store.audit({domain:'lab',academicYear:ctx.scope.academicYear,changeType:action,actorFirebaseUid:uid,before,after:{revision:after.revision||null,version:after.version||null},courseCode:ctx.scope.courseCode});store.commit();return after;
 }
 function save(uid,p){
  const ctx=context(p.sessionId);requireEdit(uid,ctx);const proof=receipt(uid,'save',p);if(proof.previous)return clone(proof.previous.result);
  const r=record(ctx);verifyRevision(r,p,ctx);const draft=normalize(p.draft,ctx),before={revision:r.revision};r.draft=draft;r.revision++;
  return finish(uid,ctx,'lab_draft_saved',before,read(uid,p.sessionId),proof);
 }
 function publish(uid,p){
  const ctx=context(p.sessionId);requireEdit(uid,ctx);const proof=receipt(uid,'publish',p);if(proof.previous)return clone(proof.previous.result);
  const r=record(ctx);verifyRevision(r,p,ctx);const validation=validate(r.draft,ctx);if(!validation.canPublish)throw Object.assign(Error('Resolve the listed conflicts or required ADC/ADFAD changes before publishing.'),{code:'LAB_VALIDATION',details:validation});
  const previous=r.publications.at(-1);if(previous?.revision===r.revision)fail('NO_CHANGES','This revision is already published.');
  const version=r.publications.length+1,publicData=projected(r.draft,ctx,version,stamp());
  const occupancy=runsFor(r.draft,ctx).map(r=>({date:r.date,start:r.start,end:r.end,studentIds:r.studentIds,facultyIds:r.facultyIds,room:clone(r.room)}));
  r.publications.push({revision:r.revision,scope:clone(ctx.scope),draft:clone(r.draft),public:publicData,occupancy,sourceToken:ctx.token,actor:uid});
  return finish(uid,ctx,'lab_published',{version:previous?.public.version||0},{version,revision:r.revision,publication:publicData},proof);
 }
 function roster(uid,sessionId,version){
  const ctx=context(sessionId),u=actor(uid);if(!allowed(u,ctx))fail('ROLE_DENIED','Student rosters require scoped LAB authorization.');
  const r=record(ctx),p=r.publications.find(x=>x.public.version===Number(version));
  if(!p)fail('NOT_FOUND','Choose an existing publication version.');return {scope:clone(ctx.scope),version:Number(version),groups:clone(p.draft.groups)};
 }
 function refreshSource(uid,p){
  const ctx=context(p.sessionId);requireEdit(uid,ctx);const proof=receipt(uid,'refresh',p);if(proof.previous)return clone(proof.previous.result);const r=record(ctx);
  if(p.expectedRevision!==r.revision)fail('STALE_REVISION','Reload before replacing the draft.');
  const before={revision:r.revision};const rebuilt=initial(ctx);rebuilt.groups=clone(r.draft.groups);r.draft=rebuilt;r.sourceToken=ctx.token;r.revision++;
  return finish(uid,ctx,'lab_source_refreshed',before,read(uid,p.sessionId),proof);
 }
 function copyStructure(uid,p){
  const from=context(p.fromSessionId),to=context(p.toSessionId);requireEdit(uid,to);if(!allowed(actor(uid),from))fail('ROLE_DENIED','Source course scope is required.');
  const proof=receipt(uid,'copy',p);if(proof.previous)return clone(proof.previous.result);const target=record(to);verifyRevision(target,p,to);
  if(target.revision!==0||target.publications.length)fail('TARGET_NOT_EMPTY','Copy structure only into an empty draft.');
  const source=record(from).publications.at(-1);if(!source)fail('NOT_FOUND','Copy from a Published Lab schedule.');
  const draft=initial(to);draft.groups=source.draft.groups.map(g=>({...clone(g),members:[]}));draft.rooms=clone(source.draft.rooms);
  // Match by position only for the explicitly selected template; actual session
  // references/times remain the target year's approved source, never old dates.
  draft.stations.forEach((s,i)=>{s.assignedGroupIds=clone(source.draft.stations[i]?.assignedGroupIds||[]);s.runs.forEach((r,j)=>{const old=source.draft.stations[i]?.runs[j];if(old){r.roomId=old.roomId;r.mode=old.mode;r.groupIds=clone(old.groupIds)}})});
  target.draft=draft;target.revision++;return finish(uid,to,'lab_structure_copied',{revision:0},read(uid,p.toSessionId),proof);
 }
 function listing(uid){
  const u=actor(uid),out=[],keys=new Set();for(const s of sources().filter(s=>s.sessionType==='LAB')){const ctx=context(s.id);if(keys.has(ctx.key))continue;keys.add(ctx.key);if(allowed(u,ctx)||publicView(s.id))out.push({sessionId:s.id,...ctx.scope,topic:ctx.sessions.map(x=>x.topic).join(' / '),canEdit:allowed(u,ctx)&&!ctx.archived,publishedVersion:state().blocks[ctx.key]?.publications.at(-1)?.public.version||0})}return out;
 }
 function grantScope(uid,p){
  const ctx=context(p.sessionId),u=requireEdit(uid,ctx);
  if(!['owner','developer','adfa_general'].includes(text(u.baseRole).toLowerCase()))fail('ROLE_DENIED','Only an Owner can grant a Demo LAB scope.');
  const target=list(store.tables.users).find(x=>x.firebaseUid===p.userId);
  if(!target||target.active!==true||!(target.baseRole==='lab'||list(target.officeAccess).includes('lab')))fail('ROLE_DENIED','Select an active account with LAB office access.');
  const proof=receipt(uid,'scope',p);if(proof.previous)return clone(proof.previous.result);
  const scope={academicYear:ctx.scope.academicYear,curriculumYear:ctx.scope.curriculumYear,courseCode:ctx.scope.courseCode};
  const before={scopes:clone(target.labScopes||[])};target.labScopes=list(target.labScopes);
  if(!target.labScopes.some(s=>Object.keys(scope).every(k=>String(s[k])===String(scope[k]))))target.labScopes.push(scope);
  return finish(uid,ctx,'lab_scope_granted',before,{userId:target.firebaseUid,scope},proof);
 }
 return {list:listing,read,save,publish,publicView,roster,refreshSource,copyStructure,grantScope};
}
module.exports={createLabService};
