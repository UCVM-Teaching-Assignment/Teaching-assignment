(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PAWS_MULTI_WEEK_COMPARISON=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const SEMESTERS=Object.freeze(['spring','fall','winter']);
  const key=(semester,week)=>semester+':'+week;
  function validate(semester,week,weekCount=17){
    const term=String(semester||'').toLowerCase(),count=Number(week);
    if(!SEMESTERS.includes(term)||!Number.isInteger(count)||count<1||count>weekCount)
      throw Error('Choose a valid semester and academic week.');
    return {semester:term,week:count,key:key(term,count)};
  }
  function create({weekCount=17}={}){
    if(!Number.isInteger(weekCount)||weekCount<1)throw Error('Invalid academic week count');
    let periods=[];
    return Object.freeze({
      add(semester,week){
        const selected=validate(semester,week,weekCount);
        if(periods.some(item=>item.key===selected.key))return false;
        periods=[...periods,selected];
        return true;
      },
      remove(periodKey){
        const before=periods.length;
        periods=periods.filter(item=>item.key!==periodKey);
        return before!==periods.length;
      },
      has(periodKey){return periods.some(item=>item.key===periodKey)},
      list(){return periods.map(item=>({...item}))},
      clear(){periods=[]},
      size(){return periods.length}
    });
  }
  return Object.freeze({SEMESTERS,key,validate,create});
});
