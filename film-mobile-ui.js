// Presentation only. Never changes the physical layout or a production status.
export function filmViewportScale(element,layout,zoom=1,overview=false){
 const shell=element.parentElement,w=Math.max(40,Number(shell?.clientWidth||globalThis.innerWidth||390)-56);
 const fit=w/Number(layout.filmWidthMm),height=Math.max(60,Number(shell?.clientHeight||500)-52);
 return (overview?Math.min(fit,height/Math.max(1,layout.lengthMm)):fit)*zoom;
}
export function attachFilmViewport({element,inspector,getLayout,render,setView}){
 element._filmViewport?.destroy?.();
 const panel=element.closest('.film-canvas-panel')||element.parentElement.parentElement,shell=element.parentElement;
 let stopped=false,expanded=false,frame=0,lastWidth=0,scrollY=0,previousOverflow='';
 const doc=element.ownerDocument,win=doc.defaultView,bar=doc.createElement('div');bar.className='film-view-toolbar';
 bar.innerHTML='<button type="button" class="btn" data-film-expand>Ampliar filme</button><button type="button" class="btn" data-film-fit>Ajustar largura</button><button type="button" class="btn" data-film-overview>Ver tudo</button><button type="button" class="btn" data-film-minus aria-label="Diminuir zoom">−</button><button type="button" class="btn" data-film-plus aria-label="Aumentar zoom">+</button>';
 panel.querySelector('.film-view-toolbar')?.remove();panel.prepend(bar);
 let zoom=1,overview=false;
 const reset=()=>{zoom=1;overview=false;setView({zoom,overview});shell.scrollLeft=0;shell.scrollTop=0;};
 const schedule=()=>{if(stopped)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!element.isConnected){destroy();return;}const width=shell.clientWidth;if(width!==lastWidth||expanded){lastWidth=width;render();}});};
 const viewport=()=>{if(expanded){const v=win.visualViewport;panel.style.setProperty('--film-view-height',(v?.height||win.innerHeight)+'px');panel.style.setProperty('--film-view-top',(v?.offsetTop||0)+'px');}schedule();};
 function full(value){if(value===expanded)return;expanded=value;
  if(value){scrollY=win.scrollY;previousOverflow=doc.body.style.overflow;doc.body.style.overflow='hidden';doc.body.classList.add('film-view-open');panel.classList.add('film-expanded-view');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Visualização ampliada do filme');}
  else{panel.classList.remove('film-expanded-view');panel.removeAttribute('role');panel.removeAttribute('aria-modal');panel.removeAttribute('aria-label');doc.body.style.overflow=previousOverflow;doc.body.classList.remove('film-view-open');panel.style.removeProperty('--film-view-height');panel.style.removeProperty('--film-view-top');win.scrollTo(0,scrollY);}
  const b=bar.querySelector('[data-film-expand]');b.textContent=value?'Fechar visualização':'Ampliar filme';b.setAttribute('aria-expanded',String(value));reset();viewport();
 }
 const beforeAction=event=>{if(expanded&&event.target?.closest?.('#exportFilm,#saveFilm'))full(false);};panel.addEventListener('click',beforeAction,true);
 bar.querySelector('[data-film-expand]').onclick=()=>full(!expanded);
 bar.querySelector('[data-film-fit]').onclick=reset;
 bar.querySelector('[data-film-overview]').onclick=()=>{zoom=1;overview=true;setView({zoom,overview});shell.scrollLeft=shell.scrollTop=0;};
 for(const [selector,delta] of [['[data-film-minus]',-.25],['[data-film-plus]',.25]])bar.querySelector(selector).onclick=()=>{overview=false;const current=Number(inspector.querySelector('[data-zoom]')?.value||100)/100;zoom=Math.max(.2,Math.min(4,current+delta));setView({zoom,overview});};
 const keydown=e=>{if(expanded&&e.key==='Escape'){e.preventDefault();full(false);}if(expanded&&e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}}};
 doc.addEventListener('keydown',keydown);win.addEventListener('resize',viewport);win.visualViewport?.addEventListener('resize',viewport);
 const ro=win.ResizeObserver?new win.ResizeObserver(schedule):null;ro?.observe(shell);
 const mo=new win.MutationObserver(()=>{if(!element.isConnected||!inspector.isConnected)destroy();});mo.observe(doc.body,{childList:true,subtree:true});
 function destroy(){if(stopped)return;full(false);stopped=true;cancelAnimationFrame(frame);ro?.disconnect();mo.disconnect();panel.removeEventListener('click',beforeAction,true);doc.removeEventListener('keydown',keydown);win.removeEventListener('resize',viewport);win.visualViewport?.removeEventListener('resize',viewport);bar.remove();if(element._filmViewport===api)delete element._filmViewport;}
 const api={destroy};element._filmViewport=api;lastWidth=shell.clientWidth;return api;
}
export function installFilmPageMobile(page){
 if(!page||page.dataset.mobileFilmReady)return;page.dataset.mobileFilmReady='true';
 const list=page.querySelector('#filmItems'),heading=page.querySelector('.film-panel-title');
 if(list&&heading){const toggle=page.ownerDocument.createElement('button');toggle.type='button';toggle.className='btn small film-list-toggle';toggle.textContent='Recolher lista';toggle.setAttribute('aria-expanded','true');toggle.onclick=()=>{list.hidden=!list.hidden;toggle.textContent=list.hidden?'Mostrar artes':'Recolher lista';toggle.setAttribute('aria-expanded',String(!list.hidden));};heading.append(toggle);}
}
