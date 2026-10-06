// Opt-in, lossless whitespace-only separation. Legacy items without a manifest
// remain untouched. One sale/application stays one sale/application, even when
// its lettering needs several independently movable pieces on the film.
const freshId=()=>crypto.randomUUID();
const clone=value=>structuredClone(value);
const name=value=>String(value||'').normalize('NFC').trim();
const positiveQuantity=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const stable=value=>JSON.stringify(canonical(value));
const fontRecipe=item=>stable([item.sourceId,item.fontSource||null,item.fontSources||[],item.glyphs||[],item.palette||[],item.vectorColorOverrides||null,item.nameReferenceChar||null]);
const peerRecipe=item=>({localId:item.localId,sourceId:item.sourceId,name:name(item.name),number:String(item.number||''),quantity:Number(item.quantity),nameHeightCm:Number(item.nameHeightCm||0),numberHeightCm:Number(item.numberHeightCm||0),fontRecipe:fontRecipe(item),letteringRevision:item.letteringRevision??null});
export const letteringApplicationPart=item=>({localId:item.localId,name:name(item.name),number:String(item.number||''),sourceId:item.sourceId,quantity:Number(item.quantity)});
function replaceApplicationParts(items,applicationKey,removedIds,replacements){
  for(const item of items.filter(item=>phraseApplicationKey(item)===applicationKey&&item.letteringApplicationParts)){
    let replaced=false;item.letteringApplicationParts=item.letteringApplicationParts.flatMap(part=>{if(!removedIds.includes(part.localId))return [part];if(replaced)return [];replaced=true;return replacements.map(letteringApplicationPart);});
  }
}
const fail=detail=>{throw new Error('Frase separada incompleta: '+detail+'. Reúna a frase para restaurar o conjunto; nenhuma aplicação foi liberada.');};

export function phraseApplicationKey(item){
  if(item.zero19WorkItemId)return 'work:'+item.zero19WorkItemId;
  if(item.externalOrderItemRef)return 'sale:'+String(item.officialProjectId||item.projectId||'')+':'+item.externalOrderItemRef;
  return 'composition:'+(item.compositionGroupId||item.localId);
}

export function canSeparateFilmPhrase(item){
  return item?.type==='team_customization'&&!item.vectorSource&&!item.orderLink&&!item.phrasePart&&!item.number&&name(item.name).split(/\s+/u).length>1;
}

function checkedManifest(manifest){
  if(!manifest||manifest.version!==1||!manifest.id||!manifest.revisionId||!manifest.applicationKey||!manifest.sourceLocalId||!Array.isArray(manifest.words)||manifest.words.length<2||manifest.words.length>200||!Array.isArray(manifest.partIds)||manifest.partIds.length!==manifest.words.length||new Set(manifest.partIds).size!==manifest.partIds.length||manifest.partIds.some(id=>!id)||!positiveQuantity(manifest.quantity)||name(manifest.sourceText).split(/\s+/u).some((word,index)=>word!==manifest.words[index])||name(manifest.sourceText).split(/\s+/u).length!==manifest.words.length||!Number.isFinite(Number(manifest.nameHeightCm))||Number(manifest.nameHeightCm)<=0||!Number.isFinite(Number(manifest.sourceWidthCm))||Number(manifest.sourceWidthCm)<=0||!Number.isFinite(Number(manifest.sourceHeightCm))||Number(manifest.sourceHeightCm)<=0)fail('manifesto ausente ou inválido');
  if(typeof manifest.fontRecipe!=='string'||!Array.isArray(manifest.requiredPeers)||new Set(manifest.requiredPeers.map(peer=>peer.localId)).size!==manifest.requiredPeers.length)fail('receita da fonte ou partes da aplicação inválidas');
  try{const recipe=JSON.parse(manifest.fontRecipe);if(!Array.isArray(recipe)||recipe.length!==7||!recipe[0])fail('receita da fonte inválida');}catch{fail('receita da fonte inválida');}
  return manifest;
}

function manifestFingerprint(manifest){
  return stable([manifest.version,manifest.id,manifest.revisionId,manifest.applicationKey,manifest.sourceLocalId,manifest.sourceText,manifest.words,manifest.partIds,manifest.quantity,manifest.nameHeightCm,manifest.nameTrackingCm,manifest.sourceWidthCm,manifest.sourceHeightCm,manifest.sourceLabel,manifest.sourcePieceType,manifest.sourceCompositionMode,manifest.sourceNameReferenceChar,manifest.fontRecipe,manifest.requiredPeers,manifest.letteringRevision??null]);
}

function manifestsFromItems(items){
  const manifests=new Map();
  for(const item of items){
    if(item.phraseManifests!=null&&!Array.isArray(item.phraseManifests))fail('manifesto alterado');
    for(const candidate of item.phraseManifests||[]){const manifest=checkedManifest(candidate);
      if(phraseApplicationKey(item)!==manifest.applicationKey)fail('vínculo de aplicação alterado');
      const found=manifests.get(manifest.id);
      if(found&&manifestFingerprint(found)!==manifestFingerprint(manifest))fail('revisões incompatíveis');
      manifests.set(manifest.id,manifest);
    }
    if(item.phrasePart&&!(item.phraseManifests||[]).some(manifest=>manifest.id===item.phrasePart.manifestId))fail('palavra sem manifesto');
  }
  return manifests;
}

export function separateFilmPhrase(items,localId,{id=freshId}={}){
  const item=items.find(candidate=>candidate.localId===localId);
  if(!canSeparateFilmPhrase(item))throw new Error('Escolha uma frase com espaços e sem número unificado. Nenhuma palavra será cortada em letras.');
  assertCompleteFilmPhrases(items);
  const sourceText=name(item.name),words=sourceText.split(/\s+/u);
  if(words.length>200)throw new Error('A frase ultrapassa 200 palavras. Separe em frases menores antes de montar o filme.');
  const manifest=checkedManifest({version:1,id:id(),revisionId:id(),applicationKey:phraseApplicationKey(item),sourceLocalId:item.localId,sourceText,words,partIds:words.map(()=>id()),quantity:Number(item.quantity),nameHeightCm:Number(item.nameHeightCm),nameTrackingCm:Number(item.nameTrackingCm??item.letterTrackingCm??0),sourceWidthCm:Number(item.widthCm),sourceHeightCm:Number(item.heightCm),sourceLabel:item.label||sourceText,sourcePieceType:item.pieceType,sourceCompositionMode:item.compositionMode,sourceNameReferenceChar:item.nameReferenceChar,fontRecipe:fontRecipe(item),requiredPeers:items.filter(peer=>peer.localId!==item.localId&&phraseApplicationKey(peer)===phraseApplicationKey(item)).map(peerRecipe),letteringRevision:item.letteringRevision??null});
  const allIds=new Set(items.map(candidate=>candidate.localId));
  if(manifest.partIds.some(partId=>allIds.has(partId)))throw new Error('Não foi possível identificar as palavras sem duplicar um item. Tente novamente.');
  const parts=words.map((word,index)=>{
    const part={...clone(item),localId:manifest.partIds[index],compositionGroupId:item.compositionGroupId||item.localId,name:word,label:manifest.sourceLabel+' · palavra '+(index+1)+'/'+words.length+' — '+word,phrasePart:{manifestId:manifest.id,revisionId:manifest.revisionId,index},phraseManifests:[...(clone(item.phraseManifests||[])),clone(manifest)]};
    delete part.previewDataUrl;delete part.previewQualityVersion;delete part.symbolFallbackCharacters;
    return part;
  });
  const next=items.flatMap(candidate=>candidate.localId===localId?parts:[clone(candidate)]).map(candidate=>{
    if(phraseApplicationKey(candidate)===manifest.applicationKey&&!candidate.phraseManifests?.some(value=>value.id===manifest.id))candidate.phraseManifests=[...(candidate.phraseManifests||[]),clone(manifest)];
    for(const existing of candidate.phraseManifests||[])if(existing.id!==manifest.id)existing.requiredPeers=(existing.requiredPeers||[]).flatMap(peer=>peer.localId===localId?parts.map(peerRecipe):[peer]);
    return candidate;
  });
  replaceApplicationParts(next,manifest.applicationKey,[localId],parts);
  assertCompleteFilmPhrases(next);
  return {items:next,parts:next.filter(candidate=>candidate.phrasePart?.manifestId===manifest.id),manifest};
}

export function reuniteFilmPhrase(items,manifestId){
  const manifest=manifestsFromItems(items).get(manifestId);
  if(!manifest)throw new Error('A frase original não está disponível neste filme.');
  const source=items.find(item=>item.phrasePart?.manifestId===manifestId)||items.find(item=>phraseApplicationKey(item)===manifest.applicationKey);
  if(!source)throw new Error('O conjunto desta aplicação não está disponível.');
  const restored={...clone(source),localId:manifest.sourceLocalId,name:manifest.sourceText,number:'',quantity:manifest.quantity,nameHeightCm:manifest.nameHeightCm,nameTrackingCm:manifest.nameTrackingCm,widthCm:manifest.sourceWidthCm,heightCm:manifest.sourceHeightCm,label:manifest.sourceLabel,pieceType:manifest.sourcePieceType,compositionMode:manifest.sourceCompositionMode,nameReferenceChar:manifest.sourceNameReferenceChar,letteringRevision:manifest.letteringRevision};
  const [sourceId,fontSource,fontSources,glyphs,palette,vectorColorOverrides,nameReferenceChar]=JSON.parse(manifest.fontRecipe);
  Object.assign(restored,{sourceId,fontSource,fontSources,glyphs,palette,vectorColorOverrides,nameReferenceChar});
  delete restored.phrasePart;delete restored.previewDataUrl;delete restored.previewQualityVersion;delete restored.symbolFallbackCharacters;
  restored.phraseManifests=(restored.phraseManifests||[]).filter(value=>value.id!==manifestId);
  const next=[];let added=false;
  for(const item of items){
    if(item.phrasePart?.manifestId===manifestId){if(!added){next.push(restored);added=true;}continue;}
    const remaining=clone(item);if(remaining.phraseManifests)remaining.phraseManifests=remaining.phraseManifests.filter(value=>value.id!==manifestId);next.push(remaining);
  }
  if(!added)next.push(restored);
  replaceApplicationParts(next,manifest.applicationKey,manifest.partIds,[restored]);
  for(const remaining of next)for(const existing of remaining.phraseManifests||[]){let replaced=false;existing.requiredPeers=(existing.requiredPeers||[]).flatMap(peer=>{if(!manifest.partIds.includes(peer.localId))return [peer];if(replaced)return [];replaced=true;return [peerRecipe(restored)];});}
  if(new Set(next.map(item=>item.localId)).size!==next.length)throw new Error('A frase não pôde ser reunida porque há um ID repetido no filme.');
  assertCompleteFilmPhrases(next);
  return {items:next,item:restored};
}

export function assertCompleteFilmPhrases(items,layout=null){
  assertCompleteLetteringApplications(items,layout);
  const manifests=manifestsFromItems(items);
  for(const manifest of manifests.values()){
    const parts=items.filter(item=>item.phrasePart?.manifestId===manifest.id);
    if(parts.length!==manifest.words.length)fail('faltam palavras de “'+manifest.sourceText+'”');
    for(let index=0;index<manifest.words.length;index++){
      const matches=parts.filter(item=>item.phrasePart.index===index);
      if(matches.length!==1)fail('palavra repetida ou ausente');
      const part=matches[0];
      if(part.localId!==manifest.partIds[index]||part.phrasePart.revisionId!==manifest.revisionId||phraseApplicationKey(part)!==manifest.applicationKey||name(part.name)!==manifest.words[index]||part.number||Number(part.quantity)!==manifest.quantity||Number(part.nameHeightCm)!==manifest.nameHeightCm||Number(part.nameTrackingCm??part.letterTrackingCm??0)!==manifest.nameTrackingCm||fontRecipe(part)!==manifest.fontRecipe||(part.letteringRevision??null)!==(manifest.letteringRevision??null))fail('texto, fonte, medida ou quantidade de uma palavra foi alterada isoladamente');
      if(layout){
        const placements=(layout.placements||[]).filter(placement=>placement.id===part.localId),copies=new Set(placements.map(placement=>placement.copy));
        if(placements.length!==manifest.quantity||copies.size!==manifest.quantity||placements.some(placement=>!Number.isInteger(placement.copy)||placement.copy<0||placement.copy>=manifest.quantity))fail('nem todas as cópias de cada palavra estão no arquivo');
      }
    }
    if(!Array.isArray(manifest.requiredPeers))fail('partes da aplicação sem conferência');
    for(const peer of manifest.requiredPeers){
      const matches=items.filter(item=>item.localId===peer.localId);
      if(matches.length!==1||phraseApplicationKey(matches[0])!==manifest.applicationKey||stable(peerRecipe(matches[0]))!==stable(peer))fail('faltam partes de nome/número desta aplicação');
      if(layout){const placements=(layout.placements||[]).filter(placement=>placement.id===peer.localId),copies=new Set(placements.map(placement=>placement.copy));if(placements.length!==peer.quantity||copies.size!==peer.quantity||placements.some(placement=>!Number.isInteger(placement.copy)||placement.copy<0||placement.copy>=peer.quantity))fail('nem todas as cópias da aplicação estão no arquivo');}
    }
  }
  return true;
}

// New source snapshots retain every name/number part of their application.
// In particular, a digit or full line cannot be removed and still release the
// application by printing only its remaining sibling. Legacy manual items have
// no such snapshot and are not migrated automatically.
export function assertCompleteLetteringApplications(items,layout=null){
  const applications=new Map();
  for(const item of items.filter(item=>item.letteringApplicationParts)){
    const parts=item.letteringApplicationParts,key=phraseApplicationKey(item);
    if(!Array.isArray(parts)||!parts.length||new Set(parts.map(part=>part.localId)).size!==parts.length)fail('conferência da aplicação inválida');
    const fingerprint=stable([...parts].sort((a,b)=>String(a.localId).localeCompare(String(b.localId))));
    if(applications.has(key)&&applications.get(key).fingerprint!==fingerprint)fail('conferências da aplicação incompatíveis');
    applications.set(key,{parts,fingerprint});
  }
  for(const [key,{parts}] of applications){
    const actual=items.filter(item=>phraseApplicationKey(item)===key);
    if(actual.length!==parts.length)fail('faltam partes de nome/número desta aplicação');
    for(const part of parts){
      const matches=actual.filter(item=>item.localId===part.localId);
      if(matches.length!==1||stable(letteringApplicationPart(matches[0]))!==stable(part))fail('texto, fonte ou quantidade da aplicação foi alterada isoladamente');
      const item=matches[0];
      if(Number(item.applicationQuantity)!==part.quantity)fail('a quantidade não corresponde à aplicação do pedido');
      if(layout){const placements=(layout.placements||[]).filter(placement=>placement.id===part.localId),copies=new Set(placements.map(placement=>placement.copy));if(placements.length!==part.quantity||copies.size!==part.quantity||placements.some(placement=>!Number.isInteger(placement.copy)||placement.copy<0||placement.copy>=part.quantity))fail('nem todas as cópias da aplicação estão no arquivo');}
    }
  }
  return true;
}

// The server-side editor gives each application a fresh revision. Do not change
// old film snapshots automatically: reject them when the current application
// has a different revision, and let the operator reload that application.
export function assertCurrentLetteringRevisions(items,workItems){
  const current=new Map((workItems||[]).map(item=>[item.id,item]));
  for(const item of items.filter(item=>item.type==='team_customization'&&item.zero19WorkItemId)){
    const row=current.get(item.zero19WorkItemId);
    if(!row)throw new Error('Não foi possível confirmar a escrita desta aplicação. Atualize o filme antes de exportar.');
    if((item.letteringRevision??null)!==(row.metadata?.lettering_revision??null))throw new Error('A escrita do pedido foi alterada depois de adicionar ao filme. Remova o conjunto antigo e adicione esta aplicação novamente.');
  }
  return true;
}
