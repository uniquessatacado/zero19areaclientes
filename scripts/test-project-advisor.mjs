import assert from 'node:assert/strict';
import {evaluateProjectAdvice as evaluate,registerProjectAdvisorRule,renderProjectAdvice} from '../project-advisor.js';
const base=()=>({today:'2026-09-18',now:'2026-09-18T15:00:00Z',workspace:{id:'w',owner_id:'owner',workspace_type:'client',status_id:'ready',responsible_user_id:'seller'},project:{id:'p2',owner_id:'owner',workspace_id:'w',sequence_no:2,status_id:'ready',delivery_date:'2026-09-25',responsible_user_id:'seller'},statuses:[{id:'new',queue_stage:'none',active:true,is_finalized:false},{id:'art',queue_stage:'art_work',active:true,is_finalized:false},{id:'ready',queue_stage:'ready_production',active:true,is_finalized:false},{id:'printing',queue_stage:'production',active:true,is_finalized:false},{id:'done',queue_stage:'none',active:true,is_finalized:true}],quotes:[{id:'q2',project_id:'p2',workspace_id:'w',payment_status:'paid',updated_at:'2026-09-18T10:00:00Z'}],quoteItems:[{id:'item',quote_id:'q2',quantity:20}],assets:[{id:'art2',project_id:'p2',workspace_id:'w',asset_type:'arte',original_path:'p2/design.png',processed_path:null,folder_id:'ready-folder',metadata:{print_ready_intent:true}}],printProfiles:[{asset_id:'art2',project_id:'p2',default_width_cm:20,default_height_cm:10,aspect_ratio:2,ready_for_print:true,halftone:false,allow_internal_nesting:true}],folders:[{id:'ready-folder',project_id:'p2',workspace_id:'w',purpose:'artes_prontas'}],documents:[{id:'doc2',quote_id:'q2',project_id:'p2',document_version:1,quote_updated_at:'2026-09-18T10:00:00Z',stale:false}],teamProfiles:[{id:'seller',active:true,account_owner_id:'owner'}]});
const codes=result=>result.issues.map(issue=>issue.code);let count=0;
{
 const input=base(),before=JSON.stringify(input),result=evaluate(input);assert.deepEqual(codes(result),[]);assert.equal(result.nextAction.type,'open_film');assert.equal(result.confidence,'complete');assert.equal(result.counts.readyArts,1);assert.equal(JSON.stringify(input),before);count++;
}
{
 const input=base();input.workspace.status_id=input.project.status_id='new';input.project.delivery_date=null;input.quotes=[];input.quoteItems=[];input.assets=[];input.printProfiles=[];input.documents=[];const result=evaluate(input);assert.ok(codes(result).includes('QUOTE_MISSING'));assert.ok(!codes(result).includes('PAYMENT_PENDING'));assert.ok(!codes(result).includes('ARTWORK_MISSING'));assert.equal(result.nextAction.type,'new_quote');count++;
}
{
 const input=base();input.project=null;const result=evaluate(input);assert.deepEqual(codes(result),['PROJECT_MISSING']);assert.equal(result.nextAction.type,'new_project');count++;
 const unknown=evaluate({workspace:{id:'w'}});assert.deepEqual(codes(unknown),[]);assert.equal(unknown.confidence,'partial');assert.ok(unknown.incomplete.includes('projects'));count++;
}
{
 const input=base();input.project.finalized_at='2026-09-17';input.project.delivery_date='2026-09-01';input.quotes=[];input.assets=[];const result=evaluate(input);assert.equal(result.closed,true);assert.deepEqual(codes(result),[]);assert.equal(result.nextAction.type,'view_history');count++;
 input.project.desisted_at='2026-09-17';assert.ok(codes(evaluate(input)).includes('CLOSED_STATE_CONFLICT'));count++;
}
{
 const input=base();input.project.delivery_date='2026-09-17';input.quotes[0].payment_status='unpaid';input.printProfiles[0].default_width_cm=0;const result=evaluate(input);assert.equal(result.issues[0].code,'DELIVERY_OVERDUE');assert.ok(codes(result).includes('PAYMENT_PENDING'));assert.ok(codes(result).includes('ART_DIMENSIONS_MISSING'));assert.ok(result.issues.filter(issue=>issue.severity==='critical').length>=3);count++;
 input.project.delivery_date='2026-02-30';assert.ok(codes(evaluate(input)).includes('DELIVERY_INVALID'));count++;
}
{
 const input=base();input.project.delivery_date=null;assert.ok(codes(evaluate(input)).includes('DELIVERY_MISSING'));delete input.project.delivery_date;const result=evaluate(input);assert.ok(!codes(result).includes('DELIVERY_MISSING'));assert.ok(result.incomplete.includes('project.delivery_date'));count++;
 input.project.delivery_date='2026-09-18';assert.ok(codes(evaluate(input)).includes('DELIVERY_SOON'));count++;
}
{
 const input=base();input.printProfiles[0].halftone=true;const result=evaluate(input);assert.ok(codes(result).includes('HALFTONE_NESTING_REVIEW'));assert.equal(result.issues.find(issue=>issue.code==='HALFTONE_NESTING_REVIEW').recommendedAction.assetId,'art2');input.printProfiles[0].allow_internal_nesting=false;assert.ok(!codes(evaluate(input)).includes('HALFTONE_NESTING_REVIEW'));count++;
 input.printProfiles[0].ready_for_print=false;assert.ok(codes(evaluate(input)).includes('PRINT_READINESS_PENDING'));count++;
 input.printProfiles=[];assert.ok(codes(evaluate(input)).includes('ART_DIMENSIONS_MISSING'));count++;
 input.known={printProfiles:false};const partial=evaluate(input);assert.ok(!codes(partial).includes('ART_DIMENSIONS_MISSING'));assert.ok(!codes(partial).includes('PRINT_READINESS_PENDING'));assert.equal(partial.confidence,'partial');count++;
}
{
 const input=base();input.assets[0].metadata={};input.assets[0].folder_id='other';input.printProfiles[0].ready_for_print=false;input.project.status_id=input.workspace.status_id='new';input.quotes[0].payment_status='unpaid';assert.ok(!codes(evaluate(input)).includes('ART_DIMENSIONS_MISSING'),'reference art outside ready folders is not a print defect');count++;
}
{
 const input=base();delete input.assets[0].original_path;delete input.assets[0].processed_path;const result=evaluate(input);assert.ok(!codes(result).includes('PRINT_READINESS_PENDING'));assert.ok(result.incomplete.includes('assets.file_path'));count++;
 input.printProfiles[0]={asset_id:'art2',ready_for_print:true};const incomplete=evaluate(input);assert.ok(!codes(incomplete).includes('ART_DIMENSIONS_MISSING'));assert.ok(incomplete.incomplete.includes('printProfiles.dimensions'));count++;
}
{
 const input=base();input.assets[0].processed_path=input.assets[0].original_path=null;assert.ok(codes(evaluate(input)).includes('ART_FILE_MISSING'));input.printProfiles[0].aspect_ratio=3;assert.ok(codes(evaluate(input)).includes('ART_PROPORTION_MISMATCH'));count++;
}
{
 const input=base();input.quotes[0].project_id='p1';input.assets[0].project_id='p1';input.documents[0].project_id='p1';const result=evaluate(input);assert.equal(result.counts.paidQuotes,0);assert.equal(result.counts.arts,0);assert.ok(codes(result).includes('QUOTE_MISSING'));assert.ok(codes(result).includes('ARTWORK_MISSING'));assert.ok(!codes(result).includes('QUOTE_PDF_MISSING'));assert.ok(result.issues.every(issue=>issue.evidence.every(fact=>!['q2','art2','doc2'].includes(fact.id))));count++;
 input.quotes[0].project_id=null;assert.ok(codes(evaluate(input)).includes('UNLINKED_QUOTES'));count++;
}
{
 const input=base();input.project.workspace_id='another';const result=evaluate(input);assert.deepEqual(codes(result),['PROJECT_SCOPE_MISMATCH']);assert.equal(result.counts.paidQuotes,0);count++;
 input.project.workspace_id='w';input.assets[0].owner_id='another-owner';assert.equal(evaluate(input).counts.arts,0);count++;
}
{
 const input=base();delete input.project;input.projects=[{id:'p1',workspace_id:'w',sequence_no:1,status_id:'done',finalized_at:'2026-09-01'},{id:'p2',workspace_id:'w',sequence_no:2,status_id:'ready',delivery_date:'2026-09-25',responsible_user_id:'seller'}];assert.equal(evaluate(input).projectId,'p2');count++;
}
{
 const input=base();input.documents=[{...input.documents[0],document_version:1,stale:true},{...input.documents[0],id:'fresh',document_version:2,stale:false}];assert.ok(!codes(evaluate(input)).includes('QUOTE_PDF_STALE'));input.documents[1].quote_updated_at='2026-09-16T00:00:00Z';assert.ok(codes(evaluate(input)).includes('QUOTE_PDF_STALE'));input.documents=[];assert.ok(codes(evaluate(input)).includes('QUOTE_PDF_MISSING'));input.known={documents:false};assert.ok(!codes(evaluate(input)).includes('QUOTE_PDF_MISSING'));count++;
}
{
 const input=base();input.workspace.status_id='done';assert.equal(evaluate(input).closed,false);assert.ok(codes(evaluate(input)).includes('STATUS_MISMATCH'));input.workspace.status_id='ready';input.workspace.responsible_user_id=input.project.responsible_user_id=null;assert.ok(codes(evaluate(input)).includes('RESPONSIBLE_MISSING'));count++;
 input.project.responsible_user_id='seller';input.teamProfiles[0].active=false;assert.ok(codes(evaluate(input)).includes('RESPONSIBLE_UNAVAILABLE'));count++;
}
{
 const input=base();input.queueSnapshot={rows:[{project:{id:'p1'},workspace:{id:'w'},position:1},{project:{id:'p2'},workspace:{id:'w'},position:7,stage:'ready_production'}]};assert.equal(evaluate(input).queuePosition,7);input.queueSnapshot.error='network';assert.ok(evaluate(input).incomplete.includes('queueSnapshot'));count++;
}
{
 const unregister=registerProjectAdvisorRule({id:'fixture-rule',requires:['quotes'],run:context=>[{code:'TEST_RULE',severity:'info',title:'<script>evil</script>',detail:"\"'><",evidence:[{source:'project',id:context.project.id,field:'id',value:context.project.id}],recommendedAction:context.action('open_workspace','Ver <projeto>')}]});const result=evaluate(base());assert.ok(codes(result).includes('TEST_RULE'));const rendered=renderProjectAdvice(result);assert.ok(!rendered.includes('<script>evil</script>'));assert.ok(rendered.includes('&lt;script&gt;evil'));unregister();assert.ok(!codes(evaluate(base())).includes('TEST_RULE'));count++;
 const stop=registerProjectAdvisorRule({id:'unavailable',requires:['documents'],run:()=>{throw Error('should not execute')}});const input=base();input.known={documents:false};assert.ok(evaluate(input).incomplete.includes('rule:unavailable'));stop();count++;
}
{
 const input=base();input.workspace.workspace_type='library_art';assert.equal(evaluate(input).applicable,false);assert.equal(renderProjectAdvice(evaluate(input)),'');count++;
}
{
 const input=base();delete input.today;input.now='2026-09-18T01:00:00Z';input.project.delivery_date='2026-09-17';assert.ok(!codes(evaluate(input)).includes('DELIVERY_OVERDUE'),'date uses Sao Paulo, not UTC midnight');assert.ok(codes(evaluate(input)).includes('DELIVERY_SOON'));count++;
 input.printProfiles[0].project_id='p1';assert.equal(evaluate(input).counts.readyArts,0,'profile tied to old project is not used');count++;
}
{
 const input=base();input.printProfiles=[];input.assets[0].metadata={};input.folders[0].purpose='other';input.folders[0].parent_id='ready-folder';const result=evaluate(input);assert.ok(!codes(result).includes('ART_DIMENSIONS_MISSING'),'cyclic folders cannot infer print intent');count++;
}
{
 const input=base();input.quotes[0].delivery_date='2026-09-24';const result=evaluate(input),issue=result.issues.find(issue=>issue.code==='DELIVERY_QUOTE_MISMATCH');assert.ok(issue);assert.deepEqual(issue.evidence.map(e=>e.value),['2026-09-25','2026-09-24']);assert.equal(issue.recommendedAction.type,'open_quote_pdf');assert.equal(issue.recommendedAction.quoteId,'q2');assert.equal(input.quotes[0].payment_status,'paid');count++;
 input.quotes[0].delivery_date=null;assert.ok(!codes(evaluate(input)).includes('DELIVERY_QUOTE_MISMATCH'));input.quotes[0].delivery_date='2026-09-24';input.quotes[0].payment_status='unpaid';assert.ok(!codes(evaluate(input)).includes('DELIVERY_QUOTE_MISMATCH'));count++;
}
console.log(`Project advisor: ${count} scenarios passed. Pure local evaluation, verified evidence, unknown-data guards, current-project isolation and safe UI markup.`);
