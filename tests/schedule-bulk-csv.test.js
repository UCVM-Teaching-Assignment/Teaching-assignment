'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBulkSchedule,template}=require('../frontend/scripts/schedule-bulk-csv.js');
test('paste from Excel TSV maps headers, combined Time, optional blanks and curriculum year',()=>{
 const text='Course Number\tYear\tDate\tTime\tCourse Title\tRoom Number\nVTMD 304\t2\t2026-11-04\t08:30-10:30\t\t\n';
 const parsed=parseBulkSchedule(text);
 assert.equal(parsed.rows.length,1);assert.deepEqual(parsed.rows[0],{courseNumber:'VTMD 304',year:'2',date:'2026-11-04',time:'08:30-10:30',title:'',room:''});
});
test('quoted CSV commas, line breaks, BOM, CRLF and time columns do not split records',()=>{
 const csv='\ufeffCourse Number,Year,Date,Start Time,End Time,Session Title,Room Number\r\nVETM 505,3,2026-11-03,08:30,10:30,"Review, Equine\nPalpation","CSB, Ward"\r\n';
 const parsed=parseBulkSchedule(csv);
 assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].title,'Review, Equine\nPalpation');
 assert.equal(parsed.rows[0].room,'CSB, Ward');
 assert.equal(parsed.rows[0].startTime,'08:30');
});
test('invalid header or duplicate header is refused before publish',()=>{
 assert.throws(()=>parseBulkSchedule('Course Number,Date\nVTMD 304,2026-11-04'),/Missing required column/i);
 assert.throws(()=>parseBulkSchedule('Course Number,Course Code,Year,Date,Time\nVTMD 304,VTMD 304,2,2026-11-04,8:30-9:30'),/Duplicate column/i);
});
test('downloadable CSV template includes mandatory fields and optional entries',()=>{
 const header=template().split('\n')[0];
 for(const name of ['Course Number','Year','Date','Start Time','End Time','Session Title','Room Number'])assert.ok(header.includes(name),name);
});
