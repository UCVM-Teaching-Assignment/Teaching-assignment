'use strict';
// Browser-local PAWS Testing Demo. Office batch staging uses a cloned store:
// conflicts are checked using the existing LAB and ADFAD domain validators,
// with no roster, teaching assignment or DOE writes until every row passes.
const {createLabService}=require('./lab-scheduling');
const clone=x=>JSON.parse(JSON.stringify(x));
const val=x=>String(x==null?'':x).trim();
const list=x=>Array.isArray(x)?x:[];
const OFFICE_ROLES={lab:new Set(['lab','developer','owner','administrator','admin']),
 adfa:new Set(['adfa_general','adfa_regular','administrator','admin','developer','owner'])};
const codeError=(code,message)=>Object.assign(Error(message),{code});
function createOfficeBulk({store}){
 const users=()=>list(store.tables.users);
 const active=uid=>{const user=users().find(x=>x.firebaseUid===uid);if(!user||user.active!==true||user.mustChangePassword!==false)throw codeError('ROLE_DENIED','Select an active Demo account.');return user;};
 const role=uid=>val(active(uid).baseRole).toLowerCase();
 function requireOffice(uid,office){
  if(!OFFICE_ROLES[office]||!OFFICE_ROLES[office].has(role(uid))&&!(['lab'].includes(office)&&list(active(uid).officeAccess).includes('lab')))
   throw codeError('ROLE_DENIED','This office operation requires its LAB or ADFAD role.');
 }
 const isPending=s=>s.academicYear===store.tables.academicYear&&s.scheduleStatus==='published'&&s.facultyStatus!=='confirmed';
 const labKey=s=>JSON.stringify({academicYear:s.academicYear,curriculumYear:String(s.curriculumYear),courseCode:s.courseCode,date:s.date});
 function hasLabRelease(tables,s){
  const p=tables.extra?.labScheduling?.blocks?.[labKey(s)]?.publications?.at(-1)?.public;
  return Boolean(p&&list(p.stations).some(st=>st.sessionId===s.id));
 }
 function fakeStore(){
  const tables=clone(store.tables);
  return {tables,nowIso:store.nowIso,commit(){},audit(r){tables.history.push(clone(r))},
   bag(n,init){return tables.extra[n]||(tables.extra[n]=init())}};
 }
 function labEditable(lab,uid,s){
  try{return lab.read(uid,s.id).capabilities?.canEdit===true}catch(_){return false}
 }
 function officeExport(uid,office){
  requireOffice(uid,office);
  const temp=fakeStore(),lab=createLabService({store:temp}),rows=[];
  const sessions=list(store.tables.sessions).filter(s=>isPending(s)||office==='lab'&&s.academicYear===store.tables.academicYear&&s.scheduleStatus==='published');
  for(const s of sessions){
   if(office==='adfa'){
    if(!isPending(s))continue;
    const suggested=list(s.suggestedFacultyIds);
    for(const id of (suggested.length?suggested:[''])){
     rows.push({sessionId:s.id,courseNumber:s.courseCode,date:s.date,startTime:val(s.startTime).slice(0,5),
      endTime:val(s.endTime).slice(0,5),facultyId:id,
      teachingRole:s.sessionType==='LAB'?'Lab Primary':s.sessionType==='SRL'?'SRL':'Lecture',
      creditedHours:'',reviewNote:'',expectedRevision:Number(s.facultyRevision||0)});
    }
    continue;
   }
   if(s.sessionType!=='LAB'||hasLabRelease(store.tables,s)||!labEditable(lab,uid,s))continue;
   const ctx=lab.read(uid,s.id),st=ctx.draft.stations.find(x=>x.sessionId===s.id);
   if(!st)continue;
   for(const run of st.runs){
    const groupIds=run.mode==='all'?st.assignedGroupIds:run.groupIds;
    const ids=groupIds.length?groupIds:[null];
    const room=ctx.draft.rooms.find(x=>x.id===run.roomId);
    for(const groupId of ids){
     const g=ctx.draft.groups.find(x=>x.id===groupId);
     rows.push({sessionId:s.id,courseNumber:s.courseCode,date:s.date,startTime:run.start,endTime:run.end,
      runKey:run.id,room:room?.label||'',capacity:room?.capacity??'',
      attendance:run.mode,groupCode:g?.code||'',studentIds:list(g?.members).map(m=>m.id).join(';'),
      studentNames:list(g?.members).map(m=>m.name).join(';'),expectedRevision:ctx.revision});
    }
   }
  }
  return {office,academicYear:store.tables.academicYear,rows};
 }
 function keysFromRows(uid,office,rows){
  const originals=new Map(list(store.tables.sessions).map(s=>[s.id,s]));
  const grouped=new Map(),errors=[];
  if(!Array.isArray(rows)||rows.length<1||rows.length>500)throw codeError('IMPORT_VALIDATION','Provide 1–500 office import rows.');
  for(let i=0;i<rows.length;i++){
   const row=rows[i],id=val(row?.sessionId),s=originals.get(id),rowNumber=i+1;
   if(!row||typeof row!=='object'||Array.isArray(row)||!s||s.scheduleStatus!=='published'||s.academicYear!==store.tables.academicYear){
    errors.push({rowNumber,code:'INVALID_SESSION',message:'Use an ADC-published Session ID in the active academic year.'});continue;
   }
   if(office==='lab'&&s.sessionType!=='LAB'){errors.push({rowNumber,code:'INVALID_SESSION',message:'LAB imports must contain LAB Sessions only.'});continue}
   if(office==='adfa'&&!isPending(s)){errors.push({rowNumber,code:'STALE_REVISION',message:'Faculty work is already confirmed. Download a current template.'});continue}
   if(val(row.courseNumber)&&val(row.courseNumber)!==val(s.courseCode)||val(row.date)&&val(row.date)!==val(s.date)){
    errors.push({rowNumber,code:'SOURCE_CHANGED',message:'Course or date differs from the published ADC Session.'});continue;
   }
   const revision=Number(row.expectedRevision);
   if(!Number.isInteger(revision)||revision<0||revision!==Number(office==='lab'?0:s.facultyRevision||0)&&office==='adfa'){
    errors.push({rowNumber,code:'STALE_REVISION',message:'Download the current task template; its revision changed.'});continue;
   }
   const key=office==='lab'?labKey(s):id;
   if(!grouped.has(key))grouped.set(key,{s,rows:[],rowNumber});
   grouped.get(key).rows.push({row,rowNumber,session:s});
  }
  return {grouped,errors};
 }
 const members=s=>val(s).split(';').map(x=>val(x)).filter(Boolean);
 function labDraftFor(ctx,scopeRows){
  const draft=clone(ctx.draft),stations=new Map(),groups=new Map(),rooms=new Map();
  for(const item of scopeRows){
   const {row,s}= {row:item.row,s:item.session},stationId=s.id;
   if(Number(row.expectedRevision)!==ctx.revision)throw codeError('STALE_REVISION','LAB draft revision changed. Download again.');
   if(!val(row.runKey))throw codeError('INVALID_DRAFT','Run Key is required.');
   const groupCode=val(row.groupCode),ids=members(row.studentIds),names=members(row.studentNames);
   if(!groupCode||!ids.length)throw codeError('ROSTER_REQUIRED','Provide Group Code and Student IDs for each LAB run.');
   if(names.length&&names.length!==ids.length)throw codeError('ROSTER_REQUIRED','Student Names must match Student IDs by position.');
   const groupId='bulk-group:'+groupCode.toLowerCase(),roster=ids.map((id,i)=>({id,name:names[i]||id}));
   if(groups.has(groupId)&&JSON.stringify(groups.get(groupId).members)!==JSON.stringify(roster))
    throw codeError('ROSTER_CONFLICT','The same Group Code must use one consistent roster.');
   groups.set(groupId,{id:groupId,code:groupCode,members:roster});
   const roomLabel=val(row.room),capacity=Number(row.capacity);
   if(!roomLabel||!val(row.capacity)||!Number.isInteger(capacity)||capacity<1)throw codeError('ROOM_REQUIRED','Each LAB run needs a room and positive integer capacity.');
   const roomId='bulk-room:'+roomLabel.toLowerCase();
   if(rooms.has(roomId)&&rooms.get(roomId).capacity!==capacity)throw codeError('CAPACITY_CONFLICT','One room must have the same capacity in this batch.');
   rooms.set(roomId,{id:roomId,label:roomLabel,resourceKey:roomLabel.toLowerCase(),subspace:'',capacity});
   const mode=val(row.attendance).toLowerCase()==='all'?'all':'groups';
   if(!['all','groups','selected groups','group'].includes(val(row.attendance).toLowerCase()))
    throw codeError('INVALID_DRAFT','Attendance must be All or Groups.');
   let st=stations.get(stationId);
   if(!st){st={id:stationId,sessionId:stationId,label:val(s.topic),assignedGroupIds:[],runs:[],index:new Map()};stations.set(stationId,st);}
   const runId=val(row.runKey);let run=st.index.get(runId);
   const source={id:runId,start:val(row.startTime).slice(0,5),end:val(row.endTime).slice(0,5),roomId,mode,groupIds:[]};
   if(!run){run=source;st.runs.push(run);st.index.set(runId,run);}
   else if(['start','end','roomId','mode'].some(k=>run[k]!==source[k]))
    throw codeError('RUN_CONFLICT','A Run Key must use the same time, room and attendance on every group row.');
   if(!run.groupIds.includes(groupId))run.groupIds.push(groupId);
   if(!st.assignedGroupIds.includes(groupId))st.assignedGroupIds.push(groupId);
  }
  if(stations.size!==draft.stations.length||draft.stations.some(st=>!stations.has(st.sessionId)))
   throw codeError('SESSION_SCOPE','A LAB import must include every station in the Course/date group; download the complete task template.');
  draft.groups=[...groups.values()];draft.rooms=[...rooms.values()];
  draft.stations=draft.stations.map(st=>{
   const next=stations.get(st.sessionId);next.runs=next.runs.map(r=>({...r,groupIds:r.mode==='all'?[]:r.groupIds}));
   return {id:st.id,sessionId:st.sessionId,label:next.label,assignedGroupIds:next.assignedGroupIds,runs:next.runs};
  });
  return draft;
 }
 function stageLab(uid,grouped,errors,staged){
  const lab=createLabService({store:staged});
  const changed=[];
  for(const record of grouped.values()){
   try{
    const ctx=lab.read(uid,record.s.id);
    if(!ctx.capabilities?.canEdit)throw codeError('ROLE_DENIED','LAB course scope is not assigned to this account.');
    const draft=labDraftFor(ctx,record.rows);
    const result=lab.save(uid,{sessionId:record.s.id,expectedRevision:ctx.revision,requestId:'office-lab-preview-save:'+record.s.id,draft});
    const published=lab.publish(uid,{sessionId:record.s.id,expectedRevision:result.revision,requestId:'office-lab-preview-publish:'+record.s.id});
    changed.push({sessionId:record.s.id,version:published.version});
   }catch(e){
    errors.push({rowNumber:record.rowNumber,code:e.code||'LAB_VALIDATION',message:e.message,
     issues:list(e.details?.issues).map(x=>x.code+': '+x.message)});
   }
  }
  return changed;
 }
 function stageAdfa(uid,grouped,errors,staged){
  const workflow=require('./schedule-workflow').createScheduleWorkflow({store:staged});
  const changed=[];
  for(const record of grouped.values()){
   try{
    const entries=record.rows.map(({row})=>({facultyId:val(row.facultyId),teachingRole:val(row.teachingRole),creditedHours:val(row.creditedHours)}));
    if(entries.some(x=>!x.facultyId))throw codeError('INVALID_ASSIGNMENT','Faculty ID is missing. Fill it in before uploading.');
    const notes=[...new Set(record.rows.map(({row})=>val(row.reviewNote)).filter(Boolean))];
    if(notes.length>1)throw codeError('INVALID_ASSIGNMENT','Use the same review note for each teacher assigned to this Session.');
    const p={sessionId:record.s.id,expectedRevision:Number(record.rows[0].row.expectedRevision),
     assignments:entries,reviewNote:notes[0]||''};
    workflow.confirmFaculty(uid,p);
    changed.push({sessionId:record.s.id,facultyRevision:record.s.facultyRevision+1});
   }catch(e){errors.push({rowNumber:record.rowNumber,code:e.code||'INVALID_ASSIGNMENT',message:e.message});}
  }
  return changed;
 }
 function stage(uid,p){
  const office=val(p?.office),rows=p?.rows;
  requireOffice(uid,office);
  const staged=fakeStore(),{grouped,errors}=keysFromRows(uid,office,rows);
  const ready=office==='lab'?stageLab(uid,grouped,errors,staged):stageAdfa(uid,grouped,errors,staged);
  return {office,staged,ready,errors,valid:errors.length===0};
 }
 function previewOfficeBulk(uid,p){
  const result=stage(uid,p);
  return {office:result.office,valid:result.valid,readyCount:result.valid?result.ready.length:0,
   invalidCount:result.errors.length,errors:result.errors};
 }
 function publishOfficeBulk(uid,p){
  const office=val(p?.office);requireOffice(uid,office);
  const id=val(p?.batchId);if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(id))throw codeError('IMPORT_VALIDATION','A unique office Batch ID is required.');
  const imports=store.bag('officeBulkImports',()=>({lab:{},adfa:{}})),signature=JSON.stringify(p.rows||[]);
  const prev=imports[office]?.[id];
  if(prev){if(prev.signature!==signature)throw codeError('IMPORT_CONFLICT','This Batch ID was already published with different data.');return clone(prev.result);}
  const result=stage(uid,p);
  if(!result.valid)throw codeError('IMPORT_VALIDATION',result.errors.map(e=>'Row '+e.rowNumber+' '+e.code+': '+e.message+(e.issues?.length?' ['+e.issues.join('; ')+']':'')).join(' | ').slice(0,3000));
  if(office==='lab'){
   store.tables.extra.labScheduling=clone(result.staged.tables.extra.labScheduling);
  }else{
   for(const item of result.ready){
    const source=result.staged.tables.sessions.find(s=>s.id===item.sessionId),target=store.tables.sessions.find(s=>s.id===item.sessionId);
    Object.assign(target,{assignments:clone(source.assignments),facultyStatus:source.facultyStatus,
     facultyRevision:source.facultyRevision,updatedAtUtc:source.updatedAtUtc});
   }
  }
  const response={office,batchId:id,publishedCount:result.ready.length,sessionIds:result.ready.map(x=>x.sessionId)};
  imports[office][id]={signature,result:clone(response),actorUid:uid,at:store.nowIso()};
  store.audit({domain:office==='lab'?'lab':'teaching',changeType:'office_bulk_published',office,batchId:id,
   actorFirebaseUid:uid,sessionIds:response.sessionIds,count:response.publishedCount});
  store.commit();return clone(response);
 }
 return Object.freeze({officeExport,previewOfficeBulk,publishOfficeBulk});
}
module.exports={createOfficeBulk};