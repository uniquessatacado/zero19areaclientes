/* Keeps dialogs within the visible keyboard viewport; intentionally never changes page scale. */
export function mobileViewportState({width,height,offsetTop=0,scale=1,layoutHeight,editing=false}) {
  const keyboard = Boolean(editing && width<=900 && scale>=.99 && scale<=1.01 && layoutHeight-height>120);
  return {keyboard,height:Math.max(120,Number(height)||0),top:Math.max(0,Number(offsetTop)||0)};
}
export function installMobileViewport(win=window,doc=document) {
  const viewport=win.visualViewport;
  if(!viewport)return ()=>{};
  let frame=0;
  const update=()=>{
    frame=0;
    const editing=Boolean(doc.activeElement?.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button]):not([type=submit]),textarea,[contenteditable="true"]'));
    const state=mobileViewportState({width:viewport.width,height:viewport.height,offsetTop:viewport.offsetTop,scale:viewport.scale,layoutHeight:win.innerHeight,editing});
    doc.documentElement.classList.toggle('keyboard-open',state.keyboard);
    doc.documentElement.style.setProperty('--visible-viewport-height',`${state.height}px`);
    doc.documentElement.style.setProperty('--visible-viewport-top',`${state.top}px`);
  };
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(update);};
  viewport.addEventListener('resize',schedule);viewport.addEventListener('scroll',schedule);
  doc.addEventListener('focusin',schedule);doc.addEventListener('focusout',schedule);update();
  return ()=>{viewport.removeEventListener('resize',schedule);viewport.removeEventListener('scroll',schedule);doc.removeEventListener('focusin',schedule);doc.removeEventListener('focusout',schedule);if(frame)win.cancelAnimationFrame(frame);doc.documentElement.classList.remove('keyboard-open');};
}
