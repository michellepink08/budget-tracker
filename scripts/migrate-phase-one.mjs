import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {PrismaNeon} from '@prisma/adapter-neon';
import {neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
import {planIncomeBackfill} from './phase-one-backfill-core.mjs';
neonConfig.webSocketConstructor=ws; neonConfig.poolQueryViaFetch=true;
const index=process.argv.indexOf('--user-email'),email=process.argv[index+1];
if(index<0||!email) throw Error('Provide --user-email');
const apply=process.argv.includes('--apply'),rollback=process.argv.includes('--rollback-check');
if(apply&&rollback) throw Error('Choose one write mode');
const p=new PrismaClient({adapter:new PrismaNeon({connectionString:process.env.DATABASE_URL}),transactionOptions:{maxWait:10000,timeout:60000}});
async function audit(db,userId) {
  const where={userId};
  const [accounts,transactions,cards,categories,subcategories,incomePlans]=await Promise.all([db.account.findMany({where,orderBy:{id:'asc'}}),db.transaction.findMany({where,orderBy:{id:'asc'}}),db.creditCard.findMany({where}),db.category.findMany({where}),db.subcategory.findMany({where}),db.cycleIncomePlan.findMany({where,select:{id:true,userId:true,source:true,actualTransactionId:true}})]);
  const targets={'BPI Amore':3252965,'Maya Credit Card':1869566,'UnionBank Credit Card':5911173,'EastWest Credit Card':0};
  for(const [name,want] of Object.entries(targets)) {
    const matches=cards.filter(c=>accounts.find(a=>a.id===c.accountId)?.name===name);
    if(matches.length!==1) throw Error(`Ambiguous card: ${name}`);
    const card=matches[0],account=accounts.find(a=>a.id===card.accountId);
    const actual=card.creditLimit-account.openingBalance-transactions.filter(t=>t.accountId===account.id).reduce((s,t)=>s+t.amount,0);
    let target=want;
    if(name==='EastWest Credit Card') {
      for(const [date,amount] of [['2026-09-06',3000000],['2026-09-10',1551914]]) {
        const matches=transactions.filter(t=>t.accountId===account.id&&t.type==='EXPENSE'&&t.amount===-amount&&t.date.toISOString().slice(0,10)===date);
        if(matches.length>1) throw Error(`Ambiguous authorized EastWest charge: ${date}`);
        if(matches.length===1) target+=amount;
      }
    }
    if(actual!==target) throw Error(`STOP: ${name} liability ${actual} differs from audited target ${target}`);
  }
  return {userId,accounts,transactions,categories,subcategories,incomePlans};
}
async function hasSchema(db) {
  const rows=await db.$queryRaw`SELECT column_name::text FROM information_schema.columns WHERE table_name='CyclePaymentPlan' AND column_name='dueDateStatus'`;
  return rows.length===1;
}
try {
  const user=await p.user.findUnique({where:{email},select:{id:true}});if(!user) throw Error('User not found');
  const before=await audit(p,user.id),schema=await hasSchema(p);
  if(schema) before.incomePlans=await p.cycleIncomePlan.findMany({where:{userId:user.id},orderBy:{id:'asc'}});
  const planned=planIncomeBackfill(before);if(planned.conflicts.length) throw Error(JSON.stringify(planned.conflicts));
  console.log(JSON.stringify({schemaPresent:schema,backfill:planned,balances:'all card targets matched',mode:apply?'apply':rollback?'rollback':'read-only'},null,2));
  if(apply||rollback) {
    const sentinel='PHASE_ONE_MIGRATION_ROLLBACK';
    try {
      await p.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        await tx.$queryRaw`SELECT id FROM "Account" WHERE "userId"=${user.id} FOR UPDATE`;
        const locked=await audit(tx,user.id);
        if(JSON.stringify(locked.accounts)!==JSON.stringify(before.accounts)||JSON.stringify(locked.transactions)!==JSON.stringify(before.transactions)) throw Error('Live ledger changed; stop before migration');
        if(!await hasSchema(tx)) {
          const sql=await readFile(new URL('../prisma/repairs/20260917_phase_one.sql',import.meta.url),'utf8');
          for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
        }
        locked.incomePlans=await tx.cycleIncomePlan.findMany({where:{userId:user.id},orderBy:{id:'asc'}});
        const plan=planIncomeBackfill(locked);if(plan.conflicts.length) throw Error(JSON.stringify(plan.conflicts));
        for(const row of plan.updates) await tx.cycleIncomePlan.update({where:{id:row.id},data:row.data});
        const after=await audit(tx,user.id);
        if(JSON.stringify(after.accounts)!==JSON.stringify(before.accounts)||JSON.stringify(after.transactions)!==JSON.stringify(before.transactions)) throw Error('Migration changed ledger or balances');
        after.incomePlans=await tx.cycleIncomePlan.findMany({where:{userId:user.id}});
        const repeat=planIncomeBackfill(after);if(repeat.updates.length||repeat.conflicts.length) throw Error('Backfill not idempotent');
        console.log(JSON.stringify({schemaAdded:!schema,sourceReferencesUpdated:plan.updates.length,ledgerChanged:false,repeatUpdates:0}));
        if(rollback) throw Error(sentinel);
      });
    }catch(e){if(!rollback||e.message!==sentinel) throw e;console.log('Migration rollback completed');}
    const persisted=await audit(p,user.id);
    if(JSON.stringify(persisted.accounts)!==JSON.stringify(before.accounts)||JSON.stringify(persisted.transactions)!==JSON.stringify(before.transactions)) throw Error('Persisted ledger changed');
    if(rollback&&(await hasSchema(p))!==schema) throw Error('Schema rollback leaked');
  }
}catch(e){console.error(e.message);process.exitCode=1;}finally{await p.$disconnect();}
