'use strict';
const {createScheduleWorkflow}=require('./schedule-workflow');
function createScheduleWorkflowRoutes({store,verify,findUser}={}){
 const service=createScheduleWorkflow({store}),root='/api/v1/schedule-workflow';
 const reply=(status,jsonBody)=>({status,jsonBody,headers:{'Cache-Control':'no-store'}});
 return async function handle(request){
  const url=new URL(request.url),path=url.pathname.slice(root.length);
  if(url.pathname!==root&&!url.pathname.startsWith(root+'/'))return null;
  try{
   let decoded;try{decoded=await verify(String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''));}catch(_){return reply(401,{error:{code:'UNAUTHENTICATED',message:'Sign in to the synthetic Testing Demo.'}})}
   const u=await findUser(decoded.uid);
   if(!u||u.active!==true||u.mustChangePassword!==false)return reply(403,{error:{code:'ROLE_DENIED',message:'An active ready Demo user is required.'}});
   if((!path||path==='/')&&request.method==='GET')return reply(200,service.list(decoded.uid));
   const action={'/draft':'saveDraft','/publish':'publish','/suggest':'suggest','/faculty':'confirmFaculty'}[path];
   if(!action)return reply(404,{error:{code:'NOT_FOUND',message:'Workflow operation not found.'}});
   if(request.method!=='POST')return reply(405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}});
   let body;try{const t=await request.text();if(t.length>100000)throw Error('limit');body=JSON.parse(t)}catch(_){return reply(400,{error:{code:'INVALID_JSON',message:'Provide a valid workflow object smaller than 100 KB.'}})}
   if(!body||Array.isArray(body)||typeof body!=='object')return reply(400,{error:{code:'INVALID_JSON',message:'Workflow body must be an object.'}});
   return reply(200,service[action](decoded.uid,body));
  }catch(e){const code=e.code||'WORKFLOW_ERROR',status=code==='ROLE_DENIED'?403:code==='NOT_FOUND'?404:code==='STALE_REVISION'||code==='DUPLICATE_SESSION'?409:422;
   return reply(status,{error:{code,message:e.code?e.message:'The schedule operation failed.'}});
  }
 };
}
module.exports={createScheduleWorkflowRoutes};
