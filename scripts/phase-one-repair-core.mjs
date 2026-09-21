import {createHash} from 'node:crypto';
export const repairId=(userId,key)=>'phase1_'+createHash('sha256').update(`${userId}:${key}`).digest('hex').slice(0,32);
const day=date=>new Date(date).toISOString().slice(0,10);
const names={budgetPeriod:'periods',category:'categories',subcategory:'subcategories',transaction:'transactions',cyclePaymentPlan:'plans',planPayment:'payments',auditLog:'auditLogs'};
export function planPhaseOneRepair(state) {
 const creates=Object.fromEntries(Object.keys(names).map(k=>[k,[]])),updates=[],conflicts=[];
 const {userId}=state;
 const audit=(model,id,action,data,previous=null)=>creates.auditLog.push({id:repairId(userId,`audit:${model}:${id}`),userId,entityType:`PHASE_ONE_${model}`,entityId:id,action,source:'PHASE_ONE_FINANCIAL_REPAIR',previousValuesJson:previous?JSON.stringify(previous):null,newValuesJson:JSON.stringify(data),relatedRecordIds:[id]});
 const add=(model,data)=>{creates[model].push(data);audit(model,data.id,'CREATE',data);return data;};
 const update=(model,row,data)=>{if(Object.entries(data).every(([k,v])=>JSON.stringify(row[k]??null)===JSON.stringify(v)))return;updates.push({model,id:row.id,data});audit(model,row.id,'UPDATE',data,row);};
 const one=(list,label)=>{if(list.length!==1){conflicts.push(`Missing or ambiguous ${label}`);return null;}return list[0];};
 const account=name=>one(state.accounts.filter(a=>a.name===name),`account ${name}`);
 const period=(start,end)=>{
  const found=state.periods.filter(p=>day(p.startDate)===start);
  if(found.length>1||(found[0]&&day(found[0].endDate)!==end)){conflicts.push(`Ambiguous cycle ${start}`);return null;}
  return found[0]??add('budgetPeriod',{id:repairId(userId,`cycle:${start}`),userId,name:`${start} – ${end}`,startDate:new Date(start),endDate:new Date(end),status:'PLANNED'});
 };
 const current=one(state.periods.filter(p=>day(p.startDate)==='2026-09-11'&&day(p.endDate)==='2026-10-10'),'current cycle');
 const prior=period('2026-08-11','2026-09-10'),next=period('2026-10-11','2026-11-10');
 const bpiCash=account('BPI Savings'),mayaCash=account('Maya Savings');
 const configurations=[['BPI Amore',2538983,'2026-10-05','CONFIRMED',current,bpiCash?.id,null,'2026-09-12'],['Maya Credit Card',749404,'2026-09-30','CONFIRMED',current,mayaCash?.id,null,'2026-09-10'],['UnionBank Credit Card',3571173,null,'UNSET',current,null,2340000,null],['EastWest Credit Card',4551914,'2026-10-25','ESTIMATED',next,null,0,'2026-10-05']];
 const cardByName=new Map();
 for(const [name] of configurations) {
  const a=account(name);if(!a)continue;const card=one(state.cards.filter(c=>c.accountId===a.id),`card ${name}`);if(card)cardByName.set(name,{card,account:a});
 }
 const engageSub=one(state.subcategories.filter(s=>s.name==='Engage'&&state.categories.some(c=>c.id===s.categoryId&&c.type==='INCOME')),'Engage source');
 if(bpiCash&&engageSub&&current) {
  const receipt=one(state.transactions.filter(t=>t.type==='INCOME'&&t.accountId===bpiCash.id&&day(t.date)==='2026-09-16'&&t.amount===2404668),'Engage receipt');
  if(receipt) {
   if(receipt.categoryId!==engageSub.categoryId||receipt.subcategoryId!==engageSub.id)conflicts.push('Engage classification differs from audited source');
   if(receipt.budgetPeriodId!==current.id)update('transaction',receipt,{budgetPeriodId:current.id});
  }
 }
 for(const row of state.incomePlans) {
  if(!row.categoryId||!row.subcategoryId){conflicts.push(`Income source needs schema backfill: ${row.source}`);continue;}
  if(row.actualTransactionId) {
   const receipt=one(state.transactions.filter(t=>t.id===row.actualTransactionId),`linked income ${row.source}`);if(!receipt)continue;
   if(receipt.type!=='INCOME'||receipt.amount<=0){conflicts.push(`Linked receipt is not income: ${row.source}`);continue;}
   if((receipt.categoryId&&receipt.categoryId!==row.categoryId)||(receipt.subcategoryId&&receipt.subcategoryId!==row.subcategoryId)){conflicts.push(`Conflicting linked income category: ${row.source}`);continue;}
   update('transaction',receipt,{categoryId:row.categoryId,subcategoryId:row.subcategoryId});
  }
 }
 let health=state.categories.filter(c=>c.type==='EXPENSE'&&c.name==='Health');
 if(health.length>1)conflicts.push('Ambiguous Health category');
 health=health[0]??add('category',{id:repairId(userId,'health'),userId,name:'Health',type:'EXPENSE',color:'rose',icon:'heart',sortOrder:0});
 const subs=state.subcategories.filter(s=>s.categoryId===health.id&&s.name==='Hospital');
 if(subs.length>1)conflicts.push('Ambiguous Hospital category');
 const hospital=subs[0]??add('subcategory',{id:repairId(userId,'hospital'),userId,categoryId:health.id,name:'Hospital',sortOrder:0});
 const ew=cardByName.get('EastWest Credit Card');let recordedHospital=0;
 if(ew&&prior)for(const [date,amount,description] of [['2026-09-06',3000000,'Hospital deposit'],['2026-09-10',1551914,'Hospital remaining balance']]) {
  const matches=state.transactions.filter(t=>t.accountId===ew.account.id&&day(t.date)===date&&t.type==='EXPENSE'&&t.amount===-amount);
  if(matches.length>1){conflicts.push(`Ambiguous hospital charge ${date}`);continue;}
  const classification={categoryId:health.id,subcategoryId:hospital.id,budgetPeriodId:prior.id,creditCardId:ew.card.id};
  if(matches.length){recordedHospital+=amount;update('transaction',matches[0],classification);}
  else add('transaction',{id:repairId(userId,`hospital:${date}`),userId,date:new Date(date),type:'EXPENSE',amount:-amount,accountId:ew.account.id,...classification,description,notes:'Phase 1: historical Health/Hospital expense; card liability only, no cash movement',status:'CLEARED'});
 }
 const eastWestHospitalIds=new Set(state.transactions.filter(t=>t.accountId===ew?.account.id&&t.type==='EXPENSE'&&[['2026-09-06',-3000000],['2026-09-10',-1551914]].some(([date,amount])=>day(t.date)===date&&t.amount===amount)).map(t=>t.id));
 const eastWestLaterLedger=ew?state.transactions.filter(t=>t.accountId===ew.account.id&&!eastWestHospitalIds.has(t.id)).reduce((s,t)=>s-t.amount,0):0;
 const targets={'BPI Amore':3252965,'Maya Credit Card':1869566,'UnionBank Credit Card':5911173,'EastWest Credit Card':ew?ew.card.creditLimit-ew.account.openingBalance+recordedHospital+eastWestLaterLedger:recordedHospital};
 for(const [name,{card,account:a}] of cardByName){
  const liability=card.creditLimit-a.openingBalance-state.transactions.filter(t=>t.accountId===a.id).reduce((s,t)=>s+t.amount,0);
  if(liability!==targets[name])conflicts.push(`${name} liability mismatch: ${liability} != ${targets[name]}`);
 }
 let mayaPlan;
 for(const [name,amount,due,confidence,cycle,funding,unbilled,statement] of configurations){
  const record=cardByName.get(name);if(!record||!cycle)continue;
  const matches=state.plans.filter(p=>p.sourceType==='CREDIT_CARD'&&p.sourceId===record.card.id&&p.budgetPeriodId===cycle.id);
  if(matches.length>1){conflicts.push(`Ambiguous plan ${name}`);continue;}
  const priorPlan=matches[0];
  const data={userId,budgetPeriodId:cycle.id,sourceType:'CREDIT_CARD',sourceId:record.card.id,expectedAmount:amount,dueDate:due?new Date(due):null,dueDateStatus:confidence,fundingAccountId:priorPlan?.fundingAccountId??funding,statementAmount:amount,statementDate:statement?new Date(statement):null,verifiedUnbilledAmount:unbilled};
  let planned=priorPlan;
  if(!priorPlan)planned=add('cyclePaymentPlan',{id:repairId(userId,`plan:${name}:${cycle.id}`),...data});
  else if(!state.auditLogs.some(a=>a.source==='PHASE_ONE_FINANCIAL_REPAIR'&&a.entityId===priorPlan.id))update('cyclePaymentPlan',priorPlan,data);
  if(name==='Maya Credit Card')mayaPlan=planned;
 }
 const maya=cardByName.get('Maya Credit Card');
 if(maya&&mayaCash&&mayaPlan){
  const receipt=one(state.transactions.filter(t=>t.type==='CREDIT_CARD_PAYMENT'&&t.amount===-749404&&t.accountId===mayaCash.id&&t.creditCardId===maya.card.id&&day(t.date)==='2026-09-12'),'existing Maya cash-side payment');
  if(receipt){
   const paired=state.transactions.find(t=>t.id===receipt.linkedTransactionId);
   if(!paired||paired.amount!==749404||paired.accountId!==maya.account.id||paired.linkedTransactionId!==receipt.id||paired.type!=='CREDIT_CARD_PAYMENT')conflicts.push('Maya payment ledger pair differs');
   const existing=state.payments.filter(p=>p.transactionId===receipt.id);
   if(existing.length>1||(existing[0]&&(existing[0].planId!==mayaPlan.id||existing[0].amount!==749404)))conflicts.push('Maya payment already allocated inconsistently');
   else if(!existing.length)add('planPayment',{id:repairId(userId,'maya-link'),userId,planId:mayaPlan.id,transactionId:receipt.id,amount:749404});
  }
 }
 return {creates,updates,conflicts};
}
export function projectRepair(state,plan,stage='all') {
 const after=structuredClone(state);
 const selected=selectRepairStage(plan,stage);
 for(const [model,rows]of Object.entries(selected.creates))after[names[model]].push(...rows);
 for(const change of selected.updates)Object.assign(after[names[change.model]].find(r=>r.id===change.id),change.data);
 return after;
}
export function selectRepairStage(plan,stage='all'){
 const selected=(model,row)=>stage==='all'||(stage==='plans'?!isHospital(model,row):isHospital(model,row));
 const creates=Object.fromEntries(Object.entries(plan.creates).filter(([m])=>m!=='auditLog').map(([model,rows])=>[model,rows.filter(row=>selected(model,row))]));
 const updates=plan.updates.filter(row=>selected(row.model,row));
 const ids=new Set([...Object.values(creates).flat().map(r=>r.id),...updates.map(r=>r.id)]);
 creates.auditLog=plan.creates.auditLog.filter(row=>ids.has(row.entityId));
 return {creates,updates,conflicts:plan.conflicts};
}
export function isHospital(model,row){return model==='category'||model==='subcategory'||model==='transaction'&&((row.description??'').startsWith('Hospital')||row.data?.creditCardId)||model==='auditLog'&&['PHASE_ONE_category','PHASE_ONE_subcategory'].includes(row.entityType)||model==='auditLog'&&row.newValuesJson?.includes('Hospital');}
export function reconcilePhaseOne(state){
 const accounts=state.accounts.map(a=>({id:a.id,name:a.name,opening:a.openingBalance,balance:a.openingBalance+state.transactions.filter(t=>t.accountId===a.id).reduce((s,t)=>s+t.amount,0)}));
 const cards=state.cards.map(card=>{
  const a=accounts.find(a=>a.id===card.accountId),plan=state.plans.find(p=>p.sourceType==='CREDIT_CARD'&&p.sourceId===card.id&&p.statementAmount!==null);
  const paid=plan?state.payments.filter(p=>p.planId===plan.id).reduce((s,p)=>s+p.amount,0):0;
  const cycle=plan?state.periods.find(p=>p.id===plan.budgetPeriodId):null;
  return {name:a.name,creditLimit:card.creditLimit,availableCredit:a.balance,totalLiability:card.creditLimit-a.balance,statementAmount:plan?.statementAmount??null,statementRemaining:plan?Math.max(0,plan.statementAmount-paid):null,plannedPayment:plan?.expectedAmount??null,paid,paymentStatus:plan?(paid>=plan.expectedAmount?'PAID':paid>0?'PARTIAL':'UNPAID'):'UNPLANNED',dueDate:plan?.dueDate??null,dueDateStatus:plan?.dueDateStatus??'UNSET',unbilled:plan?.verifiedUnbilledAmount??null,cycle:cycle?`${day(cycle.startDate)} – ${day(cycle.endDate)}`:null};
 });
 const periods=state.periods.map(p=>{const rows=state.transactions.filter(t=>t.budgetPeriodId===p.id);return {start:day(p.startDate),end:day(p.endDate),income:rows.filter(t=>t.type==='INCOME').reduce((s,t)=>s+t.amount,0),expenses:rows.filter(t=>t.type==='EXPENSE'||t.type==='REFUND').reduce((s,t)=>s-t.amount,0)};});
 return {accounts,cards,periods,transactionCount:state.transactions.length};
}
