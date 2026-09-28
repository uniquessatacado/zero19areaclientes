import {PRODUCTION_FIELDS,productionSettings} from './production-scheduler.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const steps=[['printing','Impressão','Ainda falta imprimir o filme.'],['cutting','Corte e poliamida','Impressão concluída; falta cortar e aplicar poliamida.'],['curing','Cura no forno','Impressão, corte e poliamida concluídos.'],['pressing','Prensagem','Filme já curado; falta aplicar na camisa.']];
export function createProductionPlanningUI({supabase,load,toast,onSaved}){
  function modal(title,content){
    const root=document.createElement('div');root.className='modal-backdrop';root.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-label="'+escape(title)+'"><div class="modal-head"><h2>'+escape(title)+'</h2><button class="btn ghost" data-close aria-label="Fechar">×</button></div>'+content+'<p class="hint" data-error role="alert"></p></section>';
    root.querySelector('[data-close]').onclick=()=>root.remove();document.body.appendChild(root);return root;
  }
  async function save(root,button,request){button.disabled=true;root.querySelector('[data-error]').textContent='';try{const {error}=await request();if(error)throw error;root.remove();toast('Produção atualizada. Os prazos foram recalculados.','ok');await onSaved()}catch(error){button.disabled=false;root.querySelector('[data-error]').textContent=error?.message||'Não foi possível salvar.'}}
  async function openSettings(){
    try{
      const data=await load(true),settings=productionSettings(data.sla.production_settings),b=data.schedule.breakdown;
      const root=modal('Tempos da produção','<p class="hint">Somente estampas na mesma etapa atual e com medidas confirmadas compartilham filme ou forno. Arte, fonte e halftone pendentes reservam preparação; medidas estimadas não geram economia presumida de encaixe. Corte e prensagem usam um operador, enquanto impressora e forno podem trabalhar em paralelo.</p><form data-settings><div class="form-grid">'+PRODUCTION_FIELDS.map(([key,label,unit,min,max])=>'<div class="field"><label for="production-'+key+'">'+escape(label)+' ('+unit+')</label><input id="production-'+key+'" name="'+key+'" type="number" required min="'+min+'" max="'+max+'" step="'+(key==='cure_cycles'?'1':'0.1')+'" value="'+settings[key]+'"></div>').join('')+'</div><p class="hint">Forno padrão A3. Dois ciclos de 2 minutos reservam 4 minutos para virar a estampa. A prensagem conta uma vez por lado da peça.</p><div class="z19-ready-message">Fila atual: '+b.filmMeters+' m de filme · '+b.printBatches+' lote(s) · '+b.ovenBatches+' carga(s) de forno\nDesenvolver arte: '+b.art+' min · Preparação pendente: '+(b.preparation||0)+' min · Impressão: '+b.printing+' min · Corte: '+b.cutting+' min · Cura: '+b.curing+' min · Prensa: '+b.pressing+' min\nO tempo total considera o trabalho simultâneo das máquinas. Pedidos expressos têm reserva exclusiva antes da fila; novos pedidos normais entram depois de toda a capacidade já reservada. O próximo prazo do painel acrescenta 30 minutos para uma nova unidade.</div><div class="modal-footer"><button type="submit" class="btn primary">Salvar tempos e recalcular</button></div></form>');
      root.querySelector('form').onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(PRODUCTION_FIELDS.map(([key])=>[key,Number(root.querySelector('[name="'+key+'"]').value)]));return save(root,root.querySelector('[type=submit]'),()=>supabase.rpc('z19p_save_production_parameters',{p_parameters:values}));};
    }catch(error){toast(error?.message||'Não foi possível carregar os tempos.','err')}
  }
  async function openStep(projectId){
    try{
      const data=await load(true),summary=data.summaries.find(x=>x.project.id===projectId);if(!summary)return;
      const current=summary.items.find(x=>x.stage==='production')?.production_step||'printing';
      const root=modal('Etapa atual da produção','<p class="hint">Escolha o que ainda falta fazer no pedido. O cálculo deixa de contar as etapas já concluídas. A mudança não marca o pedido como pronto.</p><div class="field"><label>Próxima etapa</label><select data-step>'+steps.map(([value,label,hint])=>'<option value="'+value+'" '+(value===current?'selected':'')+'>'+escape(label+' — '+hint)+'</option>').join('')+'</select></div><div class="modal-footer"><button class="btn primary" data-save>Atualizar etapa</button></div>');
      root.querySelector('[data-save]').onclick=event=>save(root,event.currentTarget,()=>supabase.rpc('z19p_set_production_step',{p_project_id:projectId,p_step:root.querySelector('[data-step]').value}));
    }catch(error){toast(error?.message||'Não foi possível carregar a etapa.','err')}
  }
  return {openSettings,openStep};
}
