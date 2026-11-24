(function(root){
  'use strict';
  if(!root||!root.document||!root.PAWS_MULTI_YEAR_DEMO_MODEL)return;
  const doc=root.document;
  const escapeText=value=>String(value===undefined||value===null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const E=escapeText;
  const roleCanWork=role=>['owner','developer','adfa_general','adfa_regular','administrator','admin','adc','lab','hicc','visc'].includes(role);
  const isAdfa=role=>['owner','developer','adfa_general','adfa_regular','administrator','admin'].includes(role);
  const isBusiness=role=>isAdfa(role)&&role!=='developer';
  const managesYears=role=>['owner','adfa_general'].includes(role);
  const layers=[['LEC','LEC'],['SRL','SRL'],['LAB','LAB'],['ccc','CCC'],['rotation','Rotation'],['fourthYear','Fourth-Year'],['otherWork','Other Work'],['afc','AFC']];
  const defaultLayers=()=>new Set(['LEC','SRL','LAB']);
  const opts=(items,value,label)=>items.map(item=>'<option value="'+E(value(item))+'">'+E(label(item))+'</option>').join('');
  let engine=null,selectedYear='',selectedCode='',tab='calendar',dialog=null,message='',rolloverPreview=null,comparisonYear='',calendarMonth='all',lastHeaderUid='',roleBulkSnapshot=null,officeView='datasets';
  let calendarLayers=defaultLayers();
  let teachingImport=null;
  function identity(){
    const demo=root.UCVM_PAWS_DEMO_API;
    const current=root.firebase&&root.firebase.auth&&root.firebase.auth().currentUser;
    if(!demo||!current)return null;
    const row=demo.store.tables.users.find(u=>u.firebaseUid===current.uid);
    return row&&row.active!==false&&!row.mustChangePassword?{uid:row.firebaseUid,role:String(row.baseRole||'faculty').toLowerCase(),facultyId:row.facultyId||null,name:row.displayName||'Signed-in account'}:null;
  }
  function load(){
    const demo=root.UCVM_PAWS_DEMO_API;
    if(!demo||!root.PAWS_MULTI_YEAR_DEMO_MODEL)throw Error('This workspace is only available in the PAWS browser-local Demo.');
    if(!engine)engine=root.PAWS_MULTI_YEAR_DEMO_MODEL.createEngine({storage:root.localStorage,source:demo.store.tables,readSource:()=>demo.store.tables,sampleYear2027:false});
    return engine;
  }
  function actual(){const a=identity();if(!a)throw Error('Sign in to a synthetic Demo account before opening Academic Years.');return a;}
  function state(){return load().getState();}
  function current(){return state().annual[selectedYear]||{};}
  const displayName=name=>root.PAWS_FACULTY_NAME?.format(name)||name;
  const facultyName=(s,id)=>displayName(s.faculty.find(f=>f.id===id)?.name||(id?'Name unavailable':'Unassigned'));
  const eligibleFaculty=(s,date)=>s.faculty.filter(f=>f.active&&f.appointmentValid&&(!f.activationDate||date>=f.activationDate));
  const doeNumber=value=>root.PAWS_MULTI_YEAR_DEMO_MODEL.formatDoeNumber(value);
  function canEditCourse(s,a,code){if(isAdfa(a.role))return true;const fid=a.facultyId||s.users.find(u=>u.uid===a.uid)?.facultyId;return (s.roles[selectedYear]||[]).some(r=>r.status==='confirmed'&&r.facultyId===fid&&['HICC','Course Coordinator'].includes(r.roleType)&&r.scope.toUpperCase().startsWith(code));}
  function label(s,code){const row=s.annual[selectedYear]?.[code];if(!row)return code;const pub=row.published.at(-1);return code+' · '+row.title+(pub?' · Published v'+pub.version:(row.working.length?' · Draft':' · Empty Draft'))+(pub&&row.revision!==pub.revision?' · Changes Pending':'');}
  function table(headers,rows){if(!rows.length)return '<p class="paws-my-empty">No records for this view.</p>';
    return '<div class="paws-my-scroller"><table class="paws-my-table"><thead><tr>'+headers.map(h=>'<th>'+E(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(cells=>'<tr>'+cells.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function input(label,name,type,extra){return '<label class="paws-my-field"><span>'+E(label)+'</span><input name="'+E(name)+'" type="'+E(type||'text')+'" '+(extra||'')+' required></label>';}
  function select(name,items,value,label){return '<select name="'+E(name)+'">'+opts(items,value,label)+'</select>';}
  function wrap(title,body){return '<section class="paws-my-panel"><h3>'+E(title)+'</h3>'+body+'</section>';}
  function guard(fn){try{message='';const result=fn();if(!message)message='Updated in this browser Demo only.';render();syncHeader();return result}catch(error){message=error.message||String(error);render();return null;}}
  const previousYear=year=>{const n=Number(year.slice(0,4))-1;return n+'-'+String((n+1)%100).padStart(2,'0')};
  const PHASE_LABELS={planning:'Planning',review:'Planning · Review',active:'Current',archived:'Archived · Read-only'};
  const shownVersion=(role,stage)=>stage==='archived'?'Historical':isAdfa(role)?'Working / Confirmed':'Published';
  function clearYearSelection(){
    selectedCode='';rolloverPreview=null;comparisonYear='';calendarMonth='all';calendarLayers=defaultLayers();
    roleBulkSnapshot=null;officeView='datasets';
    teachingImport=null;
  }
  function maskLegacyCalendar(a,s,year){
    // The existing PAWS timetable still uses the original 2026-27 Demo data.
    // Never allow a future-year header selection to relabel that calendar.
    if(!doc.getElementById('calendar-body'))return;
    const status=s.years[year].status,masked=year!=='2026-27'||status==='archived';
    doc.body.classList.toggle('paws-my-year-preview-required',masked);
    let banner=doc.getElementById('paws-year-preview-notice');
    if(!banner){
      banner=doc.createElement('div');banner.id='paws-year-preview-notice';
      banner.className='paws-my-year-preview-notice';
      const calendar=doc.getElementById('cal-card');
      if(!calendar||!calendar.parentNode)return;
      calendar.parentNode.insertBefore(banner,calendar);
      banner.addEventListener('click',event=>{
        const button=event.target.closest('[data-my-preview-open]');
        if(button)open({year:selectedYear||load().getPreferredYear(actual()),tab:button.dataset.myPreviewOpen});
      });
    }
    banner.hidden=!masked;
    if(!masked)return;
    if(['faculty','hicc','visc'].includes(a.role)&&status==='archived'){
      banner.innerHTML='<strong>'+E(year)+' · Archived Calendar hidden</strong><p>Faculty can still view their historical Published Teaching and DOE.</p><button type="button" data-my-preview-open="teaching">View Historical Teaching</button> <button type="button" data-my-preview-open="doe">View Historical DOE</button>';
    }else{
      banner.innerHTML='<strong>'+E(year)+' · Academic Year Demo Calendar</strong><p>The original 2026-27 timetable is hidden to prevent mixing academic years. Open the Demo to view '+E(year)+' Sessions.</p><button type="button" data-my-preview-open="calendar">Open Selected Year Calendar</button>';
    }
  }
  function syncHeader(){
    const header=doc.getElementById('paws-global-academic-year'),phase=doc.getElementById('paws-global-academic-phase');
    if(!header)return;
    try{
      const a=identity();
      if(!a){
        lastHeaderUid='';selectedYear='';clearYearSelection();
        if(dialog?.open)dialog.close();
        header.innerHTML='';header.disabled=true;
        if(phase)phase.textContent='Sign in to select a year';
        return;
      }
      // Test Role Selector can change identity without navigating. Do not carry
      // an ADFAD-selected planning year or open privileged dialog into Faculty.
      const context=[a.uid,a.role,a.facultyId].join('|');
      if(lastHeaderUid&&lastHeaderUid!==context){
        selectedYear='';clearYearSelection();tab='calendar';
        if(dialog?.open)dialog.close();
      }
      lastHeaderUid=context;
      const m=load(),s=m.getState(),allowed=Object.keys(s.years).sort(),year=selectedYear&&s.years[selectedYear]?selectedYear:m.getPreferredYear(a);
      header.disabled=false;
      header.innerHTML=opts(allowed,x=>x,x=>x+' · '+PHASE_LABELS[s.years[x].status]);header.value=year;
      if(phase)phase.textContent=PHASE_LABELS[s.years[year].status]+' · '+shownVersion(a.role,s.years[year].status);
      maskLegacyCalendar(a,s,year);
    }catch(_){/* Demo auth/API bootstrap has not initialized yet */}
  }
  function viewCalendar(a,s){
    if(['faculty','hicc','visc'].includes(a.role)&&s.years[selectedYear].status==='archived')return wrap('Historical Calendar','<p class="paws-my-warning">Archived Calendar is hidden for Faculty. Use Teaching or DOE to review your historical published records.</p>');
    const m=load(),typeOf=value=>({LECTURE:'LEC',LECTURES:'LEC',LABORATORY:'LAB','SELF-REGULATED LEARNING':'SRL'}[String(value||'').toUpperCase()]||String(value||'').toUpperCase());
    const sessions=m.getCalendar(a,selectedYear).map(row=>({...row,layer:typeOf(row.sessionType),timeText:row.startTime&&row.endTime?row.startTime+'–'+row.endTime:'Check time evidence'}));
    const combined=[...sessions,...m.getCalendarLayers(a,selectedYear)].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    const months=[['all','All months'],['05','May'],['06','June'],['07','July'],['08','August'],['09','September'],['10','October'],['11','November'],['12','December'],['01','January'],['02','February'],['03','March'],['04','April']];
    const filtered=combined.filter(x=>calendarLayers.has(x.layer)&&(calendarMonth==='all'||(x.date||'').slice(5,7)===calendarMonth));
    return wrap('Calendar · '+selectedYear,
      '<p class="paws-my-muted">'+(roleCanWork(a.role)&&!['faculty','hicc','visc'].includes(a.role)?'Staff Working sessions; archived years show Published only.':'Published sessions visible to this Faculty.')+' Calendar and Course records use the same selected academic year.</p>'+
      '<div class="paws-my-calendar-controls"><label>Month '+select('month',months,x=>x[0],x=>x[1]).replace('<select ','<select data-my-calendar-month ')+'</label><span>'+E(filtered.length)+' records</span></div>'+
      '<fieldset class="paws-my-calendar-layers"><legend>Calendar Layers</legend>'+layers.map(([id,label])=>
        '<label><input type="checkbox" data-my-calendar-layer="'+E(id)+'" '+(calendarLayers.has(id)?'checked':'')+'>'+E(label)+'</label>').join('')+'</fieldset>'+
      table(['Date','Time','Course / Section','Topic or Activity','Instructor','Room'],filtered.slice(0,140).map(x=>[
        E(x.endDate&&x.endDate!==x.date?x.date+'–'+x.endDate:x.date||'Unscheduled'),E(x.timeText),
        s.annual[selectedYear][x.courseCode]?'<button type="button" data-my-open-course="'+E(x.courseCode)+'">'+E(x.courseCode)+'</button>':E(x.courseCode||'—'),
        E(x.topic||x.type||x.sessionType),E(x.instructorNames||'—'),E(x.room||'—')
      ]))+'<p class="paws-my-muted">Showing '+Math.min(filtered.length,140)+' of '+filtered.length+' matching records.</p>');
  }
  function viewTeaching(a,s){
    const sessions=load().getTeaching(a,selectedYear);
    return wrap('Published Teaching · '+selectedYear,'<p class="paws-my-muted">Shows only the last formally Published Course version, including archived years. Working Draft is never shown here.</p>'+table(['Course','Date','Topic','Instructor','DOE credit'],sessions.slice(0,200).map(x=>[E(x.courseCode),E(x.date),E(x.topic),E((x.assignments||[]).map(f=>facultyName(s,f.facultyId)).join('; ')),E(isAdfa(a.role)||['faculty','hicc','visc'].includes(a.role)?root.PAWS_MULTI_YEAR_DEMO_MODEL.sessionDoeCredit(x.assignments):'Not available')])));
  }
  function viewCourses(a,s){
    const annual=s.annual[selectedYear]||{},yearState=s.years[selectedYear].status;
    const canPlan=roleCanWork(a.role)&&a.role!=='faculty';
    const codes=Object.keys(annual).filter(code=>canEditCourse(s,a,code)||annual[code].published.length>0).sort();
    if(!codes.includes(selectedCode))selectedCode=codes[0]||'';
    const canEdit=selectedCode&&canEditCourse(s,a,selectedCode);
    let html='<div class="paws-my-two"><div>'+wrap('Annual Courses',
       '<p class="paws-my-muted">Shared Catalog, separate Course/Session/Assignment records for every academic year.</p>'+
       (isAdfa(a.role)&&yearState!=='archived'?'<form data-my-form="add-course" class="paws-my-form"><label class="paws-my-field"><span>Select from Catalog</span>'+select('code',s.catalog.filter(c=>!annual[c.code]),c=>c.code,c=>c.code+' · '+c.title)+'</label><button type="submit">Add Course</button></form>':'')+
       '<div class="paws-my-course-list">'+codes.map(code=>'<button type="button" class="'+(code===selectedCode?'active':'')+'" data-my-select-course="'+E(code)+'">'+E(label(s,code))+'</button>').join('')+'</div>')+'</div><div>';
    if(!selectedCode||!annual[selectedCode])return html+wrap('Course detail','Select a Course to inspect its Working and Published information.')+'</div></div>';
    const row=annual[selectedCode],pub=row.published.at(-1),office=row.confirmed?.at(-1),readWorking=canPlan&&canEdit,sessionRows=readWorking?row.working:pub?.sessions||[];
    let body='<p class="paws-my-muted">'+E(row.title)+' · Working revision '+E(row.revision)+' · '+(office?'Confirmed v'+E(office.version):'Confirmation pending')+' · '+(pub?'Published v'+E(pub.version):'Publication pending')+'</p>';
    if(canEdit&&yearState!=='archived'){
      if(isBusiness(a.role))body+='<button data-my-action="finalize">ADFAD Finalize Working revision</button> <button data-my-tab="office">Office Confirmation</button> ';
      if(a.role!=='developer')body+='<button data-my-action="review-publish">'+(pub?'Review & Publish Changes':'Review & Publish Course')+'</button>';
      body+='<form data-my-form="add-session" class="paws-my-form paws-my-grid">'+
        input('Date','date','date','min="'+selectedYear.slice(0,4)+'-05-01" max="'+String(Number(selectedYear.slice(0,4))+1)+'-04-30"')+
        input('Topic','topic','text','placeholder="Topic / Session"')+
        '<label class="paws-my-field"><span>Type</span>'+select('sessionType',['LEC','SRL','LAB'],x=>x,x=>x)+'</label>'+
        input('Starts','startTime','time','')+input('Ends','endTime','time','')+
        '<label class="paws-my-field"><span>Room</span><input name="room" maxlength="100"></label>'+
        '<label class="paws-my-field"><span>Group</span><input name="group" maxlength="100"></label>'+
        '<label class="paws-my-field"><span>Faculty</span>'+select('facultyId',[{id:'',name:'Unassigned'},...s.faculty.filter(f=>f.active&&f.appointmentValid)],f=>f.id,f=>f.name)+'</label>'+
        '<label class="paws-my-field"><span>Instructor Role</span>'+select('teachingRole',['Instructor','Primary','Secondary'],x=>x,x=>x)+'</label>'+
        '<label class="paws-my-field"><span>DOE credit</span><input name="doeCredit" type="number" min="0" step="0.01"></label>'+
        '<button type="submit">Add Session</button></form>';
    }
    body+=table(['Date / Topic','Assignments','Working actions'],sessionRows.slice(0,50).map(item=>{
      const editor=canEdit&&yearState!=='archived';
      const currentNames=(item.assignments||[]).map(x=>facultyName(s,x.facultyId)).join('; ');
      const edit=editor?'<form data-my-form="edit-assignment" data-session="'+E(item.id)+'" class="paws-my-inline">'+select('facultyId',[{id:'',name:'Unassigned'},...eligibleFaculty(s,item.date)],f=>f.id,f=>f.name)+'<button type="submit">Set Instructor</button></form>':'';
      return [E(item.date)+' · '+E(item.topic),E(currentNames||'Unassigned'),edit];
    }));
    body+='<p class="paws-my-muted">Showing '+Math.min(sessionRows.length,50)+' of '+sessionRows.length+' sessions.</p>';
    if(canEdit&&yearState!=='archived')body+=viewSuggestions(a,row);
    body+=wrap('Published release history',pub?table(['Version','Published by','Published at','Session count'],row.published.map(v=>[E(v.version),E(v.by),E(v.at),E(v.sessions.length)])):'<p>Not yet Published.</p>');
    return html+wrap(selectedCode+' · '+row.title,body)+'</div></div>';
  }
  function viewSuggestions(a,course){
    const rows=load().historicalSuggestions(a,selectedYear,course.code);
    if(!rows.length)return '';
    const clear='No PAWS Conflict Found';
    const eligible=rows.filter(row=>!row.assigned&&row.match==='Exact Match'&&row.candidates.length===1&&row.candidates[0].availability===clear);
    const selected=rows.slice(0,40).flatMap(row=>row.candidates.length?row.candidates.map(candidate=>[row,candidate]):[[row,null]]);
    const rendered=table(['Working Session','Match and previous source','Faculty / Role','Availability','Working / Projected DOE','Action'],selected.map(([row,candidate])=>{
      const chosen=candidate&&!row.assigned&&row.match==='Exact Match'&&candidate.availability===clear;
      return [
        E(row.date||'Unscheduled')+' · '+E(row.topic),
        E(row.match)+(row.source?' · '+E(row.source.year+' '+row.source.kind+' v'+row.source.version):'')+
          '<br><small>'+E(row.reason)+'</small>',
        candidate?E(displayName(candidate.name))+' · '+E(candidate.teachingRole)+' ('+E(candidate.frequency)+')':'—',
        E(candidate?.availability||'Check needed'),
        candidate?E(doeNumber(candidate.workingDoe))+' / '+E(doeNumber(candidate.projectedDoe)):'—',
        chosen?'<button type="button" data-my-suggest-session="'+E(row.sessionId)+'" data-my-suggest-faculty="'+E(candidate.facultyId)+
          '" data-my-revision="'+E(course.revision)+'">Accept Suggestion</button>':''
      ];
    }));
    return '<details class="paws-my-panel"><summary>Historical Teaching Suggestions · '+E(rows.length)+' Working sessions</summary>'+
      '<p class="paws-my-muted">The check uses the Demo teaching schedule and shared AFC. Accepted suggestions enter Working only. Missing credit and scheduling evidence remain visible.</p>'+
      (rows[0].source?'<button type="button" data-my-previous-year="'+E(rows[0].source.year)+'">View Previous Year</button> ':'')+
      (eligible.length?'<button type="button" data-my-exact-revision="'+E(course.revision)+'">Accept Exact Matches ('+E(eligible.length)+')</button>':'')+
      rendered+(rows.length>40?'<p class="paws-my-muted">Showing the first 40 Sessions. Exact-match review includes the full Course.</p>':'')+'</details>';
  }

  function viewOffice(a,s){
    const info=load().getOfficeProgress(a,selectedYear),writable=info.lifecycle!=='archived'&&isBusiness(a.role);
    const tabs=[['datasets','By Dataset'],['courses','By Course'],['faculty','By Faculty']];
    const count=value=>E(value??'—');
    const destination={calendar:'calendar',teaching:'courses',lab:'courses',srl:'courses',roles:'roles',doe:'doe'};
    const next=['Generated','Exported','Delivered','Confirmed Received'];
    let body='<div class="paws-my-calendar-controls" role="group" aria-label="Office progress view">'+tabs.map(([id,title])=>
      '<button type="button" data-my-office-view="'+E(id)+'" aria-pressed="'+(officeView===id)+'">'+E(title)+'</button>').join('')+'</div>';
    if(officeView==='datasets')body+=table(['Dataset','Total','Completed','Outstanding','Needs Review','Awaiting Information','Awaiting Confirmation','Status','Next Action'],
      info.datasets.map(row=>[E(row.label),count(row.total),count(row.completed),
        row.outstanding&&destination[row.dataset]?'<button type="button" data-my-tab="'+E(destination[row.dataset])+'">'+E(row.outstanding)+'</button>':count(row.outstanding),
        count(row.needsReview),count(row.awaitingInformation),count(row.awaitingConfirmation),E(row.status),E(row.nextAction)]));
    if(officeView==='courses')body+=table(['Course','Sessions','Outstanding','Status','Responsible Person','Last Confirmed','Versions'],info.courses.map(row=>[
      '<button type="button" data-my-open-course="'+E(row.code)+'">'+E(row.code)+'</button> '+E(row.title),count(row.sessions),count(row.outstanding),
      E(row.status),E(row.responsiblePerson?displayName(row.responsiblePerson):'Unassigned'),E(row.lastUpdated||'—'),
      E('Working '+row.revision+(row.confirmedVersion?' · Confirmed '+row.confirmedVersion:'')+(row.publishedVersion?' · Published '+row.publishedVersion:''))]
    ));
    if(officeView==='faculty')body+=table(['Faculty','Working Sessions','Confirmed Sessions','Annual Roles'],info.faculty.map(row=>[
      E(displayName(row.name)),count(row.sessions),count(row.confirmed),count(row.roles)
    ]));
    const current=info.courses.find(row=>row.code===selectedCode)||info.courses[0];
    if(writable&&current){
      const courseChoices=info.courses.map(row=>'<option value="'+E(row.code)+'" '+(row.code===current.code?'selected':'')+'>'+E(row.code+' · '+row.title)+'</option>').join('');
      body+=wrap('Record External Confirmation',
        '<form data-my-form="confirm-office" data-revision="'+E(current.revision)+'" class="paws-my-form">'+
        '<label class="paws-my-field"><span>Course</span><select name="code" data-my-office-course>'+courseChoices+'</select></label>'+
        '<label class="paws-my-field"><span>Confirmed by Office</span><output>'+E(displayName(a.name))+'</output></label>'+
        input('Confirmation date','confirmedOn','date','')+
        '<label class="paws-my-field"><span>Method</span>'+select('method',[['email','Email'],['excel','Excel'],['meeting','Meeting'],['other','Other']],x=>x[0],x=>x[1])+'</label>'+
        input('Responsible person','responsiblePerson','text','maxlength="150" placeholder="Last name, First name"')+
        input('Reference or notes','reference','text','maxlength="500"')+
        '<button type="submit">Confirm Working Revision '+E(current.revision)+'</button></form>');
    }
    if(writable&&info.courses.length){
      const draft=teachingImport?.preview;
      let content='<form data-my-form="calendar-import" class="paws-my-form">'+
        '<label class="paws-my-field"><span>Course</span>'+select('code',info.courses,x=>x.code,x=>x.code+' · '+x.title)+'</label>'+
        '<label class="paws-my-field"><span>Teaching Calendar JSON</span><input type="file" name="file" accept=".json,application/json" required></label>'+
        input('Source Version','sourceVersion','text','maxlength="100"')+
        '<label><input type="checkbox" name="replace"> Complete Course replacement</label><button type="submit">Preview Import</button></form>'+
        '<p class="paws-my-muted">Use a JSON array with id, courseCode, academicYear, topic, sessionType, date, startTime, endTime, and optional room and group. Existing instructors follow matching Session IDs.</p>';
      if(draft){
        content+='<p><strong>'+E(draft.year+' · '+draft.courseCode+' · '+draft.name+' · '+draft.sourceVersion)+'</strong></p>'+
          table(['Validation row','Issue'],draft.issues.map(row=>[E(row.row),E(row.message)]))+
          table(['Change','Session ID','Topic'],draft.changes.map(row=>[E(row.status),E(row.id),E(row.topic)]))+
          '<p>'+E(draft.issues.length)+' validation issues · '+E(draft.changes.filter(row=>row.status!=='Existing').length)+' affected Sessions</p>';
        if(!draft.issues.length&&draft.changes.some(row=>row.status!=='Existing'))content+='<button type="button" data-my-action="apply-calendar-import">Apply Exact Preview</button>';
      }
      body+=wrap('Teaching Calendar Import',content);
    }
    if(info.imports.length)body+=wrap('Import History',table(['Dataset','Course','Source / Version','Date','Status','Action'],info.imports.map(row=>[
      E(row.dataset),E(row.courseCode),E(row.source+' · '+row.sourceVersion),E(row.at),E(row.status),
      writable&&row.status==='Applied'?'<button type="button" data-my-recover-import="'+E(row.id)+'">Recover Previous Working Data</button>':''
    ])));
    const kinds=[['confirmed','Confirmed'],['published','Published'],['working','Working']];
    if(writable)body+=wrap('Generate Schedule Export',
      '<form data-my-form="office-export" class="paws-my-form">'+
      '<label class="paws-my-field"><span>Template</span>'+select('template',info.templates,x=>x.id,x=>x.label)+'</label>'+
      '<label class="paws-my-field"><span>Data version</span>'+select('version',kinds,x=>x[0],x=>x[1])+'</label>'+
      '<label class="paws-my-field"><span>Course scope</span>'+select('course',[{code:'',title:'All Courses'},...info.courses],x=>x.code,x=>x.code||x.title)+'</label>'+
      '<label class="paws-my-field"><span>Faculty scope</span>'+select('facultyId',[{id:'',name:'All Faculty'},...s.faculty],x=>x.id,x=>displayName(x.name))+'</label>'+
      input('Intended recipient','recipient','text','maxlength="150"')+
      '<label><input type="checkbox" name="changesOnly"> Changes since last export</label>'+
      '<button type="submit">Generate Export</button></form>');
    body+=wrap('Export and Delivery History',table(['Template','Data Version','Recipient','Generated','Rows','Status','Action'],info.exports.map(row=>{
      const status=next[next.indexOf(row.status)+1],description=Object.entries(row.sourceVersions).map(([code,v])=>
        code+' '+(v.version===null?'Working r'+v.revision:'v'+v.version)).join(', ');
      const download=row.status!=='Generated'||writable?[
        ['csv','CSV'],['xlsx','Excel']
      ].map(([format,label])=>'<button type="button" data-my-download-export="'+E(row.id)+'" data-my-export-format="'+format+'">'+label+'</button>').join(' '):'';
      const advance=writable&&status&&status!=='Exported'?'<button type="button" data-my-advance-export="'+E(row.id)+'" data-my-next-status="'+E(status)+'">Mark '+E(status)+'</button>':'';
      return [E(row.title),E(row.version)+(row.baselineExportId?' · Changes':'')+'<br><small>'+E(description)+'</small>',
        E(row.recipient),E(row.generatedAt),E(row.rowCount),E(row.status),download+' '+advance];
    })));
    return wrap('ADFAD Office · '+selectedYear,body);
  }
  function viewRollover(a,s){
    if(!roleCanWork(a.role)||a.role==='faculty')return wrap('Rollover','Planning permission required.');
    const previous=previousYear(selectedYear),source=s.annual[previous]||{},dest=s.annual[selectedYear]||{};
    const candidates=Object.keys(source).filter(code=>source[code].published.length>0&&!dest[code]).sort();
    if(s.years[selectedYear].status==='archived')return wrap('Rollover','This year is Archived and read-only.');
    let content='<p class="paws-my-muted">Optional copy from the previous year\'s <strong>last Published</strong> Course. New academic years remain empty until you select a Course. Drafts, approvals, DOE Overrides and conflict exceptions are never copied.</p>';
    if(!s.years[previous])content+='<p class="paws-my-warning">No previous academic year available.</p>';
    else if(!candidates.length)content+='<p class="paws-my-warning">Every previous Published Course is already present, or none are available. Rollover never overwrites existing annual Courses.</p>';
    else content+='<form data-my-form="rollover-preview" class="paws-my-form paws-my-rollover-form">'+
      '<div class="paws-my-rollover-sources"><label>From '+E(previous)+' · Published</label><label>To '+E(selectedYear)+' · Working</label></div>'+
      '<label class="paws-my-field"><span>Published Course</span>'+select('code',candidates,code=>code,code=>code+' · '+source[code].title)+'</label>'+
      '<fieldset class="paws-my-options"><legend>Copy fields</legend><label><input type="checkbox" checked disabled> Course basic information (required)</label>'+
      '<label><input type="checkbox" name="sessions"> Section / Session structure and topics</label>'+
      '<label><input type="checkbox" name="instructors"> Faculty Assignments (requires Sessions)</label>'+
      '<label><input type="checkbox" name="schedule"> Dates / Time / Room (requires Sessions)</label></fieldset>'+
      '<button type="submit">Preview Rollover</button></form>';
    if(rolloverPreview&&rolloverPreview.destinationYear===selectedYear){
      const p=rolloverPreview;
      content+=wrap('Confirm from Published version '+E(p.sourceReleaseVersion),
        '<p>'+E(p.code)+' · '+E(p.title)+' · '+E(p.copyCount)+' of '+E(p.sessionCount)+' Sessions selected.</p>'+
        '<p>Copy: '+E(Object.keys(p.options).filter(k=>p.options[k]).join(', '))+'.</p>'+
        (p.excludedInstructors?'<p class="paws-my-warning">'+E(p.excludedInstructors)+' inactive/ineligible instructor(s) will be excluded.</p>':'')+
        '<p class="paws-my-muted">The new Course will be a separate, unapproved Working Draft. Existing Course records will never be replaced.</p>'+
        '<button data-my-action="rollover-confirm" type="button">Confirm & Create Working Course</button>');
    }
    return wrap('Selective Course / Section Rollover',content);
  }
  function viewReview(a,s){
    if(!selectedCode||!s.annual[selectedYear]?.[selectedCode])return wrap('Publication Review','Select an annual Course in Courses & Assignments.');
    if(!canEditCourse(s,a,selectedCode))return wrap('Publication Review','Course scope permission required.');
    const p=load().previewPublication(a,selectedYear,selectedCode),d=p.diff;
    let content='<p><strong>'+E(selectedCode)+'</strong> · Working revision '+E(p.sourceRevision)+' · Current Published '+E(p.currentPublishedVersion||'None')+'</p>'+
      '<div class="paws-my-stats"><span>Added <b>'+E(d.added)+'</b></span><span>Removed <b>'+E(d.removed)+'</b></span><span>Modified <b>'+E(d.modified)+'</b></span><span>Instructor changes <b>'+E(d.assignmentChanges)+'</b></span></div>'+
      wrap('Working vs Published · Session differences',table(['Change','Topic','Session'],d.changes.slice(0,120).map(x=>[E(x.kind+(x.instructorChanged?' · instructor changed':'')),E(x.topic),E(x.sessionId)])))+
      wrap('Validation summary',p.issues.length?table(['Severity','Issue','Details','Resolve'],p.issues.map(issue=>{
        const row=s.annual[selectedYear][selectedCode].working.find(session=>session.id===issue.sessionId);
        const repairable=['INACTIVE_FACULTY','FUTURE_FACULTY_START'].includes(issue.code)&&issue.facultyId&&row&&s.years[selectedYear].status!=='archived';
        const current=issue.facultyId&&row?.assignments?.find(item=>item.facultyId===issue.facultyId);
        const replacements=repairable?eligibleFaculty(s,row.date).filter(f=>f.id!==issue.facultyId&&!row.assignments.some(x=>x!==current&&x.facultyId===f.id)):[];
        const control=repairable?'<form data-my-form="resolve-faculty-issue" class="paws-my-inline">'+
          '<input type="hidden" name="sessionId" value="'+E(issue.sessionId)+'">'+
          '<input type="hidden" name="priorFacultyId" value="'+E(issue.facultyId)+'">'+
          '<input type="hidden" name="expectedRevision" value="'+E(p.sourceRevision)+'">'+
          '<label>Replacement <select name="nextFacultyId" required><option value="" disabled selected>Choose an eligible instructor or remove</option>'+opts(replacements,f=>f.id,f=>f.name)+'<option value="__remove__">Remove this assignment (leave unassigned)</option></select></label>'+
          '<button type="submit">Resolve</button></form>':issue.sessionId?
            '<button type="button" data-my-open-course="'+E(selectedCode)+'">Open Course</button>':'—';
        return [E(issue.severity.toUpperCase()),E(issue.code),E(issue.message)+(row?'<div class="paws-my-muted">'+E(row.date||'No date')+' · '+E(row.topic||'Untitled Session')+' · '+E(row.id)+'</div>':''),control];
      })):'<p class="paws-my-pass">No blocking issues or warnings.</p>')+
      wrap('DOE impact · Published calculation on release',table(['Faculty','Before','After','Change'],p.doeImpact.map(x=>[E(facultyName(s,x.facultyId)),E(doeNumber(x.before)),E(doeNumber(x.after)),E(doeNumber(x.delta))])));
    if(s.years[selectedYear].status!=='archived')content+='<p class="paws-my-muted">Publish updates only this Course. If Published DOE is already enabled it recalculates from the new release, retaining manual Overrides for ADFAD review.</p><button data-my-action="publish-confirm" '+(p.canPublish?'':'disabled')+' type="button">'+(p.currentPublishedVersion?'Publish Changes':'Publish Course')+'</button>';
    return wrap('Publish Changes · Review & Validation',content);
  }
  function viewComparison(a,s){
    const available=Object.keys(s.years).sort(),previous=previousYear(selectedYear);
    if(!comparisonYear||!s.years[comparisonYear]||comparisonYear===selectedYear)comparisonYear=s.years[previous]?previous:(available.find(y=>y!==selectedYear)||selectedYear);
    const report=load().compareYears(a,comparisonYear,selectedYear);
    const content='<p class="paws-my-muted">Only Published Teaching and Published DOE are compared. Faculty see only their own data; DOE remains Pending when the annual policy has not been published.</p>'+
      '<div class="paws-my-calendar-controls"><label>Compare '+select('compareYear',available.filter(y=>y!==selectedYear),x=>x,x=>x).replace('<select ','<select data-my-compare-year ')+'</label><strong>against '+E(selectedYear)+'</strong></div>'+
      table(['Faculty','Teaching '+comparisonYear,'Teaching '+selectedYear,'DOE '+comparisonYear,'DOE '+selectedYear],report.rows.map(r=>[
        E(r.name),E(r.left.teachingSessions),E(r.right.teachingSessions),
        E(r.left.doeStatus==='published'?r.left.doe:r.left.doeStatus),E(r.right.doeStatus==='published'?r.right.doe:r.right.doeStatus)]));
    return wrap('Cross-year Teaching / DOE Comparison',content);
  }
  function viewDoe(a,s){const d=s.doe[selectedYear],info=load().getDoe(a,selectedYear),admin=isAdfa(a.role),working=admin?load().getWorkingDoe(a,selectedYear):[];
    let body='<p><strong>Rule Book:</strong> '+E(d.policy.status)+' · <strong>Published DOE:</strong> '+(d.released?'Available':'Pending')+'</p>';
    if(isBusiness(a.role)&&s.years[selectedYear].status!=='archived'){
      if(d.policy.status!=='approved')body+='<button data-my-action="approve-doe">Approve annual DOE rules</button> ';
      if(!d.released)body+='<button data-my-action="publish-doe">Publish initial DOE</button>';
      body+='<form data-my-form="override" class="paws-my-form"><label class="paws-my-field"><span>Faculty</span>'+select('facultyId',s.faculty,x=>x.id,x=>x.name)+'</label>'+input('Manual override','value','number','step="0.5" value="10"')+'<button type="submit">Save Override</button></form>';
    }
    if(!d.released)body+='<p class="paws-my-warning">Pending · Faculty can see published Teaching but cannot see DOE until the initial DOE release.</p>';
    if(d.released){body+=table(['Faculty','Calculated','Override','Published effective','Review'],info.items.slice(0,80).map(x=>[E(facultyName(s,x.facultyId)),E(doeNumber(x.base)),E(doeNumber(x.override)),E(doeNumber(x.effective)),E(x.needsReview?'Needs ADFAD Review':'—')]));}
    if(admin)body+=wrap('Working DOE preview (internal only)',table(['Faculty','Working credit'],working.map(x=>[E(facultyName(s,x.facultyId)),E(x.base)])));
    return wrap('DOE · '+selectedYear,body);
  }
  function viewRoles(a,s){
    const showAll=isAdfa(a.role),roles=(s.roles[selectedYear]||[]).filter(r=>showAll||r.facultyId===a.facultyId),
      archived=s.years[selectedYear].status==='archived';
    const preview=showAll?load().previewRoleConfirmations(a,selectedYear):null;
    roleBulkSnapshot=preview?{uid:a.uid,year:selectedYear,eligibleIds:preview.eligibleIds.slice()}:null;
    const eligible=preview?new Set(preview.eligibleIds):new Set(),
      blocked=preview?new Map(preview.skipped.map(x=>[x.id,x.reason])):new Map();
    const summary=preview?'<div class="paws-my-panel">'+
      '<p><strong>Draft: '+E(preview.pending)+'</strong> · Eligible: '+E(preview.eligibleIds.length)+' · Needs individual review: '+E(preview.skipped.length)+' · Already confirmed: '+E(preview.alreadyConfirmed)+'</p>'+
      (!archived&&isBusiness(a.role)?'<button type="button" data-my-action="confirm-all-roles" '+(preview.eligibleIds.length?'':'disabled')+
        '>Confirm All Eligible Drafts ('+E(preview.eligibleIds.length)+')'+(root.UCVM_TESTING_ONLY?.pendingBadge?.()||'')+'</button>':'')+
      (preview.partialYear?'<p class="paws-my-muted">Includes '+E(preview.partialYear)+' prior partial-year appointment(s). Clicking bulk confirm records ADFAD approval for their renewed dates.</p>':'')+
      (preview.skipped.length?'<p class="paws-my-muted">Ineligible, missing or future-start appointments are skipped; review them individually. No personnel eligibility rules are bypassed.</p>':'')+
      '<p class="paws-my-muted">Applies to all eligible Draft roles in '+E(selectedYear)+', including rows beyond the 200 visible below. Browser-local Demo only.</p></div>':'';
    const body='<p class="paws-my-muted">Renewal proposals use the new May–April academic year. Review eligibility and confirm each applicable appointment.</p>'+
      summary+table(['Faculty','Role','Scope','Start','End','Status','Action'],roles.slice(0,200).map(r=>{
        const explanation=blocked.get(r.id),allowed=eligible.has(r.id);
        return [E(facultyName(s,r.facultyId)),E(r.roleType),E(r.scope),E(r.start),E(r.end),
          E(r.status==='draft'?'Draft · '+(explanation||r.rolloverReason||'Review needed'):'Confirmed'),
          isBusiness(a.role)&&r.status==='draft'&&!archived?(allowed?'<button data-my-confirm-role="'+E(r.id)+'">Confirm</button>':'<span class="paws-my-muted">Ineligible</span>'):''];
      }));
    return wrap('Annual Roles & Appointments',body);
  }
  function viewArchive(a,s){if(!isAdfa(a.role)&&!['adc','lab'].includes(a.role))return wrap('Access','Office scope permission required.');const status=s.years[selectedYear].status,admin=isAdfa(a.role),isOwner=a.role==='owner';let html='<p><strong>Year status:</strong> '+E(status)+'</p>';
    if(isOwner){
      if(status==='archived')html+='<button data-my-action="restore">Restore Academic Year</button>';
      else html+='<button data-my-action="retire">Retire Academic Year</button>';
    }
    html+=wrap('Archive history',table(['Year','Archived at','Pending Course Drafts','Frozen conflicts'],s.archives.filter(x=>x.year===selectedYear).map(x=>[E(x.year),E(x.at),E(x.pending.join(', ')||'None'),E(x.conflicts.length)])));
    if(admin)html+=wrap('Live conflict check and shared AFC',
      '<p class="paws-my-muted">AFC records are shared by year. Retire freezes a conflict snapshot. Restore recalculates from the latest shared AFC.</p>'+
      '<form data-my-form="add-afc" class="paws-my-form"><label class="paws-my-field"><span>Faculty</span>'+select('facultyId',s.faculty,x=>x.id,x=>x.name)+'</label>'+input('Start','startDate','date','')+input('End','endDate','date','')+'<button type="submit">Add synthetic AFC</button></form>'+
      table(['Course','Date','Faculty'],load().getConflicts(a,selectedYear).map(x=>[E(x.courseCode),E(x.date),E(facultyName(s,x.facultyId))])));
    html+=wrap('Recent history',table(['When','Actor','Action'],s.audit.filter(x=>x.year===selectedYear).slice(-30).reverse().map(x=>[E(x.at),E(x.actor),E(x.event)])));
    return wrap('Archive / Restore',html);
  }
  function viewCatalog(a,s){let body='<p class="paws-my-muted">Global Catalog title changes apply only to courses created later. Existing annual Course snapshots remain unchanged.</p>';
    if(isAdfa(a.role))body+='<form data-my-form="update-catalog" class="paws-my-form"><label class="paws-my-field"><span>Catalog Course</span>'+select('code',s.catalog,c=>c.code,c=>c.code+' · '+c.title)+'</label>'+input('New title','title','text','maxlength="150"')+'<button type="submit">Update Catalog</button></form>';
    body+=table(['Course','Current Catalog title'],s.catalog.map(c=>[E(c.code),E(c.title)]));return wrap('Shared Course Catalog',body);
  }
  function render(){if(!dialog)return;const a=actual(),s=state();if(!s.years[selectedYear])selectedYear=load().getPreferredYear(a);
    const available=Object.keys(s.years).sort(),current=s.annual[selectedYear]||{};
    if(!current[selectedCode])selectedCode=Object.keys(current).sort()[0]||'';
    const showStaff=roleCanWork(a.role)&&a.role!=='faculty';
    const names=[['calendar','Calendar'],['teaching','Teaching'],['courses','Courses & Assignments'],['office','ADFAD Office'],['doe','DOE'],['roles','Roles'],['archive','Archive & AFC'],['catalog','Course Catalog'],['rollover','Rollover'],['review','Publish Review'],['compare','Year Comparison']];
    if(!isAdfa(a.role)&&tab==='office')tab='calendar';
    const visible=names.filter(n=>n[0]==='office'?isAdfa(a.role):n[0]==='rollover'||n[0]==='review'?showStaff:n[0]==='archive'?(isAdfa(a.role)||['adc','lab'].includes(a.role)):n[0]==='catalog'?showStaff:n[0]==='courses'?(showStaff||a.role==='faculty'):true);
    let body='';try{body=({calendar:()=>viewCalendar(a,s),teaching:()=>viewTeaching(a,s),courses:()=>viewCourses(a,s),office:()=>viewOffice(a,s),doe:()=>viewDoe(a,s),roles:()=>viewRoles(a,s),archive:()=>viewArchive(a,s),catalog:()=>viewCatalog(a,s),rollover:()=>viewRollover(a,s),review:()=>viewReview(a,s),compare:()=>viewComparison(a,s)})[tab]();}catch(error){body=wrap('Access',E(error.message))}
    const createYear=managesYears(a.role)&&s.years[selectedYear].status!=='archived'?'<button data-my-action="create-year" type="button">Create Next Year</button>':'';
    const stage=s.years[selectedYear].status,transitions={planning:['review'],review:['planning','active'],active:['review']};
    const phaseControl=isBusiness(a.role)&&stage!=='archived'?'<label>Change phase '+select('phase',[stage,...(transitions[stage]||[])],x=>x,x=>PHASE_LABELS[x]).replace('<select ','<select data-my-phase ')+'</label>':'';
    const planningDefault=managesYears(a.role)&&stage!=='archived'?(s.planningDefault?.year===selectedYear?'<span class="paws-my-phase-badge">Office planning default</span>':'<button type="button" data-my-action="planning-default">Set Office Planning Default</button>'):'';
    dialog.innerHTML='<div class="paws-my-shell"><header class="paws-my-head"><div><small>PAWS · Testing site only · Browser-local simulation</small><h2>Academic Year Workspace</h2><p>'+E(a.name)+' · '+E(a.role)+' · No database connection</p></div><button data-my-action="close" type="button" aria-label="Close Academic Year Workspace">Close ×</button></header>'+
      '<div class="paws-my-toolbar"><label>Academic Year <select data-my-year>'+opts(available,x=>x,x=>x+' · '+PHASE_LABELS[s.years[x].status])+'</select></label><span class="paws-my-phase-badge">'+E(PHASE_LABELS[stage]+' · '+shownVersion(a.role,stage))+'</span>'+phaseControl+createYear+planningDefault+'<button data-my-action="reset" type="button">Reset multi-year Demo</button></div>'+
      '<nav class="paws-my-tabs" aria-label="Multi-year test views">'+visible.map(x=>'<button class="'+(tab===x[0]?'active':'')+'" data-my-tab="'+E(x[0])+'" type="button">'+E(x[1])+'</button>').join('')+'</nav>'+
      (message?'<p class="paws-my-notice" role="status">'+E(message)+'</p>':'')+'<div class="paws-my-body">'+body+'</div></div>';
    const selectEl=dialog.querySelector('[data-my-year]');if(selectEl)selectEl.value=selectedYear;
    const monthEl=dialog.querySelector('[data-my-calendar-month]');if(monthEl)monthEl.value=calendarMonth;
    const compareEl=dialog.querySelector('[data-my-compare-year]');if(compareEl)compareEl.value=comparisonYear;
    syncHeader();
  }
  function submitAction(form){const a=actual(),m=load(),values=Object.fromEntries(new FormData(form).entries()),kind=form.dataset.myForm;
    if(kind==='add-course')m.addCourse(a,selectedYear,values.code);
    if(kind==='add-session'){
      if(!values.startTime||!values.endTime||values.startTime>=values.endTime)throw Error('End time must follow start time.');
      m.addSession(a,selectedYear,selectedCode,{date:values.date,topic:values.topic,sessionType:values.sessionType,
        startTime:values.startTime,endTime:values.endTime,room:values.room,group:values.group,
        assignments:[{facultyId:values.facultyId||null,teachingRole:values.teachingRole,doeCredit:values.doeCredit}]});
    }
    if(kind==='edit-assignment')m.editAssignment(a,selectedYear,selectedCode,form.dataset.session,values.facultyId);
    if(kind==='resolve-faculty-issue'){
      m.resolveFacultyIssue(a,selectedYear,selectedCode,values.sessionId,values.priorFacultyId,values.nextFacultyId==='__remove__'?'':values.nextFacultyId,values.expectedRevision);
      tab='review';message='Invalid instructor corrected in Working Draft. ADFAD must finalize the new revision before publishing.';
    }
    if(kind==='confirm-office'){
      const result=m.confirmOfficeCourse(a,selectedYear,values.code,Number(form.dataset.revision),values);
      message=values.code+' confirmed as v'+result.version+' for '+selectedYear+'.';
    }
    if(kind==='office-export'){
      const result=m.generateOfficeExport(a,selectedYear,{...values,changesOnly:values.changesOnly==='on'});
      message='Generated '+result.rowCount+' rows for '+selectedYear+'. Download the file from Export and Delivery History.';
    }
    if(kind==='override')m.setOverride(a,selectedYear,values.facultyId,values.value);
    if(kind==='add-afc')m.addAfc(a,{afcRecordId:'demo-afc-'+Date.now(),facultyId:values.facultyId,startDate:values.startDate,endDate:values.endDate,active:true});
    if(kind==='update-catalog')m.updateCatalog(a,values.code,values.title);
    if(kind==='rollover-preview'){rolloverPreview=m.previewRollover(a,{fromYear:previousYear(selectedYear),toYear:selectedYear,code:values.code,options:{sessions:values.sessions==='on',instructors:values.instructors==='on',schedule:values.schedule==='on'}});message='Rollover preview ready · confirm fields before copying.';}
  }
  function clickAction(action){const a=actual(),m=load();
    if(action==='close'){dialog.close();return;}
    if(action==='create-year'){
      const years=Object.keys(state().years).sort(),last=years[years.length-1],start=Number(last.slice(0,4))+1,next=start+'-'+String((start+1)%100).padStart(2,'0');
      m.createYear(a,next);clearYearSelection();selectedYear=next;tab='office';m.setPreferredYear(a,next);
    }
    if(action==='planning-default')m.setDefaultPlanningYear(a,selectedYear);
    if(action==='apply-calendar-import'){
      const item=teachingImport,draft=item?.preview;
      if(!draft||draft.year!==selectedYear)throw Error('Preview the current academic year before applying.');
      if(!root.confirm('Apply the exact '+draft.courseCode+' Teaching Calendar preview for '+selectedYear+'?'))return;
      m.commitTeachingImport(a,selectedYear,draft.courseCode,item.input,draft.signature,true);
      teachingImport=null;selectedCode=draft.courseCode;
      message='Teaching Calendar import applied to '+selectedYear+' Working.';
    }
    if(action==='finalize')m.finalizeCourse(a,selectedYear,selectedCode);
    if(action==='review-publish'){tab='review';message='Review the changes and validation results before publishing.';}
    if(action==='publish-confirm'){const p=m.previewPublication(a,selectedYear,selectedCode);if(!p.canPublish)throw Error('Publication is blocked. Resolve validation issues first.');if(root.confirm('Publish '+selectedCode+' for '+selectedYear+'? '+p.issues.filter(x=>x.severity==='warn').length+' warnings; DOE changes: '+p.doeImpact.length+'.')){m.publishCourse(a,selectedYear,selectedCode);tab='courses';}}
    if(action==='rollover-confirm'&&rolloverPreview){const p=rolloverPreview;if(root.confirm('Create '+p.code+' in '+selectedYear+' from last Published '+p.sourceYear+'? Existing Courses are never overwritten.')){m.rolloverCourse(a,{fromYear:p.sourceYear,toYear:p.destinationYear,code:p.code,options:p.options});selectedCode=p.code;rolloverPreview=null;tab='courses';}}
    if(action==='confirm-all-roles'){
      const snapshot=roleBulkSnapshot;
      if(!snapshot||snapshot.uid!==a.uid||snapshot.year!==selectedYear)throw Error('Role selection changed. Reopen Roles before confirming.');
      const result=m.confirmRolesBulk(a,selectedYear,snapshot.eligibleIds);
      tab='roles';
      message='Confirmed '+result.confirmed+' eligible Draft role(s) in this browser. '+result.skipped+' record(s) still require individual review.';
    }
    if(action==='approve-doe')m.approvePolicy(a,selectedYear);
    if(action==='publish-doe'&&root.confirm('Publish initial annual DOE for Faculty?'))m.publishDoe(a,selectedYear);
    if(action==='retire'){
      const s=state(),pending=Object.values(s.annual[selectedYear]||{}).filter(c=>!c.published.length||c.revision!==c.published.at(-1).revision).map(c=>c.code);
      if(root.confirm('Retire '+selectedYear+'? Published is official; '+pending.length+' Course(s) have unpublished Working content. Preserve all drafts read-only and freeze conflicts?'))m.retireYear(a,selectedYear,true);
    }
    if(action==='restore'&&root.confirm('Restore '+selectedYear+' and recalculate conflicts from current AFC?'))m.restoreYear(a,selectedYear);
    if(action==='reset'&&root.confirm('Reset this browser-local Academic Year Workspace?')){m.reset();clearYearSelection();selectedYear=m.getPreferredYear(a);tab='calendar';}
  }
  async function downloadOfficeExport(id,format){
    const a=actual(),m=load(),year=selectedYear,view=m.getOfficeProgress(a,year);
    const receipt=view.exports.find(row=>row.id===id);
    if(!receipt)throw Error('Export was not found in the selected year.');
    const data=format==='xlsx'
      ?await root.UCVM_PAWS_DEMO_API.officeWorkbook(m.officeExportTable(a,year,id),year)
      :{bytes:'\ufeff'+m.officeExportCsv(a,year,id),contentType:'text/csv;charset=utf-8'};
    const current=identity();
    if(!dialog?.open||selectedYear!==year||current?.uid!==a.uid||current.role!==a.role)return;
    let url;
    try{
      url=root.URL.createObjectURL(new Blob([data.bytes],{type:data.contentType}));
      const file=doc.createElement('a');
      file.href=url;file.download='paws-'+year+'-'+receipt.template+'-'+id+'.'+format;
      doc.body.appendChild(file);
      try{file.click();}finally{file.remove();}
      if(receipt.status==='Generated')m.advanceOfficeExport(a,year,id,'Exported');
      message=(format==='xlsx'?'Excel':'CSV')+' download started. Delivery status is recorded separately.';
    }finally{if(url)root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);}
  }
  async function previewCalendarFile(form){
    const target=actual(),year=selectedYear,values=new FormData(form),file=values.get('file');
    if(!file?.name||file.size>1_000_000)throw Error('Choose a Teaching Calendar JSON file up to 1 MB.');
    let records;
    try{records=JSON.parse(await file.text());}catch(_){throw Error('The file is not valid JSON.');}
    const current=identity();
    if(!dialog?.open||selectedYear!==year||current?.uid!==target.uid||current.role!==target.role)return;
    const input={name:file.name,sourceVersion:values.get('sourceVersion'),replace:values.has('replace'),records};
    guard(()=>{teachingImport={input,preview:load().previewTeachingImport(target,year,values.get('code'),input)};message='Teaching Calendar preview ready for review.';});
  }
  function open(options={}){try{
    const a=actual();load();clearYearSelection();selectedYear=options.year||load().getPreferredYear(a);tab=options.tab||'calendar';message='';
    if(dialog?.open){render();return;}
    dialog=doc.createElement('dialog');dialog.id='paws-multi-year-demo';dialog.className='paws-my-dialog';doc.body.appendChild(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();dialog=null;});
    dialog.addEventListener('click',event=>{
      const tabButton=event.target.closest('[data-my-tab]');if(tabButton){tab=tabButton.dataset.myTab;message='';render();return;}
      const progress=event.target.closest('[data-my-office-view]');if(progress){officeView=progress.dataset.myOfficeView;render();return;}
      const previous=event.target.closest('[data-my-previous-year]');if(previous){open({year:previous.dataset.myPreviousYear,tab:'teaching'});return;}
      const course=event.target.closest('[data-my-select-course],[data-my-open-course]');if(course){selectedCode=course.dataset.mySelectCourse||course.dataset.myOpenCourse;tab='courses';render();return;}
      const single=event.target.closest('[data-my-suggest-session]');if(single){guard(()=>{
        const m=load(),a=actual();
        m.acceptHistoricalSuggestions(a,selectedYear,selectedCode,Number(single.dataset.myRevision),[single.dataset.mySuggestSession],single.dataset.mySuggestFaculty);
        message='Historical suggestion accepted into Working.';
      });return;}
      const batch=event.target.closest('[data-my-exact-revision]');if(batch){guard(()=>{
        const m=load(),a=actual(),rows=m.historicalSuggestions(a,selectedYear,selectedCode);
        const ids=rows.filter(row=>!row.assigned&&row.match==='Exact Match'&&row.candidates.length===1&&row.candidates[0].availability==='No PAWS Conflict Found').map(row=>row.sessionId);
        if(!root.confirm('Accept '+ids.length+' exact historical match(es) into Working for '+selectedYear+'?'))return;
        const result=m.acceptHistoricalSuggestions(a,selectedYear,selectedCode,Number(batch.dataset.myExactRevision),ids);
        message=result.accepted+' historical suggestions accepted into Working.';
      });return;}
      const download=event.target.closest('[data-my-download-export]');if(download){
        const expectedYear=selectedYear,expectedActor=identity()?.uid;
        download.disabled=true;
        downloadOfficeExport(download.dataset.myDownloadExport,download.dataset.myExportFormat).then(()=>{
          if(dialog?.open&&selectedYear===expectedYear&&identity()?.uid===expectedActor)render();
        },error=>{
          if(dialog?.open&&selectedYear===expectedYear&&identity()?.uid===expectedActor)guard(()=>{throw error;});
        });
        return;
      }
      const advance=event.target.closest('[data-my-advance-export]');if(advance){guard(()=>{
        const status=advance.dataset.myNextStatus;
        if(root.confirm('Record '+status+' for this export?'))load().advanceOfficeExport(actual(),selectedYear,advance.dataset.myAdvanceExport,status);
      });return;}
      const recover=event.target.closest('[data-my-recover-import]');if(recover){guard(()=>{
        if(root.confirm('Recover the prior Working revision in '+selectedYear+'?'))load().recoverTeachingImport(actual(),selectedYear,recover.dataset.myRecoverImport);
      });return;}
      const role=event.target.closest('[data-my-confirm-role]');if(role){guard(()=>load().confirmRole(actual(),selectedYear,role.dataset.myConfirmRole));return;}
      const action=event.target.closest('[data-my-action]');if(action)guard(()=>clickAction(action.dataset.myAction));
    });
    dialog.addEventListener('change',event=>{if(event.target.matches('[data-my-year]'))guard(()=>{const a=actual();clearYearSelection();selectedYear=event.target.value;load().setPreferredYear(a,selectedYear);});
      if(event.target.matches('[data-my-office-course]')){selectedCode=event.target.value;render();}
      if(event.target.matches('[data-my-phase]'))guard(()=>load().setYearPhase(actual(),selectedYear,event.target.value));
      if(event.target.matches('[data-my-calendar-layer]')){
        const layer=event.target.dataset.myCalendarLayer;
        if(event.target.checked)calendarLayers.add(layer);else calendarLayers.delete(layer);
        render();
      }
      if(event.target.matches('[data-my-calendar-month]')){calendarMonth=event.target.value;render();}
      if(event.target.matches('[data-my-compare-year]')){comparisonYear=event.target.value;render();}});
    dialog.addEventListener('submit',event=>{
      event.preventDefault();
      if(event.target.dataset.myForm==='calendar-import'){
        const year=selectedYear,uid=identity()?.uid;
        previewCalendarFile(event.target).catch(error=>{if(dialog?.open&&selectedYear===year&&identity()?.uid===uid)guard(()=>{throw error;});});
      }else guard(()=>submitAction(event.target));
    });
    dialog.showModal();render();
  }catch(error){root.alert(error.message||error);}}
  function mount(){if(doc.getElementById('paws-multi-year-open'))return;
    const target=doc.querySelector('.timetable-top-actions')||doc.querySelector('.top-actions')||doc.querySelector('.ucalgary-masthead-inner');if(!target)return;
    const button=doc.createElement('button');button.type='button';button.id='paws-multi-year-open';button.className='paws-my-launch';button.textContent='Academic Years · Demo';button.title='Test multi-year management using browser-local synthetic data';
    target.insertBefore(button,target.firstChild);button.addEventListener('click',()=>open());
    const controls=doc.createElement('div');controls.className='paws-my-global-controls';
    controls.innerHTML='<label for="paws-global-academic-year">Academic year</label><select id="paws-global-academic-year" aria-label="PAWS Testing academic year"></select><span id="paws-global-academic-phase" class="paws-my-global-phase" aria-live="polite">Demo only</span>';
    target.insertBefore(controls,button);
    controls.querySelector('select').addEventListener('change',event=>guard(()=>{
      const a=actual(),year=event.target.value;load().setPreferredYear(a,year);
      // The original Beta-derived Calendar is hard-coded to 2026-27. Use the
      // academic-year Demo Calendar for every year switch; never relabel it.
      open({year,tab:'calendar'});
    }));
    root.addEventListener('ucvm-timetable-user',syncHeader);
    root.addEventListener('storage',event=>{
      if(event.key!==root.PAWS_MULTI_YEAR_DEMO_MODEL.STORAGE_KEY)return;
      engine=null;selectedYear='';clearYearSelection();
      if(dialog?.open)dialog.close();
      syncHeader();
    });
    try{root.firebase?.auth?.()?.onAuthStateChanged?.(syncHeader)}catch(_){}
    root.setTimeout?.(syncHeader,250);root.setTimeout?.(syncHeader,1200);
    syncHeader();
  }
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount);else mount();
})(typeof window==='undefined'?null:window);
