'use strict';
// Faculty edits, role effective periods and AFC record writes for the demo.
const { PROFILE_FIELDS } = require('../../../server/src/data/sql-faculty-admin-repository.js');
const { afcView, sqlError, clone } = require('./core.js');
const { isAdministratorRole } = require('../../../server/src/auth/role-policy.js');
const { uuidFor } = require('../ids.js');
const activation=require('../faculty-activation.js');
const { dateRange, versionOf, bumpVersion } = require('./afc-date-change.js');
const leavePolicy = require('../../../frontend/scripts/afc-special-leave-policy.js');

const AFC_REASONS = { university_travel: 'University Travel', vacation: 'Vacation', rsl: 'RSL', medical: 'Medical', mat: 'MAT', special: 'Special', other: 'Other' };
const hexVersion = n => '0x' + Number(n).toString(16).toUpperCase().padStart(16, '0');

function facultyDto(store,row) {
  return { facultyId: row.facultyId, preferredFirstName: row.preferredFirstName, preferredLastName: row.preferredLastName, displayName: row.displayName, ucid: row.ucid, email: row.email, recordType: row.recordType, stream: row.stream, rank: row.rank, fte: row.fte, reportsToFacultyId: row.reportsToFacultyId || null, active: activation.effectiveActive(row,store.now()), administrativeActive: row.active === true, activationDate: row.activationDate || null, updatedAtUtc: row.updatedAtUtc, profileVersion: row.profile.profileVersion, professionalProfile: Object.fromEntries(PROFILE_FIELDS.map(field => [field, row.profile[field] ?? null])) };
}

function createFacultyAdminRepository(store) {
  const t = () => store.tables;
  const find = id => { const row = t().faculty.find(item => item.facultyId === id); if (!row) throw sqlError(52303, 'Faculty not found'); return row; };
  const sameInstant = (a, b) => String(a || '').slice(0, 19) === String(b || '').slice(0, 19);
  const touch = (row, actor, action, before) => {
    row.updatedAtUtc = store.nowIso();
    store.audit({ domain: 'lookup', changeType: action, facultyId: row.facultyId, actorFirebaseUid: actor, before, after: facultyDto(store,row) });
    store.commit();
    return facultyDto(store,row);
  };
  return {
    async createFaculty(input) {
      const identity=String(input.ucid||'').trim().toLowerCase();
      const email=String(input.email||'').trim().toLowerCase();
      if(!identity&&!email)throw sqlError(56503,'UCID or email required for a new Faculty.');
      if(t().faculty.some(f=>(identity&&String(f.ucid||'').trim().toLowerCase()===identity)||
        (email&&String(f.email||'').trim().toLowerCase()===email)))
        throw sqlError(52304,'Faculty identity already exists, including inactive entries.');
      if(input.reportsToFacultyId&&!t().faculty.some(f=>f.facultyId===input.reportsToFacultyId))
        throw sqlError(56503,'Supervisor does not exist.');
      const facultyId=uuidFor('faculty:create:'+t().faculty.length+':'+store.nowIso()+':'+identity+':'+email);
      const before=null;
      const row={facultyId,preferredFirstName:input.preferredFirstName||null,
        preferredLastName:input.preferredLastName||null,displayName:input.displayName,
        storedDisplayName:[input.preferredLastName,input.preferredFirstName].filter(Boolean).join(', '),
        ucid:input.ucid||null,email:input.email||null,recordType:input.recordType,
        stream:input.stream||null,rank:input.rank||null,fte:input.fte,
        reportsToFacultyId:input.reportsToFacultyId||null,activationDate:input.activationDate||null,
        active:true,updatedAtUtc:store.nowIso(),
        profile:{...(input.professionalProfile||{}),profileVersion:hexVersion(1)}};
      t().faculty.push(row);
      return touch(row,input.actorFirebaseUid,'faculty_created',before);
    },
    async updateRolePeriods({ roleAssignmentId, expectedVersion, periods, actorFirebaseUid }) {
      const role = t().roles.find(row => row.roleAssignmentId === roleAssignmentId);
      if (!role) throw sqlError(53504, 'Appointment not found.');
      const current = role.scheduleVersion || null;
      if ((current || null) !== (expectedVersion || null)) throw sqlError(53509, 'Appointment changed; reload.');
      const before = role.validityPeriods;
      role.validityPeriods = periods;
      role.scheduleVersion = hexVersion((parseInt(String(current || '0x0').slice(2), 16) || 0) + 1);
      store.audit({ domain: 'lookup', changeType: 'role_periods_updated', roleAssignmentId, facultyId: role.facultyId, actorFirebaseUid, before, after: periods });
      store.commit();
      return { roleAssignmentId, scheduleVersion: role.scheduleVersion };
    },
    async updateFaculty(input) {
      const row = find(input.facultyId);
      if (!sameInstant(row.updatedAtUtc, input.expectedUpdatedAtUtc) || (input.expectedProfileVersion && input.expectedProfileVersion.toUpperCase() !== String(row.profile.profileVersion).toUpperCase())) throw sqlError(52305, 'Revision conflict');
      if (t().faculty.some(other => other.facultyId !== row.facultyId && ((input.ucid && other.ucid === input.ucid) || (input.email && other.email.toLowerCase() === String(input.email).toLowerCase())))) throw sqlError(52304, 'Identity conflict');
      const before = facultyDto(store,row);
      if(Object.prototype.hasOwnProperty.call(input,'activationDate')&&input.activationDate!==row.activationDate)
        activation.assertActivationChange(store,row.facultyId,input.activationDate);
      for (const key of ['preferredFirstName', 'preferredLastName', 'ucid', 'email', 'recordType', 'stream', 'rank', 'fte', 'reportsToFacultyId']) if (input[key] !== undefined) row[key] = input[key];
      row.displayName = input.displayName || `${row.preferredFirstName} ${row.preferredLastName}`.trim();
      row.storedDisplayName = `${row.preferredLastName}, ${row.preferredFirstName}`;
      if(Object.prototype.hasOwnProperty.call(input,'activationDate'))row.activationDate=input.activationDate;
      for (const field of PROFILE_FIELDS) if (input.professionalProfile && input.professionalProfile[field] !== undefined) row.profile[field] = input.professionalProfile[field];
      row.profile.profileVersion = hexVersion(parseInt(row.profile.profileVersion.slice(2), 16) + 1);
      return touch(row, input.actorFirebaseUid, 'faculty_updated', before);
    },
    async deactivateFaculty({ facultyId, expectedUpdatedAtUtc, actorFirebaseUid }) {
      const row = find(facultyId);
      if (!sameInstant(row.updatedAtUtc, expectedUpdatedAtUtc)) throw sqlError(52305, 'Revision conflict');
      const before = facultyDto(store,row); row.active = false;
      return touch(row, actorFirebaseUid, 'faculty_deactivated', before);
    },
    async restoreFaculty({ facultyId, expectedUpdatedAtUtc, actorFirebaseUid }) {
      const row = find(facultyId);
      if (!sameInstant(row.updatedAtUtc, expectedUpdatedAtUtc)) throw sqlError(52305, 'Revision conflict');
      const before = facultyDto(store,row); row.active = true;
      return touch(row, actorFirebaseUid, 'faculty_restored', before);
    }
  };
}

function createAfcWriteRepository(store) {
  const t = () => store.tables;
  const sourceForYear = (facultyId, year) => {
    const member=t().faculty.find(row=>row.facultyId===facultyId);
    const target=t().targets.find(row=>row.facultyId===facultyId&&row.academicYear===year&&row.active!==false);
    return {fte:member?.fte??null,doe:{teaching:target?.contractTeachingDoe??null,service:target?.serviceDoe??null,research:target?.researchDoe??null}};
  };
  const validateLeave = (facultyId,startDate,endDate,specialLeave) => {
    if(!specialLeave||typeof specialLeave!=='object')throw sqlError(51213,'Special Leave deduction required');
    const years=leavePolicy.yearsForRange(startDate,endDate),confirmedYears={},sourceFingerprintByYear={};
    for(const year of years){
      const allocation=specialLeave.allocationsByYear?.[year];
      if(!allocation){confirmedYears[year]=false;continue;}
      const source=sourceForYear(facultyId,year);
      sourceFingerprintByYear[year]=JSON.stringify(source);
      const validation=leavePolicy.validateAllocation(specialLeave.fteDeduction,allocation,source);
      const hard=validation.errors.filter(error=>!error.includes('SOURCE_MISSING')&&!error.includes('DOE_SOURCE_MISSING'));
      if(hard.length)throw sqlError(51213,hard.join(', '));
      confirmedYears[year]=validation.valid;
    }
    return {...clone(specialLeave),confirmedYears,sourceFingerprintByYear};
  };
  const dayAfter = date => new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const dayBefore = date => new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  // Mark only the actual overlap dates as held. Even if a competing Leave is
  // cancelled later, these intervals require explicit Admin reapplication.
  const heldIntervals = row => {
    if(row.availability!=='available'||!row.specialLeave)return[];
    const relevant=t().afcRecords.filter(r=>r.facultyId===row.facultyId&&r.active!==false&&r.reasonCode==='special'&&r.availability==='available'&&r.afcRecordId!==row.afcRecordId&&r.endDate>=row.startDate&&r.startDate<=row.endDate);
    if(!relevant.length)return[];
    const boundaries=new Set([row.startDate,dayAfter(row.endDate)]);
    for(const item of relevant) {
      boundaries.add(item.startDate<row.startDate?row.startDate:item.startDate);
      const after=dayAfter(item.endDate);boundaries.add(after>dayAfter(row.endDate)?dayAfter(row.endDate):after);
    }
    for(const year of leavePolicy.yearsForRange(row.startDate,row.endDate).slice(1))boundaries.add(year.slice(0,4)+'-05-01');
    const points=[...boundaries].sort(),held=[];
    for(let i=0;i<points.length-1;i++) {
      const startDate=points[i],endDate=dayBefore(points[i+1]);
      if(startDate>endDate||startDate<row.startDate||startDate>row.endDate)continue;
      const view=leavePolicy.evaluate({date:startDate,source:sourceForYear(row.facultyId,leavePolicy.academicYearForDate(startDate)),leaves:[...relevant,row].map(item=>({...item,...(item.specialLeave||{}),id:item.afcRecordId,approved:true,approvedAt:item.approvedAtUtc||item.createdAtUtc}))});
      if(view.pending.some(item=>item.id===row.afcRecordId&&item.status==='Adjustment Required'))held.push({startDate,endDate});
    }
    return held;
  };
  const check = ({ facultyId, startDate, endDate, reasonCode, notes }) => {
    if (!startDate || !endDate) throw sqlError(51205, 'Dates required');
    if (endDate < startDate) throw sqlError(51206, 'Range');
    if (reasonCode && !AFC_REASONS[reasonCode]) throw sqlError(51207, 'Reason');
    if ((reasonCode === 'special' || reasonCode === 'other') && !String(notes || '').trim()) throw sqlError(51208, 'Notes required');
    if (!t().faculty.some(row => row.facultyId === facultyId && row.active)) throw sqlError(51210, 'Faculty');
  };
  return {
    supportsSpecialLeave: true,
    async createAfcRecord({ afcRecordId, facultyId, startDate, endDate, reasonCode, notes = null, actorFirebaseUid, actorName = null, documentId = null, availability = 'unavailable', specialLeave = null }) {
      check({ facultyId, startDate, endDate, reasonCode, notes });
      if (availability === 'available' && reasonCode !== 'special') throw sqlError(51213,'Available is limited to Special Leave');
      const normalizedLeave = availability === 'available' ? validateLeave(facultyId,startDate,endDate,specialLeave) : null;
      const row = { afcRecordId, facultyId, startDate, endDate, reasonCode, availability, approvedAtUtc:store.nowIso(), ...(normalizedLeave?{specialLeave:normalizedLeave}:{}), reason: AFC_REASONS[reasonCode], purpose: '', notes: notes || '', legacyPurpose: AFC_REASONS[reasonCode], active: true, sourceKind: 'manual', createdAtUtc: store.nowIso(), createdByName: actorName || '', recordKey: `AFC-M-${afcRecordId.slice(0, 8)}`, versionToken: afcRecordId.replace(/-/g, '').slice(0, 16).toUpperCase(), documentId };
      if(normalizedLeave)row.specialLeave.suspendedIntervals=heldIntervals(row);
      t().afcRecords.unshift(row);
      store.audit({ domain: 'afc', changeType: 'afc_record_created', facultyId, actorFirebaseUid, actorName, after: clone(row) });
      store.commit();
      return afcView(store, row);
    },
    async createAfcManualBatch({ requestId, rows, actorFirebaseUid, actorName = null }) {
      const done = store.bag('afcBatches', () => ({}));
      if (done[requestId]) return { status: 'ALREADY_APPLIED', rows: done[requestId] };
      const created = [];
      for (const input of rows) {
        check({ facultyId: input.facultyId, startDate: input.startDate, endDate: input.endDate });
        const afcRecordId = require('../ids.js').uuidFor(`afc:batch:${requestId}:${input.rowIndex}`);
        t().afcRecords.unshift({ afcRecordId, facultyId: input.facultyId, startDate: input.startDate, endDate: input.endDate, reasonCode: '', reason: input.purpose, purpose: input.purpose, notes: '', legacyPurpose: input.purpose, active: true, sourceKind: 'manual', createdAtUtc: store.nowIso(), createdByName: actorName || '', recordKey: `AFC-B-${afcRecordId.slice(0, 8)}`, versionToken: afcRecordId.replace(/-/g, '').slice(0, 16).toUpperCase(), documentId: null });
        created.push({ rowIndex: input.rowIndex, afcRecordId, facultyId: input.facultyId, startDate: input.startDate, endDate: input.endDate, purpose: input.purpose, status: 'CREATED' });
      }
      done[requestId] = created;
      store.audit({ domain: 'afc', changeType: 'afc_batch_created', actorFirebaseUid, actorName, after: created });
      store.commit();
      return { status: 'CREATED', rows: created };
    },
    async updateAfcSpecialLeave({ afcRecordId, expectedVersion, specialLeave, actorFirebaseUid }) {
      const actor=t().users.find(u=>u.firebaseUid===actorFirebaseUid&&u.active===true);
      if(!actor||!isAdministratorRole(actor.baseRole))throw sqlError(56402,'Administrator permission required');
      const row=t().afcRecords.find(item=>item.afcRecordId===afcRecordId&&item.sourceKind==='manual');
      if(!row)throw sqlError(56403,'AFC record not found');
      if(!row.active||row.reasonCode!=='special'||row.availability!=='available')throw sqlError(56406,'Not an active Available Special Leave');
      if(versionOf(row)!==String(expectedVersion||'').toUpperCase())throw sqlError(56404,'Version conflict');
      const normalized=validateLeave(row.facultyId,row.startDate,row.endDate,specialLeave);
      normalized.suspendedIntervals=heldIntervals({...row,specialLeave:normalized});
      const before=clone(row.specialLeave||null);
      row.specialLeave=normalized;
      row.versionToken=bumpVersion(versionOf(row));
      store.audit({domain:'afc',changeType:'afc_special_leave_deduction_confirmed',facultyId:row.facultyId,afcRecordId,actorFirebaseUid,before,after:clone(row.specialLeave)});
      store.commit();
      return afcView(store,row);
    },
    async updateAfcDates({ afcRecordId, sourceKind, expectedVersion, startDate, endDate, actorFirebaseUid }) {
      const actor = t().users.find(u => u.firebaseUid === actorFirebaseUid && u.active === true);
      if (!actor || !isAdministratorRole(actor.baseRole)) throw sqlError(56402, 'Administrator permission required');
      const row = t().afcRecords.find(r => r.afcRecordId === afcRecordId && r.sourceKind === sourceKind);
      if (!row) throw sqlError(56403, 'Record not found');
      if (row.active === false) throw sqlError(56406, 'Withdrawn record cannot be edited');
      if (versionOf(row) !== String(expectedVersion || '').toUpperCase()) throw sqlError(56404, 'Version conflict');
      if (row.startDate === startDate && row.endDate === endDate) throw sqlError(56408, 'Unchanged dates');
      const days = dateRange(startDate, endDate);
      const before = clone(row);
      row.startDate = startDate;
      row.endDate = endDate;
      row.workDays = days;
      row.versionToken = bumpVersion(versionOf(row));
      store.audit({ domain: 'afc', changeType: 'afc_dates_changed', afcRecordId, facultyId: row.facultyId,
        actorFirebaseUid, before: { startDate: before.startDate, endDate: before.endDate },
        after: { startDate, endDate, workDays: days } });
      store.commit();
      return afcView(store, row);
    },
    async cancelAfcRecord({ afcRecordId, sourceKind, expectedVersion, actorFirebaseUid, actorName = null }) {
      const row = t().afcRecords.find(item => item.afcRecordId === afcRecordId && item.sourceKind === sourceKind);
      if (!row) throw sqlError(53603, 'Not found');
      if (expectedVersion && expectedVersion.toUpperCase() !== row.versionToken.toUpperCase()) throw sqlError(53604, 'Changed');
      row.active = false;
      row.versionToken = (parseInt(row.versionToken.slice(-8), 16) + 1).toString(16).toUpperCase().padStart(16, '0');
      store.audit({ domain: 'afc', changeType: 'afc_record_cancelled', facultyId: row.facultyId, actorFirebaseUid, actorName, after: clone(row) });
      store.commit();
      return afcView(store, row);
    }
  };
}

module.exports = { createFacultyAdminRepository, createAfcWriteRepository, AFC_REASONS };
