(function(root,factory){
  'use strict';
  const names=root?.PAWS_FACULTY_NAME||(typeof module==='object'&&module.exports?require('./faculty-name'):null);
  const api=factory(names);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PAWS_MULTI_YEAR_DEMO_MODEL=api;
})(typeof window==='undefined'?null:window,function(names){
  'use strict';
  const STORAGE_KEY='paws-multi-year-demo-v1';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const invalid=message=>{throw new Error(message)};
  const normalized=v=>String(v||'').trim();
  const nameFor=value=>names?.format(value)||value?.displayName||value?.name||(typeof value==='string'?normalized(value):'');
  const codeFor=v=>normalized(v).toUpperCase();
  const startOf=year=>year.slice(0,4)+'-05-01';
  const nextOf=year=>String(Number(year.slice(0,4))+1)+'-05-01';
  const endOf=year=>String(Number(year.slice(0,4))+1)+'-04-30';
  const validateYear=year=>{const m=/^(\d{4})-(\d{2})$/.exec(year||'');if(!m||Number(m[2])!==(Number(m[1])+1)%100)invalid('Invalid academic year');return year};
  const nextYear=year=>{const n=Number(year.slice(0,4))+1;return n+'-'+String((n+1)%100).padStart(2,'0')};
  const calgaryDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'});
  const currentYear=date=>{
    const parts=Object.fromEntries(calgaryDate.formatToParts(new Date(date)).map(part=>[part.type,part.value]));
    const year=Number(parts.year)-(Number(parts.month)<5?1:0);
    return year+'-'+String((year+1)%100).padStart(2,'0');
  };
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
    Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const previousYear=year=>{
    const start=Number(year.slice(0,4));
    return String(start-1)+'-'+String(start%100).padStart(2,'0');
  };
  const isFaculty=a=>['faculty','hicc','visc'].includes(normalized(a&&a.role).toLowerCase());
  const canPlan=a=>['owner','developer','adfa_general','adfa_regular','administrator','admin','adc','lab','hicc','visc'].includes(normalized(a&&a.role).toLowerCase());
  const canAdfa=a=>['owner','developer','adfa_general','adfa_regular','administrator','admin'].includes(normalized(a&&a.role).toLowerCase());
  const actorRole=a=>normalized(a?.role).toLowerCase();
  const owner=a=>actorRole(a)==='owner';
  const canManageYears=a=>['owner','adfa_general'].includes(actorRole(a));
  const canConfirm=a=>canAdfa(a)&&actorRole(a)!=='developer';
  const inCourseScope=(scope,code)=>{
    const value=codeFor(scope);
    return value===code||(value.startsWith(code)&&/^[\s:·,(/-]/.test(value.slice(code.length)));
  };
  function bootstrap(source){
    const faculty=clone(source.faculty||[]).map(f=>({id:f.facultyId,name:nameFor(f)||'Name unavailable',active:f.active!==false,activationDate:typeof f.activationDate==='string'?f.activationDate:null,appointmentValid:f.appointmentValid!==false,contractDoe:knownNumber(f.contractTeachingDoe)}));
    const users=clone(source.users||[]).map(u=>({uid:u.firebaseUid,role:u.baseRole,facultyId:u.facultyId||null,name:u.displayName||u.firebaseUid}));
    const catalog=clone(source.courses||[]).map(c=>({code:codeFor(c.courseCode),title:c.courseName||c.courseCode,curriculumYear:c.curriculumYear||null}));
    const grouping={};
    for(const raw of source.sessions||[]){
      if(raw.academicYear!=='2026-27')continue;
      const code=codeFor(raw.courseCode);
      if(!grouping[code])grouping[code]=[];
      grouping[code].push({id:raw.id,courseCode:code,date:raw.date,topic:raw.topic||'',sessionType:raw.sessionType||'',startTime:raw.startTime||'',endTime:raw.endTime||'',room:raw.room||'',...(raw.groupKey||raw.group?{group:raw.groupKey||raw.group}:{}),assignments:clone(raw.assignments||[]).map(a=>({facultyId:a.facultyId,teachingRole:a.teachingRole||'',doeCredit:knownNumber(a.doeCredit)}))});
    }
    const annual={'2026-27':{}};
    for(const [code,sessions] of Object.entries(grouping)){
      const item=catalog.find(c=>c.code===code);
      annual['2026-27'][code]={code,title:item?item.title:code,working:clone(sessions),revision:1,finalizedRevision:1,published:[{version:1,revision:1,sessions:clone(sessions),at:'2026-10-29T00:00:00.000Z',by:'demo-initial-migration'}],publishers:[]};
    }
    const roles={'2026-27':clone(source.roles||[]).map(r=>({id:r.roleAssignmentId,facultyId:r.facultyId,roleType:r.roleType,scope:r.courseOrSubjectOrRotation||'',start:r.effectiveDate&&r.effectiveDate>'2026-05-01'?r.effectiveDate:'2026-05-01',end:r.expirationDate&&r.expirationDate<'2027-04-30'?r.expirationDate:'2027-04-30',sourceEnd:r.expirationDate||'',status:'confirmed',sourceId:r.roleAssignmentId}))};
    // The historical Demo seed uses July-June appointments. One explicitly labelled
    // synthetic full-year fixture allows testers to verify eligible automatic renewal.
    if(!roles['2026-27'].some(r=>r.start<='2026-05-01'&&r.end>='2027-04-30')){
      const valid=roles['2026-27'].find(r=>r.roleType==='HICC'&&faculty.some(f=>f.id===r.facultyId&&f.active));
      if(valid)roles['2026-27'].push({...clone(valid),id:valid.id+'-full-year-demo',sourceId:valid.id+'-full-year-demo',start:'2026-05-01',end:'2027-04-30',fixture:true});
    }
    const doeRecords={};
    for(const f of faculty){
      const target=(source.targets||[]).find(t=>t.facultyId===f.id&&t.academicYear==='2026-27');
      const base=knownNumber(target?.effectiveTargetDoe)??f.contractDoe;
      const override=knownNumber(target?.overrideDoe);
      doeRecords[f.id]={facultyId:f.id,base,effective:override===null?base:override,override,needsReview:base===null&&override===null};
    }
    return {version:1,faculty,users,catalog,afc:clone(source.afcRecords||[]),years:{'2026-27':{status:'active',revision:1}},annual,roles,doe:{'2026-27':{policy:{status:'approved',copiedFrom:null},released:true,records:doeRecords,overrides:{}}},archives:[],audit:clone(source.history||[]).map(h=>({event:h.changeType||h.eventType||'legacy_change',actor:h.actorFirebaseUid||h.actorName||'',year:h.academicYear||'2026-27',at:h.changedAtUtc||h.occurredAtUtc||'',legacy:true,detail:{original:h}})),preferences:{},serial:0};
  }
  function createEngine({source={},readSource=null,storage=null,now=()=>new Date(),sampleYear2027=false}={}){
    let state;
    try{const saved=storage&&storage.getItem(STORAGE_KEY);if(saved){const decoded=JSON.parse(saved);if(decoded&&decoded.version===1&&decoded.years&&decoded.annual&&decoded.catalog)state=decoded}}catch(_){/* invalid local demo data; recreate safely */}
    if(!state)state=bootstrap(source);
    // The earlier Testing UI auto-loaded a 2027-28 sample. Never silently
    // discard a tester's manual changes; only remove known, untouched automatic
    // sample rows and leave the academic-year settings and Roles intact.
    if(!sampleYear2027){
      const wasAutoLoaded=(state.audit||[]).some(e=>e.event==='synthetic_2027_28_sample_loaded'&&e.actor==='demo-synthetic-fixture');
      const edited=(state.audit||[]).some(e=>e.year==='2027-28'&&
        e.actor!=='demo-synthetic-fixture'&&
        e.event!=='synthetic_2027_28_sample_loaded');
      if(wasAutoLoaded&&!edited&&state.annual?.['2027-28']){
        let changed=false;
        for(const [code,row] of Object.entries(state.annual['2027-28'])){
          if(row.sampleFixture&&Array.isArray(row.working)&&row.working.every(x=>String(x.id).startsWith('sample-2027-28-'))){
            delete state.annual['2027-28'][code];changed=true;
          }
        }
        if(changed){
          state.afc=(state.afc||[]).filter(row=>row.afcRecordId!=='sample-2027-28-afc');
          try{storage?.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_) { /* in-memory cleanup retained */ }
        }
      }
    }
    let lastSaved;
    try{lastSaved=storage?.getItem(STORAGE_KEY);}catch(_){/* Storage errors are reported when saving. */}
    const persist=()=>{
      if(!storage)return;
      const serialized=JSON.stringify(state);
      storage.setItem(STORAGE_KEY,serialized);
      lastSaved=serialized;
    };
    const stamp=()=>now().toISOString();
    const getState=()=>clone(state);
    const logged=(event,actor,year,detail={})=>{state.audit.push({event,actor:actor.uid||'',year,at:stamp(),detail:clone(detail)});persist()};
    function commit(event,a,year,detail,apply){
      if(storage&&storage.getItem(STORAGE_KEY)!==lastSaved)invalid('This academic workspace changed in another tab. Reload before continuing.');
      const before=clone(state);
      try{
        const result=apply();
        logged(event,a,year,detail);
        return clone(result);
      }catch(error){
        state=before;
        throw error;
      }
    }
    const who=a=>{if(!a||!normalized(a.uid)||!normalized(a.role))invalid('Signed-in demo actor required');if(!canPlan(a)&&!isFaculty(a))invalid('Unsupported role permission');return a};
    const inspect=year=>{validateYear(year);const y=state.years[year];if(!y)invalid('Academic year not found');return y};
    const editable=year=>{const y=inspect(year);if(y.status==='archived')invalid('Archived academic year is read-only');return y};
    const staff=a=>{who(a);if(!canPlan(a))invalid('Planning permission required')};
    const adfa=a=>{who(a);if(!canAdfa(a))invalid('ADFAD approval required')};
    const business=a=>{who(a);if(!canConfirm(a))invalid('ADFAD approval required for business operations')};
    const ownerOnly=a=>{who(a);if(!owner(a))invalid('Owner only')};
    const yearManager=a=>{who(a);if(!canManageYears(a))invalid('Academic year management permission required')};
    const annual=(year,code)=>{inspect(year);const row=state.annual[year]&&state.annual[year][codeFor(code)];if(!row)invalid('Annual Course not found');return row};
    const faculty=fid=>state.faculty.find(f=>f.id===fid);
    const effectiveOn=(f,date)=>Boolean(f?.active&&f?.appointmentValid&&(!f.activationDate||(date&&date>=f.activationDate)));
    function sharedAfc(){
      const rows=readSource?.()?.afcRecords;
      if(!Array.isArray(rows))return state.afc;
      const local=new Set(state.audit.filter(item=>item.event==='afc_added').map(item=>item.detail.afcRecordId));
      const imported=new Map(rows.map(item=>[item.afcRecordId,item]));
      for(const item of state.afc)if(local.has(item.afcRecordId))imported.set(item.afcRecordId,item);
      return [...imported.values()];
    }
    const afcBlocks=item=>item.active!==false&&item.availability!=='available';
    const currentRelease=row=>row.published[row.published.length-1]||null;
    const publicationRows=year=>Object.values(state.annual[year]||{}).flatMap(c=>{const release=currentRelease(c);return release?release.sessions.map(s=>({...clone(s),courseCode:c.code,courseName:c.title})):[]});
    function sumCredits(sessions){
      const values=new Map();
      for(const session of sessions){
        const assignments=new Map();
        for(const item of session.assignments||[]){
          if(!item.facultyId)continue;
          const credit=knownNumber(item.doeCredit);
          const prior=assignments.get(item.facultyId);
          assignments.set(item.facultyId,assignments.has(item.facultyId)&&prior!==credit?null:credit);
        }
        for(const [id,credit] of assignments){
          const previous=values.has(id)?values.get(id):0;
          values.set(id,previous===null||credit===null?null:previous+credit);
        }
      }
      return values;
    }
    const creditFor=(values,id)=>values.has(id)?values.get(id):0;
    const roundCredit=value=>value===null?null:Math.round(value*100)/100;
    function refreshPublishedDoe(year,afterChange){
      const d=state.doe[year];if(!d.released||d.policy.status!=='approved')return;
      const values=sumCredits(publicationRows(year)),records={};
      for(const f of state.faculty){
        const prior=d.records[f.id]||{};
        const override=d.overrides[f.id]!==undefined?Number(d.overrides[f.id]):prior.override??null;
        const base=roundCredit(creditFor(values,f.id));
        records[f.id]={facultyId:f.id,base,override,effective:override===null?base:override,
          needsReview:Boolean(base===null||prior.needsReview||(afterChange&&override!==null&&prior.base!==base))};
      }
      d.records=records;
    }
    function authorizeCourseEditor(a,row){staff(a);if(canAdfa(a))return;
      const identity=state.users.find(u=>u.uid===a.uid);
      const fid=a.facultyId||identity&&identity.facultyId;
      const source=(state.roles[row.year]||[]).filter(r=>r.status==='confirmed'&&r.facultyId===fid&&inCourseScope(r.scope,row.course.code));
      if(!row.course.publishers.includes(a.uid)&&!source.length)invalid('Course scope permission required');
    }
    function canPublish(a,year,row){if(canConfirm(a))return true;
      const uid=normalized(a&&a.uid),fid=a&&a.facultyId||state.users.find(u=>u.uid===uid)?.facultyId;
      if(row.publishers.includes(uid))return true;
      return (state.roles[year]||[]).some(r=>r.status==='confirmed'&&r.facultyId===fid&&['HICC','Course Coordinator'].includes(r.roleType)&&inCourseScope(r.scope,row.code));
    }
    const canEditCourse=(a,year,row)=>canAdfa(a)||canPublish(a,year,row);
    function setPlanningDefault(year){
      state.planningDefault={year,revision:(state.planningDefault?.revision||0)+1};
    }
    function setDefaultPlanningYear(a,year){
      yearManager(a);
      editable(year);
      return commit('default_planning_year_set',a,year,{previous:state.planningDefault?.year||null},()=>{
        setPlanningDefault(year);
        return state.planningDefault;
      });
    }
    function createYear(a,year){
      yearManager(a);
      validateYear(year);
      if(state.years[year])invalid('Academic year already exists');
      const previous=previousYear(year);
      if(!state.years[previous])invalid('Prior academic year required');
      const roles=(state.roles[previous]||[]).map((r,index)=>{
        const person=faculty(r.facultyId),eligible=effectiveOn(person,startOf(year));
        const full=r.start<=startOf(previous)&&r.end>=endOf(previous);
        const reason=full&&eligible?'eligible full year':!full?'partial year':!person?.active?'inactive Faculty':
          !person?.appointmentValid?'invalid Appointment':'future Faculty activation';
        return {...clone(r),id:'renew-'+year+'-'+index,sourceId:r.id,start:startOf(year),end:endOf(year),status:'draft',rolloverReason:reason};
      });
      return commit('year_created',a,year,{previous,roles:roles.length},()=>{
        state.years[year]={status:'planning',revision:1,referenceYear:previous};
        state.annual[year]={};
        state.doe[year]={policy:{status:'draft',copiedFrom:previous},released:false,records:{},overrides:{}};
        state.roles[year]=roles;
        setPlanningDefault(year);
        return state.years[year];
      });
    }
    // Synthetic 2027-28 showcase. It is isolated from Beta and only runs in
    // the browser-local Testing Demo (or from an explicit Owner action).
    // Existing annual Courses are never overwritten or silently replaced.
    function seed2027Sample(a){
      ownerOnly(a);
      const year='2027-28';
      const available=['VTMD 200','VTMD 304','VTMD 422','VTMD 306']
        .filter(code=>state.catalog.some(c=>c.code===code));
      for(const row of state.catalog)if(available.length<3&&!available.includes(row.code))available.push(row.code);
      const people=state.faculty.filter(f=>effectiveOn(f,'2027-09-01')).slice(0,5);
      if(available.length<3||people.length<4)invalid('Synthetic 2027-28 sample requires at least three Catalog Courses and four eligible demo Faculty.');
      if(state.years[year]){
        editable(year);
        if(Object.keys(state.annual[year]||{}).length)
          invalid('2027-28 already contains Courses; sample data will not overwrite existing work.');
      }else createYear(a,year);
      const [first,second,third]=available;
      const [f1,f2,f3,f4]=people;
      const session=(code,id,date,topic,kind,startTime,endTime,room,credits)=>({
        id:'sample-2027-28-'+id,courseCode:code,date,topic,sessionType:kind,
        startTime,endTime,room,
        assignments:credits.map(([person,amount,role])=>({facultyId:person.id,teachingRole:role,doeCredit:amount}))
      });
      const firstWorking=[
        session(first,'a1','2027-09-07','Introduction to clinical cases','LEC','08:30','09:30','HSB 1401',[[f1,2,'Lecture']]),
        session(first,'a2','2027-09-14','Small-group case review','SRL','10:00','11:50','HSB 1403',[[f2,3,'SRL']]),
        session(first,'a3','2027-09-21','Hands-on teaching lab','LAB','13:00','14:50','Clinical Skills Lab',[[f1,4,'Lab Primary'],[f3,2,'Lab Secondary']])
      ];
      const secondPublished=[
        session(second,'b1','2027-10-04','Introduction and learning objectives','LEC','08:30','09:30','HSB 1401',[[f3,2,'Lecture']]),
        session(second,'b2','2027-10-11','Applied practical','LAB','13:00','14:50','Anatomy Lab',[[f2,3,'Lab Primary']])
      ];
      const secondWorking=clone(secondPublished);
      secondWorking[0].assignments=[{facultyId:f4.id,teachingRole:'Lecture',doeCredit:2}];
      secondWorking.push(session(second,'b3','2027-10-18','New case discussion - awaiting publication','SRL','10:00','11:50','HSB 1403',[[f4,2,'SRL']]));
      const thirdWorking=[
        session(third,'c1','2028-01-18','Winter term introduction','LEC','10:00','11:50','HSB 1401',[[f3,2,'Lecture']]),
        session(third,'c2','2028-01-25','Small group discussion','SRL','10:00','11:50','HSB 1403',[[f4,3,'SRL']]),
        session(third,'c3','2028-02-01','Practical lab - AFC review example','LAB','13:00','14:50','Anatomy Lab',[[f2,4,'Lab Primary']])
      ];
      const snapshot=code=>state.catalog.find(c=>c.code===code).title;
      const release=(sessions,revision=1)=>[{version:1,revision,sessions:clone(sessions),at:'2026-11-01T00:00:00.000Z',by:'demo-synthetic-fixture'}];
      state.annual[year]={
        [first]:{code:first,title:snapshot(first),working:clone(firstWorking),revision:1,finalizedRevision:1,published:release(firstWorking),publishers:[],sampleFixture:true},
        [second]:{code:second,title:snapshot(second),working:clone(secondWorking),revision:2,finalizedRevision:1,published:release(secondPublished),publishers:[],sampleFixture:true},
        [third]:{code:third,title:snapshot(third),working:clone(thirdWorking),revision:1,finalizedRevision:0,published:[],publishers:[],sampleFixture:true}
      };
      const afcId='sample-2027-28-afc';
      if(!state.afc.some(row=>row.afcRecordId===afcId))
        state.afc.push({afcRecordId:afcId,facultyId:f2.id,startDate:'2028-02-01',endDate:'2028-02-01',active:true,sourceKind:'synthetic-demo'});
      logged('synthetic_2027_28_sample_loaded',a,year,{courses:3,workingSessions:9,publishedSessions:5});
      return {year,courses:3,workingSessions:9,publishedSessions:5};
    }
    function addCourse(a,year,code){adfa(a);editable(year);const key=codeFor(code),item=state.catalog.find(c=>c.code===key);if(!item)invalid('Course not found in shared Catalog');
      if(state.annual[year][key])invalid('Annual Course already exists');
      state.annual[year][key]={code:key,title:item.title,working:[],revision:1,finalizedRevision:0,published:[],publishers:[]};
      logged('annual_course_created',a,year,{code:key});return clone(state.annual[year][key]);
    }
    function updateCatalog(a,code,title){adfa(a);const key=codeFor(code),item=state.catalog.find(c=>c.code===key);if(!item)invalid('Catalog Course not found');if(!normalized(title))invalid('Course title required');item.title=normalized(title);logged('catalog_updated',a,'global',{code:key,title:item.title});return clone(item)}
    function addSession(a,year,code,input){staff(a);editable(year);const row=annual(year,code);if(!canEditCourse(a,year,row))invalid('Course scope permission required');
      const date=normalized(input&&input.date);if(!validDate(date)||date<startOf(year)||date>=nextOf(year))invalid('Session date outside academic year');
      const id=normalized(input.id)||'demo-session-'+(state.serial+1);
      if(Object.values(state.annual[year]).some(course=>course.working.some(s=>s.id===id)))invalid('Session already exists');
      const assignments=clone(input.assignments||[]).map(x=>({facultyId:x.facultyId||null,teachingRole:x.teachingRole||'',doeCredit:knownNumber(x.doeCredit)}));
      const assigned=assignments.map(item=>item.facultyId).filter(Boolean);
      if(new Set(assigned).size!==assigned.length)invalid('Duplicate Faculty assignment in one Session');
      for(const x of assignments){
        if(x.facultyId&&!faculty(x.facultyId))invalid('Unknown Faculty');
        if(x.facultyId&&(!faculty(x.facultyId).active||!faculty(x.facultyId).appointmentValid))invalid('Inactive or ineligible Faculty cannot be assigned');
        if(x.facultyId&&faculty(x.facultyId)?.activationDate&&date<faculty(x.facultyId).activationDate)invalid('Faculty cannot be assigned before activation date');
      }
      if(!normalized(input.id))state.serial++;
      row.working.push({id,courseCode:row.code,date,topic:normalized(input.topic),sessionType:normalized(input.sessionType),startTime:normalized(input.startTime),endTime:normalized(input.endTime),room:normalized(input.room),...(input.group?{group:normalized(input.group)}:{}),assignments});
      row.revision++;row.finalizedRevision=0;logged('session_added',a,year,{code:row.code,id});return id;
    }
    function editAssignment(a,year,code,id,fid){staff(a);editable(year);const row=annual(year,code);if(!canEditCourse(a,year,row))invalid('Course scope permission required');const s=row.working.find(x=>x.id===id);if(!s)invalid('Session not found');if(fid&&!faculty(fid))invalid('Unknown Faculty');
      if(fid&&(!faculty(fid).active||!faculty(fid).appointmentValid))invalid('Inactive or ineligible Faculty cannot be assigned');
      if(fid&&faculty(fid)?.activationDate&&(!s.date||s.date<faculty(fid).activationDate))invalid('Faculty cannot be assigned before activation date');
      const [old={},...rest]=s.assignments||[];
      if(fid&&rest.some(item=>item.facultyId===fid))invalid('Faculty is already assigned to this Session');
      s.assignments=fid?[{facultyId:fid,teachingRole:old.teachingRole||'Instructor',doeCredit:knownNumber(old.doeCredit)},...rest]:rest;
      row.revision++;row.finalizedRevision=0;logged('assignment_updated',a,year,{code:row.code,sessionId:id});return clone(s);
    }

    // Repair a *specific* ineligible, previously saved assignment without
    // replacing other Faculty or silently changing that Session's DOE credit.
    // Used by Publish Review to unblock old browser-local edits safely.
    function resolveFacultyIssue(a,year,code,sessionId,priorFacultyId,nextFacultyId,expectedRevision){
      staff(a);editable(year);const row=annual(year,code);
      if(!canEditCourse(a,year,row))invalid('Course scope permission required');
      if(Number(expectedRevision)!==row.revision)invalid('Working revision changed; reload Publish Review before fixing the assignment');
      const session=row.working.find(s=>s.id===sessionId);
      if(!session)invalid('The blocking Session no longer exists');
      const index=(session.assignments||[]).findIndex(item=>item.facultyId===priorFacultyId);
      if(index<0)invalid('The blocking Faculty assignment has changed; refresh Publish Review');
      if(effectiveOn(faculty(priorFacultyId),session.date))invalid('This instructor is eligible; no ineligible assignment to repair');
      const chosen=nextFacultyId||null;
      if(chosen&&!faculty(chosen))invalid('Replacement Faculty not found');
      if(chosen&&!effectiveOn(faculty(chosen),session.date))invalid('Replacement Faculty is inactive, ineligible or starts after this Session date');
      if(chosen&&(session.assignments||[]).some((item,i)=>i!==index&&item.facultyId===chosen))invalid('Replacement is already assigned to this Session');
      if(chosen)session.assignments[index].facultyId=chosen;
      else session.assignments.splice(index,1);
      row.revision++;row.finalizedRevision=0;
      logged('ineligible_assignment_resolved',a,year,{code:row.code,sessionId,priorFacultyId,nextFacultyId:chosen});
      return clone(session);
    }
    function finalizeCourse(a,year,code){business(a);editable(year);const row=annual(year,code);row.finalizedRevision=row.revision;logged('course_finalized',a,year,{code:row.code,revision:row.revision});return row.revision}
    function publishCourse(a,year,code){who(a);editable(year);const row=annual(year,code);if(!canPublish(a,year,row))invalid('Course publisher scope permission required');
      if(row.finalizedRevision!==row.revision)invalid('Current Working revision is not finalized');
      if(currentRelease(row)?.revision===row.revision)invalid('No changes: Working revision already published');
      const review=previewPublication(a,year,code);
      if(!review.canPublish)invalid('Course publication validation failed: '+review.issues.filter(x=>x.severity==='block').map(x=>x.code).join(', '));
      const release={version:row.published.length+1,revision:row.revision,sessions:clone(row.working),at:stamp(),by:a.uid};row.published.push(release);refreshPublishedDoe(year,true);
      logged('course_published',a,year,{code:row.code,version:release.version});return clone(release);
    }
    // Selective rollover is opt-in: only the previous year's *last Published*
    // snapshot may seed the new annual Course. Never transfer approvals or DOE.
    function previewRollover(a,request){
      staff(a);
      const fromYear=validateYear(request?.fromYear),toYear=validateYear(request?.toYear),code=codeFor(request?.code);
      editable(toYear);inspect(fromYear);
      const previous=String(Number(toYear.slice(0,4))-1)+'-'+String(Number(toYear.slice(0,4))%100).padStart(2,'0');
      if(fromYear!==previous)invalid('Rollover source must be the previous academic year');
      const source=annual(fromYear,code),release=currentRelease(source);
      if(!release)invalid('Source Course has no Published release');
      if(state.annual[toYear][code])invalid('Target Annual Course already exists; rollover never overwrites');
      if(!state.catalog.some(c=>c.code===code))invalid('Course not found in shared Catalog');
      if(!canPublish(a,toYear,{code,publishers:[]}))invalid('Course scope permission required');
      const opts=request.options||{};
      const options={course:true,sessions:opts.sessions===true,instructors:opts.instructors===true,schedule:opts.schedule===true};
      if(options.instructors&&!options.sessions)invalid('Instructor rollover requires Sessions');
      if(options.schedule&&!options.sessions)invalid('Schedule rollover requires Sessions');
      if(opts.course===false)invalid('Course snapshot is required for rollover');
      const excluded=new Set(),included=new Set();
      for(const session of release.sessions)for(const x of session.assignments||[]){
        const person=faculty(x.facultyId);
        if(person&&person.active&&person.appointmentValid)included.add(x.facultyId);
        else excluded.add(x.facultyId||'missing');
      }
      return {sourceYear:fromYear,destinationYear:toYear,code,title:source.title,sourceReleaseVersion:release.version,
        sessionCount:release.sessions.length,copyCount:options.sessions?release.sessions.length:0,
        eligibleInstructors:included.size,excludedInstructors:excluded.size,options};
    }
    function shiftDate(date,years){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return '';
      const [y,m,d]=date.split('-').map(Number);
      const last=new Date(Date.UTC(y+years,m,0)).getUTCDate();
      return String(y+years)+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(d,last)).padStart(2,'0');
    }
    function rolloverCourse(a,request){
      const preview=previewRollover(a,request),source=annual(preview.sourceYear,preview.code),release=currentRelease(source),options=preview.options;
      const course={code:preview.code,title:source.title,working:[],revision:1,finalizedRevision:0,published:[],publishers:[],
        rollover:{sourceYear:preview.sourceYear,sourceReleaseVersion:release.version,options,at:stamp(),actor:a.uid}};
      if(options.sessions){
        const years=Number(preview.destinationYear.slice(0,4))-Number(preview.sourceYear.slice(0,4));
        course.working=release.sessions.map(session=>({
          id:'demo-rollover-'+(++state.serial),courseCode:preview.code,
          date:options.schedule?shiftDate(session.date,years):'',topic:session.topic||'',sessionType:session.sessionType||'',
          startTime:options.schedule?session.startTime||'':'',endTime:options.schedule?session.endTime||'':'',
          room:options.schedule?session.room||'':'',
          assignments:options.instructors?(session.assignments||[]).filter(x=>{const f=faculty(x.facultyId);return f?.active&&f?.appointmentValid&&(!f.activationDate||(options.schedule&&shiftDate(session.date,years)>=f.activationDate));}).map(clone):[]
        }));
      }
      state.annual[preview.destinationYear][preview.code]=course;
      logged('course_rolled_over',a,preview.destinationYear,{sourceYear:preview.sourceYear,code:preview.code,
        release:preview.sourceReleaseVersion,options,excludedInstructors:preview.excludedInstructors});
      return clone(course);
    }
    function setYearPhase(a,year,phase){
      business(a);const item=editable(year),next=normalized(phase).toLowerCase();
      const allowed={planning:['review'],review:['planning','active'],active:['review']};
      if(next===item.status)return clone(item);
      if(!allowed[item.status]?.includes(next))invalid('Invalid year phase transition');
      item.status=next;item.revision++;logged('year_phase_changed',a,year,{phase:next});return clone(item);
    }
    function previewPublication(a,year,code){
      who(a);const y=inspect(year),row=annual(year,code),published=currentRelease(row),issues=[];
      const problem=(severity,code,message,sessionId='',facultyId=null)=>issues.push({severity,code,message,sessionId,...(facultyId?{facultyId}:{})});
      if(y.status==='archived')problem('block','ARCHIVED','The academic year is archived');
      if(!canPublish(a,year,row))problem('block','SCOPE_DENIED','Course publication permission required');
      if(row.finalizedRevision!==row.revision)problem('block','NOT_FINALIZED','Current Working revision is not finalized');
      if(published?.revision===row.revision)problem('block','NO_CHANGES','Working revision already Published');
      const before=published?.sessions||[],after=row.working||[],past=new Map(before.map(x=>[x.id,x])),newMap=new Map(after.map(x=>[x.id,x]));
      const diff={added:after.filter(x=>!past.has(x.id)).length,removed:before.filter(x=>!newMap.has(x.id)).length,modified:0,assignmentChanges:0,changes:[]};
      for(const s of after){
        const old=past.get(s.id);
        if(!old){diff.changes.push({kind:'added',sessionId:s.id,topic:s.topic||''});continue;}
        const beforeAssignments=JSON.stringify(old.assignments||[]),afterAssignments=JSON.stringify(s.assignments||[]);
        const updated=['date','topic','sessionType','startTime','endTime','room'].some(k=>(old[k]||'')!==(s[k]||''))||beforeAssignments!==afterAssignments;
        if(updated){diff.modified++;diff.changes.push({kind:'modified',sessionId:s.id,topic:s.topic||'',instructorChanged:beforeAssignments!==afterAssignments});}
        if(beforeAssignments!==afterAssignments)diff.assignmentChanges++;
      }
      for(const s of before)if(!newMap.has(s.id))diff.changes.push({kind:'removed',sessionId:s.id,topic:s.topic||''});
      const oldDoe=sumCredits(before),newDoe=sumCredits(after),faculties=new Set([...oldDoe.keys(),...newDoe.keys()]);
      const doeImpact=[...faculties].map(facultyId=>{
        const previous=creditFor(oldDoe,facultyId),next=creditFor(newDoe,facultyId);
        return {facultyId,before:previous,after:next,delta:previous===null||next===null?null:roundCredit(next-previous)};
      }).filter(x=>x.delta!==0);
      const seen=new Map();
      for(const s of after){
        const date=s.date||'';
        if(!date)problem('block','UNSCHEDULED_SESSION','Session needs a scheduled date',s.id);
        else if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date<startOf(year)||date>=nextOf(year))
          problem('block','INVALID_DATE','Session date is outside this academic year',s.id);
        if(s.startTime&&s.endTime&&s.endTime<=s.startTime)problem('block','INVALID_TIME','End time must follow start time',s.id);
        if(Boolean(s.startTime)!==Boolean(s.endTime))problem('block','INVALID_TIME','Both start and end time are required',s.id);
        if(!(s.assignments||[]).some(x=>x.facultyId))problem('warn','UNASSIGNED_INSTRUCTOR','Session has no instructor',s.id);
        if(!s.room)problem('warn','UNASSIGNED_ROOM','Room not selected',s.id);
        for(const x of s.assignments||[]){
          // An explicit unassigned placeholder is not an inactive Faculty record.
          if(!x.facultyId)continue;
          const f=faculty(x.facultyId);
          if(!f||!f.active||!f.appointmentValid)problem('block','INACTIVE_FACULTY',(!f?'Unknown Faculty assignment':f.name)+' is inactive or ineligible for '+(s.topic||'this Session')+' ('+(date||'unscheduled')+'). Replace or remove this assignment before publishing.',s.id,x.facultyId);
          if(date&&f?.activationDate&&date<f.activationDate)problem('block','FUTURE_FACULTY_START',f.name+' starts '+f.activationDate+', after the Session date '+date+'. Choose an eligible replacement.',s.id,x.facultyId);
          if(date)for(const afc of sharedAfc()){
            if(afcBlocks(afc)&&afc.facultyId===x.facultyId&&date>=afc.startDate&&date<=afc.endDate)
              problem('warn','AFC_CONFLICT','Instructor has an AFC overlap',s.id);
          }
        }
        if(date&&s.startTime&&s.endTime){
          const key=date;
          const overlaps=seen.get(key)||[];
          for(const old of overlaps){
            if(s.startTime<old.endTime&&s.endTime>old.startTime){
              if(s.room&&s.room===old.room)problem('warn','ROOM_CONFLICT','Room overlaps another session',s.id);
              if((s.assignments||[]).some(x=>old.facultyIds.includes(x.facultyId)))problem('warn','INSTRUCTOR_CONFLICT','Instructor overlaps another session',s.id);
            }
          }
          overlaps.push({room:s.room,startTime:s.startTime,endTime:s.endTime,facultyIds:(s.assignments||[]).map(x=>x.facultyId)});seen.set(key,overlaps);
        }
      }
      // Check current Working sessions in other Courses of this same year;
      // publication cannot validate room/instructor use in isolation.
      const otherSessions=Object.entries(state.annual[year]||{})
        .filter(([key])=>key!==row.code)
        .flatMap(([courseCode,c])=>(c.working||[]).map(session=>({courseCode,session})));
      for(const session of after){
        if(!session.date||!session.startTime||!session.endTime)continue;
        for(const other of otherSessions){
          const x=other.session;
          if(x.date!==session.date||!x.startTime||!x.endTime||session.startTime>=x.endTime||session.endTime<=x.startTime)continue;
          if(session.room&&session.room===x.room)
            problem('warn','ROOM_CONFLICT','Room overlaps '+other.courseCode+' in the same academic year',session.id);
          const facultyIds=new Set((x.assignments||[]).map(a=>a.facultyId).filter(Boolean));
          if((session.assignments||[]).some(a=>a.facultyId&&facultyIds.has(a.facultyId)))
            problem('warn','INSTRUCTOR_CONFLICT','Instructor overlaps '+other.courseCode+' in the same academic year',session.id);
        }
      }
      return {year,code:row.code,sourceRevision:row.revision,currentPublishedVersion:published?.version||null,
        diff,doeImpact,issues,canPublish:!issues.some(x=>x.severity==='block')};
    }
    function compareYears(a,fromYear,toYear){
      who(a);inspect(fromYear);inspect(toYear);
      const staffView=canAdfa(a),officeView=['adc','lab'].includes(a.role);
      const people=staffView||officeView?state.faculty:state.faculty.filter(f=>f.id===a.facultyId);
      const measure=(year,facultyId)=>{
        const teachingSessions=publicationRows(year).filter(s=>(s.assignments||[]).some(x=>x.facultyId===facultyId)).length;
        const published=state.doe[year];const allowed=staffView||(!officeView&&facultyId===a.facultyId);
        const item=allowed&&published?.released?published.records[facultyId]:null;
        return {teachingSessions,doeStatus:allowed?(published?.released?'published':'pending'):'restricted',doe:item?item.effective:null};
      };
      return {fromYear,toYear,rows:people.map(f=>({facultyId:f.id,name:f.name,
        left:measure(fromYear,f.id),right:measure(toYear,f.id)}))};
    }
    function approvePolicy(a,year){business(a);editable(year);state.doe[year].policy.status='approved';logged('doe_policy_approved',a,year);return true}
    function publishDoe(a,year){business(a);editable(year);const d=state.doe[year];if(d.policy.status!=='approved')invalid('Approved DOE rules required');d.released=true;refreshPublishedDoe(year,false);logged('doe_initial_published',a,year);return clone(d.records)}
    function setOverride(a,year,fid,value){business(a);editable(year);if(!faculty(fid))invalid('Unknown Faculty');if(!Number.isFinite(Number(value)))invalid('Invalid override');
      const d=state.doe[year];d.overrides[fid]=Number(value);if(d.released){const row=d.records[fid]||{facultyId:fid,base:0};row.override=Number(value);row.effective=Number(value);row.needsReview=false;d.records[fid]=row}
      logged('doe_override_set',a,year,{facultyId:fid});return true;
    }
    function getTeaching(a,year){who(a);inspect(year);return publicationRows(year).map(s=>({...s,assignments:(s.assignments||[]).filter(x=>!isFaculty(a)||x.facultyId===a.facultyId).map(x=>(isFaculty(a)||canAdfa(a))?x:{facultyId:x.facultyId,teachingRole:x.teachingRole})})).filter(s=>!isFaculty(a)||s.assignments.length)}
    function getCalendar(a,year){who(a);const y=inspect(year);if(isFaculty(a)&&y.status==='archived')invalid('Archived Calendar is hidden from Faculty');
      const rows=isFaculty(a)?publicationRows(year):Object.values(state.annual[year]||{}).flatMap(c=>(y.status==='archived'?(currentRelease(c)?.sessions||[]):c.working).map(s=>({...s,courseName:c.title,courseCode:c.code})));
      return rows.map(s=>({id:s.id,courseCode:s.courseCode,courseName:s.courseName,date:s.date,topic:s.topic,sessionType:s.sessionType,startTime:s.startTime,endTime:s.endTime,room:s.room,
        instructorNames:(s.assignments||[]).map(x=>faculty(x.facultyId)?.name||'Unassigned').join('; ')}));
    }
    function getDoe(a,year){who(a);inspect(year);if(!isFaculty(a)&&!canAdfa(a))invalid('DOE access denied');const d=state.doe[year];if(!d.released)return{status:'pending',items:[]};
      const items=Object.values(d.records).filter(r=>!isFaculty(a)||r.facultyId===a.facultyId).map(clone);return{status:'published',items};
    }
    function getWorkingDoe(a,year){
      adfa(a);inspect(year);
      const values=sumCredits(Object.values(state.annual[year]||{}).flatMap(course=>course.working));
      return state.faculty.map(f=>({facultyId:f.id,base:roundCredit(creditFor(values,f.id))}));
    }
    function conflictRows(year){const rows=[],afcRows=sharedAfc();
      for(const s of Object.values(state.annual[year]||{}).flatMap(c=>c.working.map(x=>({...x,courseCode:c.code}))))for(const x of s.assignments||[])for(const afc of afcRows){if(!afcBlocks(afc)||afc.facultyId!==x.facultyId)continue;if(s.date>=afc.startDate&&s.date<=afc.endDate){rows.push({courseCode:s.courseCode,sessionId:s.id,date:s.date,facultyId:x.facultyId,sourceId:afc.afcRecordId});}}
      return rows;
    }
    const officeTemplates=Object.freeze({
      'dvm-schedule':{label:'DVM Office Teaching Schedule',type:null},
      'lab-schedule':{label:'LAB Schedule',type:'LAB'},
      'course-assignments':{label:'Course Coordinator Teaching Assignments',type:null,courseRequired:true},
      'faculty-teaching':{label:'Faculty Individual Teaching Schedule',type:null,facultyRequired:true}
    });
    const exportStatuses=['Generated','Exported','Delivered','Confirmed Received'];
    const confirmedRelease=row=>row.confirmed?.at(-1)||null;
    const clockPattern=/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    const hasTime=session=>clockPattern.test(session.startTime||'')&&clockPattern.test(session.endTime||'')&&
      session.startTime.slice(0,5)<session.endTime.slice(0,5);
    const withInstructor=session=>(session.assignments||[]).some(assignment=>assignment.facultyId);
    const isCurrentReceipt=row=>[confirmedRelease(row),currentRelease(row)].some(receipt=>receipt?.revision===row.revision);
    const exportHistory=year=>state.officeExports?.[year]||[];
    const exportMetadata=record=>{
      const {records,changes,...metadata}=record;
      return {...metadata,rowCount:(changes||records).length};
    };
    const sessionKind=value=>({LECTURE:'LEC',LECTURES:'LEC','SELF-REGULATED LEARNING':'SRL',LABORATORY:'LAB'}[codeFor(value)]||codeFor(value));
    const activityCategories=Object.freeze({
      ccc:['ccc','CCC'],rotation_participant:['rotation','Rotation'],fourth_year:['fourthYear','Fourth-Year'],
      clinical_day:['otherWork','Clinical day / PPVM'],vetm581_rounds:['otherWork','VETM 581 rounds'],
      vetm571_clinical_pharmacology:['otherWork','VETM 571 clinical pharmacology'],
      vetm591_presentations:['otherWork','VETM 591 presentations'],teaching_excellence:['otherWork','Teaching excellence']
    });
    function liveActivities(year){
      const raw=(readSource?.()||source).activities||[];
      const records=new Map();
      for(const item of raw){
        const category=Object.hasOwn(activityCategories,item.category)?activityCategories[item.category]:null;
        if(!category||item.academicYear!==year||item.active===false||!item.activityId)continue;
        const scoped=validDate(item.startDate)&&validDate(item.endDate)&&item.startDate<=item.endDate&&
          item.startDate>=startOf(year)&&item.endDate<=endOf(year);
        const times=Array.isArray(item.timeEvidence)?item.timeEvidence.filter(time=>validDate(time.date)&&
          time.date>=item.startDate&&time.date<=item.endDate&&hasTime(time)).map(time=>({
            date:time.date,startTime:time.startTime,endTime:time.endTime
          })):[];
        records.set(item.activityId,{
          id:item.activityId,layer:category[0],type:category[1],courseCode:item.courseCode||'',
          facultyId:item.facultyKey||item.facultyId||null,instructorNames:item.staffingLabel||'',
          date:item.startDate,endDate:item.endDate,scoped,times
        });
      }
      return [...records.values()];
    }
    function workActivities(year){
      if(inspect(year).status!=='archived')return liveActivities(year);
      return [...state.archives].reverse().find(item=>item.year===year)?.activities||[];
    }
    function getCalendarLayers(a,year){
      who(a);
      const archived=inspect(year).status==='archived';
      if(archived&&isFaculty(a))invalid('Archived Calendar is hidden from Faculty');
      const live=workActivities(year).filter(row=>row.scoped);
      const canSeePerson=id=>canAdfa(a)||(Boolean(id)&&id===a.facultyId);
      const rows=live.filter(row=>!isFaculty(a)||canSeePerson(row.facultyId)).map(row=>{
        const {facultyId,times,scoped,...fields}=row;
        return {...fields,instructorNames:fields.instructorNames||nameFor(faculty(facultyId)?.name),
          timeText:row.date===row.endDate&&times.length===1?times[0].startTime+'–'+times[0].endTime:'Check time evidence'};
      });
      const absence=archived?([...state.archives].reverse().find(item=>item.year===year)?.absence||[]):afcLayer(year);
      return rows.concat(absence.filter(row=>canSeePerson(row.facultyId)).map(({facultyId,...row})=>({
        ...row,instructorNames:nameFor(faculty(facultyId)?.name)
      })));
    }
    function afcLayer(year){
      return sharedAfc().filter(item=>afcBlocks(item)&&validDate(item.startDate)&&validDate(item.endDate)&&
        item.startDate<=endOf(year)&&item.endDate>=startOf(year)).map(item=>({
        id:item.afcRecordId,facultyId:item.facultyId,layer:'afc',type:'Unavailable',
        date:item.startDate<startOf(year)?startOf(year):item.startDate,
        endDate:item.endDate>endOf(year)?endOf(year):item.endDate,timeText:'All day'
      }));
    }

    function confirmOfficeCourse(a,year,code,expectedRevision,input){
      business(a);
      editable(year);
      const row=annual(year,code);
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==row.revision)invalid('Working revision changed. Review the current Course.');
      if(confirmedRelease(row)?.revision===row.revision)invalid('This Working revision is already confirmed.');
      const method=normalized(input?.method).toLowerCase(),confirmedOn=input?.confirmedOn;
      const responsiblePerson=normalized(input?.responsiblePerson),reference=normalized(input?.reference);
      if(!['email','excel','meeting','other'].includes(method)||!validDate(confirmedOn))invalid('Choose a confirmation method and valid date.');
      if(!responsiblePerson||responsiblePerson.length>150||!reference||reference.length>500)
        invalid('Provide a responsible person and a confirmation reference.');
      const review=previewPublication(a,year,row.code);
      const issues=review.issues.filter(issue=>issue.severity==='block'&&!['NO_CHANGES','NOT_FINALIZED'].includes(issue.code));
      if(issues.length||!row.working.length||row.working.some(session=>!hasTime(session)||!withInstructor(session)))
        invalid('Complete scheduling details and resolve blocking issues before confirming this Course.');
      const receipt={version:(row.confirmed?.length||0)+1,revision:row.revision,by:a.uid,at:stamp(),
        method,confirmedOn,responsiblePerson,reference,sessions:clone(row.working)};
      return commit('office_course_confirmed',a,year,{code:row.code,version:receipt.version,revision:row.revision,method,confirmedOn},()=>{
        (row.confirmed??=[]).push(receipt);
        return receipt;
      });
    }

    function getOfficeProgress(a,year){
      adfa(a);
      const lifecycle=inspect(year).status;
      const courses=Object.values(state.annual[year]||{}).sort((a,b)=>a.code.localeCompare(b.code));
      const roleRows=state.roles[year]||[],people=new Map();
      const liveConflicts=lifecycle==='archived'?getConflicts(a,year):conflictRows(year);
      const conflicts=new Set(liveConflicts.map(item=>item.courseCode+'|'+item.sessionId));
      const courseRows=courses.map(row=>{
        const confirmed=isCurrentReceipt(row),receipt=confirmedRelease(row);
        const items=row.working.map(session=>{
          const needsReview=conflicts.has(row.code+'|'+session.id)||(session.assignments||[]).some(assignment=>
            assignment.facultyId&&!effectiveOn(faculty(assignment.facultyId),session.date));
          return {sessionId:session.id,courseCode:row.code,type:sessionKind(session.sessionType),
            missingDate:!validDate(session.date)||!hasTime(session),assigned:withInstructor(session),confirmed,needsReview};
        });
        for(const session of row.working)for(const id of new Set((session.assignments||[]).map(x=>x.facultyId).filter(Boolean))){
          if(!people.has(id))people.set(id,{name:faculty(id)?.name||'Name unavailable',sessions:0,confirmed:0,roles:0});
          const person=people.get(id);
          person.sessions++;
          if(confirmed)person.confirmed++;
        }
        return {code:row.code,title:row.title,revision:row.revision,confirmedVersion:receipt?.version||null,
          confirmedRevision:receipt?.revision||null,confirmedOn:receipt?.confirmedOn||null,
          publishedVersion:currentRelease(row)?.version||null,responsiblePerson:receipt?.responsiblePerson||null,
          lastUpdated:receipt?.at||currentRelease(row)?.at||null,sessions:items.length,
          outstanding:items.filter(item=>!item.confirmed).length,
          status:!items.length?'Awaiting Information':confirmed?'Confirmed':items.some(item=>item.needsReview)?'Needs Review':
            items.every(item=>!item.missingDate&&item.assigned)?'Awaiting Confirmation':'In Progress',items};
      });
      for(const role of roleRows){
        if(!people.has(role.facultyId))people.set(role.facultyId,{name:faculty(role.facultyId)?.name||'Name unavailable',sessions:0,confirmed:0,roles:0});
        people.get(role.facultyId).roles++;
      }
      const sessions=courseRows.flatMap(row=>row.items);
      const activities=workActivities(year);
      function summarize(dataset,label,items,nextAction){
        const counts={dataset,label,total:items.length||null,completed:0,outstanding:items.length||null,needsReview:0,
          awaitingInformation:0,awaitingConfirmation:0,nextAction};
        for(const item of items){
          if(item.confirmed)counts.completed++;
          else if(item.needsReview)counts.needsReview++;
          else if(item.missingDate||item.assigned===false)counts.awaitingInformation++;
          else counts.awaitingConfirmation++;
        }
        if(items.length)counts.outstanding-=counts.completed;
        counts.status=!items.length?'Awaiting Information':counts.outstanding===0?'Confirmed':counts.needsReview?'Needs Review':
          counts.awaitingConfirmation===counts.outstanding?'Awaiting Confirmation':'In Progress';
        return counts;
      }
      const datasets=[
        summarize('calendar','Teaching Calendar',sessions.map(item=>({...item,assigned:true})),'Check dates and times'),
        summarize('teaching','Scheduled Teaching',sessions,'Review Course assignments'),
        summarize('lab','LAB',sessions.filter(item=>item.type==='LAB'),'Review LAB assignments'),
        summarize('srl','SRL',sessions.filter(item=>item.type==='SRL'),'Review SRL assignments'),
        summarize('roles','Roles',roleRows.map(row=>({confirmed:row.status==='confirmed',needsReview:Boolean(roleApprovalIssue(year,row))})),'Review annual appointments'),
        ...[['ccc','CCC'],['rotation','Rotation'],['fourthYear','Fourth-Year'],['trainees','Trainees'],['otherWork','Other Work']].map(([key,label])=>
          summarize(key,label,activities.filter(row=>row.layer===key).map(row=>({
            confirmed:false,needsReview:!row.scoped,assigned:Boolean(row.facultyId),missingDate:!row.times.length
          })),'Verify the source in its existing workspace')),
        summarize('doe','DOE',Object.values(state.doe[year]?.records||{}).map(row=>({
          confirmed:state.doe[year].released&&row.effective!==null&&!row.needsReview,
          needsReview:row.needsReview,missingDate:row.effective===null
        })),'Review annual DOE and its source'),
        summarize('exports','Exports',exportHistory(year).map(row=>({confirmed:row.status==='Confirmed Received'})),'Check export and delivery status')
      ];
      return {year,lifecycle,revision:inspect(year).revision,datasets,courses:courseRows.map(({items,...rest})=>rest),
        faculty:[...people.values()].map(person=>({...person,name:nameFor(person.name)})).sort((a,b)=>a.name.localeCompare(b.name)),
        imports:(state.officeImports?.[year]||[]).map(({before,...receipt})=>receipt).reverse(),
        exports:exportHistory(year).map(exportMetadata).reverse(),
        templates:Object.entries(officeTemplates).map(([id,template])=>({id,...template}))};
    }

    function previewTeachingImport(a,year,code,input){
      business(a);
      editable(year);
      const course=annual(year,code),name=normalized(input?.name),sourceVersion=normalized(input?.sourceVersion);
      if(!name||name.length>180||!sourceVersion||sourceVersion.length>100||typeof input?.replace!=='boolean'||
        !Array.isArray(input?.records)||!input.records.length||input.records.length>750)
        invalid('Supply a source name, version and 1 to 750 Session records.');
      const prior=new Map(course.working.map(row=>[row.id,row]));
      const otherIds=new Set(Object.values(state.annual[year]).filter(row=>row.code!==course.code).flatMap(row=>row.working.map(session=>session.id)));
      const seen=new Set(),issues=[],working=[],changes=[];
      const keys=['id','courseCode','academicYear','topic','sessionType','date','startTime','endTime','room','group'];
      for(const [index,record] of input.records.entries()){
        const row=index+1;
        if(!record||typeof record!=='object'||Array.isArray(record)||
          Object.entries(record).some(([key,value])=>!keys.includes(key)||typeof value!=='string')){
          issues.push({row,message:'Only Teaching Calendar fields are permitted.'});
          continue;
        }
        const id=normalized(record.id),topic=normalized(record.topic),date=record.date;
        const sessionType=sessionKind(record.sessionType),startTime=normalized(record.startTime),endTime=normalized(record.endTime);
        if(!/^[a-z0-9._:-]{1,80}$/i.test(id)||seen.has(id)||otherIds.has(id)){
          issues.push({row,message:'Session ID is missing, duplicated or belongs to another Course.'});
          continue;
        }
        seen.add(id);
        if(record.academicYear!==year||codeFor(record.courseCode)!==course.code||!validDate(date)||date<startOf(year)||date> endOf(year)){
          issues.push({row,message:'Session belongs to a different Course or academic year.'});
          continue;
        }
        if(!topic||topic.length>500||!['LEC','SRL','LAB'].includes(sessionType)||!hasTime({startTime,endTime})||
          normalized(record.room).length>100||normalized(record.group).length>100){
          issues.push({row,message:'Complete the Topic, Session Type and scheduled time.'});
          continue;
        }
        const old=prior.get(id);
        const next={id,courseCode:course.code,topic,sessionType,date,startTime,endTime,room:normalized(record.room),
          ...(normalized(record.group)?{group:normalized(record.group)}:{}),assignments:clone(old?.assignments||[])};
        working.push(next);
        const fields=['topic','sessionType','date','startTime','endTime','room','group'];
        const status=!old?'Added':fields.some(key=>normalized(old[key])!==normalized(next[key]))?'Changed':'Existing';
        changes.push({id,topic,status});
      }
      for(const previous of course.working.filter(row=>!seen.has(row.id))){
        if(input.replace)changes.push({id:previous.id,topic:previous.topic,status:'Pending removal'});
        else working.push(clone(previous));
      }
      return {year,courseCode:course.code,revision:course.revision,name,sourceVersion,replace:input.replace,
        issues,changes,working,signature:JSON.stringify([year,course.code,course.revision,name,sourceVersion,input.replace,working])};
    }
    function commitTeachingImport(a,year,code,input,expected,approved){
      const preview=previewTeachingImport(a,year,code,input);
      if(approved!==true||preview.signature!==expected)invalid('The exact Teaching Calendar preview must be confirmed again.');
      if(preview.issues.length)invalid('Resolve validation issues before applying the import.');
      if(!preview.changes.some(row=>row.status!=='Existing'))invalid('No changes for this Teaching Calendar.');
      const course=annual(year,code),imports=state.officeImports?.[year]||[];
      if(imports.some(record=>record.courseCode===course.code&&record.sourceVersion===preview.sourceVersion&&record.status==='Applied'))
        invalid('This source version already has an applied import for the Course.');
      return commit('teaching_calendar_import_applied',a,year,{course:course.code,sourceVersion:preview.sourceVersion,source:preview.name},()=>{
        const receipt={id:'calendar-import-'+(++state.serial),dataset:'Teaching Calendar',year,courseCode:course.code,
          source:preview.name,sourceVersion:preview.sourceVersion,fromRevision:course.revision,
          appliedRevision:course.revision+1,status:'Applied',by:a.uid,at:stamp(),changes:preview.changes,validationIssues:0,before:clone(course.working)};
        course.working=preview.working;
        course.revision++;
        course.finalizedRevision=0;
        state.officeImports??={};
        (state.officeImports[year]??=[]).push(receipt);
        const {before,...result}=receipt;
        return result;
      });
    }
    function recoverTeachingImport(a,year,id){
      business(a);
      editable(year);
      const receipt=state.officeImports?.[year]?.find(row=>row.id===id&&row.status==='Applied');
      if(!receipt)invalid('Applied Teaching Calendar import not found for this year.');
      const course=annual(year,receipt.courseCode);
      if(course.revision!==receipt.appliedRevision||confirmedRelease(course)?.revision===course.revision||
        currentRelease(course)?.revision===course.revision)invalid('The imported revision changed or was confirmed. Review it before recovery.');
      return commit('teaching_calendar_import_recovered',a,year,{id,course:course.code},()=>{
        course.working=clone(receipt.before);
        course.revision++;
        course.finalizedRevision=0;
        receipt.status='Recovered';
        receipt.recoveredBy=a.uid;
        receipt.recoveredAt=stamp();
        return {revision:course.revision};
      });
    }
    function generateOfficeExport(a,year,input){
      business(a);
      editable(year);
      const templateId=normalized(input?.template);
      const template=Object.hasOwn(officeTemplates,templateId)?officeTemplates[templateId]:null;
      const version=input?.version,recipient=normalized(input?.recipient),course=codeFor(input?.course),facultyId=normalized(input?.facultyId);
      if(!template||!['working','confirmed','published'].includes(version)||!recipient||recipient.length>150||
        typeof input?.changesOnly!=='boolean')invalid('Choose an export template, data version and recipient.');
      if((template.courseRequired&&!course)||(template.facultyRequired&&!facultyId))invalid('Select the required Course or Faculty.');
      if(course)annual(year,course);
      if(facultyId&&!faculty(facultyId))invalid('Faculty not found.');
      const records=[],sourceVersions={};
      for(const row of Object.values(state.annual[year]||{})){
        if(course&&course!==row.code)continue;
        const release=version==='confirmed'?confirmedRelease(row):version==='published'?currentRelease(row):row;
        if(!release)continue;
        sourceVersions[row.code]={revision:release.revision,version:release.version??null};
        for(const session of release.sessions||release.working){
          if(template.type&&sessionKind(session.sessionType)!==template.type)continue;
          const assignments=(session.assignments||[]).filter(x=>!facultyId||x.facultyId===facultyId);
          if(facultyId&&!assignments.length)continue;
          records.push({key:row.code+'|'+session.id,year,course:row.code,topic:session.topic,type:session.sessionType,
            date:session.date,start:session.startTime,end:session.endTime,room:session.room,
            instructor:assignments.map(x=>nameFor(faculty(x.facultyId)?.name)||'Unassigned').join('; '),
            instructorRole:assignments.map(x=>x.teachingRole||'').join('; '),
            assignmentSignature:JSON.stringify(assignments.map(x=>[x.facultyId,x.teachingRole]).sort())});
        }
      }
      if(!Object.keys(sourceVersions).length)invalid('The selected year has no data in that version and scope.');
      records.sort((a,b)=>normalized(a.date).localeCompare(normalized(b.date))||
        normalized(a.start).localeCompare(normalized(b.start))||a.key.localeCompare(b.key));
      const prior=[...exportHistory(year)].reverse().find(row=>row.key===JSON.stringify([templateId,version,recipient,course,facultyId])&&row.status!=='Generated');
      if(input.changesOnly&&!prior)invalid('Download one complete export in this scope before generating changes.');
      let changes=null;
      if(input.changesOnly){
        const oldRows=new Map(prior.records.map(row=>[row.key,row]));
        changes=[];
        for(const row of records){
          const old=oldRows.get(row.key);
          oldRows.delete(row.key);
          if(!old)changes.push({...row,change:'Added'});
          else{
            const fields=['topic','type','date','start','end','room','instructor','instructorRole','assignmentSignature'];
            if(fields.some(field=>row[field]!==old[field]))changes.push({...row,change:'Changed'});
          }
        }
        for(const old of oldRows.values())changes.push({...old,change:'Cancelled'});
      }
      return commit('office_export_generated',a,year,{template:templateId,version,recipient,records:(changes||records).length},()=>{
        const id='office-export-'+(++state.serial);
        const row={id,year,key:JSON.stringify([templateId,version,recipient,course,facultyId]),template:templateId,
          title:template.label,version,sourceVersions,recipient,course,facultyId,by:a.uid,generatedAt:stamp(),status:'Generated',
          baselineExportId:input.changesOnly?prior.id:null,records,changes};
        state.officeExports??={};
        (state.officeExports[year]??=[]).push(row);
        return {...exportMetadata(row),rows:changes||records};
      });
    }

    function getOfficeExport(a,year,id){
      adfa(a);
      inspect(year);
      const row=exportHistory(year).find(item=>item.id===id);
      if(!row)invalid('Export record not found for this year.');
      return row;
    }
    function advanceOfficeExport(a,year,id,status){
      business(a);
      editable(year);
      const row=getOfficeExport(a,year,id);
      if(exportStatuses.indexOf(status)!==exportStatuses.indexOf(row.status)+1)invalid('Select the next delivery status in order.');
      return commit('office_export_status_changed',a,year,{id,from:row.status,to:status},()=>{
        row.status=status;
        row.statusBy=a.uid;
        row.statusAt=stamp();
        return exportMetadata(row);
      });
    }
    function officeExportTable(a,year,id){
      const receipt=getOfficeExport(a,year,id);
      const columns=[['Academic Year','year'],['Course','course'],['Topic','topic'],['Type','type'],['Date','date'],
        ['Start','start'],['End','end'],['Room','room'],['Faculty','instructor'],['Instructor Role','instructorRole']];
      if(receipt.changes)columns.push(['Change','change']);
      const rows=(receipt.changes||receipt.records).map(row=>columns.map(([,field])=>row[field]??''));
      return {source:'schedule',label:receipt.title,columns:columns.map(([label,id])=>({label,id,type:'text'})),
        rows,total:rows.length};
    }
    function officeExportCsv(a,year,id){
      const table=officeExportTable(a,year,id);
      const cell=value=>{
        const raw=String(value??''),text=/^[\s\x00-\x1f]*[=+@-]/u.test(raw)?"'"+raw:raw;
        return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
      };
      return [table.columns.map(column=>column.label).join(','),...table.rows.map(row=>row.map(cell).join(','))].join('\r\n');
    }
    const comparable=value=>normalized(value).normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
    const groupFor=session=>comparable(session.groupKey||session.group);
    function availabilityFor(year,session,id,additional=[]){
      if(!effectiveOn(faculty(id),session.date))return 'Ineligible Faculty';
      if(!validDate(session.date)||!hasTime(session))return 'Check needed';
      if(sharedAfc().some(item=>afcBlocks(item)&&item.facultyId===id&&session.date>=item.startDate&&session.date<=item.endDate))
        return 'Unavailable';
      let uncertainActivity=false;
      for(const work of liveActivities(year)){
        if(work.facultyId!==id||session.date<work.date||session.date>work.endDate)continue;
        const times=work.times.filter(time=>time.date===session.date);
        if(!work.scoped||!times.length)uncertainActivity=true;
        if(times.some(time=>session.startTime.slice(0,5)<time.endTime.slice(0,5)&&time.startTime.slice(0,5)<session.endTime.slice(0,5)))return 'Busy';
      }
      const assigned=Object.values(state.annual[year]).flatMap(course=>course.working)
        .filter(other=>other.id!==session.id&&(other.assignments||[]).some(item=>item.facultyId===id));
      const scheduled=[...assigned,...additional.filter(other=>other.facultyId===id)];
      if(scheduled.some(other=>other.date===session.date&&hasTime(other)&&
        session.startTime.slice(0,5)<other.endTime.slice(0,5)&&other.startTime.slice(0,5)<session.endTime.slice(0,5)))
        return 'Busy';
      if(uncertainActivity||scheduled.some(other=>!validDate(other.date)||(other.date===session.date&&!hasTime(other))))return 'Check needed';
      return 'No PAWS Conflict Found';
    }

    function historicalSuggestions(a,year,code){
      staff(a);
      const course=annual(year,code);
      if(!canEditCourse(a,year,course))invalid('Course scope permission required');
      const previous=previousYear(year),past=state.annual[previous]?.[course.code];
      const published=past&&currentRelease(past),confirmed=past&&confirmedRelease(past);
      const release=published||confirmed;
      const source=release?{year:previous,version:release.version,kind:published?'Published':'Confirmed'}:null;
      const workingCredits=canAdfa(a)?sumCredits(Object.values(state.annual[year]).flatMap(row=>row.working)):null;
      return course.working.map(target=>{
        const topic=comparable(target.topic);
        const base={sessionId:target.id,topic:target.topic,sessionType:target.sessionType,date:target.date,
          source,candidates:[],assigned:withInstructor(target)};
        if(!past)return {...base,match:'No Match',reason:'No prior annual Course record.'};
        if(!source||!topic)return {...base,match:'Course History Only',reason:'No dated Topic and confirmed teaching evidence to match.'};
        const topicRows=release.sessions.filter(prior=>comparable(prior.topic)===topic);
        if(!topicRows.length)return {...base,match:'New Topic',reason:'This Topic does not occur in the prior release.'};
        const rows=topicRows.filter(prior=>sessionKind(prior.sessionType)===sessionKind(target.sessionType)&&groupFor(prior)===groupFor(target));
        const declaredRoles=new Set((target.assignments||[]).map(item=>comparable(item.teachingRole)).filter(Boolean));
        const candidates=new Map();
        for(const prior of rows)for(const item of prior.assignments||[]){
          if(!item.facultyId||!faculty(item.facultyId))continue;
          const role=comparable(item.teachingRole);
          if(declaredRoles.size&&!declaredRoles.has(role))continue;
          if(!declaredRoles.size&&(sessionKind(target.sessionType)==='LAB'||!['instructor','primary'].includes(role)))continue;
          const key=item.facultyId+'|'+role;
          if(candidates.has(key)){candidates.get(key).frequency++;continue;}
          const slot=(target.assignments||[]).find(line=>!line.facultyId&&comparable(line.teachingRole)===role);
          const credit=knownNumber(slot?.doeCredit);
          const working=workingCredits?creditFor(workingCredits,item.facultyId):null;
          candidates.set(key,{facultyId:item.facultyId,name:faculty(item.facultyId).name,teachingRole:item.teachingRole,
            previousSessionId:prior.id,previousCourse:course.code,previousTopic:prior.topic,previousType:prior.sessionType,
            frequency:1,availability:availabilityFor(year,target,item.facultyId),
            workingDoe:canAdfa(a)?working:null,projectedDoe:canAdfa(a)&&working!==null&&credit!==null?working+credit:null});
        }
        if(!candidates.size)return {...base,match:'Possible Match',reason:'Topic matches. Type, group or instructor role needs review.'};
        const matches=[...candidates.values()].sort((a,b)=>b.frequency-a.frequency||a.name.localeCompare(b.name)||a.teachingRole.localeCompare(b.teachingRole));
        return {...base,match:'Exact Match',reason:'Same Course, Topic, Session Type and applicable instructor context.',
          candidates:matches};
      });
    }

    function acceptHistoricalSuggestions(a,year,code,expectedRevision,ids,chosenFacultyId=null){
      staff(a);
      editable(year);
      const course=annual(year,code);
      if(!canEditCourse(a,year,course))invalid('Course scope permission required');
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==course.revision)invalid('Working revision changed. Refresh historical suggestions.');
      if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length||(chosenFacultyId&&ids.length!==1))
        invalid('Select distinct Working Sessions for review.');
      const suggestions=new Map(historicalSuggestions(a,year,code).map(row=>[row.sessionId,row]));
      const plans=[];
      for(const id of ids){
        const result=suggestions.get(id);
        const session=course.working.find(row=>row.id===id);
        const matches=(result?.candidates||[]).filter(item=>!chosenFacultyId||item.facultyId===chosenFacultyId);
        if(!session||result?.match!=='Exact Match'||result.assigned||matches.length!==1)
          invalid('Review each ambiguous, assigned or unmatched Session individually.');
        const candidate=matches[0];
        if(availabilityFor(year,session,candidate.facultyId,plans)!=='No PAWS Conflict Found')
          invalid('Review Faculty availability or a possible conflict before accepting suggestions.');
        const slot=(session.assignments||[]).find(item=>!item.facultyId&&comparable(item.teachingRole)===comparable(candidate.teachingRole));
        plans.push({session,id,facultyId:candidate.facultyId,role:candidate.teachingRole,slot,
          date:session.date,startTime:session.startTime,endTime:session.endTime,source:result.source,previousSessionId:candidate.previousSessionId});
      }
      return commit('historical_suggestions_accepted',a,year,{course:course.code,items:plans.map(plan=>({
        sessionId:plan.id,facultyId:plan.facultyId,source:plan.source,previousSessionId:plan.previousSessionId
      }))},()=>{
        for(const plan of plans){
          if(plan.slot)plan.slot.facultyId=plan.facultyId;
          else plan.session.assignments.push({facultyId:plan.facultyId,teachingRole:plan.role,doeCredit:null});
        }
        course.revision++;
        course.finalizedRevision=0;
        return {accepted:plans.length,revision:course.revision};
      });
    }
    function getConflicts(a,year){staff(a);if(!canAdfa(a)&&!['adc','lab'].includes(normalized(a.role).toLowerCase()))invalid('Office scope permission required');const y=inspect(year);if(y.status==='archived')return clone([...state.archives].reverse().find(v=>v.year===year)?.conflicts||[]);return clone(conflictRows(year));}
    function addAfc(a,input){adfa(a);if(!faculty(input.facultyId))invalid('Unknown Faculty');if(!input.startDate||!input.endDate||input.startDate>input.endDate)invalid('Invalid AFC dates');
      if(state.afc.some(x=>x.afcRecordId===input.afcRecordId))invalid('Duplicate AFC');state.afc.push(clone(input));logged('afc_added',a,'shared',{afcRecordId:input.afcRecordId});return true;
    }
    function retireYear(a,year,confirmed=false){ownerOnly(a);const y=editable(year);if(confirmed!==true)invalid('Retire confirmation required');
      const conflicts=conflictRows(year);const pending=Object.values(state.annual[year]||{}).filter(c=>!currentRelease(c)||c.revision!==currentRelease(c).revision).map(c=>c.code);
      const snapshot={year,at:stamp(),actor:a.uid,priorStatus:y.status,conflicts:clone(conflicts),activities:liveActivities(year),
        absence:afcLayer(year),published:Object.fromEntries(Object.entries(state.annual[year]).map(([code,c])=>[code,currentRelease(c)?.version||null])),pending};
      return commit('year_retired',a,year,{pending:pending.length,conflicts:conflicts.length},()=>{
        state.archives.push(snapshot);y.status='archived';y.revision++;
        return snapshot;
      });
    }
    function restoreYear(a,year){ownerOnly(a);const y=inspect(year);if(y.status!=='archived')invalid('Academic year is not archived');y.status=[...state.archives].reverse().find(x=>x.year===year)?.priorStatus||'active';y.revision++;const count=conflictRows(year).length;logged('year_restored',a,year,{liveConflicts:count});return{liveConflicts:count};}
    function copyHistorical(a,year,code,sessionId,sourceId){staff(a);editable(year);const row=annual(year,code);if(!canPublish(a,year,row))invalid('Course scope permission required');const s=row.working.find(x=>x.id===sessionId);if(!s)invalid('Target Session not found');
      const previous=String(Number(year.slice(0,4))-1)+'-'+String(Number(year.slice(0,4))%100).padStart(2,'0');const history=publicationRows(previous).find(x=>x.id===sourceId&&x.courseCode===row.code);
      if(!history||!history.assignments.length)invalid('Published historical assignment not found');const chosen=history.assignments.find(x=>effectiveOn(faculty(x.facultyId),s.date));if(!chosen)invalid('Historical Faculty no longer eligible');
      s.assignments=clone([chosen]);row.revision++;row.finalizedRevision=0;logged('historical_assignment_copied',a,year,{code:row.code,sourceId,sessionId});return clone(chosen);
    }
    // Bulk approval is an explicit ADFAD action, not automatic year rollover.
    // A partial-year renewal may be confirmed after ADFAD review, but inactive,
    // invalid, future-start or out-of-year records must never be auto-approved.
    function roleApprovalIssue(year,r){
      const person=faculty(r.facultyId);
      if(!person)return 'Unknown Faculty';
      if(!person.active)return 'Inactive Faculty';
      if(!person.appointmentValid)return 'Invalid Faculty appointment';
      if(!r.roleType||!r.scope)return 'Missing role type or scope';
      if(!r.start||!r.end||r.start>r.end||r.start<startOf(year)||r.end>endOf(year))return 'Role dates outside selected academic year';
      if(person.activationDate&&r.start<person.activationDate)return 'Faculty starts after role start';
      return '';
    }
    function previewRoleConfirmations(a,year){
      adfa(a);inspect(year);
      const all=state.roles[year]||[],pending=all.filter(r=>r.status==='draft'),eligible=[],skipped=[];
      for(const r of pending){
        const reason=roleApprovalIssue(year,r);
        if(reason)skipped.push({id:r.id,facultyId:r.facultyId,reason});
        else eligible.push({id:r.id,facultyId:r.facultyId,rolloverReason:r.rolloverReason||''});
      }
      return {year,pending:pending.length,alreadyConfirmed:all.filter(r=>r.status==='confirmed').length,
        eligibleIds:eligible.map(r=>r.id),eligible:clone(eligible),skipped:clone(skipped),
        partialYear:eligible.filter(r=>r.rolloverReason==='partial year').length};
    }
    function confirmRolesBulk(a,year,expectedEligibleIds){
      business(a);editable(year);
      if(!Array.isArray(expectedEligibleIds)||new Set(expectedEligibleIds).size!==expectedEligibleIds.length||
        expectedEligibleIds.some(id=>typeof id!=='string'))invalid('Invalid bulk role confirmation selection');
      const current=previewRoleConfirmations(a,year);
      if(JSON.stringify(expectedEligibleIds)!==JSON.stringify(current.eligibleIds))
        invalid('Draft role approvals changed. Refresh the Roles page before confirming.');
      if(!current.eligibleIds.length)return {confirmed:0,skipped:current.skipped.length,pending:current.pending};
      const ids=new Set(current.eligibleIds);
      for(const r of state.roles[year]||[])if(ids.has(r.id))r.status='confirmed';
      logged('annual_roles_confirmed_bulk',a,year,{count:ids.size,roleIds:[...ids],skipped:current.skipped.length,partialYearReviewed:current.partialYear});
      return {confirmed:ids.size,skipped:current.skipped.length,pending:current.pending};
    }
    function confirmRole(a,year,id){
      business(a);editable(year);
      const role=(state.roles[year]||[]).find(r=>r.id===id);
      if(!role)invalid('Role not found');
      if(role.status!=='draft')invalid('Role is not draft');
      const reason=roleApprovalIssue(year,role);
      if(reason)invalid('Cannot confirm this Role: '+reason);
      role.status='confirmed';
      logged('annual_role_confirmed',a,year,{roleId:id});
      return clone(role);
    }
    function setPreferredYear(a,year){who(a);inspect(year);state.preferences[a.uid]={year,defaultRevision:state.planningDefault?.revision||0};persist()}
    function getPreferredYear(a){
      who(a);
      const actual=currentYear(now()),fallback=state.years[actual]?actual:Object.keys(state.years).sort()[0];
      if(isFaculty(a))return fallback;
      const wanted=state.preferences[a.uid];
      const defaultYear=state.planningDefault?.year;
      if(canAdfa(a)&&state.years[defaultYear]&&state.years[defaultYear].status!=='archived'&&
        wanted?.defaultRevision!==state.planningDefault.revision)return defaultYear;
      const saved=typeof wanted==='string'?wanted:wanted?.year;
      return state.years[saved]?saved:fallback;
    }
    function reset(){state=bootstrap(source);if(sampleYear2027)seed2027Sample({uid:'demo-synthetic-fixture',role:'owner'});persist();return getState()}
    if(sampleYear2027&&!state.years['2027-28'])seed2027Sample({uid:'demo-synthetic-fixture',role:'owner'});
    return Object.freeze({getState,createYear,seed2027Sample,addCourse,previewRollover,rolloverCourse,setYearPhase,previewPublication,compareYears,updateCatalog,addSession,editAssignment,resolveFacultyIssue,finalizeCourse,publishCourse,approvePolicy,publishDoe,setOverride,getTeaching,getCalendar,getCalendarLayers,getDoe,getWorkingDoe,getConflicts,addAfc,retireYear,restoreYear,copyHistorical,confirmRole,previewRoleConfirmations,confirmRolesBulk,setPreferredYear,getPreferredYear,setDefaultPlanningYear,confirmOfficeCourse,getOfficeProgress,historicalSuggestions,acceptHistoricalSuggestions,previewTeachingImport,commitTeachingImport,recoverTeachingImport,generateOfficeExport,advanceOfficeExport,officeExportTable,officeExportCsv,reset,currentYear});
  }
  // UX-04: a missing DOE value is shown as a dash, never as 0.00; unknown
  // session credit is reported as not recorded rather than counted as 0.
  const knownNumber=value=>(typeof value!=='number'&&typeof value!=='string')||(typeof value==='string'&&!value.trim())||!Number.isFinite(Number(value))?null:Number(value);
  function formatDoeNumber(value){const n=knownNumber(value);return n===null?'—':n.toFixed(2);}
  function sessionDoeCredit(assignments){
    const values=(Array.isArray(assignments)?assignments:[]).map(a=>knownNumber(a&&a.doeCredit));
    const known=values.filter(v=>v!==null);
    if(!known.length)return 'Not recorded';
    const total=known.reduce((n,v)=>n+v,0).toFixed(2);
    return known.length===values.length?total:total+' + not recorded';
  }
  return Object.freeze({createEngine,STORAGE_KEY,currentYear,validateYear,formatDoeNumber,sessionDoeCredit});
});
