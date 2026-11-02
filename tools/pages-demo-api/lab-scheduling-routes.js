'use strict';
const {createLabService}=require('./lab-scheduling');
const ROOT='/api/v1/lab-scheduling';
const clone=value=>JSON.parse(JSON.stringify(value));
function createLabRoutes({store,verify,findUser,calculateDoe,annualState}={}){
 const getAnnual=annualState||(()=>{try{return JSON.parse(globalThis.localStorage?.getItem('paws-multi-year-demo-v1')||'null')}catch(_){return null}});
 const service=createLabService({store,annualState:getAnnual});
 const reply=(status,jsonBody)=>({status,jsonBody,headers:{'Cache-Control':'no-store'}});
 async function identity(request){
  let decoded;try{decoded=await verify(String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''))}catch(_){throw Object.assign(Error('Sign in to a synthetic Demo account.'),{code:'UNAUTHENTICATED'})}
  const profile=await findUser(decoded.uid);
  if(!profile||profile.active!==true||profile.mustChangePassword!==false)throw Object.assign(Error('An active, ready account is required.'),{code:'ROLE_DENIED'});
  return {uid:decoded.uid,profile};
 }
 function seed(uid,profile){
  if(!['owner','developer','adfa_general'].includes(String(profile.baseRole).toLowerCase()))throw Object.assign(Error('Only the Owner or Developer can load the synthetic example.'),{code:'ROLE_DENIED'});
  const id=n=>'50502026-0000-4000-8000-'+String(n).padStart(12,'0');
  const ids=[id(1),id(2)],existing=store.tables.sessions.filter(s=>ids.includes(s.id));
  if(existing.length===2)return service.read(uid,id(1));
  if(existing.length)throw Object.assign(Error('The sample is incomplete. Review it instead of overwriting existing Sessions.'),{code:'SOURCE_CHANGED'});
  const faculty=store.tables.faculty.filter(f=>f.active===true&&(!f.activationDate||f.activationDate<='2026-11-03')).slice(0,6);
  if(faculty.length<6||typeof calculateDoe!=='function')throw Object.assign(Error('Six active synthetic faculty and the existing DOE calculator are required.'),{code:'INVALID_DRAFT'});
  const before=clone({sessions:store.tables.sessions,users:store.tables.users,courses:store.tables.courses,extra:store.tables.extra,history:store.tables.history});
  try{
   const assignment=(f,index,primary,hours)=>{const teachingRole=primary?'Lab Primary':'Lab Secondary',resolved=calculateDoe({sessionType:'LAB',teachingRole,creditedHours:hours});return {sessionAssignmentId:id(100+index),facultyId:f.facultyId,teachingRole,labLead:primary?'Yes':'',creditedHours:hours,doeRate:resolved.rate??null,doeQuantity:resolved.quantity??hours,doeUnit:resolved.unit||'credited hour',doeCredit:resolved.calculatedDoe??null,doeStatus:resolved.calculatedDoe==null?'needs_review':'calculated',sourceFacultyName:f.displayName}};
   const shared={academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505',courseName:'Clinical Skills III - synthetic example',date:'2026-11-03',sessionType:'LAB',startTime:'08:30:00',endTime:'16:30:00',updatedAtUtc:store.nowIso(),syntheticLabExample:true};
   store.tables.sessions.push({...shared,id:id(1),topic:'Review / Equine Palpation - synthetic example',room:'Demo Equine Area',labApprovedRuns:[['08:30','16:30']],assignments:[assignment(faculty[0],0,true,8),assignment(faculty[1],1,false,8)]},{...shared,id:id(2),topic:'SA Casting and Splinting - synthetic example',room:'Demo Skills Lab',labApprovedRuns:[['08:30','10:30'],['11:00','13:00'],['14:30','16:30']],assignments:faculty.slice(2).map((f,i)=>assignment(f,2+i,i===0,6))});
   if(!store.tables.courses.some(c=>c.courseCode==='VETM 505'))store.tables.courses.push({courseCode:'VETM 505',courseName:'Clinical Skills III - synthetic example',curriculumYear:3,term:'fall'});
   // Explicit synthetic course scopes, never a role-wide real-data grant.
   for(const user of store.tables.users)if(user.baseRole==='lab'){
    user.labScopes=Array.isArray(user.labScopes)?user.labScopes:[];
    if(!user.labScopes.some(s=>s.academicYear==='2026-27'&&s.curriculumYear==='3'&&s.courseCode==='VETM 505'))user.labScopes.push({academicYear:'2026-27',curriculumYear:'3',courseCode:'VETM 505'});
   }
   const c=service.read(uid,id(1)),draft=c.draft;
   draft.groups=[1,2,3].map(i=>({id:'demo-group-'+i,code:String(i),members:[1,2,3].map(j=>({id:'demo-y3-2026-student-'+((i-1)*3+j),name:'Synthetic Student '+((i-1)*3+j)}))}));
   draft.rooms=[{id:'eq',label:'Demo Equine Area',resourceKey:'demo-equine-area',subspace:'',capacity:12},{id:'sa',label:'Demo Skills Lab',resourceKey:'demo-skills-lab',subspace:'',capacity:6}];
   for(const st of draft.stations){st.assignedGroupIds=draft.groups.map(g=>g.id);st.runs.forEach((run,i)=>{run.roomId=st.sessionId===id(1)?'eq':'sa';run.mode=st.sessionId===id(1)?'all':'groups';run.groupIds=run.mode==='all'?[]:['demo-group-'+(i+1)]})}
   // Deliberately retain the reference's overlapping mandatory audiences.
   // A sample save is a Draft, not an automatic approval/publication.
   return service.save(uid,{sessionId:id(1),expectedRevision:c.revision,requestId:'initialize-lab-example-2026',draft});
  }catch(error){Object.assign(store.tables,before);throw error}
 }
 return async function handle(request){
  const url=new URL(request.url),path=url.pathname.slice(ROOT.length),method=request.method;
  if(!url.pathname.startsWith(ROOT))return null;
  try{
   if(path==='/public'&&method==='GET')return reply(200,{publication:service.publicView(url.searchParams.get('sessionId'))});
   const {uid,profile}=await identity(request);
   if((path===''||path==='/')&&method==='GET')return reply(200,{items:service.list(uid).map(item=>{if(item.canEdit)return item;const pub=service.publicView(item.sessionId);return {...item,topic:pub?pub.stations.map(s=>s.topic).join(' / '):'Archived Lab schedule'}}),canSeed:['owner','developer','adfa_general'].includes(String(profile.baseRole).toLowerCase()),labAccounts:['owner','developer','adfa_general'].includes(String(profile.baseRole).toLowerCase())?store.tables.users.filter(u=>u.active===true&&(u.baseRole==='lab'||u.officeAccess?.includes('lab'))).map(u=>({id:u.firebaseUid,name:u.displayName||'LAB account'})):[]});
   if(path==='/context'&&method==='GET')return reply(200,service.read(uid,url.searchParams.get('sessionId')));
   if(path==='/roster'&&method==='GET')return reply(200,service.roster(uid,url.searchParams.get('sessionId'),url.searchParams.get('version')));
   if(method!=='POST')return reply(405,{error:{code:'METHOD_NOT_ALLOWED',message:'This Lab operation requires POST.'}});
   let body;try{const raw=await request.text();if(raw.length>1000000)throw Error('large');body=raw?JSON.parse(raw):{}}catch(_){return reply(400,{error:{code:'INVALID_JSON',message:'Provide a valid Lab operation payload smaller than 1 MB.'}})}
   if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:{code:'INVALID_JSON',message:'A Lab operation object is required.'}});
   if(path==='/sample')return reply(200,seed(uid,profile));
   const commands={'/draft':'save','/publish':'publish','/refresh-source':'refreshSource','/copy-structure':'copyStructure','/scope':'grantScope'};
   if(!commands[path])return reply(404,{error:{code:'NOT_FOUND',message:'Lab operation not found.'}});
   return reply(200,service[commands[path]](uid,body));
  }catch(error){
   const code=error.code||'LAB_ERROR';
   const status=code==='UNAUTHENTICATED'?401:['ROLE_DENIED','ARCHIVED_YEAR'].includes(code)?403:code==='NOT_FOUND'?404:['STALE_REVISION','SOURCE_CHANGED','REQUEST_REUSE','TARGET_NOT_EMPTY'].includes(code)?409:code==='LAB_VALIDATION'?422:400;
   return reply(status,{error:{code,message:error.code?error.message:'The Lab operation could not be completed.',...(error.details?{details:error.details}:{})}});
  }
 };
}
module.exports={createLabRoutes};
