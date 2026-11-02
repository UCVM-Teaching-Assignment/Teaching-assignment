'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createStore} = require('../tools/pages-demo-api/store.js');
const {createDemoRuntime} = require('../tools/pages-demo-api/runtime.js');
const {createScheduleWorkflow} = require('../tools/pages-demo-api/schedule-workflow.js');

test('opening Schedule Workflow succeeds with actual seeded Demo sessions and ADC user', async () => {
 const store=createStore();
 const adc=store.tables.users.find(user=>String(user.baseRole).toLowerCase()==='adc');
 assert.ok(adc,'real seeded dataset must have an ADC tester');
 const snapshot=createScheduleWorkflow({store}).list(adc.firebaseUid);
 assert.ok(snapshot.courses.length>0,'real Course Catalog should be loaded');
 assert.ok(snapshot.sessions.length>0,'real timetable seed should be available');
 const request=new Request('https://pages-demo.invalid/api/v1/schedule-workflow',{headers:{Authorization:'Bearer demo-token-'+adc.firebaseUid}});
 const response=await createDemoRuntime(store)(request);
 assert.equal(response.status,200,JSON.stringify(response.jsonBody));
 assert.equal(response.jsonBody.capabilities.canADC,true);
});
