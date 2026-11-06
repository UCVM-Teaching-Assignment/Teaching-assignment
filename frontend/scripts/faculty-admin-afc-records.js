(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UCVM_AFC_RECORDS=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>String(value??'').trim();
  const norm=value=>String(value??'').trim().toLowerCase();
  const unconfirmedMessage='Save unconfirmed. Check the AFC list before reloading or submitting again.';
  function updateWriteControls(api, $, afcSubmitInFlight, unconfirmed=false) {
    const single = api.afcSingleWriteEnabled?.() === true;
    const batch = api.afcBatchWriteEnabled?.() === true;
    if ($('afc-submit')) $('afc-submit').disabled = !single || afcSubmitInFlight || unconfirmed;
    if ($('afc-form-status')) $('afc-form-status').textContent = unconfirmed ? unconfirmedMessage : single ? '' : 'AFC creation is unavailable. Your administrator permissions must be verified by the server.';
    if (!batch && $('afc-batch-submit')) $('afc-batch-submit').disabled = true;
    if ($('afc-batch-status')) $('afc-batch-status').textContent = batch ? '' : 'AFC batch creation is unavailable. Your administrator permissions must be verified by the server.';
  }
  function createSpecialLeaveEditor({api,$,policy}={}) {
    let generation=0,years=[],sources={};
    const host=$('afc-special-years'),message=$('afc-special-source-status');
    function selections() {
      const values={};
      for(const card of host?.querySelectorAll?.('[data-afc-special-year]')||[]){
        const year=card.dataset.afcSpecialYear;
        values[year]=Object.fromEntries(policy.CATEGORIES.map(category=>[category,card.querySelector('[data-afc-category="'+category+'"]')?.value??'']));
      }
      return values;
    }
    function format(value){return value===null||value===undefined?'Missing':String(value);}
    function read() {
      if($('afc-reason')?.value!=='special')return {};
      const availability=$('afc-special-availability')?.value||'unavailable';
      if(availability!=='available')return {availability:'unavailable'};
      const allocationsByYear=Object.fromEntries(Object.entries(selections()).map(([year,categories])=>[year,Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,v]))]));
      return {availability:'available',specialLeave:{fteDeduction:$('afc-special-fte')?.value??'',allocationsByYear}};
    }
    function validate(input) {
      if(input.reasonCode!=='special'||input.availability!=='available')return '';
      const fte=Number(input.specialLeave?.fteDeduction);
      if(input.specialLeave?.fteDeduction===''||!Number.isFinite(fte)||fte<0)return 'Enter a non-negative FTE deduction.';
      if(!years.length||years.some(year=>!input.specialLeave?.allocationsByYear?.[year]))return 'Enter annual DOE deductions for every affected academic year.';
      for(const year of years){
        const allocation=input.specialLeave.allocationsByYear[year],source=sources[year];
        let sum=0;
        for(const category of policy.CATEGORIES){
          const raw=allocation?.[category],value=Number(raw);
          if(raw===''||raw===undefined||!Number.isFinite(value)||value<0)return 'Enter valid non-negative DOE amounts for '+year+'.';
          sum+=value;
          const available=source?.doe?.[category];
          if(available!==null&&available!==undefined&&value>available+0.000001)return category+' DOE deduction exceeds available '+year+' allocation.';
        }
        if(Math.abs(sum-fte*100)>0.000001)return year+': DOE category deductions must total FTE deduction × 100.';
        if(source?.fte!==null&&source?.fte!==undefined&&fte>source.fte+0.000001)return 'FTE deduction exceeds the Faculty contract FTE.';
      }
      return '';
    }
    async function refresh() {
      const id=++generation,reason=$('afc-reason')?.value,available=$('afc-special-availability')?.value==='available';
      $('afc-special-options')?.classList.toggle('hidden',reason!=='special');
      $('afc-special-deduction')?.classList.toggle('hidden',reason!=='special'||!available);
      if(reason!=='special'||!available){return;}
      const start=$('afc-start-date')?.value,end=$('afc-end-date')?.value,facultyId=$('afc-faculty')?.value;
      const previous=selections(),oldYears=years;
      try{years=policy.yearsForRange(start,end);}catch(_){years=[];}
      if(!facultyId||!years.length){host.innerHTML='<p class="aux-note">Choose Faculty and valid Leave dates.</p>';return;}
      if(message)message.textContent='Loading contract FTE and annual DOE sources…';
      const requested=years.slice();
      const loaded=await Promise.all(requested.map(async year=>{
        try{
          const data=await api.dashboardFacultyById(facultyId,{academicYear:year});
          const allocation=data?.contractDoe?.allocations||[];
          const find=category=>{const row=allocation.find(entry=>String(entry.categoryCode||'').toLowerCase()===category);return row?.allocationDoe??null;};
          return {year,fte:data?.faculty?.fte??null,doe:Object.fromEntries(policy.CATEGORIES.map(k=>[k,find(k)]))};
        }catch(_){return {year,fte:null,doe:{teaching:null,service:null,research:null}};}
      }));
      if(id!==generation)return;
      sources=Object.fromEntries(loaded.map(item=>[item.year,item]));
      host.innerHTML=requested.map((year,index)=>{
        const source=sources[year],prior=previous[year]||(!oldYears.includes(year)&&index?previous[requested[index-1]]:null)||{};
        const rows=policy.CATEGORIES.map(category=>'<label class="field"><span class="field-label">'+esc(category[0].toUpperCase()+category.slice(1))+' DOE (base '+esc(format(source.doe[category]))+')</span><input class="input" type="number" step="0.0001" min="0" data-afc-category="'+category+'" value="'+esc(prior[category]??'0')+'"></label>').join('');
        return '<section class="section wide" data-afc-special-year="'+esc(year)+'"><div class="section-title">Academic Year '+esc(year)+' · Contract FTE '+esc(format(source.fte))+'</div><div class="field-grid">'+rows+'</div></section>';
      }).join('');
      if(message){
        const missing=loaded.some(item=>item.fte===null||policy.CATEGORIES.some(category=>item.doe[category]===null));
        const mismatch=loaded.some(item=>item.fte!==null&&policy.CATEGORIES.every(category=>item.doe[category]!==null)&&Math.abs(policy.CATEGORIES.reduce((sum,category)=>sum+Number(item.doe[category]),0)-item.fte*100)>0.000001);
        message.textContent=[missing?'Pending Deduction: missing FTE / DOE source; Admin must apply once configured.':'Contract DOE sources loaded.',mismatch?'FTE / DOE Mismatch: original source values will not be altered.':''].filter(Boolean).join(' ');
      }
    }
    return {read,validate,refresh};
  }
  function createSingleActions({api,$,reasonLabels,normalizeDate,isBusy,setBusy,refreshRecords,refreshDashboard,attachment=null,getUser=null,specialLeaveEditor=null}) {
    let unconfirmed=false;
    function status(message,error=false) {
      const node=$('afc-form-status');if(!node)return;
      node.textContent=message;node.classList.toggle('error',error);
    }
    function values() {
      return {facultyId:text($('afc-faculty')?.value),startDate:text($('afc-start-date')?.value),endDate:text($('afc-end-date')?.value),reasonCode:text($('afc-reason')?.value),notes:text($('afc-notes')?.value),...(specialLeaveEditor?.read?.()||{})};
    }
    function validate(input) {
      if(!input.facultyId)return 'Select an active faculty member.';
      const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!normalizeDate(value,'Date').error;
      if(!validDate(input.startDate)||!validDate(input.endDate))return 'Enter valid start and end dates.';
      if(input.endDate<input.startDate)return 'End date cannot be before start date.';
      if(!Object.prototype.hasOwnProperty.call(reasonLabels,input.reasonCode))return 'Select a recognised AFC reason.';
      if((input.reasonCode==='special'||input.reasonCode==='other')&&!input.notes)return 'Notes are required for Special and Other reasons.';
      if(input.notes.length>1000)return 'Notes must be 1,000 characters or fewer.';
      const leaveError=specialLeaveEditor?.validate?.(input);if(leaveError)return leaveError;
      return '';
    }
    async function submit(event) {
      event?.preventDefault?.();if(isBusy()||unconfirmed)return;
      const input=values(),error=validate(input);if(error){status(error,true);return;}
      const formSnapshot=JSON.stringify(input),owner=getUser?.()?.uid,current=()=>!getUser||getUser()?.uid===owner;
      const button=$('afc-submit');setBusy(true);if(button){button.disabled=true;button.textContent='Saving…';}
      status('Saving AFC record…');
      let createSent=false;
      try {
        const documentId=await attachment?.prepare(input.facultyId);
        if(!current())return;
        if(JSON.stringify(values())!==formSnapshot)throw Object.assign(Error('AFC fields changed. Review again; any archived PDF remains available.'),{status:409,code:'AFC_CONTEXT_CHANGED'});
        if(documentId)input.documentId=documentId;
        createSent=true;
        const created=await api.createDashboardAfcRecord(input);
        if(!current())return;
        if(!created?.afcRecordId)throw Object.assign(Error('AFC save response incomplete.'),{code:'OUTCOME_UNCONFIRMED'});
        let confirmed=false;
        for(let attempt=0;attempt<2&&!confirmed;attempt++)confirmed=(await refreshRecords())?.some(row=>String(row.afcRecordId)===String(created.afcRecordId)&&(!documentId||row.documentId===documentId));
        if(!current())return;
        if(!confirmed)throw Object.assign(Error('AFC readback incomplete.'),{code:'OUTCOME_UNCONFIRMED'});
        $('afc-record-form')?.reset();specialLeaveEditor?.refresh?.();attachment?.clear?.();await attachment?.open?.();await refreshDashboard();status('AFC record created and confirmed in the AFC list.');
      } catch(error) {
        if(!current())return;
        unconfirmed=createSent&&!(error?.code==='WRITE_DISABLED'&&Number(error.status)===503)&&(error?.code==='OUTCOME_UNCONFIRMED'||!Number(error?.status)||Number(error.status)>=500);
        status(unconfirmed?unconfirmedMessage:error?.message||'AFC record could not be created.',true);
      } finally {setBusy(false);if(button){button.disabled=unconfirmed||api.afcSingleWriteEnabled?.()!==true;button.textContent='Create AFC Record';}}
    }
    return {submit,isUnconfirmed:()=>unconfirmed};
  }
  function renderRows(rows,{facultyName,canCancel:allowed=false,canEdit:editAllowed=false,editingKey='',editingSpecialKey='',busy=()=>false,renderPdf=()=>'<span class="muted">N/A</span>'}={}) {
    return rows.map(row => {
      const key = `${row.sourceKind}:${row.afcRecordId}`;
      const editable = row.active !== false && /^[0-9a-f]{16}$/i.test(row.versionToken || '');
      const canCancel = allowed && editable;
      const canEdit = editAllowed && editable;
      const canEditLeave=canEdit&&row.sourceKind==='manual'&&row.reasonCode==='special'&&row.availability==='available'&&!!row.specialLeave;
      const leave=row.specialLeave||{};
      const held=Array.isArray(leave.suspendedIntervals)&&leave.suspendedIntervals.length>0;
      const pending=Object.values(leave.confirmedYears||{}).some(value=>value!==true);
      const buttons = [
        canEdit ? `<button class="btn" type="button" data-afc-edit="${esc(key)}" ${busy(key) ? 'disabled' : ''}>Edit dates</button>` : '',
        canEditLeave ? `<button class="btn" type="button" data-afc-leave-edit="${esc(key)}" ${busy(key) ? 'disabled' : ''}>Edit / Apply DOE</button>` : '',
        canCancel ? `<button class="btn" type="button" data-afc-cancel="${esc(key)}" ${busy(key) ? 'disabled' : ''}>${busy(key) ? 'Withdrawing…' : 'Withdraw'}</button>` : ''
      ].filter(Boolean).join(' ');
      const action = buttons || (row.active === false ? 'Withdrawn' : 'Unavailable');
      // UX-07: the ADFA office changes the dates directly; Change History keeps old and new dates.
      const editor = canEdit && editingKey === key ? `<tr class="afc-date-edit" data-afc-edit-row="${esc(key)}"><td colspan="9"><div class="afc-date-edit-form"><label>New start date<input type="date" data-afc-edit-start value="${esc(row.startDate || '')}"></label><label>New end date<input type="date" data-afc-edit-end value="${esc(row.endDate || '')}"></label><button class="btn btn-primary" type="button" data-afc-edit-save="${esc(key)}" ${busy(key) ? 'disabled' : ''}>${busy(key) ? 'Saving…' : 'Save dates'}</button><button class="btn" type="button" data-afc-edit-cancel="${esc(key)}">Cancel</button><span class="muted">Was ${esc(row.startDate || '—')} to ${esc(row.endDate || '—')}. The change is recorded in Change History.</span></div></td></tr>` : '';

      const yearEditor=Object.keys(leave.confirmedYears||leave.allocationsByYear||{}).map(year=>{
        const values=leave.allocationsByYear?.[year]||{};
        const fields=['teaching','service','research'].map(category=>'<label>'+esc(category)+' DOE<input class="input" type="number" min="0" step="0.0001" data-afc-leave-category="'+category+'" value="'+esc(values[category]??0)+'"></label>').join('');
        return '<fieldset data-afc-leave-year="'+esc(year)+'"><legend>Academic Year '+esc(year)+'</legend>'+fields+'</fieldset>';
      }).join('');
      const leaveEditor=canEditLeave&&editingSpecialKey===key?
        '<tr data-afc-leave-edit-row="'+esc(key)+'"><td colspan="9"><div class="afc-date-edit-form"><p>Admin review: source FTE / DOE and teaching assignments are unchanged. Incomplete sources remain Pending.</p><label>FTE Deduction<input class="input" type="number" min="0" step="0.0001" data-afc-leave-fte value="'+esc(leave.fteDeduction??0)+'"></label>'+yearEditor+'<button class="btn btn-primary" type="button" data-afc-leave-save="'+esc(key)+'">Validate and Apply</button><button class="btn" type="button" data-afc-leave-close="1">Cancel</button></div></td></tr>':'';
      return `<tr><td><button type="button" class="btn-link" data-afc-person="${esc(row.facultyId)}">${esc(facultyName(row, 'Name unavailable'))}</button></td><td>${esc(row.startDate || '—')}</td><td>${esc(row.endDate || '—')}</td><td>${esc(row.reason || row.legacyPurpose || row.reasonCode || '—')}</td><td>${esc(row.notes || row.legacyPurpose || '—')}</td><td>${esc(norm(row.sourceKind) === 'manual' ? 'Manual' : 'Imported')}</td><td>${row.active === false ? 'Withdrawn' : (row.reasonCode==='special'?(row.availability==='available'?'Available':'Unavailable')+(pending?' · Pending Deduction':held?' · Partial Adjustment Required':''):'Active')}</td><td>${renderPdf(row)}</td><td>${action}</td></tr>${editor}${leaveEditor}`;
    }).join('') || '<tr><td colspan="9" class="empty">No AFC records match the current filters.</td></tr>';
  }
  function profileAfc(records,{selfMode=false,renderPdf=()=>'<span class="muted">N/A</span>'}={}) {
    // Render only the record set authorized and returned by the detail API.
    if (!Array.isArray(records)) return '';
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const dateOnly = value => /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(text(value)) ? text(value).slice(0, 10) : '';
    const archived = record => record.active === false || (dateOnly(record.endDate) && dateOnly(record.endDate) < today);
    const upcoming = records.filter(record => !archived(record)).sort((a,b) => text(a.startDate).localeCompare(text(b.startDate)));
    const past = records.filter(archived).sort((a,b) => text(b.endDate).localeCompare(text(a.endDate)));
    const table = rows => rows.length?'<div class="table-wrap"><table class="data-table"><thead><tr>'+['Start','End','Availability status','Reason','Notes','Source','PDF'].map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(record => {
      const start = dateOnly(record.startDate), end = dateOnly(record.endDate);
      const status = record.active === false ? 'Withdrawn' : !start || !end ? 'Dates need review' : end < today ? 'Past' : start <= today ? 'Current' : 'Upcoming';
      const values=[record.startDate,record.endDate,status,record.reason||record.reasonCode||record.purpose,record.notes||record.legacyPurpose,record.sourceKind||'Source unavailable'];return '<tr>'+values.map(v=>'<td>'+esc(v??'—')+'</td>').join('')+'<td>'+renderPdf(record)+'</td></tr>';
    }).join('')+'</tbody></table></div>':'<div class="afc-none">No records in this group.</div>';
    const fold = (label, rows, open = false) => `<details class="afc-fold" ${open ? 'open' : ''}><summary><span>${label}</span><span>${rows.length} record${rows.length === 1 ? '' : 's'}</span></summary>${table(rows)}</details>`;
    return `<section class="section wide"><div class="section-title">Away from Campus · Availability & HR Archive</div><div class="afc-wrap">${fold('Current / Upcoming', upcoming, true)}${fold('Past / Withdrawn · HR Archive', past)}<div class="afc-privacy">${selfMode ? 'Your private Away from Campus / availability records.' : 'Confidential availability and HR records. Detailed reasons follow your Dashboard permissions.'} PDF: N/A means no original was archived, including legacy records.</div></div></section><section id="faculty-afc-originals" class="section wide"></section>`;
  }

  function createActions({api,facultyName,canCancel,canEdit=()=>false,getRecords,render,refresh,refreshRecords,notify,confirm}) {
    const afcCancelInFlight=new Set();
    let editingKey='';
    let editingSpecialKey='';
    const findRow=key=>getRecords().find(record => `${record.sourceKind}:${record.afcRecordId}` === key);
    const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
    function startEdit(key){ if(!canEdit()||afcCancelInFlight.has(key))return; const row=findRow(key); if(!row||row.active===false)return; editingKey=key; render(); }
    function cancelEdit(){ editingKey=''; render(); }
    function startSpecialEdit(key) {
      if(!canEdit()||afcCancelInFlight.has(key))return;
      const row=findRow(key);
      if(!row||row.active===false||row.reasonCode!=='special'||row.availability!=='available'||!row.specialLeave)return;
      editingSpecialKey=key;editingKey='';render();
    }
    function cancelSpecialEdit(){editingSpecialKey='';render();}
    async function saveSpecialLeave(key,element) {
      if(!canEdit()||afcCancelInFlight.has(key))return false;
      const row=findRow(key);
      if(!row||row.active===false||!row.specialLeave)return false;
      const fteRaw=element?.querySelector('[data-afc-leave-fte]')?.value;
      const allocationsByYear={};
      for(const part of element?.querySelectorAll('[data-afc-leave-year]')||[]){
        allocationsByYear[part.dataset.afcLeaveYear]=Object.fromEntries(['teaching','service','research'].map(category=>[category,part.querySelector('[data-afc-leave-category="'+category+'"]')?.value??'']));
      }
      const total=Number(fteRaw)*100;
      if(fteRaw===''||fteRaw===undefined||!Number.isFinite(Number(fteRaw))||Number(fteRaw)<0||
        Object.entries(allocationsByYear).some(([,values])=>Object.values(values).some(v=>v===''||!Number.isFinite(Number(v))||Number(v)<0)||Math.abs(Object.values(values).reduce((sum,v)=>sum+Number(v),0)-total)>0.000001)){
        notify('DOE must total FTE deduction × 100 for each academic year.',true);return false;
      }
      afcCancelInFlight.add(key);render();
      try{
        await api.updateDashboardAfcSpecialLeave(row.afcRecordId,{expectedVersion:row.versionToken,specialLeave:{fteDeduction:Number(fteRaw),allocationsByYear}});
        editingSpecialKey='';
        await refresh();
        notify('Special Leave deduction reviewed. Valid allocations applied; missing source data remains Pending.');
        return true;
      }catch(error){
        notify(error?.message||'Special Leave deduction could not be updated.',true);
        if(error?.status===409||error?.status===404)await refreshRecords();
        return false;
      }finally{afcCancelInFlight.delete(key);render();}
    }

    async function saveDates(key,startDate,endDate) {
      if (!canEdit() || afcCancelInFlight.has(key)) return false;
      const row = findRow(key);
      if (!row || row.active === false || !/^[0-9a-f]{16}$/i.test(row.versionToken || '')) return false;
      if (!validDate(startDate) || !validDate(endDate)) { notify('Choose a valid start and end date.', true); return false; }
      if (endDate < startDate) { notify('End date must be on or after start date.', true); return false; }
      if (startDate === row.startDate && endDate === row.endDate) { notify('The new dates are the same as the current dates.', true); return false; }
      afcCancelInFlight.add(key); render();
      try {
        await api.updateDashboardAfcRecordDates(row.afcRecordId, { sourceKind: row.sourceKind, expectedVersion: row.versionToken, startDate, endDate });
        editingKey='';
        await refresh();
        notify(`AFC dates changed from ${row.startDate} – ${row.endDate} to ${startDate} – ${endDate}. The change is in Change History.`);
        return true;
      } catch (error) {
        notify(error?.message || 'AFC dates could not be changed.', true);
        if (error?.status === 409 || error?.status === 404) await refreshRecords();
        return false;
      } finally { afcCancelInFlight.delete(key); render(); }
    }
    async function cancel(key) {
    if (!canCancel() || afcCancelInFlight.has(key)) return;
    const row = getRecords().find(record => `${record.sourceKind}:${record.afcRecordId}` === key);
    if (!row || row.active === false || !/^[0-9a-f]{16}$/i.test(row.versionToken || '')) return;
    if (!confirm(`Withdraw the AFC record for ${facultyName(row, 'this faculty member')} (${row.startDate} to ${row.endDate})?\n\nIt will stop affecting availability. Its history and audit record will be retained.`)) return;
    afcCancelInFlight.add(key); render();
    try {
      await api.cancelDashboardAfcRecord(row.afcRecordId, { sourceKind: row.sourceKind, expectedVersion: row.versionToken });
      await refresh();
      notify('AFC record withdrawn. It no longer affects availability; its history is kept.');
    } catch (error) {
      notify(error?.message || 'AFC record could not be withdrawn.', true);
      if (error?.status === 409 || error?.status === 404) await refreshRecords();
    } finally { afcCancelInFlight.delete(key); render(); }
  }
    // Click wiring for the inline office date editor; returns true when handled.
    function handleEditClick(event){
      const target=event?.target;

      const leaveEdit=target?.closest?.('[data-afc-leave-edit]');if(leaveEdit){startSpecialEdit(leaveEdit.dataset.afcLeaveEdit);return true;}
      if(target?.closest?.('[data-afc-leave-close]')){cancelSpecialEdit();return true;}
      const leaveSave=target?.closest?.('[data-afc-leave-save]');
      if(leaveSave){saveSpecialLeave(leaveSave.dataset.afcLeaveSave,leaveSave.closest('[data-afc-leave-edit-row]'));return true;}
      const edit=target?.closest?.('[data-afc-edit]');if(edit){startEdit(edit.dataset.afcEdit);return true;}
      if(target?.closest?.('[data-afc-edit-cancel]')){cancelEdit();return true;}
      const save=target?.closest?.('[data-afc-edit-save]');if(!save)return false;
      const row=save.closest?.('[data-afc-edit-row]');
      saveDates(save.dataset.afcEditSave,row?.querySelector?.('[data-afc-edit-start]')?.value||'',row?.querySelector?.('[data-afc-edit-end]')?.value||'');
      return true;
    }
    return {cancel,startEdit,cancelEdit,saveDates,handleEditClick,canEdit,editingKey:()=>editingKey,editingSpecialKey:()=>editingSpecialKey,isBusy:key=>afcCancelInFlight.has(key)};
  }
  function facultyLabel(row, rows, facultyName) {
    const label = text(facultyName(row, 'Name unavailable'));
    const duplicates = rows.filter(other => text(facultyName(other, 'Name unavailable')) === label);
    return duplicates.length > 1 && (row.rank || row.stream) ? `${label} — ${[row.rank, row.stream].filter(Boolean).join(' / ')}` : label;
  }
  function resolveFaculty(value, rows, facultyName) {
    const input = text(value);
    const exact = rows.find(row => text(row.facultyId).toLowerCase() === input.toLowerCase());
    if (exact) return exact;
    const labelMatches = rows.filter(row => facultyLabel(row, rows, facultyName) === input);
    if (labelMatches.length === 1) return labelMatches[0];
    const nameMatches = rows.filter(row => text(row.displayName) === input);
    if (nameMatches.length === 1) return nameMatches[0];
    const parts = input.split(/,\s*/);
    if (parts.length === 2 && parts[0] && parts[1]) {
      const swapped = parts[1] + ' ' + parts[0];
      const transformed = rows.filter(row => text(row.displayName) === swapped);
      if (transformed.length === 1) return transformed[0];
    }
    return null;
  }
  return Object.freeze({updateWriteControls,createSpecialLeaveEditor,createSingleActions,renderRows,profileAfc,createActions,facultyLabel,resolveFaculty});
});
