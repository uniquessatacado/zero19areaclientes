// RGB coverage is an estimation model, not an ICC/RIP ink-separation report.
import {validateRipSettings,ripInkFactors,ripPrintTime} from './rip-calibration.js?v=2.17.3';
// The 52 min/m supplier reference is only a printing-time reference for a 60 cm
// roll / 58 cm printable width. It does not establish ink or powder consumption.
export const PRODUCTION_TIME_REFERENCE={url:'https://bulkinkjetbrasil.com.br/produto/impressora-plotter-epson-t3170-a1-24-adaptada-para-dtf-textil/',nominalWidthCm:60,usableWidthCm:58,minutesPerM:52};
const CHANNELS=['C','M','Y','K','W'];
const CHANNEL_LABELS={C:'Ciano',M:'Magenta',Y:'Amarelo',K:'Preto',W:'Branco'};
const EPS=1e-8;
const absent=value=>value==null||typeof value==='string'&&!value.trim();
function numeric(value,label,{min=0,max=1e12,positive=false}={}){
  if(absent(value))return null;
  if(!['number','string'].includes(typeof value))throw new Error(`${label}: informe um número válido.`);
  const number=typeof value==='string'?Number(value.trim().replace(',','.')):value;
  if(!Number.isFinite(number)||number<min||number>max||positive&&number<=0)throw new Error(`${label}: informe ${positive?'um número maior que zero':'um número não negativo'} dentro do limite permitido.`);
  return number;
}
const required=(value,label,options)=>{const number=numeric(value,label,options);if(number==null)throw new Error(`${label} não informado.`);return number;};
const multiply=(a,b)=>a===0||b===0?0:a==null||b==null?null:a*b;
const channelSet=mode=>{if(!['CMYW','CMYKW'].includes(mode))throw new Error('Escolha os canais CMYW ou CMYKW da impressora.');return mode==='CMYW'?['C','M','Y','W']:CHANNELS;};
const round=value=>value==null?null:Number(value.toFixed(10));

export function analyzeRgba(bytes,width,height,{channelMode='CMYW'}={}){
  channelSet(channelMode);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>68e6)throw new Error('Dimensões inválidas para analisar as cores da arte.');
  const data=bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes;
  if(!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw new Error('Os pixels RGBA não correspondem às dimensões da arte.');
  const sums={C:0,M:0,Y:0,K:0,W:0};let alphaSum=0;
  for(let index=0;index<data.length;index+=4){
    const alpha=data[index+3]/255;if(!alpha)continue;
    const r=data[index]/255,g=data[index+1]/255,b=data[index+2]/255;
    let c=1-r,m=1-g,y=1-b,k=0;
    if(channelMode==='CMYKW'){
      k=1-Math.max(r,g,b);
      if(k>=1-EPS)c=m=y=0;
      else{c=(c-k)/(1-k);m=(m-k)/(1-k);y=(y-k)/(1-k);}
    }
    sums.C+=Math.max(0,c)*alpha;sums.M+=Math.max(0,m)*alpha;sums.Y+=Math.max(0,y)*alpha;sums.K+=k*alpha;sums.W+=alpha;alphaSum+=alpha;
  }
  const pixels=width*height;
  return {version:1,method:'rgba-equivalent-area-v1',channelMode,width,height,samplePixels:pixels,alphaCoverage:alphaSum/pixels,channels:Object.fromEntries(CHANNELS.map(channel=>[channel,sums[channel]/pixels]))};
}

function checkedPurchases(purchases){
  if(!Array.isArray(purchases))throw new Error('A lista de compras de insumos é inválida.');
  const ids=new Set();
  return purchases.map(purchase=>{
    if(!purchase?.id||ids.has(purchase.id))throw new Error('Há uma compra de insumo sem identificação ou duplicada.');ids.add(purchase.id);
    if(!['film','powder','ink'].includes(purchase.kind))throw new Error('O tipo da compra de insumo é inválido.');
    const unit={film:'m',powder:'g',ink:'ml'}[purchase.kind];
    if(purchase.unit!==unit)throw new Error(`A compra “${purchase.name||purchase.id}” deve informar a quantidade total em ${unit}. Converta litros para ml e quilos para gramas.`);
    const quantity=numeric(purchase.quantity,`Quantidade de ${purchase.name||purchase.id}`,{positive:true}),totalPrice=numeric(purchase.totalPrice,`Preço de ${purchase.name||purchase.id}`);
    if(purchase.kind==='film'&&purchase.widthCm!=null&&![30,60].includes(Number(purchase.widthCm)))throw new Error('A largura nominal do rolo deve ser 30 ou 60 cm.');
    if(purchase.kind==='ink'&&purchase.channel!=null&&!CHANNELS.includes(purchase.channel))throw new Error('Canal de tinta inválido na compra.');
    if(purchase.kind==='powder'&&purchase.color!=null&&!['white','black'].includes(purchase.color))throw new Error('Escolha pó branco ou preto.');
    return {...purchase,quantity,totalPrice,unitCost:quantity!=null&&totalPrice!=null?totalPrice/quantity:null};
  });
}
function checkedCalibration(profile){
  channelSet(profile.channelMode);
  validateRipSettings(profile.rip);
  const source=profile.calibration||{},calibration={inkMlPerM2:{}};
  for(const channel of CHANNELS)calibration.inkMlPerM2[channel]=numeric(source.inkMlPerM2?.[channel],`Consumo da tinta ${CHANNEL_LABELS[channel]}`,{max:1e6});
  for(const key of ['powderGPerM2','leaderCm','setupMinutes','curingMinutes','laborPerHour','kwhPerHour','kwhPrice','maintenancePerM','ripPerM'])calibration[key]=numeric(source[key],`Calibração ${key}`);
  for(const key of ['inkWastePercent','filmWastePercent'])calibration[key]=numeric(source[key],`Percentual ${key}`,{max:1000});
  for(const key of ['time60MinPerM','time30MinPerM'])calibration[key]=numeric(source[key],`Tempo ${key}`,{positive:true,max:1e6});
  if(source.time30Mode!=null&&!['measured','proportional'].includes(source.time30Mode))throw new Error('Escolha tempo medido ou estimativa proporcional para o filme de 30 cm.');
  calibration.time30Mode=source.time30Mode||null;
  return calibration;
}

export function validateProductionCostConfig(state){
  if(!state||state.version!==1)throw new Error('A versão da configuração de custos não é suportada.');
  checkedPurchases(state.purchases||[]);
  if(!Array.isArray(state.profiles))throw new Error('A lista de impressoras é inválida.');
  const ids=new Set();for(const profile of state.profiles){if(!profile?.id||ids.has(profile.id))throw new Error('Há uma impressora sem identificação ou duplicada.');ids.add(profile.id);checkedCalibration(profile);}
  if(state.activeProfileId&&!ids.has(state.activeProfileId))throw new Error('A impressora ativa não está cadastrada.');
  return true;
}

export function estimateProductionCost({layout,items=[],profile,purchases,analyses,state,commissionAmount,garmentUnitCost,garmentQuantity,saleTotal}={}){
  profile=profile||state?.profiles?.find(candidate=>candidate.id===state.activeProfileId);
  if(!profile)throw new Error('Selecione uma impressora para estimar os custos.');
  const channels=channelSet(profile.channelMode),calibration=checkedCalibration(profile),purchaseList=checkedPurchases(purchases||state?.purchases||[]),purchaseMap=new Map(purchaseList.map(purchase=>[purchase.id,purchase]));
  const rip=ripInkFactors(profile.rip),warn=new Set(rip.warnings),assumptions=[
    'Consumo de tinta e pó é uma estimativa por cobertura e calibração; não é uma medição do RIP nem usa perfil ICC.',
    'A camada branca acompanha a transparência da arte. A base branca, o perfil de cor e as passadas reais podem alterar o consumo.',
    'O filme é cobrado pelo comprimento inteiro do rolo nominal, incluindo espaços vazios, avanço inicial e a perda configurada.',
    'Comissão e custo das peças entram somente quando informados. O resultado é contribuição estimada, não lucro líquido contábil.'
  ];
  if(rip.enabled){assumptions.push('Os consumos ml/m² pertencem ao RIP de referência cadastrado. Camadas e limites só ajustam diferenças relativas, sem multiplicar a referência duas vezes.');assumptions.push(`RIP ${rip.label}: ${rip.totalLayers} camadas totais, ${rip.rip.resolutionDpi} × ${rip.rip.resolutionDpi} dpi. Alterações relativas de tinta são aproximações lineares, não medições de gotas.`)}
  warn.add('Estimativa por pixels e coeficientes configurados, não aferida por este cálculo. Um total preenchido não comprova o consumo real da impressora; calibre com sua produção.');
  const zeroOperations=[];
  if(calibration.laborPerHour===0)zeroOperations.push('mão de obra');
  if(calibration.kwhPerHour===0||calibration.kwhPrice===0)zeroOperations.push('energia');
  if(calibration.maintenancePerM===0)zeroOperations.push('manutenção');
  if(calibration.ripPerM===0)zeroOperations.push('RIP/software');
  if(zeroOperations.length)warn.add(`Custos operacionais não incluídos porque estão configurados como zero: ${zeroOperations.join(', ')}. Revise esses valores se quiser incluir a operação no orçamento.`);
  const usableWidthCm=required(layout?.filmWidthMm,'Largura útil do filme',{positive:true,max:600})/10,lengthM=required(layout?.lengthMm,'Comprimento do filme',{max:1e9})/1000;
  const nominalWidthCm=usableWidthCm<=30?30:60;
  if(Math.abs(usableWidthCm-(nominalWidthCm===30?28:58))>.001)warn.add(`Largura útil de ${usableWidthCm} cm: confira se corresponde ao rolo nominal de ${nominalWidthCm} cm selecionado.`);
  if(!Array.isArray(items))throw new Error('A lista de artes para estimar custos é inválida.');
  const itemIds=new Set(),artCoverage=[],channelKnownAreas={C:0,M:0,Y:0,K:0,W:0};let boundingAreaM2=0,knownPrintedAreaM2=0,analysisComplete=true,ripOutputComplete=true,totalCopies=0;
  for(const [index,item] of items.entries()){
    const id=item.localId??item.id??`item-${index}`;
    if(itemIds.has(id))throw new Error('Há itens duplicados na análise de custos.');itemIds.add(id);
    const widthCm=required(item.widthCm,`Largura de ${item.label||id}`,{positive:true,max:1e6}),heightCm=required(item.heightCm,`Altura de ${item.label||id}`,{positive:true,max:1e6}),quantity=item.quantity==null?1:required(item.quantity,'Quantidade de impressões',{positive:true,max:10000});
    if(!Number.isInteger(quantity))throw new Error('A quantidade de impressões deve ser inteira.');
    const areaM2=widthCm*heightCm/10000*quantity;boundingAreaM2+=areaM2;totalCopies+=quantity;
    const detail={id,label:String(item.label||id),widthCm,heightCm,quantity,boundingAreaM2:areaM2,printedAreaM2:null,channelAreasM2:{},analysisComplete:false,ripOutputComplete:true,warnings:[]};artCoverage.push(detail);
    const analysis=(analyses instanceof Map?analyses.get(id):analyses?.[id])||item.analysis;
    if(!analysis){analysisComplete=false;const message=`A arte “${item.label||id}” ainda não tem análise de cores/transparência. O consumo não foi presumido.`;warn.add(message);detail.warnings.push(message);continue;}
    if(analysis.channelMode!==profile.channelMode){analysisComplete=false;const message=`Reanalise “${item.label||id}” para os canais ${profile.channelMode} desta impressora.`;warn.add(message);detail.warnings.push(message);continue;}
    const alpha=required(analysis.alphaCoverage,'Cobertura de transparência',{max:1});
    knownPrintedAreaM2+=areaM2*alpha;detail.printedAreaM2=areaM2*alpha;detail.analysisComplete=true;
    const usedChannels=[];
    for(const channel of channels){const coverage=required(analysis.channels?.[channel],`Cobertura do canal ${channel}`,{max:1});if(coverage>alpha+EPS)throw new Error('A cobertura de tinta não pode ultrapassar a área com transparência da arte.');channelKnownAreas[channel]+=coverage*areaM2;detail.channelAreasM2[channel]=coverage*areaM2;if(coverage>0)usedChannels.push(channel);}
    if(rip.enabled&&alpha>0&&usedChannels.every(channel=>rip.factors[channel]===0)){
      ripOutputComplete=false;detail.ripOutputComplete=false;const message=`A configuração do RIP não imprime pixels da arte “${item.label||id}”: todos os canais necessários estão desligados. Revise os canais e o branco.`;warn.add(message);detail.warnings.push(message);
      warn.add('O pó permanece estimado pela transparência original da arte. Sem saída de tinta válida, esse consumo e o custo total não são conclusivos.');
    }
  }
  const printedAreaM2=analysisComplete?knownPrintedAreaM2:null,channelAreasM2=Object.fromEntries(CHANNELS.map(channel=>[channel,channels.includes(channel)?analysisComplete?channelKnownAreas[channel]:null:0]));
  if(totalCopies&&!lengthM)throw new Error('Calcule o comprimento do filme antes de estimar custos de artes.');
  const usableAreaM2=usableWidthCm/100*lengthM,geometryComplete=knownPrintedAreaM2<=usableAreaM2+EPS;
  if(!geometryComplete)warn.add('A área estimada das impressões ultrapassa a área útil deste filme. Recalcule o encaixe e confira quantidades. O total não pode ser fechado com este comprimento.');
  const reserveM=calibration.filmWastePercent==null?null:lengthM*calibration.filmWastePercent/100,leaderM=calibration.leaderCm==null?null:calibration.leaderCm/100;
  const consumedLengthM=reserveM==null||leaderM==null?null:lengthM+reserveM+leaderM;
  if(consumedLengthM==null)warn.add('Informe a perda de filme e o avanço inicial; use zero explicitamente quando não houver.');
  const areaM2=consumedLengthM==null?null:nominalWidthCm/100*consumedLengthM,wasteAreaM2=areaM2==null||printedAreaM2==null?null:Math.max(0,areaM2-printedAreaM2),wastePercent=areaM2>0&&wasteAreaM2!=null?wasteAreaM2/areaM2*100:null;

  let minutesPerM=null,timeMode='unavailable';
  if(nominalWidthCm===60){minutesPerM=calibration.time60MinPerM;timeMode='configured-60';}
  else if(calibration.time30Mode==='measured'){minutesPerM=calibration.time30MinPerM;timeMode='measured-30';}
  else if(calibration.time30Mode==='proportional'){minutesPerM=multiply(calibration.time60MinPerM,28/58);timeMode='proportional-30';}
  const ripTime=ripPrintTime(minutesPerM,profile.rip,nominalWidthCm);minutesPerM=ripTime.minutesPerM;if(ripTime.adjusted)timeMode='white-extra-'+(profile.rip.whiteExtraTimeMode||'measured');if(ripTime.assumption)assumptions.push(ripTime.assumption);
  if(timeMode==='proportional-30')assumptions.push('Tempo do filme de 30 cm estimado proporcionalmente a 28/58 do tempo de 60 cm. É uma hipótese selecionada, não uma velocidade medida.');
  const printMinutes=multiply(lengthM,minutesPerM),timeParts=[printMinutes,calibration.setupMinutes,calibration.curingMinutes],timeComplete=timeParts.every(part=>part!=null),knownMinutes=timeParts.reduce((sum,part)=>sum+(part??0),0),totalMinutes=timeComplete?knownMinutes:null;
  if(minutesPerM==null&&lengthM>0)warn.add(`Cadastre o tempo de impressão do filme de ${nominalWidthCm} cm${nominalWidthCm===30?' ou selecione explicitamente a hipótese proporcional':''}.`);
  if(calibration.setupMinutes==null||calibration.curingMinutes==null)warn.add('Informe preparo e cura em minutos; zero indica explicitamente que esse tempo não será incluído.');
  const timeEstimate={minutesPerM:round(minutesPerM),printMinutes:round(printMinutes),setupMinutes:calibration.setupMinutes,curingMinutes:calibration.curingMinutes,totalMinutes:round(totalMinutes),knownMinutes:round(knownMinutes),complete:timeComplete,mode:timeMode,estimated:true,label:timeMode==='proportional-30'?'Estimativa proporcional 28/58 para rolo de 30 cm':minutesPerM!=null?`Tempo configurado para rolo de ${nominalWidthCm} cm`:'Tempo não disponível'};

  const rows=[];
  function addRow({key,label,kind,quantity,unit,unitCost,purchaseId=null,estimated=false,warning=null,scope='production',channel=null,target=rows,warnings=warn}){
    const cost=multiply(quantity,unitCost),available=cost!=null;
    if(!available){if(warning)warnings.add(warning);else warnings.add(`Custo de ${label.toLocaleLowerCase('pt-BR')} incompleto: confira consumo, unidade e preço.`);}
    target.push({key,label,kind,channel,quantity:round(quantity),unit,unitCost:round(unitCost),cost:round(cost),available,estimated,purchaseId,scope});
  }
  function materialRow({key,label,kind,quantity,unit,purchaseId,channel,widthCm,target=rows,warnings=warn}){
    const purchase=purchaseMap.get(purchaseId);let price=purchase?.unitCost??null,reason='';
    if(!purchase)reason=`Selecione a compra de ${label.toLocaleLowerCase('pt-BR')}.`;
    else if(purchase.kind!==kind||purchase.unit!==unit||channel&&purchase.channel!==channel||widthCm&&Number(purchase.widthCm)!==widthCm){price=null;reason=`A compra selecionada para ${label.toLocaleLowerCase('pt-BR')} tem tipo, unidade, canal ou largura incompatível.`;}
    else if(price==null)reason=`Informe quantidade comprada e preço total de “${purchase.name||label}”.`;
    if(quantity==null)reason=reason||`Calibre o consumo de ${label.toLocaleLowerCase('pt-BR')} e analise todas as artes.`;
    addRow({key,label,kind,quantity,unit,unitCost:price,purchaseId:purchase?.id||null,estimated:kind!=='film',warning:reason||null,channel,target,warnings});
  }
  const inkQuantity=(area,channel)=>{const baseMl=multiply(multiply(area,calibration.inkMlPerM2[channel]),rip.factors[channel]);return baseMl===0?0:baseMl==null||calibration.inkWastePercent==null?null:baseMl*(1+calibration.inkWastePercent/100)};
  materialRow({key:'film',label:`Filme nominal ${nominalWidthCm} cm`,kind:'film',quantity:consumedLengthM,unit:'m',purchaseId:profile[nominalWidthCm===30?'film30PurchaseId':'film60PurchaseId'],widthCm:nominalWidthCm});
  for(const channel of channels){
    const quantity=inkQuantity(channelAreasM2[channel],channel);
    materialRow({key:`ink-${channel}`,label:`Tinta ${CHANNEL_LABELS[channel]} (${channel})`,kind:'ink',quantity,unit:'ml',purchaseId:profile.inkPurchaseIds?.[channel],channel});
  }
  materialRow({key:'powder',label:`Pó ${purchaseMap.get(profile.powderPurchaseId)?.color==='black'?'preto':'de poliamida'}`,kind:'powder',quantity:multiply(printedAreaM2,calibration.powderGPerM2),unit:'g',purchaseId:profile.powderPurchaseId});
  // Per-art consumables are calculated from that artwork's actual analyzed
  // coverage, not allocated from film area. Shared operation and manual rows
  // deliberately stay outside this breakdown.
  const perArt=artCoverage.map(detail=>{
    const target=[],warnings=new Set(detail.warnings);
    for(const channel of channels)materialRow({key:`ink-${channel}`,label:`Tinta ${CHANNEL_LABELS[channel]} (${channel})`,kind:'ink',channel,quantity:inkQuantity(detail.channelAreasM2[channel]??null,channel),unit:'ml',purchaseId:profile.inkPurchaseIds?.[channel],target,warnings});
    materialRow({key:'powder',label:`Pó ${purchaseMap.get(profile.powderPurchaseId)?.color==='black'?'preto':'de poliamida'}`,kind:'powder',quantity:multiply(detail.printedAreaM2,calibration.powderGPerM2),unit:'g',purchaseId:profile.powderPurchaseId,target,warnings});
    return {id:detail.id,label:detail.label,widthCm:detail.widthCm,heightCm:detail.heightCm,quantity:detail.quantity,boundingAreaM2:round(detail.boundingAreaM2),printedAreaM2:round(detail.printedAreaM2),rows:target,knownConsumablesCost:round(target.reduce((sum,row)=>sum+(row.cost??0),0)),complete:detail.analysisComplete&&detail.ripOutputComplete&&target.every(row=>row.available),warnings:[...warnings]};
  });
  const hours=totalMinutes==null?null:totalMinutes/60;
  addRow({key:'labor',label:'Mão de obra',kind:'labor',quantity:hours,unit:'h',unitCost:calibration.laborPerHour,estimated:true});
  addRow({key:'energy',label:'Energia',kind:'energy',quantity:multiply(hours,calibration.kwhPerHour),unit:'kWh',unitCost:calibration.kwhPrice,estimated:true});
  addRow({key:'maintenance',label:'Manutenção',kind:'maintenance',quantity:lengthM,unit:'m',unitCost:calibration.maintenancePerM,estimated:true});
  addRow({key:'rip',label:'RIP / software',kind:'rip',quantity:lengthM,unit:'m',unitCost:calibration.ripPerM,estimated:true});
  if(commissionAmount!==undefined)addRow({key:'commission',label:'Comissão informada',kind:'commission',quantity:1,unit:'pedido',unitCost:numeric(commissionAmount,'Comissão'),scope:'manual'});
  if(garmentUnitCost!==undefined||garmentQuantity!==undefined){const count=numeric(garmentQuantity,'Quantidade de peças',{max:100000});if(count!=null&&!Number.isInteger(count))throw new Error('A quantidade de peças deve ser inteira.');addRow({key:'garments',label:'Peças / camisetas',kind:'garments',quantity:count,unit:'peça',unitCost:numeric(garmentUnitCost,'Custo unitário da peça'),scope:'manual',warning:'Informe custo unitário e quantidade real das peças; a quantidade de estampas não define a quantidade de camisetas.'});}
  const productionRows=rows.filter(row=>row.scope==='production'),productionKnown=productionRows.reduce((sum,row)=>sum+(row.cost??0),0),known=rows.reduce((sum,row)=>sum+(row.cost??0),0),productionComplete=analysisComplete&&geometryComplete&&ripOutputComplete&&productionRows.every(row=>row.available),complete=analysisComplete&&geometryComplete&&ripOutputComplete&&rows.every(row=>row.available),total=complete?known:null;
  const breakdown={};for(const kind of ['film','ink','powder','labor','energy','maintenance','rip','commission','garments']){const matching=rows.filter(row=>row.kind===kind);breakdown[kind]=!matching.length?null:matching.every(row=>row.available)?round(matching.reduce((sum,row)=>sum+row.cost,0)):null;}
  const sale=numeric(saleTotal,'Valor de venda'),profitComplete=sale!=null&&complete,grossProfit=profitComplete?sale-total:null;
  if(saleTotal!==undefined&&sale==null)warn.add('Informe o valor de venda para calcular a contribuição estimada.');
  const profit={saleTotal:sale,grossProfit:round(grossProfit),marginPercent:profitComplete&&sale>0?round(grossProfit/sale*100):null,markupPercent:profitComplete&&total>0?round(grossProfit/total*100):null,complete:profitComplete};
  return {version:1,profileId:profile.id||null,channelMode:profile.channelMode,rows,perArt,complete,ripOutputComplete,warnings:[...warn],assumptions,estimated:true,rip,
    totals:{known:round(known),total:round(total),complete,productionKnown:round(productionKnown),productionTotal:productionComplete?round(productionKnown):null,productionComplete},breakdown,
    film:{nominalWidthCm,usableWidthCm,lengthM:round(lengthM),consumedLengthM:round(consumedLengthM),reserveM:round(reserveM),leaderM:round(leaderM),areaM2:round(areaM2),usableAreaM2:round(usableAreaM2),wasteAreaM2:round(wasteAreaM2),wastePercent:round(wastePercent)},
    coverage:{boundingAreaM2:round(boundingAreaM2),printedAreaM2:round(printedAreaM2),knownPrintedAreaM2:round(knownPrintedAreaM2),channelAreasM2:Object.fromEntries(CHANNELS.map(channel=>[channel,round(channelAreasM2[channel])])),analysisComplete,geometryComplete,totalCopies},timeEstimate,profit};
}
