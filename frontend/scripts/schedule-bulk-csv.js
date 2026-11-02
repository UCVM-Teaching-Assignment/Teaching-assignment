(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PAWS_SCHEDULE_BULK_CSV=api;
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const aliases={
  courseNumber:['course number','course code','course','course #','course no','course id','coursecode'],
  year:['year','curriculum year','dvm year','yr','class year'],
  date:['date','session date','class date'],
  time:['time','time range','session time','time slot'],
  startTime:['start time','start','begin time','starts'],
  endTime:['end time','end','finish time','ends'],
  title:['session title','course title','topic','title','session name'],
  room:['room number','room','location','room #'],
  sessionType:['session type','type','activity type'],
  suggestedFaculty:['suggested faculty','faculty suggestion','suggest faculty'],
  academicYear:['academic year','academic session']
 };
 const key=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
 const colMap=new Map(Object.entries(aliases).flatMap(([name,values])=>values.map(label=>[key(label),name])));
 function delimiterFromHead(line){
  let quoted=false,commas=0,tabs=0;
  for(let i=0;i<line.length;i++){
   const c=line[i];
   if(c==='"'){if(quoted&&line[i+1]==='"'){i++;continue;}quoted=!quoted;}
   else if(!quoted){if(c===',')commas++;if(c==='\t')tabs++;}
  }
  return tabs>commas?'\t':',';
 }
 function rowsOf(text,delimiter){
  const rows=[],row=[],source=String(text).replace(/^\uFEFF/,'');let value='',quoted=false;
  for(let i=0;i<source.length;i++){
   const ch=source[i];
   if(ch==='"'){
    if(quoted&&source[i+1]==='"'){value+='"';i++;}
    else quoted=!quoted;
   }else if(!quoted&&ch===delimiter){row.push(value);value='';}
   else if(!quoted&&(ch==='\n'||ch==='\r')){
    if(ch==='\r'&&source[i+1]==='\n')i++;
    row.push(value);value='';
    if(row.some(v=>String(v).trim()))rows.push(row.slice());
    row.length=0;
   }else value+=ch;
  }
  if(quoted)throw Error('An imported CSV field contains an unclosed quotation mark.');
  row.push(value);
  if(row.some(v=>String(v).trim()))rows.push(row);
  return rows;
 }
 function parseBulkSchedule(text){
  const raw=String(text||'');
  if(!raw.trim())throw Error('Choose a CSV/TSV file or paste an Excel table.');
  if(raw.length>1048576)throw Error('The schedule source exceeds 1 MB.');
  const delimiter=delimiterFromHead(raw.replace(/^\uFEFF/,'').split(/\r?\n/)[0]);
  const data=rowsOf(raw,delimiter);
  if(data.length<2)throw Error('Include a header row and at least one Session.');
  const columns=[],seen=new Set();
  for(const header of data[0]){
   const name=colMap.get(key(header));
   if(name&&seen.has(name))throw Error('Duplicate column: '+header+'.');
   columns.push(name||null);if(name)seen.add(name);
  }
  const must=['courseNumber','year','date'];
  if(must.some(k=>!seen.has(k))||(!seen.has('time')&&!(seen.has('startTime')&&seen.has('endTime'))))
   throw Error('Missing required column: Course Number, Year, Date and either Time or Start Time + End Time.');
  const rows=data.slice(1).map((cells,i)=>{
   if(cells.length!==columns.length)throw Error('Row '+(i+2)+' has '+cells.length+' columns, expected '+columns.length+'.');
   const result={};
   for(let j=0;j<columns.length;j++)if(columns[j])result[columns[j]]=String(cells[j]||'').trim();
   return result;
  });
  return {rows,headers:columns.filter(Boolean),delimiter};
 }
 const template=()=>[
  'Course Number,Year,Date,Start Time,End Time,Session Type,Session Title,Room Number,Suggested Faculty',
  'VTMD 304,2,2026-11-04,08:30,10:30,LEC,,,'
 ].join('\n')+'\n';
 const OFFICE_COLUMNS={
  lab:[['Session ID','sessionId'],['Course Number','courseNumber'],['Date','date'],
   ['Start Time','startTime'],['End Time','endTime'],['Run Key','runKey'],['Room Number','room'],
   ['Capacity','capacity'],['Attendance','attendance'],['Group Code','groupCode'],
   ['Student IDs','studentIds'],['Student Names','studentNames'],['Expected Lab Revision','expectedRevision']],
  adfa:[['Session ID','sessionId'],['Course Number','courseNumber'],['Date','date'],
   ['Start Time','startTime'],['End Time','endTime'],['Faculty ID','facultyId'],
   ['Teaching Role','teachingRole'],['Credited Hours','creditedHours'],
   ['Review Note','reviewNote'],['Expected Faculty Revision','expectedRevision']]
 };
 const quoteCsv=v=>{
  const s=String(v==null?'':v);
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
 };
 function officeTemplate(office,rows=[]){
  const cols=OFFICE_COLUMNS[office];if(!cols)throw Error('Select LAB or ADFAD office.');
  const header=cols.map(x=>quoteCsv(x[0])).join(',');
  return [header,...rows.map(row=>cols.map(([,id])=>quoteCsv(row[id])).join(','))].join('\r\n')+'\r\n';
 }
 function parseOfficeCsv(office,text){
  const cols=OFFICE_COLUMNS[office];if(!cols)throw Error('Select LAB or ADFAD office.');
  const src=String(text||'');if(src.length>1048576)throw Error('Office import is limited to 1 MB.');
  const data=rowsOf(src,delimiterFromHead(src.replace(/^\uFEFF/,'').split(/\r?\n/)[0]));
  if(data.length<2)throw Error('Include header and at least one office assignment.');
  const mapping=new Map(cols.map(([label,id])=>[key(label),id]));
  const selected=data[0].map(label=>mapping.get(key(label))||null),seen=new Set();
  for(const id of selected){if(id&&seen.has(id))throw Error('Duplicate column: '+id);if(id)seen.add(id);}
  const required=office==='lab'
   ?['sessionId','expectedRevision','runKey','startTime','endTime','room','capacity','attendance','groupCode','studentIds']
   :['sessionId','expectedRevision','facultyId','teachingRole'];
  for(const id of required)if(!seen.has(id))throw Error('Missing required office column: '+id);
  const rows=data.slice(1).map((cells,index)=>{
   if(cells.length!==selected.length)throw Error('Row '+(index+2)+' has '+cells.length+' columns; expected '+selected.length+'.');
   const result={};for(let i=0;i<selected.length;i++)if(selected[i])result[selected[i]]=String(cells[i]||'').trim();
   return result;
  });
  return {office,rows,headers:selected.filter(Boolean)};
 }
 return Object.freeze({parseBulkSchedule,template,officeTemplate,parseOfficeCsv});

});
