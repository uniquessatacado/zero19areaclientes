// Estúdio no filme (09/10, pedido do dono): monta peças como no estúdio Estampa
// Política (público, estampa, escrita em cima/embaixo, cor e quantidade) e manda as
// aplicações direto para o filme. Não cria pedido, venda, estoque nem fila.
const AUDIENCES=[['MEN','Masculina'],['WOMEN','Feminina'],['KIDS','Infantil']];
const FALLBACK={MEN:{art_height_cm:28,letter_height_cm:5.5},WOMEN:{art_height_cm:25,letter_height_cm:5},KIDS:{art_height_cm:20,letter_height_cm:4}};
const COLORS=[['Verde Brasil','#267B3B'],['Preta','#000000'],['Branca','#FFFFFF'],['Vermelha','#D32F2F'],['Amarela','#FFCC00'],['Azul','#1565C0']];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>Number(String(value).replace(',','.'));
const fmt=value=>String(Math.round(Number(value)*100)/100).replace('.',',');

export function openFilmStudio({catalog,sets,defaultSetId,prepareArt,makeText}){
  const spec=audience=>({...FALLBACK[audience],...(catalog.brazil_customization?.[audience]||{})});
  const prints=(catalog.prints||[]).filter(print=>print.enabled!==false);
  const ink=/^#[0-9a-f]{6}$/i.test(catalog.brazil_customization?.ink_color||'')?catalog.brazil_customization.ink_color.toUpperCase():'#267B3B';
  const newPiece=(audience='MEN')=>({id:crypto.randomUUID(),audience,print:null,artHeight:spec(audience).art_height_cm,top:'',bottom:'',color:ink,letterHeight:spec(audience).letter_height_cm,quantity:1});
  let pieces=[newPiece()],busy=false,pickerFor=null;
  return new Promise(resolve=>{
    const modal=document.createElement('div');modal.className='modal-backdrop';
    modal.innerHTML=`<form class="modal film-studio-modal" role="dialog" aria-modal="true" aria-labelledby="filmStudioTitle" style="width:min(980px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto">
      <div class="modal-head"><div><div class="eyebrow">ESTAMPA POLÍTICA · DIRETO NO FILME</div><h2 id="filmStudioTitle">Montar no estúdio</h2></div><button type="button" class="btn ghost small" data-close aria-label="Fechar">×</button></div>
      <p class="hint">Escolha estampa, escritas, cor e quantidade. Cada peça entra no filme como aplicações separadas (arte e cada escrita) nas medidas de impressão. Não cria pedido nem mexe em estoque.</p>
      <div class="field"><label for="filmStudioFont">Fonte das escritas</label><select id="filmStudioFont" name="font">${sets.map(set=>`<option value="${esc(set.id)}" ${set.id===defaultSetId?'selected':''}>${esc(set._path||set.name||'Fonte')}</option>`).join('')}</select></div>
      <div data-pieces style="display:grid;gap:14px"></div>
      <button type="button" class="btn" data-add-piece style="margin-top:12px;min-height:44px">＋ Adicionar outra peça</button>
      <p data-error role="alert" style="color:#fca5a5;margin:10px 0 0"></p>
      <div class="modal-footer"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit" data-submit style="min-height:44px">Adicionar ao filme</button></div>
    </form>`;
    const form=modal.querySelector('form'),list=modal.querySelector('[data-pieces]'),error=modal.querySelector('[data-error]'),submit=modal.querySelector('[data-submit]');
    const close=value=>{if(busy)return;modal.remove();document.removeEventListener('keydown',onKey);resolve(value)};
    const onKey=event=>{if(event.key==='Escape'){if(pickerFor){pickerFor=null;modal.querySelector('[data-print-picker]')?.remove()}else close(null)}};
    const applications=()=>pieces.reduce((sum,piece)=>sum+(piece.print?1:0)+(piece.top.trim()?1:0)+(piece.bottom.trim()?1:0),0);
    const refreshSubmit=()=>{if(!busy)submit.textContent=`Adicionar ao filme (${applications()} ${applications()===1?'aplicação':'aplicações'})`};
    const preview=piece=>`<div data-preview="${piece.id}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:220px;padding:14px;border-radius:14px;background:#f5d000;color:${esc(piece.color)};text-align:center;overflow:hidden">
      <b data-preview-top style="font:900 clamp(18px,4vw,28px)/1.05 Impact,'Arial Narrow',sans-serif;letter-spacing:.02em;text-transform:uppercase;word-break:break-word;${piece.color==='#FFFFFF'?'text-shadow:0 0 2px #000':''}">${esc(piece.top)}</b>
      ${piece.print?`<img src="${esc(piece.print.preview_url)}" alt="" style="max-width:70%;max-height:150px;object-fit:contain">`:'<small style="color:#5b4b00">Sem estampa</small>'}
      <b data-preview-bottom style="font:900 clamp(16px,3.4vw,24px)/1.05 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;word-break:break-word;${piece.color==='#FFFFFF'?'text-shadow:0 0 2px #000':''}">${esc(piece.bottom)}</b></div>`;
    const pieceHTML=(piece,index)=>`<section data-piece="${piece.id}" style="border:1px solid #334155;border-radius:16px;padding:14px;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));align-items:start">
      <div style="display:grid;gap:10px;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>Peça ${index+1}</b>${pieces.length>1?`<button type="button" class="btn small" data-remove="${piece.id}">Remover</button>`:''}</div>
        <div role="group" aria-label="Público" style="display:flex;flex-wrap:wrap;gap:6px">${AUDIENCES.map(([value,label])=>`<button type="button" class="btn small ${piece.audience===value?'primary':''}" data-audience="${value}" aria-pressed="${piece.audience===value}" style="min-height:40px">${label}</button>`).join('')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${piece.print?`<img src="${esc(piece.print.preview_url)}" alt="" style="width:52px;height:52px;object-fit:contain;background:#fff;border-radius:8px"><span style="flex:1 1 140px;min-width:0;font-weight:700">${esc(piece.print.name)}</span>`:'<span style="flex:1 1 140px">Sem estampa</span>'}<button type="button" class="btn small" data-pick style="min-height:40px">${piece.print?'Trocar estampa':'Escolher estampa'}</button>${piece.print?'<button type="button" class="btn small" data-no-print style="min-height:40px">Sem estampa</button>':''}</div>
        ${piece.print?`<label class="field"><span>Altura da estampa (cm)</span><input data-key="artHeight" inputmode="decimal" value="${fmt(piece.artHeight)}"></label>`:''}
        <label class="field"><span>Escrita em cima</span><input data-key="top" maxlength="60" value="${esc(piece.top)}" placeholder="Ex.: BOLSONARO" autocomplete="off"></label>
        <label class="field"><span>Escrita embaixo</span><input data-key="bottom" maxlength="60" value="${esc(piece.bottom)}" placeholder="Ex.: 22" autocomplete="off"></label>
        <div role="group" aria-label="Cor da letra" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><small style="width:100%">Cor da letra</small>${COLORS.map(([name,hex])=>`<button type="button" data-color="${hex}" title="${name}" aria-label="${name}" aria-pressed="${piece.color===hex}" style="width:36px;height:36px;border-radius:50%;background:${hex};border:${piece.color===hex?'3px solid #22c55e':'2px solid #64748b'};cursor:pointer"></button>`).join('')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="field"><span>Altura da letra (cm)</span><input data-key="letterHeight" inputmode="decimal" value="${fmt(piece.letterHeight)}"></label><label class="field"><span>Quantidade</span><input data-key="quantity" type="number" inputmode="numeric" min="1" value="${piece.quantity}"></label></div>
      </div>${preview(piece)}</section>`;
    const render=()=>{list.innerHTML=pieces.map(pieceHTML).join('');refreshSubmit()};
    const pieceOf=element=>pieces.find(piece=>piece.id===element.closest('[data-piece]')?.dataset.piece);
    const openPicker=piece=>{
      pickerFor=piece.id;let candidate='ALL',term='';
      const picker=document.createElement('div');picker.dataset.printPicker='';
      picker.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(2,6,23,.82);display:flex;align-items:center;justify-content:center;padding:12px';
      picker.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Escolher estampa" style="background:#0f172a;color:#f8fafc;border-radius:18px;width:min(900px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;overflow:hidden">
        <div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px;align-items:center;border-bottom:1px solid #334155"><b style="flex:1 1 100%">Escolher estampa</b><input data-search placeholder="Buscar estampa" style="flex:1 1 180px;min-height:42px;border-radius:10px;padding:0 10px">${[['ALL','Todas'],['LULA','Lula'],['BOLSONARO','Bolsonaro']].map(([value,label])=>`<button type="button" class="btn small" data-candidate="${value}" style="min-height:40px">${label}</button>`).join('')}<button type="button" class="btn small" data-picker-close aria-label="Fechar">×</button></div>
        <div data-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(130px,40vw),1fr));gap:10px;padding:12px;overflow:auto"></div></div>`;
      const grid=picker.querySelector('[data-grid]');
      const draw=()=>{const query=term.trim().toLocaleLowerCase('pt-BR'),rows=prints.filter(print=>(candidate==='ALL'||print.candidate===candidate)&&print.name.toLocaleLowerCase('pt-BR').includes(query));
        picker.querySelectorAll('[data-candidate]').forEach(button=>button.classList.toggle('primary',button.dataset.candidate===candidate));
        grid.innerHTML=rows.length?rows.map(print=>`<button type="button" data-print="${esc(print.id)}" style="display:grid;gap:6px;padding:8px;border-radius:12px;border:2px solid ${piece.print?.id===print.id?'#22c55e':'#334155'};background:#1e293b;color:inherit;cursor:pointer;text-align:center"><img src="${esc(print.preview_url)}" alt="" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:contain;background:#fff;border-radius:8px"><small style="font-weight:700;word-break:break-word">${esc(print.name)}</small></button>`).join(''):'<p>Nenhuma estampa encontrada.</p>';};
      const shut=()=>{pickerFor=null;picker.remove()};
      picker.querySelector('[data-search]').oninput=event=>{term=event.target.value;draw()};
      picker.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>{candidate=button.dataset.candidate;draw()});
      picker.querySelector('[data-picker-close]').onclick=shut;
      picker.onclick=event=>{if(event.target===picker)return shut();const chosen=event.target.closest('[data-print]');if(!chosen)return;piece.print=prints.find(print=>print.id===chosen.dataset.print)||null;shut();render()};
      modal.appendChild(picker);draw();picker.querySelector('[data-search]').focus();
    };
    list.onclick=event=>{
      const target=event.target.closest('button');if(!target||busy)return;const piece=pieceOf(target);if(!piece)return;
      if(target.dataset.remove){pieces=pieces.filter(row=>row!==piece);render()}
      else if(target.dataset.audience){const next=spec(target.dataset.audience);Object.assign(piece,{audience:target.dataset.audience,artHeight:next.art_height_cm,letterHeight:next.letter_height_cm});render()}
      else if(target.dataset.color){piece.color=target.dataset.color;render()}
      else if('pick' in target.dataset)openPicker(piece);
      else if('noPrint' in target.dataset){piece.print=null;render()}
    };
    list.oninput=event=>{
      const input=event.target,key=input.dataset.key,piece=pieceOf(input);if(!key||!piece)return;
      piece[key]=key==='top'||key==='bottom'?input.value:input.value;
      const box=list.querySelector(`[data-preview="${piece.id}"]`);
      if(key==='top')box.querySelector('[data-preview-top]').textContent=input.value;
      if(key==='bottom')box.querySelector('[data-preview-bottom]').textContent=input.value;
      refreshSubmit();
    };
    modal.querySelector('[data-add-piece]').onclick=()=>{if(busy)return;pieces.push(newPiece(pieces.at(-1)?.audience||'MEN'));render();list.lastElementChild?.scrollIntoView({block:'nearest'})};
    modal.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>close(null));
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;error.textContent='';
      const set=sets.find(row=>row.id===form.elements.font.value);
      for(const [index,piece] of pieces.entries()){
        const label='Peça '+(index+1)+': ',quantity=Number(piece.quantity),hasText=piece.top.trim()||piece.bottom.trim();
        if(!piece.print&&!hasText){error.textContent=label+'escolha uma estampa ou escreva algo.';return}
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000){error.textContent=label+'quantidade de 1 a 1000.';return}
        if(piece.print&&!(num(piece.artHeight)>=1&&num(piece.artHeight)<=100)){error.textContent=label+'altura da estampa entre 1 e 100 cm.';return}
        if(hasText&&!(num(piece.letterHeight)>=1&&num(piece.letterHeight)<=60)){error.textContent=label+'altura da letra entre 1 e 60 cm.';return}
        if(hasText&&!set){error.textContent='Escolha a fonte das escritas.';return}
      }
      busy=true;submit.disabled=true;const items=[];
      try{
        let done=0;const total=applications(),step=()=>{submit.textContent=`Preparando ${++done}/${total}…`};
        for(const piece of pieces){
          const quantity=Number(piece.quantity);
          if(piece.print){submit.textContent=`Preparando estampa ${done+1}/${total}…`;items.push(await prepareArt({printId:piece.print.id,printName:piece.print.name,heightCm:num(piece.artHeight),quantity}));step()}
          for(const text of [piece.top,piece.bottom].map(value=>value.trim()).filter(Boolean)){items.push(await makeText({set,text,heightCm:num(piece.letterHeight),color:piece.color,quantity}));step()}
        }
        busy=false;close(items);
      }catch(failure){busy=false;submit.disabled=false;refreshSubmit();error.textContent=(failure?.message||String(failure))+' Nada foi adicionado ao filme; a montagem foi preservada.';}
    };
    document.addEventListener('keydown',onKey);document.body.appendChild(modal);render();
  });
}
