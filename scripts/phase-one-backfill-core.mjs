export function planIncomeBackfill(state) {
  const updates=[],conflicts=[];
  for(const row of state.incomePlans) {
    if(row.categoryId && row.subcategoryId) {
      const sub=state.subcategories.find(s=>s.id===row.subcategoryId&&s.userId===state.userId&&s.categoryId===row.categoryId);
      if(!sub || !state.categories.some(c=>c.id===row.categoryId&&c.userId===state.userId&&c.type==='INCOME')) conflicts.push(`Invalid source reference: ${row.id}`);
      continue;
    }
    const candidates=state.subcategories.filter(s=>s.userId===state.userId&&s.name.trim().toLowerCase()===row.source.trim().toLowerCase()&&state.categories.some(c=>c.id===s.categoryId&&c.userId===state.userId&&c.type==='INCOME'));
    if(candidates.length!==1) {conflicts.push(`Missing or ambiguous income source: ${row.source}`);continue;}
    const sub=candidates[0];
    if((row.categoryId&&row.categoryId!==sub.categoryId)||(row.subcategoryId&&row.subcategoryId!==sub.id)) {conflicts.push(`Conflicting source reference: ${row.id}`);continue;}
    updates.push({id:row.id,data:{categoryId:sub.categoryId,subcategoryId:sub.id}});
  }
  return {updates,conflicts};
}
