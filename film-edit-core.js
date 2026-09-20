/** Remove only the requested artwork/copy, never pack or change physical geometry.
 * Undefined copy means the list's X: remove all copies of that item.
 */
export function removeFilmEntry(items,layout,{id,copy}={}){
  if(!Array.isArray(items))throw new Error('Lista de itens inválida.');
  const item=items.find(entry=>entry.localId===id);
  if(!item)return {items,layout,changed:false};
  const oneCopy=copy!==undefined,quantity=Number(item.quantity);
  if(oneCopy&&(!Number.isInteger(copy)||copy<0||copy>=quantity))throw new Error('Cópia inválida para exclusão.');
  if(oneCopy&&(!layout?.placements?.some(p=>p.id===id&&p.copy===copy)))return {items,layout,changed:false};
  const nextItems=items.flatMap(entry=>entry.localId!==id?[entry]:oneCopy&&quantity>1?[{...entry,quantity:quantity-1}]:[]);
  if(!layout||!nextItems.length)return {items:nextItems,layout:null,changed:true};
  if(!Array.isArray(layout.placements))throw new Error('Posições do filme inválidas.');
  const placements=layout.placements.filter(p=>p.id!==id||oneCopy&&p.copy!==copy).map(p=>p.id===id&&oneCopy&&p.copy>copy?{...p,copy:p.copy-1}:{...p});
  // Occupancy depends on the nesting masks/grid. Do not retain an obsolete
  // percentage or trigger a fresh packing pass merely to refresh this metric.
  const nextLayout={...layout,placements,efficiency:null,waste:null,metricsNeedRecalculation:true};
  return {items:nextItems,layout:nextLayout,changed:true};
}
