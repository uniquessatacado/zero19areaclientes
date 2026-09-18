// New routes start at the top. Only a reload of the same route/tab restores it.
// Keep the intended position until content is tall enough or the user takes over;
// a slow image must never overwrite that position with a temporarily clamped one.
export function createRouteViewportController({win=window,getRoute,root=document.documentElement,key='z19p:route-viewport:v1'}={}){
  let current=null,ready=false,destroyed=false,timer=null,observer=null,sequence=0,activeTicket=null,restoration=null,pollTimer=null;
  const frames=new Set(),setTimer=(fn,ms)=>win.setTimeout(fn,ms),clearTimer=id=>{if(id!==null)win.clearTimeout(id)},point=value=>({x:Number.isFinite(value?.x)&&value.x>=0?value.x:0,y:Number.isFinite(value?.y)&&value.y>=0?value.y:0});
  const currentPoint=()=>point({x:win.scrollX,y:win.scrollY});
  const navigation=win.performance?.getEntriesByType?.('navigation')?.[0]?.type;
  let boot=null;try{const value=JSON.parse(win.sessionStorage.getItem(key)||'null');if(navigation==='reload'&&value?.route===getRoute()&&Number.isFinite(value.y)&&value.y>=0)boot={route:value.route,...point(value)}}catch{}
  const previousScrollRestoration=win.history?.scrollRestoration;
  if(win.history&&'scrollRestoration' in win.history)win.history.scrollRestoration='manual';
  const persist=position=>{if(destroyed||current!==getRoute())return;try{win.sessionStorage.setItem(key,JSON.stringify({route:current,...point(position),at:Date.now()}))}catch{}};
  const store=()=>{
    if(destroyed||current===null||current!==getRoute())return;
    if(restoration)return persist(restoration.target);
    if(!ready)return activeTicket?persist(activeTicket.interrupted?currentPoint():activeTicket.target):undefined;
    persist(currentPoint());
  };
  const clearFrames=()=>{for(const frame of frames)win.cancelAnimationFrame?.(frame);frames.clear()};
  const stopRestore=()=>{observer?.disconnect();observer=null;clearTimer(pollTimer);pollTimer=null;clearFrames();restoration=null};
  const userIntent=event=>{
    if(event?.type==='keydown'&&!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Spacebar'].includes(event.key))return;
    if(activeTicket&&!ready)activeTicket.interrupted=true;
    if(restoration){if(activeTicket)activeTicket.interrupted=true;stopRestore();persist(currentPoint())}
  };
  const onScroll=()=>{clearTimer(timer);timer=setTimer(store,120)};
  const onGeometryChange=()=>{if(restoration)apply(restoration)};
  const intentTypes=['wheel','touchstart','pointerdown','keydown'];
  for(const type of intentTypes)win.addEventListener(type,userIntent,{passive:true});
  win.addEventListener('scroll',onScroll,{passive:true});win.addEventListener('pagehide',store);win.addEventListener('resize',onGeometryChange,{passive:true});win.addEventListener('load',onGeometryChange,true);
  function frame(fn){
    if(!win.requestAnimationFrame){fn();return}
    const id=win.requestAnimationFrame(()=>{frames.delete(id);fn()});frames.add(id);
  }
  function apply(pending){
    // A previously scheduled RAF/ResizeObserver callback cannot override a gesture.
    if(destroyed||restoration!==pending)return;
    if(pending.token!==sequence||pending.path!==getRoute()){stopRestore();return}
    win.scrollTo({left:pending.target.x,top:pending.target.y,behavior:'instant'});
    if(win.scrollY>=pending.target.y-1&&win.scrollX>=pending.target.x-1){stopRestore();store();return}
    // ResizeObserver is event-driven and can wait for arbitrarily delayed content.
    // The timer is only a compatibility fallback, never a deadline that loses y.
    if(!win.ResizeObserver&&pollTimer===null)pollTimer=setTimer(()=>{pollTimer=null;apply(pending)},250);
  }
  function begin(path){
    if(destroyed)return {path,target:{x:0,y:0},token:-1};
    const same=current===path;
    const target=current===null&&boot?.route===path?point(boot):same?point(restoration?.target||(!ready&&!activeTicket?.interrupted?activeTicket?.target:null)||currentPoint()):{x:0,y:0};
    stopRestore();clearTimer(timer);timer=null;ready=false;current=path;boot=null;
    const ticket={path,target,token:++sequence,interrupted:false};activeTicket=ticket;
    if(!same)win.scrollTo({left:0,top:0,behavior:'instant'});
    // Save the destination before async rendering can shorten the current DOM.
    persist(target);return ticket;
  }
  function complete(ticket){
    if(destroyed||ticket!==activeTicket||ticket.completed||ticket.token!==sequence||ticket.path!==getRoute())return;
    ticket.completed=true;stopRestore();ready=true;
    if(ticket.interrupted){store();return}
    const pending={path:ticket.path,target:point(ticket.target),token:ticket.token};restoration=pending;
    if(win.ResizeObserver&&root){observer=new win.ResizeObserver(()=>apply(pending));observer.observe(root)}
    frame(()=>frame(()=>apply(pending)));
  }
  return {begin,complete,store,destroy(){
    if(destroyed)return;store();stopRestore();clearTimer(timer);timer=null;destroyed=true;sequence++;
    for(const type of intentTypes)win.removeEventListener(type,userIntent);
    win.removeEventListener('scroll',onScroll);win.removeEventListener('pagehide',store);win.removeEventListener('resize',onGeometryChange);win.removeEventListener('load',onGeometryChange,true);
    if(win.history&&previousScrollRestoration!==undefined)win.history.scrollRestoration=previousScrollRestoration;
  }};
}
