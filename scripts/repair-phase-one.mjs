import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {PrismaNeon} from '@prisma/adapter-neon';
import {neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
import {planPhaseOneRepair,projectRepair,reconcilePhaseOne,selectRepairStage} from './phase-one-repair-core.mjs';
neonConfig.webSocketConstructor=ws;neonConfig.poolQueryViaFetch=true;
const emailIndex=process.argv.indexOf('--user-email'),email=process.argv[emailIndex+1];
const stageIndex=process.argv.indexOf('--stage'),stage=stageIndex<0?'all':process.argv[stageIndex+1];
const apply=process.argv.includes('--apply'),rollback=process.argv.includes('--rollback-check');
if(emailIndex<0||!email||apply&&rollback||!['all','plans','hospital'].includes(stage))throw Error('Provide --user-email, one write mode and valid stage');
const p=new PrismaClient({adapter:new PrismaNeon({connectionString:process.env.DATABASE_URL}),transactionOptions:{maxWait:10000,timeout:60000}});
const models={account:'accounts',creditCard:'cards',transaction:'transactions',category:'categories',subcategory:'subcategories',cycleIncomePlan:'incomePlans',cyclePaymentPlan:'plans',planPayment:'payments',budgetPeriod:'periods',auditLog:'auditLogs',loan:'loans',lending:'lendings'};
export async function readPhaseOneState(db,userId){
 const state={userId};await Promise.all(Object.entries(models).map(async([model,key])=>state[key]=await db[model].findMany({where:{userId},orderBy:{id:'asc'}})));return state;
}
const fingerprint=state=>Object.fromEntries(Object.keys(models).map(m=>[m,JSON.stringify(state[models[m]])]));
const counts=plan=>({creates:Object.fromEntries(Object.entries(plan.creates).map(([m,rows])=>[m,rows.length])),updates:plan.updates.length,conflicts:plan.conflicts});
function verifyProtected(before,after){
 for(const key of ['accounts','loans','lendings'])if(JSON.stringify(before[key])!==JSON.stringify(after[key]))throw Error(`STOP: protected ${key} changed`);
 const beforeBalances=reconcilePhaseOne(before).accounts,afterBalances=reconcilePhaseOne(after).accounts;
 const cardAccounts=new Set(before.cards.map(c=>c.accountId));
 for(const row of beforeBalances)if(!cardAccounts.has(row.id)&&afterBalances.find(a=>a.id===row.id).balance!==row.balance)throw Error(`STOP: ${row.name} cash balance changed`);
 for(const row of before.transactions){
  const current=after.transactions.find(t=>t.id===row.id);if(!current)throw Error(`STOP: deleted transaction ${row.id}`);
  for(const key of ['date','type','amount','accountId','destinationAccountId','loanId','linkedTransactionId','description','notes'])if(JSON.stringify(row[key])!==JSON.stringify(current[key]))throw Error(`STOP: unauthorized transaction ${key} change ${row.id}`);
 }
 for(const [name,want]of [['SLoan 1',8089956],['SLoan 2',1383383],['SPaylater',4919554]]){
  const loan=after.loans.filter(l=>l.name===name);if(loan.length!==1)throw Error(`STOP: protected ${name} ambiguous`);
  const actual=loan[0].openingBalance+after.transactions.filter(t=>t.loanId===loan[0].id&&t.type==='LOAN_PAYMENT').reduce((s,t)=>s+t.amount,0);
  if(actual!==want)throw Error(`STOP: protected ${name} remaining ${actual} differs from ${want}`);
 }
}
try{
 const user=await p.user.findUnique({where:{email},select:{id:true}});if(!user)throw Error('User not found');
 const before=await readPhaseOneState(p,user.id),plan=planPhaseOneRepair(before),selected=selectRepairStage(plan,stage);
 console.log('Read-only audit',JSON.stringify({stage,...counts(selected),proposedCreates:Object.fromEntries(Object.entries(selected.creates).filter(([m])=>m!=='auditLog')),proposedUpdates:selected.updates},null,2));
 if(plan.conflicts.length)throw Error(`STOP: ${JSON.stringify(plan.conflicts)}`);
 const projected=projectRepair(before,plan,stage);verifyProtected(before,projected);
 console.log('Projected reconciliation',JSON.stringify(reconcilePhaseOne(projected),null,2));
 if(apply||rollback){
  const sentinel='PHASE_ONE_REPAIR_ROLLBACK';
  try{await p.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
   await tx.$queryRaw`SELECT id FROM "Account" WHERE "userId"=${user.id} FOR UPDATE`;
   await tx.$queryRaw`SELECT id FROM "Loan" WHERE "userId"=${user.id} FOR UPDATE`;
   const locked=await readPhaseOneState(tx,user.id);
   if(JSON.stringify(fingerprint(locked))!==JSON.stringify(fingerprint(before)))throw Error('STOP: database changed after audit');
   const fresh=planPhaseOneRepair(locked);if(fresh.conflicts.length)throw Error(`STOP: ${JSON.stringify(fresh.conflicts)}`);
   const changes=selectRepairStage(fresh,stage);
   for(const model of ['budgetPeriod','category','subcategory','transaction','cyclePaymentPlan','planPayment'])if(changes.creates[model].length)await tx[model].createMany({data:changes.creates[model]});
   for(const row of changes.updates)await tx[row.model].update({where:{id:row.id},data:row.data});
   if(changes.creates.auditLog.length)await tx.auditLog.createMany({data:changes.creates.auditLog});
   const after=await readPhaseOneState(tx,user.id);verifyProtected(before,after);
   const repeat=selectRepairStage(planPhaseOneRepair(after),stage);
   if(repeat.conflicts.length||Object.values(repeat.creates).flat().length||repeat.updates.length)throw Error('STOP: second stage audit is not zero-change');
   console.log('Verified write checkpoint',JSON.stringify({stage,...counts(changes),repeatCreates:0,repeatUpdates:0,protectedBalancesUnchanged:true}));
   if(rollback)throw Error(sentinel);
  });}catch(e){if(!rollback||e.message!==sentinel)throw e;console.log('Rollback completed');}
  const persisted=await readPhaseOneState(p,user.id);
  if(rollback&&JSON.stringify(fingerprint(persisted))!==JSON.stringify(fingerprint(before)))throw Error('STOP: rollback leaked records');
  verifyProtected(before,persisted);
  console.log('Persisted reconciliation',JSON.stringify(reconcilePhaseOne(persisted),null,2));
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{await p.$disconnect();}
