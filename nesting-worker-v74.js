import {nestItems,snapFilmPlacement} from './nesting-core.js';
self.onmessage=({data})=>{
 try{const {items,options}=data,send=(type,value)=>self.postMessage({type,...value});
 const settings={...options,onProgress:value=>send('progress',value),onCheckpoint:result=>send('checkpoint',{result})};
 const result=settings.operation==='move'?snapFilmPlacement(items,settings.placements,settings.moving,settings):nestItems(items,settings);
 self.postMessage({ok:true,result});
 }catch(error){self.postMessage({ok:false,error:error?.message||String(error)});}
};
