import {describe,it,expect} from 'vitest';
import {planPhaseOneRepair,projectRepair,reconcilePhaseOne} from './phase-one-repair-core.mjs';
function fixture() {
 const userId='u';
 const cards=[['bpi','BPI Amore',3500000,247035],['maya','Maya Credit Card',4500000,2024241],['ub','UnionBank Credit Card',6500000,588827],['ew','EastWest Credit Card',9900000,9900000]];
 const accounts=cards.map(([id,name,limit,openingBalance])=>({id:`a-${id}`,userId,name,openingBalance}));
 accounts.push({id:'cash-bpi',userId,name:'BPI Savings',openingBalance:0},{id:'cash-maya',userId,name:'Maya Savings',openingBalance:0});
 const transactions=[{id:'engage',userId,date:new Date('2026-09-16'),type:'INCOME',amount:2404668,accountId:'cash-bpi',categoryId:'income',subcategoryId:'engage',budgetPeriodId:'current'},
 {id:'out',userId,date:new Date('2026-09-12'),type:'CREDIT_CARD_PAYMENT',amount:-749404,accountId:'cash-maya',creditCardId:'maya',linkedTransactionId:'in',budgetPeriodId:'current'},
 {id:'in',userId,date:new Date('2026-09-12'),type:'CREDIT_CARD_PAYMENT',amount:749404,accountId:'a-maya',linkedTransactionId:'out',budgetPeriodId:'current'},
 {id:'claude1',userId,date:new Date('2026-09-13'),type:'EXPENSE',amount:-107332,accountId:'a-maya',budgetPeriodId:'current'},
 {id:'claude2',userId,date:new Date('2026-09-15'),type:'EXPENSE',amount:-35879,accountId:'a-maya',budgetPeriodId:'current'}];
 return {userId,accounts,cards:cards.map(([id,name,creditLimit])=>({id,userId,accountId:`a-${id}`,creditLimit})),transactions,categories:[{id:'income',userId,type:'INCOME',name:'Income'}],subcategories:[{id:'engage',userId,categoryId:'income',name:'Engage'}],incomePlans:[{id:'income-plan',userId,source:'Engage',categoryId:'income',subcategoryId:'engage',actualTransactionId:null}],plans:[],payments:[],periods:[{id:'current',userId,startDate:new Date('2026-09-11'),endDate:new Date('2026-10-10')}],auditLogs:[],loans:[],lendings:[]};
}
describe('phase one repairs',()=>{
 it('creates four plans and only two historical card purchases',()=>{
  const plan=planPhaseOneRepair(fixture());expect(plan.conflicts).toEqual([]);expect(plan.creates.cyclePaymentPlan).toHaveLength(4);expect(plan.creates.transaction).toHaveLength(2);
  expect(plan.creates.transaction.map(t=>[t.type,t.amount,t.accountId])).toEqual([['EXPENSE',-3000000,'a-ew'],['EXPENSE',-1551914,'a-ew']]);
  expect(plan.creates.planPayment[0]).toMatchObject({transactionId:'out',amount:749404});
 });
 it('second run creates and updates zero records',()=>{
  const before=fixture(),after=projectRepair(before,planPhaseOneRepair(before));const repeat=planPhaseOneRepair(after);
  expect(repeat.conflicts).toEqual([]);expect(Object.values(repeat.creates).flat()).toEqual([]);expect(repeat.updates).toEqual([]);
 });
 it('stops if an audited live liability differs',()=>{
  const state=fixture();state.accounts[0].openingBalance+=1;expect(planPhaseOneRepair(state).conflicts).toContain('BPI Amore liability mismatch: 3252964 != 3252965');
 });
 it('stops for ambiguous hospital matches',()=>{
  const state=fixture();state.transactions.push(...['one','two'].map(id=>({id,userId:'u',date:new Date('2026-09-06'),accountId:'a-ew',type:'EXPENSE',amount:-3000000})));
  expect(planPhaseOneRepair(state).conflicts.some(c=>c.includes('Ambiguous hospital'))).toBe(true);
 });
 it('keeps unset UnionBank and next-cycle estimated EastWest plans',()=>{
  const plan=planPhaseOneRepair(fixture());expect(plan.creates.cyclePaymentPlan.find(p=>p.sourceId==='ub')).toMatchObject({expectedAmount:3571173,dueDate:null,dueDateStatus:'UNSET',verifiedUnbilledAmount:2340000});
  const ew=plan.creates.cyclePaymentPlan.find(p=>p.sourceId==='ew');expect(ew.dueDateStatus).toBe('ESTIMATED');expect(ew.dueDate.toISOString().slice(0,10)).toBe('2026-10-25');expect(ew.budgetPeriodId).not.toBe('current');
 });
 it('preserves later legitimate edits of an already repaired plan',()=>{
  const before=fixture(),after=projectRepair(before,planPhaseOneRepair(before));after.plans.find(p=>p.sourceId==='ub').expectedAmount=10000;
  expect(planPhaseOneRepair(after).updates).toEqual([]);
 });
 it('historical purchases do not change any cash balance',()=>{
  const before=fixture(),after=projectRepair(before,planPhaseOneRepair(before));const report=reconcilePhaseOne(after);
  expect(report.cards.find(c=>c.name==='EastWest Credit Card')).toMatchObject({totalLiability:4551914,availableCredit:5348086});
  expect(report.accounts.find(a=>a.name==='BPI Savings').balance).toBe(2404668);expect(report.accounts.find(a=>a.name==='Maya Savings').balance).toBe(-749404);
 });
});
