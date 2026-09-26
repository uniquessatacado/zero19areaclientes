import {CURVE_INK_LUT} from './film-tiff-core.js?v=2.17.9';

export const STANDARD_CURVE_ID='zero19-54-34';
export const STANDARD_CURVE_PROFILE=Object.freeze({id:STANDARD_CURVE_ID,name:'Padrão ZERO19 54 → 34',inputPercent:54,outputPercent:34,builtIn:true});
const STORAGE_PREFIX='z19p:spot-curves:';

const clampPercent=value=>Math.max(1,Math.min(99,Math.round(Number(value)||0)));
const cleanProfile=(profile,index=0)=>({
  id:String(profile?.id||`curve-${Date.now()}-${index}`),
  name:String(profile?.name||'Curva sem nome').trim().slice(0,60)||'Curva sem nome',
  inputPercent:clampPercent(profile?.inputPercent),
  outputPercent:clampPercent(profile?.outputPercent),
  builtIn:Boolean(profile?.builtIn),
});

export function createInkCurveLut(inputPercent=54,outputPercent=34){
  const input=clampPercent(inputPercent),output=clampPercent(outputPercent);
  if(input===54&&output===34)return Uint8Array.from(CURVE_INK_LUT);
  const x=Math.round(input*255/100),y=Math.round(output*255/100),lut=new Uint8Array(256);
  for(let level=0;level<256;level++){
    const mapped=level<=x
      ? level*y/Math.max(1,x)
      : y+(level-x)*(255-y)/Math.max(1,255-x);
    lut[level]=Math.max(0,Math.min(255,Math.round(mapped)));
  }
  return lut;
}

export function loadCurveLibrary(ownerId='local'){
  const storageKey=STORAGE_PREFIX+String(ownerId||'local');
  let stored={};
  try{stored=JSON.parse(localStorage.getItem(storageKey)||'{}')||{}}catch{}
  const custom=Array.isArray(stored.profiles)?stored.profiles.map(cleanProfile).filter(profile=>profile.id!==STANDARD_CURVE_ID):[];
  const profiles=[STANDARD_CURVE_PROFILE,...custom];
  const selected=profiles.find(profile=>profile.id===stored.defaultId)||STANDARD_CURVE_PROFILE;
  return {storageKey,profiles,defaultId:selected.id};
}

export function saveCurveLibrary(library){
  const profiles=(library.profiles||[]).filter(profile=>profile.id!==STANDARD_CURVE_ID).map(cleanProfile);
  const defaultId=[STANDARD_CURVE_ID,...profiles.map(profile=>profile.id)].includes(library.defaultId)?library.defaultId:STANDARD_CURVE_ID;
  localStorage.setItem(library.storageKey,JSON.stringify({defaultId,profiles}));
  return {...library,profiles:[STANDARD_CURVE_PROFILE,...profiles],defaultId};
}

export function upsertCurveProfile(library,profile){
  const next=cleanProfile(profile);
  const profiles=(library.profiles||[]).filter(item=>item.id!==next.id&&item.id!==STANDARD_CURVE_ID);
  profiles.push(next);
  return saveCurveLibrary({...library,profiles:[STANDARD_CURVE_PROFILE,...profiles]});
}

export function removeCurveProfile(library,id){
  if(id===STANDARD_CURVE_ID)return library;
  const profiles=(library.profiles||[]).filter(profile=>profile.id!==id);
  const defaultId=library.defaultId===id?STANDARD_CURVE_ID:library.defaultId;
  return saveCurveLibrary({...library,profiles,defaultId});
}

export function setDefaultCurve(library,id){
  return saveCurveLibrary({...library,defaultId:id});
}
