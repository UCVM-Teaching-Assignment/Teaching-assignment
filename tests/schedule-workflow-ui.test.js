'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../frontend/scripts/schedule-workflow.js');
test('Schedule Workflow exposes ADC and ADFAD controls only to correct roles, Developer can see both',()=>{
 assert.equal(ui.allowedRole('adc'),true);
 assert.equal(ui.allowedRole('adfa_general'),true);
 assert.equal(ui.allowedRole('developer'),true);
 assert.equal(ui.allowedRole('owner'),true);
 assert.equal(ui.allowedRole('lab'),false);
 assert.equal(ui.allowedRole('faculty'),false);
 assert.equal(ui.allowedRole('visitor'),false);
});
test('untrusted topic and faculty labels are escaped before display',()=>{
 assert.equal(ui.escape('<img src=x onerror=alert(1)>'),'&lt;img src=x onerror=alert(1)&gt;');
});
