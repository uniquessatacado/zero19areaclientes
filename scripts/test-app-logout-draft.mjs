import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=(await fs.readFile(new URL('../app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n'),start=source.indexOf('let logoutInProgress=false;'),end=source.indexOf('\n\n',source.indexOf('\n}',start)),code=source.slice(start,end);
assert.ok(start>0&&end>start);assert.equal((source.match(/addEventListener\('click',signOutWithDraftGuard\)/g)||[]).length,2);
let tests=0;async function test(name,run){await run();tests++;console.log('PASS '+name)}
function fixture({pending=true,saved=true,confirmation=false,flush,signOut}={}){
 const calls=[],button={innerHTML:'Sair',disabled:false,isConnected:true},context=vm.createContext({session:{user:{id:'u'}},productionModule:{hasPendingFilmDraft:()=>pending,flushFilmDraft:async()=>{calls.push('flush');return flush?await flush():saved}},$:()=>button,confirm:message=>{assert.match(message,/não foram confirmadas na nuvem/);calls.push('confirm');return confirmation},supabase:{auth:{signOut:async()=>{calls.push('signOut');return signOut?await signOut():{error:null}}}},toast:message=>calls.push(['toast',message]),nav:route=>calls.push(['nav',route])});
 vm.runInContext(code+';globalThis.logout=signOutWithDraftGuard;',context);return {context,calls,button,logout:context.logout};
}
await test('manual logout flushes cloud changes before sign-out',async()=>{const f=fixture();await f.logout();assert.deepEqual(f.calls,['flush','signOut',['nav','/']]);assert.equal(f.button.disabled,false);assert.equal(f.button.innerHTML,'Sair')});
await test('unsynced draft cancel preserves authenticated session',async()=>{const f=fixture({saved:false});await f.logout();assert.deepEqual(f.calls,['flush','confirm']);assert.equal(f.context.session.user.id,'u');assert.equal(f.button.disabled,false)});
await test('explicit user confirmation permits logout after failed cloud write',async()=>{const f=fixture({saved:false,confirmation:true});await f.logout();assert.deepEqual(f.calls,['flush','confirm','signOut',['nav','/']])});
await test('unexpected flush failure still asks user instead of silently discarding',async()=>{const f=fixture({flush:async()=>{throw Error('network')}});await f.logout();assert.deepEqual(f.calls,['flush','confirm'])});
await test('double click produces one save and one sign-out',async()=>{let release;const f=fixture({flush:()=>new Promise(resolve=>release=resolve)}),first=f.logout();assert.equal(f.button.disabled,true);assert.equal(f.button.textContent,'Salvando filme…');await f.logout();assert.deepEqual(f.calls,['flush']);release(true);await first;assert.equal(f.calls.filter(value=>value==='signOut').length,1)});
await test('account switch while saving never signs out the new user',async()=>{let release;const f=fixture({flush:()=>new Promise(resolve=>release=resolve)}),first=f.logout();f.context.session={user:{id:'other'}};release(false);await first;assert.deepEqual(f.calls,['flush'])});
await test('clean draft needs no save or warning',async()=>{const f=fixture({pending:false});await f.logout();assert.deepEqual(f.calls,['signOut',['nav','/']])});
await test('auth sign-out errors stay visible and do not navigate',async()=>{const f=fixture({signOut:async()=>({error:{message:'offline'}})});await f.logout();assert.equal(f.calls[2][0],'toast');assert.match(f.calls[2][1],/offline/);assert.equal(f.calls.some(value=>Array.isArray(value)&&value[0]==='nav'),false);assert.equal(f.button.disabled,false)});
await test('logout also works before production module has been opened',async()=>{const f=fixture();f.context.productionModule=null;await f.logout();assert.deepEqual(f.calls,['signOut',['nav','/']])});
console.log(tests+' real app logout guard tests passed; no remote authentication calls.');
