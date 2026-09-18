// Relative RIP model. The ml/m² calibration belongs to the reference settings;
// applying those same passes/limits again would count ink twice.
const CHANNELS=['C','M','Y','K','W'];
const clone=value=>JSON.parse(JSON.stringify(value));
export function createUserRipSettings(){
  const outputPercent={C:70,M:80,Y:90,K:100,W:100},layers={C:2,M:2,Y:2,K:0,W:2};
  return {version:1,mode:'normal',resolutionDpi:1200,quality:'high',whiteMode:'substrate',totalLayers:4,outputPercent,layers,referenceOutputPercent:{...outputPercent},referenceLayers:{...layers},extraWhiteLayers:1,whiteExtraTimeMode:'measured',whiteExtraMinutesPerM:{film30:null,film60:null}};
}
export function validateRipSettings(rip){
  if(rip==null)return null;
  if(typeof rip!=='object'||Array.isArray(rip)||rip.version!==1||!['normal','white-extra'].includes(rip.mode))throw new Error('Revise o modo do RIP.');
  const number=(value,label,min,max,integer=false)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value))throw new Error(`RIP: ${label} inválido.`);return value};
  number(rip.resolutionDpi,'resolução',72,9600,true);number(rip.totalLayers,'total de camadas normais',1,16,true);number(rip.extraWhiteLayers,'camadas adicionais de branco',0,16,true);
  if(rip.totalLayers+rip.extraWhiteLayers>32)throw new Error('RIP: use no máximo 32 camadas totais.');
  for(const field of ['outputPercent','referenceOutputPercent','layers','referenceLayers']){
    if(!rip[field]||typeof rip[field]!=='object'||Array.isArray(rip[field]))throw new Error('RIP: configuração de canais incompleta.');
    for(const channel of CHANNELS)number(rip[field][channel],`${field} ${channel}`,0,field.includes('Percent')?100:16,!field.includes('Percent'));
  }
  if(CHANNELS.some(channel=>rip.layers[channel]>rip.totalLayers))throw new Error('RIP: um canal não pode ter mais camadas que o total normal.');
  if(!['measured','proportional-layers'].includes(rip.whiteExtraTimeMode))throw new Error('RIP: escolha tempo medido ou hipótese proporcional às camadas.');
  for(const key of ['film30','film60']){const value=rip.whiteExtraMinutesPerM?.[key];if(value!==null&&value!==undefined)number(value,'tempo do branco reforçado',.001,1000000);}
  return clone(rip);
}
export function ripInkFactors(input){
  const rip=validateRipSettings(input);if(!rip)return {enabled:false,factors:Object.fromEntries(CHANNELS.map(c=>[c,1])),warnings:[],mode:'legacy'};
  const factors={},warnings=[];
  for(const channel of CHANNELS){
    const actualLayers=rip.layers[channel]+(channel==='W'&&rip.mode==='white-extra'?rip.extraWhiteLayers:0),actual=rip.outputPercent[channel]*actualLayers,reference=rip.referenceOutputPercent[channel]*rip.referenceLayers[channel];
    factors[channel]=actual===0?0:reference>0?actual/reference:null;
    if(factors[channel]===null)warnings.push(`Canal ${channel}: cadastre camadas e saída da referência de consumo; não foi possível estimar a mudança do RIP.`);
  }
  return {enabled:true,mode:rip.mode,factors,warnings,rip,totalLayers:rip.totalLayers+(rip.mode==='white-extra'?rip.extraWhiteLayers:0),label:rip.mode==='white-extra'?'Branco reforçado':'Normal'};
}
export function ripPrintTime(baseMinutesPerM,input,nominalWidthCm){
  const rip=validateRipSettings(input);if(!rip||rip.mode==='normal')return {minutesPerM:baseMinutesPerM,adjusted:false,assumption:null};
  const measured=rip.whiteExtraMinutesPerM?.[nominalWidthCm===30?'film30':'film60'];
  if(rip.whiteExtraTimeMode==='measured')return {minutesPerM:measured??null,adjusted:true,assumption:measured==null?'Meça o tempo do branco reforçado nesta largura. O tempo normal não foi reutilizado como se fosse medido.':null};
  return {minutesPerM:baseMinutesPerM==null?null:baseMinutesPerM*(rip.totalLayers+rip.extraWhiteLayers)/rip.totalLayers,adjusted:true,assumption:'Tempo do branco reforçado estimado pela proporção de camadas totais (por exemplo, 5/4). É uma hipótese opcional, não uma velocidade medida.'};
}
