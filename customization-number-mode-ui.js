import {NUMBER_MODES,numberMode} from './customization-number-mode.js?v=2.17.12';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountNumberModeControls({modal,set,candidates}){
  let mode=numberMode(set),fontId=set.number_font_source_id||'',originalMode=mode,originalFontId=fontId;
  const host=document.createElement('section');host.className='preparer-working-source';host.dataset.numberModeControls='';
  host.innerHTML='<label for="letteringNumberMode">Uso dos números nesta personalização</label><select id="letteringNumberMode"></select><label for="letteringNumberFont">Arquivo para os números</label><select id="letteringNumberFont"></select><p class="hint" data-number-mode-note></p>';
  modal.querySelector('.preparer-working-source').insertAdjacentElement('afterend',host);
  const choice=host.querySelector('#letteringNumberMode'),fonts=host.querySelector('#letteringNumberFont'),note=host.querySelector('[data-number-mode-note]');
  choice.innerHTML=Object.entries(NUMBER_MODES).filter(([key])=>key!=='legacy'||originalMode==='legacy').map(([key,label])=>`<option value="${key}" ${key===mode?'selected':''}>${label}</option>`).join('');
  function refresh(){
    const options=candidates().filter(item=>['ttf','otf'].includes(item.ext));
    // Do not silently select another file if an uploaded candidate was removed.
    fonts.innerHTML='<option value="">Usar o mesmo TTF / OTF do nome</option>'+options.map(item=>`<option value="${h(item.id)}" ${item.id===fontId?'selected':''}>${h(item.name)}</option>`).join('');
    if(fontId&&!options.some(item=>item.id===fontId))fonts.insertAdjacentHTML('beforeend',`<option value="${h(fontId)}" selected>Arquivo não disponível — selecione novamente</option>`);
    fonts.value=fontId;fonts.hidden=mode!=='font';fonts.previousElementSibling.hidden=mode!=='font';
    note.textContent=mode==='none'?'Pode salvar e testar só o nome, sem enviar números.':mode==='font'?'Os números virão do TTF / OTF selecionado. Vetores já enviados ficam guardados para uma troca futura.':mode==='vector'?'Mapeie cada SVG para seu algarismo (0–9). Pode salvar incompleto; o teste informa os vetores que faltam.':'Configuração anterior preservada: os SVGs mapeados têm prioridade sobre o TTF.';
    note.textContent+=' Você pode trocar esta opção depois. Após a troca, confira o teste visual antes de liberar para produção.';
  }
  choice.onchange=()=>{mode=choice.value;refresh();};fonts.onchange=()=>{fontId=fonts.value;};
  return {
    get dirty(){return mode!==originalMode||fontId!==originalFontId;},
    refresh,
    validate(){
      if(!Object.hasOwn(NUMBER_MODES,mode))throw new Error('Escolha como usar os números.');
      if(fontId&&!candidates().some(item=>item.id===fontId&&['ttf','otf'].includes(item.ext)))throw new Error('O arquivo dos números não está disponível. Selecione novamente ou use o mesmo TTF do nome.');
    },
    async persist(supabase,{ownerId,userId}){
      if(!this.dirty)return;this.validate();
      const payload={number_source_mode:mode,number_font_source_id:fontId||null,status:'preparing',tested_at:null,tested_by:null,updated_by:userId,updated_at:new Date().toISOString()};
      const result=await supabase.from('z19p_customization_sets').update(payload).eq('owner_id',ownerId).eq('id',set.id).select('id,number_source_mode,number_font_source_id').single();
      if(result.error)throw result.error;
      if(!result.data||result.data.id!==set.id||result.data.number_source_mode!==mode||(result.data.number_font_source_id||'')!==fontId)throw new Error('A opção dos números não foi confirmada. Tente salvar novamente.');
      Object.assign(set,payload);originalMode=mode;originalFontId=fontId;
    }
  };
}
