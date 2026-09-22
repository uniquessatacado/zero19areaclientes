import fs from 'node:fs';
import path from 'node:path';

// Compile-time, exact-match transformations, following the existing release pipeline.
// This never changes the original checkout or rewrites downloaded runtime code.
export const patches={
  'service-readiness.js':[["if(QUOTE_SERVICES[quote.service_type]?.mockup){", "if(QUOTE_SERVICES[quote.service_type]?.mockup&&quote.official_mockup_asset_id){"]],
  'quote-service-core.js':[["  if(QUOTE_SERVICES[quote.service_type].mockup&&!quote.official_mockup_asset_id)pending.push('Criar e vincular o mockup oficial com posições e medidas');", "  // Mockup is optional; absence is not a preparation issue."]],
  'scripts/test-service-readiness.mjs':[["assert.ok(readiness(f).length>=2);", "assert.equal(readiness(f).length,1);assert.ok(!readiness(f).some(issue=>/mockup/i.test(issue)));"]],
  'scripts/test-quote-services.mjs':[["assert.equal(quotePreparationSummary(draft).length,2);", "assert.equal(quotePreparationSummary(draft).length,1);"]],
  'customization-preparer.js':[
    ["const h=(value='')", "import {mountNumberModeControls} from './customization-number-mode-ui.js?v=2.17.12';\nconst h=(value='')"],
    ["  const showWorking=async()=>{", "  const numberControls=lettering?mountNumberModeControls({modal,set,candidates:workingCandidates}):null;\n  const showWorking=async()=>{"],
    ["const drawWorking=()=>{const options=workingCandidates();", "const drawWorking=()=>{numberControls?.refresh();const options=workingCandidates();"],
    ["try{assignments=validateGlyphAssignments(drafts)}", "try{assignments=validateGlyphAssignments(drafts);numberControls?.validate()}"],
    ["selectedWorkingId===originalWorkingId&&nameColor===originalNameColor)", "selectedWorkingId===originalWorkingId&&nameColor===originalNameColor&&!numberControls?.dirty)"],
    ["      originalWorkingId=selectedWorkingId;drafts.length=0;", "      await numberControls?.persist(supabase,{ownerId,userId});\n      originalWorkingId=selectedWorkingId;drafts.length=0;"],
    ["Fonte oficial padrão", "Fonte para os nomes"],
    ["Fonte oficial para o nome + SVGs próprios para letras e números", "Fonte para nomes e números opcionais"],
    ["Envie vários SVGs individuais e escolha qual caractere cada arquivo representa. Um SVG mapeado tem prioridade sobre a fonte.", "Envie o TTF / OTF para os nomes. Escolha abaixo: somente nomes, números do TTF ou vetores SVG individuais. Você pode salvar e trocar essa opção depois."]
  ],
  'production-v217.js':[
    ["import {cmToPx,nestItems,snapFilmPlacement,rotatedBoundsMm}", "import {numberMode,letteringSources,setNumberInputs} from './customization-number-mode.js?v=2.17.12';\nimport {cmToPx,nestItems,snapFilmPlacement,rotatedBoundsMm}"],
    ["name:`${SET_KIND_PREFIX[kind]}${friendlyName}`,created_by:uid()", "name:`${SET_KIND_PREFIX[kind]}${friendlyName}`,number_source_mode:kind==='lettering'?'none':'legacy',created_by:uid()"],
    ["description=isLettering?`Nome ${Number(set.default_name_height_cm)} cm • Número ${Number(set.default_number_height_cm)} cm`", "description=isLettering?`Nome ${Number(set.default_name_height_cm)} cm${numberMode(set)==='none'?' • somente nomes':` • Número ${Number(set.default_number_height_cm)} cm`}`"],
    ["isLettering?'Testar CLOVIS 10':'Pré-visualizar'", "isLettering?(numberMode(set)==='none'?'Testar nome':'Testar nome e número'):'Pré-visualizar'"],
    ["Execute e confira o teste CLOVIS 10 antes de liberar.", "Execute e confira o teste visual da personalização antes de liberar."],
    ["field('heightCm').value='';vectorDimension='width';prepared=null;refresh()", "field('heightCm').value='';setNumberInputs(modal,set,{sample:true});vectorDimension='width';prepared=null;refresh()"],
    ["glyphs:set._glyphs||[],palette:set._palette||[]});", "glyphs:set._glyphs||[],palette:set._palette||[]});Object.assign(item,letteringSources(set,item.number));"],
    ["    const labelBase=set._path||customizationName(set);", "    Object.assign(item,letteringSources(set,cleanNumber));\n    const labelBase=set._path||customizationName(set);"],
    ["const applyDefaults=()=>{const set=selectedSet();if(!set)return;const defaults=customizationDefaults(set);", "const applyDefaults=()=>{const set=selectedSet();if(!set)return;setNumberInputs(modal,set);const defaults=customizationDefaults(set);"],
    ["const mode=modal.querySelector('[name=\"composition\"]:checked')?.value||'split',settings=readSettings();", "letteringSources(set,number);const mode=modal.querySelector('[name=\"composition\"]:checked')?.value||'split',settings=readSettings();"]
  ],
  'lettering-core.js':[
    ["export function measureLetteringItem({name,number,nameHeightCm,numberHeightCm,gapCm=0,nameTrackingCm=0,digitSpacingCm=0,...resources}){", "export function measureLetteringItem({name,number,nameHeightCm,numberHeightCm,gapCm=0,nameTrackingCm=0,digitSpacingCm=0,...resources}){\n  if(resources.numberSourceMode==='none'&&String(number||'').trim())throw new Error('Esta personalização está cadastrada somente para nomes.');"]
  ],
  'quote-service-ui.js':[
    ["Depois do orçamento: mockup oficial", "Mockup oficial (opcional)"],
    ["Salve o orçamento agora. Depois, crie o mockup com local, medidas e posicionamento das estampas e vincule aqui.", "O mockup é opcional e não impede colocar o pedido como pronto para produção. Você pode criar ou vincular um mockup quando precisar."],
    ["A próxima etapa é preparar as artes finais e o mockup aplicável.", "A próxima etapa é preparar as artes finais. O mockup é opcional."]
  ],
  'project-advisor.js':[["Preparar artes e mockup", "Preparar artes finais"]],
  'scripts/build-v2176.mjs':[["const version='2.17.11';", "const version='2.17.12';"]]
};
export function transformSource(source,entries,file){
  for(const [before,after] of entries){
    const count=source.split(before).length-1;
    if(count!==1)throw new Error(`v2.17.12: ${file}: expected one unchanged source fragment, got ${count}: ${before.slice(0,100)}`);
    source=source.replace(before,after);
  }
  return source;
}
export function applyV21712Patch(root){
  const changed=[];
  // Validate every target before writing any patched file.
  for(const [file,entries] of Object.entries(patches)){
    const target=path.join(root,file),source=fs.readFileSync(target,'utf8');
    changed.push([target,transformSource(source,entries,file)]);
  }
  for(const [target,source] of changed)fs.writeFileSync(target,source);
}
