import assert from 'node:assert/strict';
import {createResilientReadFetch} from '../network-read.js';
const origin='https://test.supabase.co',url=origin+'/rest/v1/z19p_assets?private_filter=never-log',diagnostics=[];
let calls=0;
const recovered=createResilientReadFetch({origin,retryDelayMs:0,onDiagnostic:event=>diagnostics.push(event),fetchImpl:async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return new Response('ok')}});
assert.equal(await(await recovered(url)).text(),'ok');assert.equal(calls,2);assert.equal(diagnostics.length,0);
for(const status of [401,403,404,409,429]){
  calls=0;const fetch=createResilientReadFetch({origin,retryDelayMs:0,fetchImpl:async()=>{calls++;return new Response('',{status})}});
  const response=await fetch(url);assert.equal(response.status,status);await response.text();assert.equal(calls,1);
}
for(const [path,method] of [['/rest/v1/z19p_assets','POST'],['/rest/v1/z19p_assets','PATCH'],['/rest/v1/z19p_assets','DELETE'],['/rest/v1/rpc/example','GET'],['/auth/v1/user','GET'],['/storage/v1/object/private/a','GET']]){
  calls=0;const fetch=createResilientReadFetch({origin,retryDelayMs:0,fetchImpl:async()=>{calls++;throw Error('test')}});
  await assert.rejects(fetch(origin+path,{method}),/test/);assert.equal(calls,1);
}
calls=0;const fail=createResilientReadFetch({origin,retryDelayMs:0,onDiagnostic:event=>diagnostics.push(event),fetchImpl:async()=>{calls++;throw new TypeError('Failed to fetch')}});
await assert.rejects(fail(url),/Falha de conexão/);assert.equal(calls,2);assert.equal(JSON.stringify(diagnostics).includes('private_filter'),false);assert.equal(diagnostics.at(-1).resource,'z19p_assets');
calls=0;const timeout=createResilientReadFetch({origin,timeoutMs:5,retryDelayMs:0,onDiagnostic:()=>{},fetchImpl:(_input,{signal})=>{calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}))}});
await assert.rejects(timeout(url),/demorou demais/);assert.equal(calls,2);
const controller=new AbortController();calls=0;const cancelled=timeout(url,{signal:controller.signal});controller.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(calls,1);
calls=0;const outside=createResilientReadFetch({origin,retryDelayMs:0,fetchImpl:async()=>{calls++;throw Error('external')}});await assert.rejects(outside('https://other.example/rest/v1/a'));assert.equal(calls,1);
calls=0;const retryHttp=createResilientReadFetch({origin,retryDelayMs:0,fetchImpl:async()=>new Response(++calls===1?'busy':'ok',{status:calls===1?503:200})});assert.equal(await(await retryHttp(url)).text(),'ok');assert.equal(calls,2);
calls=0;const stuckCancel=createResilientReadFetch({origin,retryDelayMs:0,fetchImpl:async()=>++calls===1?new Response(new ReadableStream({cancel(){return new Promise(()=>{})}}),{status:503}):new Response('ok')});
assert.equal(await(await stuckCancel(url)).text(),'ok');assert.equal(calls,2,'best-effort cancellation cannot hang the retry');
console.log('Network reads: bounded retry/timeout, abort, no auth/RPC/writes, no credentials/filters logged passed.');

// Headers alone are not completion: a stalled JSON body must also time out.
calls=0;let cancelledBody=0;
const bodyTimeout=createResilientReadFetch({origin,timeoutMs:10,retryDelayMs:0,onDiagnostic:()=>{},fetchImpl:async()=>{
  calls++;return new Response(new ReadableStream({start(stream){stream.enqueue(new TextEncoder().encode('{'))},cancel(){cancelledBody++}}),{headers:{'Content-Type':'application/json'}});
}});
const slowBody=await bodyTimeout(url);
await assert.rejects(slowBody.text(),/demorou demais/);
assert.equal(calls,1,'never retry a response whose body was already handed to the SDK');
assert.equal(cancelledBody,1,'stalled underlying reader is cancelled');

// A Request's own signal remains connected after fetch resolves the headers.
const requestAbort=new AbortController();let requestCalls=0;
const requestFetch=createResilientReadFetch({origin,timeoutMs:500,onDiagnostic:()=>{},fetchImpl:async()=>{requestCalls++;return new Response(new ReadableStream({start(){}}))}});
const requestResponse=await requestFetch(new Request(url,{signal:requestAbort.signal}));
const pendingBody=requestResponse.text();requestAbort.abort();
await assert.rejects(pendingBody,{name:'AbortError'});assert.equal(requestCalls,1);

// Status, headers and JSON byte contents must survive the guarded stream.
const payload='{"name":"Ação","value":0,"nothing":null}';
const semanticFetch=createResilientReadFetch({origin,timeoutMs:1000,fetchImpl:async()=>new Response(payload,{status:206,statusText:'Partial Content',headers:{'Content-Type':'application/json','Content-Range':'0-2/3'}})});
const semantic=await semanticFetch(url);assert.equal(semantic.status,206);assert.equal(semantic.statusText,'Partial Content');assert.equal(semantic.headers.get('Content-Range'),'0-2/3');assert.equal(await semantic.text(),payload);
const limited=createResilientReadFetch({origin,maxResponseBytes:4,onDiagnostic:()=>{},fetchImpl:async()=>new Response('12345')});
await assert.rejects((await limited(url)).text(),/limite seguro/);
const denial=createResilientReadFetch({origin,timeoutMs:10,onDiagnostic:()=>{},fetchImpl:async()=>{calls++;return new Response(new ReadableStream({start(){}}),{status:403})}});
calls=0;const denied=await denial(url);assert.equal(denied.status,403);await assert.rejects(denied.text(),/demorou demais/);assert.equal(calls,1,'403 is never retried even when its body stalls');
calls=0;const final503=createResilientReadFetch({origin,timeoutMs:10,retryDelayMs:0,onDiagnostic:()=>{},fetchImpl:async()=>{calls++;return calls===1?new Response('busy',{status:503}):new Response(new ReadableStream({start(){}}),{status:503})}});
const finalError=await final503(url);assert.equal(finalError.status,503);await assert.rejects(finalError.text(),/demorou demais/);assert.equal(calls,2,'last transient HTTP response also retains its body deadline');
console.log('Response bodies: deadline through EOF, Request.signal after headers, cancellation, byte limit, status/headers/JSON preserved, no late retry passed.');
