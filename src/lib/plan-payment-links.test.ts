import {expect,it} from 'vitest';
import {linkPlanPayment} from './cycle-payment-plans';
function fixture(transaction:any,existing:any=null) {
  const tx:any={cyclePaymentPlan:{findFirst:async()=>({id:'p',sourceType:'CREDIT_CARD',sourceId:'maya'})},transaction:{findFirst:async()=>transaction},planPayment:{findUnique:async()=>existing,create:async({data}:any)=>data},$executeRaw:async()=>0};
  return {$transaction:async(fn:any)=>fn(tx)} as any;
}
it('rejects incoming card-side payment instead of double counting it',async()=>{
  expect(await linkPlanPayment(fixture({id:'t',type:'CREDIT_CARD_PAYMENT',creditCardId:'maya',amount:749404}),'u','p','t',749404)).toMatchObject({ok:false});
});
it('links the existing negative cash-side payment without posting a transaction',async()=>{
  expect(await linkPlanPayment(fixture({id:'t',type:'CREDIT_CARD_PAYMENT',creditCardId:'maya',amount:-749404}),'u','p','t',749404)).toMatchObject({ok:true});
});
it('rejects reusing a payment on another plan',async()=>{
  expect(await linkPlanPayment(fixture({id:'t',type:'CREDIT_CARD_PAYMENT',creditCardId:'maya',amount:-749404},{planId:'other',amount:749404}),'u','p','t',749404)).toMatchObject({ok:false});
});
