import {GARMENT_SIDES,SIDE_LABELS,normalizeGarmentScene,renderGarmentView} from './garment-scene.js?v=2.17.3';
export const PRESENTATION_BUCKET='z19p-presentations';
export const PRESENTATION_BASE='https://kedggjyerexnzmipaick.supabase.co/storage/v1/object/public/'+PRESENTATION_BUCKET+'/';
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export const isGalleryPath=path=>new RegExp(`^${uuid}/presentations/${uuid}/gallery\\.json$`,'i').test(path||'');
export function parseGallery(value,path){
 if(!isGalleryPath(path)||value?.version!==1||value.kind!=='z19p-garment-gallery'||typeof value.title!=='string'||value.title.length>140||!Array.isArray(value.views)||!value.views.length||value.views.length>4)throw new Error('Esta apresentação é inválida. Peça um novo link.');
 const base=path.slice(0,path.lastIndexOf('/')+1),seen=new Set();
 const views=value.views.map(view=>{if(!GARMENT_SIDES.includes(view.side)||seen.has(view.side)||view.path!==base+view.side+'.jpg'||!Number.isInteger(view.width)||!Number.isInteger(view.height)||view.width<1||view.height<1||view.width>4000||view.height>16000)throw new Error('Uma vista da apresentação é inválida.');seen.add(view.side);return {side:view.side,label:SIDE_LABELS[view.side],path:view.path,width:view.width,height:view.height};});
 return {title:value.title,model:value.model==='oversized'?'Oversized':'Normal',color:{black:'Preta',white:'Branca',offwhite:'Off-white'}[value.color]||'Preta',views:views.sort((a,b)=>GARMENT_SIDES.indexOf(a.side)-GARMENT_SIDES.indexOf(b.side))};
}
export async function createPresentationViews(input,{publicUrl,signal}={}){
 const scene=normalizeGarmentScene(input),sides=GARMENT_SIDES.filter(side=>scene.layers.some(layer=>layer.side===side));if(!sides.length)sides.push('front');const views=[];
 for(const side of sides){signal?.throwIfAborted();const canvas=await renderGarmentView(scene,side,{width:1600,annotations:true,publicUrl});try{signal?.throwIfAborted();views.push({side,label:SIDE_LABELS[side],width:canvas.width,height:canvas.height,dataUrl:canvas.toDataURL('image/jpeg',.94)})}finally{canvas.width=canvas.height=1}}
 return views;
}
export function presentationPDF(views){
 if(!Array.isArray(views)||!views.length||views.length>4)throw new Error('Escolha de uma a quatro vistas para o PDF.');
 const enc=value=>new TextEncoder().encode(value),objects=[],add=value=>(objects.push(typeof value==='string'?enc(value):value),objects.length),combine=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let index=0;for(const p of parts){out.set(p,index);index+=p.length}return out};
 add('<< /Type /Catalog /Pages 2 0 R /PageLayout /OneColumn >>');add(`<< /Type /Pages /Kids [${views.map((_,i)=>(3+i*3)+' 0 R').join(' ')}] /Count ${views.length} >>`);
 views.forEach((view,i)=>{if(!/^data:image\/jpeg;base64,/.test(view.dataUrl)||view.dataUrl.length>32*1024*1024||!Number.isInteger(view.width)||!Number.isInteger(view.height)||view.width<1||view.height<1)throw new Error('Imagem inválida para PDF.');const raw=atob(view.dataUrl.split(',')[1]),jpeg=Uint8Array.from(raw,c=>c.charCodeAt(0)),scale=Math.min(559.28/view.width,805.89/view.height),w=view.width*scale,h=view.height*scale,x=(595.28-w)/2,y=(841.89-h)/2,page=3+i*3;
 add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /View ${page+2} 0 R >> >> /Contents ${page+1} 0 R >>`);
 const commands=enc(`q\n${w.toFixed(4)} 0 0 ${h.toFixed(4)} ${x.toFixed(4)} ${y.toFixed(4)} cm\n/View Do\nQ`);add(combine(enc(`<< /Length ${commands.length} >>\nstream\n`),commands,enc('\nendstream')));
 add(combine(enc(`<< /Type /XObject /Subtype /Image /Width ${view.width} /Height ${view.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,enc('\nendstream')));
 });
 const chunks=[enc('%PDF-1.4\n%Zero19\n')],offsets=[0];let offset=chunks[0].length;objects.forEach((object,i)=>{offsets.push(offset);const chunk=combine(enc(`${i+1} 0 obj\n`),object,enc('\nendobj\n'));chunks.push(chunk);offset+=chunk.length});const xref=offset;chunks.push(enc(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));return new Blob(chunks,{type:'application/pdf'});
}
export async function publishPresentation(ctx,input,views,{signal}={}){
 const owner=ctx.accountOwnerId(),user=ctx.state().session?.user?.id,scene=normalizeGarmentScene(input),base=`${owner}/presentations/${crypto.randomUUID()}/`;
 if(!new RegExp(`^${uuid}$`,'i').test(owner||''))throw new Error('Entre novamente antes de publicar.');
 const guard=()=>{signal?.throwIfAborted();if(ctx.accountOwnerId()!==owner||ctx.state().session?.user?.id!==user)throw new Error('A conta mudou. Reabra a apresentação.')};
 const manifest={version:1,kind:'z19p-garment-gallery',title:scene.title,model:scene.model,color:scene.color,views:views.map(view=>({side:view.side,path:base+view.side+'.jpg',width:view.width,height:view.height}))};parseGallery(manifest,base+'gallery.json');
 for(const view of views){guard();const raw=atob(view.dataUrl.split(',')[1]),blob=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:'image/jpeg'}),result=await ctx.supabase.storage.from(PRESENTATION_BUCKET).upload(base+view.side+'.jpg',blob,{contentType:'image/jpeg',upsert:false});guard();if(result.error)throw result.error}
 const result=await ctx.supabase.storage.from(PRESENTATION_BUCKET).upload(base+'gallery.json',new Blob([JSON.stringify(manifest)],{type:'application/json'}),{contentType:'application/json',upsert:false});guard();if(result.error)throw result.error;return base+'gallery.json';
}
