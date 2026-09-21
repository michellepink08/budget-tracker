import 'dotenv/config';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {PrismaNeon} from '@prisma/adapter-neon';
import {neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
import {planPhaseOneRepair,reconcilePhaseOne} from './phase-one-repair-core.mjs';
import {listCycleIncomePlans} from '../src/lib/cycle-income-plans';
import {listCycleObligations} from '../src/lib/financial-obligation-view';
import {classifyObligation} from '../src/lib/financial-obligations';
import {listCalendarEntries} from '../src/lib/calendar/aggregate';
import {makeCreditCardPayment} from '../src/lib/credit-cards';
import {computeAccountBalance} from '../src/lib/account-balance';
import {computeLoanRemainingBalance} from '../src/lib/loans';
import {computeLendingOutstanding} from '../src/lib/lending';
import {incomeVsExpenseByPeriod} from '../src/lib/reports';
import {linkPlanPayment} from '../src/lib/cycle-payment-plans';
import {nextStatementDate,projectCardStatement} from '../src/lib/card-statements';
import {createExpenseLikeTransaction} from '../src/lib/transactions';
import {recordConfirmedCardInterest} from '../src/lib/card-interest';
const live=process.env.RUN_PHASE_ONE_DB_TESTS==='1'?describe:describe.skip;
live('Phase one live financial reconciliation',()=>{
 let p,state,period;
 const models={account:'accounts',creditCard:'cards',transaction:'transactions',category:'categories',subcategory:'subcategories',cycleIncomePlan:'incomePlans',cyclePaymentPlan:'plans',planPayment:'payments',budgetPeriod:'periods',auditLog:'auditLogs',loan:'loans',lending:'lendings'};
 async function read(){const s={userId:state.userId};await Promise.all(Object.entries(models).map(async([m,k])=>s[k]=await p[m].findMany({where:{userId:s.userId},orderBy:{id:'asc'}})));return s;}
 beforeAll(async()=>{
  neonConfig.webSocketConstructor=ws;neonConfig.poolQueryViaFetch=true;
  p=new PrismaClient({adapter:new PrismaNeon({connectionString:process.env.DATABASE_URL}),transactionOptions:{maxWait:10000,timeout:60000}});
  const u=await p.user.findUniqueOrThrow({where:{email:'michellepgar@gmail.com'},select:{id:true}});state={userId:u.id};state=await read();period=state.periods.find(p=>p.startDate.toISOString().slice(0,10)==='2026-09-11');
 },60000);
 afterAll(async()=>{if(p)await p.$disconnect();});
 it('includes the existing Engage salary by category and keeps total actual income',async()=>{
  const plans=await listCycleIncomePlans(p,state.userId,period.id),engage=plans.find(i=>i.source==='Engage');
  expect(engage).toMatchObject({actual:2404668,difference:204668,actualTransactionIds:['sept_66c72242178952680e57e688ba12a2cec3728efa']});
  expect(plans.reduce((s,r)=>s+r.actual,0)).toBe(16436345);
 },60000);
 it('reconciles automatic next-statement forecasts without adding interest to liability or creating duplicate records',async()=>{
  const before=await read(),today=new Date('2026-09-18');
  const expected={'BPI Amore':[3252965,76169,3329134],'Maya Credit Card':[1869566,0,1869566],'UnionBank Credit Card':[5911173,0,5911173],'EastWest Credit Card':[6296399,0,6296399]};
  for(const card of state.cards){
   const account=state.accounts.find(a=>a.id===card.accountId),cutoff=nextStatementDate(today,card.statementDay);
   const first=projectCardStatement({...card,account},cutoff,state.transactions,state.plans,today);
   expect([first.principal,first.estimatedInterest,first.expected],account.name).toEqual(expected[account.name]);
   expect(projectCardStatement({...card,account},cutoff,state.transactions,state.plans,today)).toEqual(first);
   if(account.name==='UnionBank Credit Card')expect(first).toMatchObject({dueDate:null,dueDateStatus:'UNSET'});
  }
  expect(await read()).toEqual(before);
 },60000);
 it('simulates a new card purchase, refund and deletion with real ledger helpers, then rolls everything back',async()=>{
  const before=await read(),card=state.cards.find(c=>state.accounts.find(a=>a.id===c.accountId).name==='BPI Amore'),account=state.accounts.find(a=>a.id===card.accountId),next=state.periods.find(p=>p.startDate.toISOString().slice(0,10)==='2026-10-11');
  const sentinel='CARD_PURCHASE_ROLLBACK';
  await expect(p.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.userId}))`;
   const expense=await createExpenseLikeTransaction(tx,state.userId,11,{type:'EXPENSE',amount:12345,date:new Date('2026-09-18'),accountId:account.id,budgetPeriodId:period.id,description:'Automatic statement verification'});
   const rows=await listCycleObligations(tx,state.userId,next.id);
   expect(rows.find(r=>r.sourceId===card.id)).toMatchObject({automaticPrincipal:3265310,estimatedInterest:76169,expected:3341479});
   expect((await listCycleObligations(tx,state.userId,period.id)).find(r=>r.sourceId===card.id)).toMatchObject({expected:2538983,actual:0});
   const refund=await createExpenseLikeTransaction(tx,state.userId,11,{type:'REFUND',amount:5000,date:new Date('2026-09-19'),accountId:account.id,budgetPeriodId:period.id,description:'Automatic statement refund verification'});
   await tx.transaction.update({where:{id:refund.id},data:{linkedTransactionId:expense.id}});
   expect((await listCycleObligations(tx,state.userId,next.id)).find(r=>r.sourceId===card.id)).toMatchObject({automaticPrincipal:3260310,expected:3336479});
   await tx.transaction.deleteMany({where:{id:{in:[expense.id,refund.id]},userId:state.userId}});
   expect((await listCycleObligations(tx,state.userId,next.id)).find(r=>r.sourceId===card.id)).toMatchObject({automaticPrincipal:3252965,expected:3329134});
   for(const cash of state.accounts.filter(a=>a.accountType!=='CREDIT_CARD'))expect(await computeAccountBalance(tx,cash.id),cash.name).toBe(await computeAccountBalance(p,cash.id));
   throw Error(sentinel);
  },{timeout:60000})).rejects.toThrow(sentinel);
  expect(await read()).toEqual(before);
 },60000);
 it('reconciles all four statements and liability targets without rewriting balances',()=>{
  const report=reconcilePhaseOne(state);
  expect(report.cards.map(c=>[c.name,c.statementAmount,c.totalLiability,c.plannedPayment,c.paymentStatus,c.dueDateStatus])).toEqual([
   ['BPI Amore',2538983,3252965,2538983,'UNPAID','CONFIRMED'],['Maya Credit Card',749404,1869566,749404,'PAID','CONFIRMED'],['UnionBank Credit Card',3571173,5911173,3571173,'UNPAID','UNSET'],['EastWest Credit Card',4551914,6296399,4551914,'UNPAID','ESTIMATED']]);
  expect(report.cards.find(c=>c.name==='Maya Credit Card').statementRemaining).toBe(0);
  expect(report.cards.find(c=>c.name==='UnionBank Credit Card')).toMatchObject({availableCredit:588827,unbilled:2340000,dueDate:null});
  expect(report.cards.find(c=>c.name==='EastWest Credit Card').cycle).toBe('2026-10-11 – 2026-11-10');
 });
 it('records bank-confirmed interest once, suppresses the estimate and rolls every change back',async()=>{
  const before=await read(),card=state.cards.find(c=>state.accounts.find(a=>a.id===c.accountId).name==='BPI Amore'),next=state.periods.find(p=>p.startDate.toISOString().slice(0,10)==='2026-10-11');
  const sentinel='CARD_INTEREST_ROLLBACK';
  await expect(p.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.userId}))`;
   const bridge=new Proxy(tx,{get(target,key){return key==='$transaction'?fn=>fn(tx):Reflect.get(target,key);}});
   const input={amount:12345,date:new Date('2026-09-18'),statementDate:new Date('2026-10-12')};
   const first=await recordConfirmedCardInterest(bridge,state.userId,11,card.id,input);expect(first.ok).toBe(true);
   expect(await recordConfirmedCardInterest(bridge,state.userId,11,card.id,input)).toEqual(first);
   expect(await tx.transaction.count({where:{userId:state.userId}})).toBe(before.transactions.length+1);
   expect((await listCycleObligations(tx,state.userId,next.id)).find(r=>r.sourceId===card.id)).toMatchObject({automaticPrincipal:3265310,estimatedInterest:0,expected:3265310});
   expect((await incomeVsExpenseByPeriod(tx,state.userId)).find(r=>r.periodId===period.id)).toMatchObject({income:16436345,expense:2576231});
   throw Error(sentinel);
  },{timeout:60000})).rejects.toThrow(sentinel);
  expect(await read()).toEqual(before);
 },60000);
 it('routes UnionBank as unscheduled and Maya as already paid in the shared projection',async()=>{
  const rows=await listCycleObligations(p,state.userId,period.id),ub=rows.find(r=>r.name==='UnionBank Credit Card'),maya=rows.find(r=>r.name==='Maya Credit Card');
  expect(classifyObligation(ub,new Date('2026-09-17'))).toBe('UNSCHEDULED');expect(maya).toMatchObject({actual:749404,remaining:0,status:'PAID'});
  expect(rows.filter(r=>r.sourceType==='CREDIT_CARD'&&r.name==='Maya Credit Card')).toHaveLength(1);
 },60000);
 it('uses the saved plans and confidence in Calendar without invented UnionBank events',async()=>{
  const entries=await listCalendarEntries(p,state.userId,{start:new Date('2026-09-11'),end:new Date('2026-11-10')},new Date('2026-09-17'));
  const card=name=>state.cards.find(c=>state.accounts.find(a=>a.id===c.accountId).name===name);
  expect(entries.filter(e=>e.sourceType==='CREDIT_CARD_DUE'&&e.sourceId===card('UnionBank Credit Card').id&&e.date<=period.endDate)).toEqual([]);
  expect(entries.find(e=>e.sourceType==='CREDIT_CARD_DUE'&&e.sourceId===card('Maya Credit Card').id&&e.date.toISOString().slice(0,10)==='2026-09-30')).toMatchObject({state:'PAID',amount:0,confidence:'CONFIRMED'});
  expect(entries.find(e=>e.sourceType==='CREDIT_CARD_DUE'&&e.sourceId===card('EastWest Credit Card').id&&e.date.toISOString().slice(0,10)==='2026-10-25')).toMatchObject({amount:6296399,confidence:'ESTIMATED'});
 },60000);
 it('counts historical Health/Hospital once and preserves current/next-cycle expense totals',async()=>{
  const report=reconcilePhaseOne(state);expect(report.periods.find(p=>p.start==='2026-08-11').expenses).toBe(4551914);expect(report.periods.find(p=>p.start==='2026-09-11').expenses).toBe(2563886);expect(report.periods.find(p=>p.start==='2026-10-11').expenses).toBe(0);
  const health=state.categories.find(c=>c.name==='Health'),charges=state.transactions.filter(t=>t.categoryId===health.id);expect(charges).toHaveLength(2);expect(charges.map(c=>c.date.toISOString().slice(0,10))).toEqual(['2026-09-06','2026-09-10']);
  expect((await incomeVsExpenseByPeriod(p,state.userId)).find(r=>r.periodId===period.id)).toMatchObject({income:16436345,expense:2563886});
 },60000);
 it('preserves all cash balances, named loans and Mama zero receivable',async()=>{
  const expected={'BPI Savings':10207895,MariBank:128943,'Maya Savings':96447,'GCash/CIMB':539368,Cash:1025200,ChinaBank:3816068,GoTyme:111,OwnBank:6372,'UnionBank Savings':3691};
  for(const [name,want]of Object.entries(expected))expect(await computeAccountBalance(p,state.accounts.find(a=>a.name===name).id),name).toBe(want);
  const loans={'SLoan 1':8089956,'SLoan 2':1383383,SPaylater:4919554,GGives:4050998,'Maya Loan':4587591,GLoan:12313328,'MariBank Loan':4739000};
  for(const [name,want]of Object.entries(loans))expect(await computeLoanRemainingBalance(p,state.loans.find(l=>l.name===name)),name).toBe(want);
  for(const receivable of state.lendings.filter(l=>l.borrowerName==='Mama'))expect(await computeLendingOutstanding(p,receivable)).toBe(0);
 },60000);
 it('has zero creates, updates, duplicate payment links or unresolved repair records',()=>{
  const plan=planPhaseOneRepair(state);expect(plan.conflicts).toEqual([]);expect(plan.updates).toEqual([]);expect(Object.values(plan.creates).flat()).toEqual([]);expect(state.payments).toHaveLength(1);
  expect(state.payments[0]).toMatchObject({transactionId:'sept_d9333fbdcc19fbeaadb1b423f29470f0d2ba37a1',amount:749404});
 });
 it('simulates UnionBank statement payment with real helpers and rolls back every record',async()=>{
  const before=await read(),card=state.cards.find(c=>state.accounts.find(a=>a.id===c.accountId).name==='UnionBank Credit Card'),account=state.accounts.find(a=>a.name==='BPI Savings'),plan=state.plans.find(p=>p.sourceId===card.id);
  const sentinel='UNIONBANK_PAYMENT_ROLLBACK';
  await expect(p.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.userId}))`;
   const bridge=new Proxy(tx,{get(target,key){return key==='$transaction'?fn=>fn(tx):Reflect.get(target,key);}});
   const result=await makeCreditCardPayment(bridge,state.userId,11,card.id,{accountId:account.id,amount:3571173,date:new Date('2026-09-17')});
   expect(result.ok).toBe(true);expect(card.creditLimit-await computeAccountBalance(tx,card.accountId)).toBe(2340000);
   expect(await linkPlanPayment(bridge,state.userId,plan.id,result.transactionId,3571173)).toEqual({ok:true});
   const rows=await listCycleObligations(tx,state.userId,period.id);expect(rows.find(r=>r.sourceId===card.id)).toMatchObject({actual:3571173,remaining:0,status:'PAID'});
   expect((await incomeVsExpenseByPeriod(tx,state.userId)).find(r=>r.periodId===period.id)).toMatchObject({income:16436345,expense:2563886});
   throw Error(sentinel);
  })).rejects.toThrow(sentinel);
  const after=await read();for(const key of Object.values(models))expect(after[key],`rollback ${key}`).toEqual(before[key]);
 },60000);
});
