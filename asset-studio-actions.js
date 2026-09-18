// Shared by asset cards, filtered lists and enlarged previews.
// A saved photograph is not an editable garment scene or printable artwork.
export function attachAssetStudioActions(card,asset,handlers={}){
  if(!card||!asset)return null;
  const artwork=asset.asset_type==='arte'&&Boolean(asset.processed_path||asset.original_path);
  const montage=Boolean(asset.metadata?.garment_scene);
  const actions=[
    (artwork||montage)&&typeof handlers.openGarment==='function'&&['montar',montage?'Editar montagem':'Montar camiseta',()=>handlers.openGarment(asset)],
    (artwork||montage)&&typeof handlers.open3D==='function'&&['3d','Ver em 3D',()=>handlers.open3D(asset)],
    (artwork||montage)&&typeof handlers.openPresentation==='function'&&['apresentar','Link 3D / cliente',()=>handlers.openPresentation(asset)],
    (artwork||montage)&&typeof handlers.openBlank==='function'&&['modelo','Baixar modelo liso',()=>handlers.openBlank(asset)],
    artwork&&typeof handlers.openMockup==='function'&&['mockup','Ver tamanho na camisa',()=>handlers.openMockup(asset)],
    artwork&&typeof handlers.openEditor==='function'&&['editar','Editar arte',()=>handlers.openEditor(asset)]
  ].filter(Boolean);
  let group=card.querySelector('.asset-studio-actions');
  if(!actions.length){group?.remove();return null}
  if(!group){group=document.createElement('div');group.className='asset-studio-actions';(card.querySelector('.asset-body')||card).append(group)}
  group.replaceChildren();
  for(const [action,label,run] of actions){
    const button=document.createElement('button');button.type='button';button.className=`btn small${action==='montar'?' primary':''}`;button.dataset.action=action;button.textContent=label;
    button.onclick=async event=>{event.stopPropagation();button.disabled=true;try{await run()}catch(error){if(handlers.onError)handlers.onError(error);else console.error(error)}finally{if(button.isConnected)button.disabled=false}};
    group.append(button);
  }
  return group;
}
