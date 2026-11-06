(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PAWS_AFC_SPECIAL_LEAVE=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const CATEGORIES=['teaching','service','research'];
  const round=n=>Math.round((n+Number.EPSILON)*10000)/10000;
  const num=v=>(v===null||v===undefined||String(v).trim()==='')?null:(Number.isFinite(Number(v))?Number(v):null);
  const validDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;};
  function academicYearForDate(date){
    if(!validDate(date))throw Error('Invalid date.');
    const start=Number(date.slice(0,4))-(Number(date.slice(5,7))<5?1:0);
    return `${start}-${String((start+1)%100).padStart(2,'0')}`;
  }
  function yearsForRange(start,end){
    if(!validDate(start)||!validDate(end)||start>end)throw Error('Invalid leave dates.');
    const result=[];let year=Number(start.slice(0,4))-(Number(start.slice(5,7))<5?1:0);
    const finish=Number(end.slice(0,4))-(Number(end.slice(5,7))<5?1:0);
    for(;year<=finish;year++)result.push(`${year}-${String((year+1)%100).padStart(2,'0')}`);
    return result;
  }
  function validateAllocation(fteDeduction,allocation,source){
    const errors=[],warnings=[];
    const fte=num(fteDeduction),baseFte=num(source?.fte);
    if(fte===null||fte<0)errors.push('INVALID_FTE_DEDUCTION');
    if(baseFte===null)errors.push('FTE_SOURCE_MISSING');
    else if(fte!==null&&fte>baseFte+0.000001)errors.push('FTE_DEDUCTION_EXCEEDS_CONTRACT');
    if(!allocation||typeof allocation!=='object')errors.push('DOE_ALLOCATION_REQUIRED');
    let sum=0,hasInvalid=false;
    for(const category of CATEGORIES){
      const value=num(allocation?.[category]),baseline=num(source?.doe?.[category]);
      if(value===null||value<0){errors.push('INVALID_'+category.toUpperCase()+'_DEDUCTION');hasInvalid=true;}
      else sum+=value;
      if(baseline===null)errors.push('DOE_SOURCE_MISSING_'+category.toUpperCase());
      else if(value!==null&&value>baseline+0.000001)errors.push('DOE_DEDUCTION_EXCEEDS_'+category.toUpperCase());
    }
    if(!hasInvalid&&fte!==null&&Math.abs(round(sum)-round(fte*100))>0.000001)errors.push('DOE_FTE_TOTAL_MISMATCH');
    if(baseFte!==null&&CATEGORIES.every(k=>num(source?.doe?.[k])!==null)){
      const total=CATEGORIES.reduce((n,k)=>n+num(source.doe[k]),0);
      if(Math.abs(round(total)-round(baseFte*100))>0.000001)warnings.push('FTE_DOE_MISMATCH');
    }
    return {valid:errors.length===0,errors,warnings};
  }
  const during=(date,leave)=>validDate(date)&&leave?.active!==false&&leave?.startDate<=date&&leave?.endDate>=date;
  const specialAvailable=l=>l?.reasonCode==='special'&&l?.availability==='available';
  function availabilityAt(date,leaves){
    const active=(Array.isArray(leaves)?leaves:[]).filter(l=>during(date,l));
    if(active.some(l=>!specialAvailable(l)&&l.availability!=='available'))return'unavailable';
    return 'available';
  }
  function evaluate({date,source,leaves=[]}={}){
    const year=academicYearForDate(date),originalFte=num(source?.fte),baseDoe=Object.fromEntries(CATEGORIES.map(k=>[k,num(source?.doe?.[k])]));
    const effectiveDoe={...baseDoe},applied=[],pending=[],flags=[];
    let effectiveFte=originalFte;
    const ordered=leaves.filter(l=>during(date,l)&&specialAvailable(l)&&l.approved===true)
      .sort((a,b)=>String(a.approvedAt||a.createdAtUtc||'').localeCompare(String(b.approvedAt||b.createdAtUtc||''))||String(a.id||a.afcRecordId||'').localeCompare(String(b.id||b.afcRecordId||'')));
    for(const leave of ordered){
      const allocation=leave.allocationsByYear?.[year],deduction=num(leave.fteDeduction);
      const result=validateAllocation(deduction,allocation,source);
      const missing=result.errors.some(x=>x.includes('SOURCE_MISSING')||x==='DOE_ALLOCATION_REQUIRED');
      const sourceChanged=leave.sourceFingerprintByYear?.[year]!==undefined&&leave.sourceFingerprintByYear?.[year]!==JSON.stringify(source);
      const heldOnDate=Array.isArray(leave.suspendedIntervals)&&leave.suspendedIntervals.some(span=>span.startDate<=date&&span.endDate>=date);
      const requestedHold=leave.confirmedYears?.[year]===false||leave.suspendedYears?.[year]===true||sourceChanged||heldOnDate;
      const exceedingAggregate=originalFte!==null&&deduction!==null&&effectiveFte!==null&&deduction>effectiveFte+0.000001||CATEGORIES.some(k=>num(allocation?.[k])!==null&&effectiveDoe[k]!==null&&allocation[k]>effectiveDoe[k]+0.000001);
      if(!result.valid||requestedHold||exceedingAggregate){
        const status=missing?'Pending Deduction':!result.valid?'Adjustment Required':exceedingAggregate?'Adjustment Required':requestedHold?'Ready to Apply':'Adjustment Required';
        pending.push({id:leave.id||leave.afcRecordId||'',status,errors:result.errors});
        const flag=exceedingAggregate&&leave.startDate!==leave.endDate?'Partial Adjustment Required':status;
        if(!flags.includes(flag))flags.push(flag);
        continue;
      }
      effectiveFte=round(effectiveFte-deduction);
      for(const k of CATEGORIES)effectiveDoe[k]=round(effectiveDoe[k]-allocation[k]);
      applied.push({id:leave.id||leave.afcRecordId||'',fteDeduction:deduction,allocation:{...allocation}});
      for(const w of result.warnings)if(!flags.includes(w))flags.push(w);
    }
    if(effectiveFte===0&&ordered.length)flags.push('Zero Effective FTE');
    const deductionFte=originalFte===null?null:round(originalFte-effectiveFte);
    const deductionDoe=Object.fromEntries(CATEGORIES.map(k=>[k,baseDoe[k]===null?null:round(baseDoe[k]-effectiveDoe[k])]));
    return {date,academicYear:year,originalFte,originalDoe:baseDoe,deductionFte,deductionDoe,effectiveFte,effectiveDoe,availability:availabilityAt(date,leaves),applied,pending,flags};
  }
  return Object.freeze({CATEGORIES,academicYearForDate,yearsForRange,validateAllocation,availabilityAt,evaluate});
});
