import {nestItems,snapFilmPlacement,validateFilmPlacements} from './nesting-core.js?v=2.17.3';
self.onmessage=event=>{
  try{const {items,options={}}=event.data;self.postMessage({ok:true,result:options.operation==='move'?snapFilmPlacement(items,options.placements,options.moving,options):options.operation==='validate'?validateFilmPlacements(items,options.placements,options):nestItems(items,options)});}
  catch(error){self.postMessage({ok:false,error:error?.message||String(error)});}
};
