import { describe, it, expect } from 'vitest';
import { planIncomeBackfill } from './phase-one-backfill-core.mjs';
const state = { userId:'u', categories:[{id:'income',userId:'u',type:'INCOME'}], subcategories:[{id:'engage',userId:'u',categoryId:'income',name:'Engage'}], incomePlans:[{id:'plan',userId:'u',source:'Engage',categoryId:null,subcategoryId:null}] };
describe('income source backfill', () => {
  it('links a unique income source without changing expected values', () => {
    expect(planIncomeBackfill(state)).toEqual({ updates:[{id:'plan',data:{categoryId:'income',subcategoryId:'engage'}}],conflicts:[] });
  });
  it('does not write anything on repeat', () => {
    expect(planIncomeBackfill({...state,incomePlans:[{...state.incomePlans[0],categoryId:'income',subcategoryId:'engage'}]}).updates).toEqual([]);
  });
  it('stops on ambiguous source matches', () => {
    const result=planIncomeBackfill({...state,subcategories:[...state.subcategories,{...state.subcategories[0],id:'another'}]});
    expect(result.updates).toEqual([]); expect(result.conflicts).toHaveLength(1);
  });
  it('does not group a source under an expense category', () => {
    const result=planIncomeBackfill({...state,categories:[{...state.categories[0],type:'EXPENSE'}]});
    expect(result.updates).toEqual([]); expect(result.conflicts).toHaveLength(1);
  });
});
