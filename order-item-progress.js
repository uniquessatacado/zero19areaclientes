// Count personalizations, not garments. Adding to a draft is never completion.
export function orderItemProgress(items=[]){
  const active=[...new Map(items.filter(item=>item.stage!=='cancelled').map(item=>[item.id,item])).values()];
  const total=active.length;
  const ready=active.filter(item=>item.stage==='ready_production').length;
  const producing=active.filter(item=>item.stage==='production').length;
  const completed=active.filter(item=>['ready_pickup','delivered'].includes(item.stage)).length;
  const pending=total-ready-producing-completed;
  const percent=total?Math.round(completed/total*100):0;
  return {total,ready,producing,completed,pending,percent,
    label:`${completed}/${total} concluídas · ${percent}%`,
    detail:`${ready}/${total} prontas para produzir · ${producing} em produção · ${pending} com pendências`};
}
