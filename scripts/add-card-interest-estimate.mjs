import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {PrismaNeon} from '@prisma/adapter-neon';
import {neonConfig} from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor=ws;neonConfig.poolQueryViaFetch=true;
const p=new PrismaClient({adapter:new PrismaNeon({connectionString:process.env.DATABASE_URL}),transactionOptions:{timeout:60000}});
const column=async db=>db.$queryRaw`SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='CreditCard' AND column_name='monthlyInterestEstimate'`;
const interestColumn=async db=>db.$queryRaw`SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='Transaction' AND column_name='cardInterestStatementDate'`;
const verify=rows=>{if(rows.length&&(rows[0].data_type!=='double precision'||rows[0].is_nullable!=='NO'||Number(rows[0].column_default)!==3))throw Error('STOP: incompatible existing interest-estimate column');};
async function financialState(db){
 const tables=['Account','Transaction','Loan','Lending','CyclePaymentPlan','PlanPayment'];
 const data=await Promise.all(tables.map(table=>db.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY id`)));
 const cards=await db.$queryRaw`SELECT id,"userId","accountId","creditLimit","statementDay","paymentDueDay","interestRate" FROM "CreditCard" ORDER BY id`;
 for(const item of data[1])delete item.row.cardInterestStatementDate;
 return JSON.stringify([...data,cards]);
}
try{
 const existing=await column(p);verify(existing);
 const interestExisting=await interestColumn(p);
 if(interestExisting.length&&(interestExisting[0].data_type!=='timestamp without time zone'||interestExisting[0].is_nullable!=='YES'))throw Error('STOP: incompatible interest statement date column');
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',columnExists:existing.length===1,interestStatementColumnExists:interestExisting.length===1,proposedChanges:(existing.length?0:1)+(interestExisting.length?0:1),financialRecordWrites:0}));
 if(process.argv.includes('--apply'))await p.$transaction(async tx=>{
  const before=await financialState(tx);
  await tx.$executeRaw`ALTER TABLE "CreditCard" ADD COLUMN IF NOT EXISTS "monthlyInterestEstimate" DOUBLE PRECISION NOT NULL DEFAULT 3`;
  await tx.$executeRaw`ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "cardInterestStatementDate" TIMESTAMP(3)`;
  verify(await column(tx));
  if(await financialState(tx)!==before)throw Error('STOP: protected financial records changed');
  console.log('Verified: estimate setting added; accounts, cards, transactions, loans, receivables and payment plans unchanged.');
 },{isolationLevel:'RepeatableRead'});
}finally{await p.$disconnect();}
