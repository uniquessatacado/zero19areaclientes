import {applyColorRules} from './art-color-core.js?v=2.17.3';
self.onmessage=({data})=>{try{const pixels=new Uint8ClampedArray(data.buffer);const stats=applyColorRules(pixels,data.rules);self.postMessage({buffer:pixels.buffer,...stats},[pixels.buffer])}catch(error){self.postMessage({error:error.message})}};
