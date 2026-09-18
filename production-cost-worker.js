import {analyzeRgba} from './production-cost-core.js?v=2.17.3';
self.onmessage=({data})=>{try{const analysis=analyzeRgba(new Uint8ClampedArray(data.buffer),data.width,data.height,{channelMode:data.channelMode});self.postMessage({id:data.id,ok:true,analysis});}catch(error){self.postMessage({id:data.id,ok:false,error:error.message||String(error)});}};
