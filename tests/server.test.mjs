import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {createStudioServer,analyzeAudio,wavDuration} from '../server.mjs';import {encodeWav} from '../audio.mjs';
const audio=async()=>Buffer.from(await encodeWav(new Float32Array(16000*6)).arrayBuffer());
const withServer=async(options,run)=>{const server=createStudioServer(options);server.listen(0,'127.0.0.1');await once(server,'listening');try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}};
test('unconfigured service exposes status but cannot charge provider',()=>withServer({apiKey:'',token:''},async base=>{assert.equal((await(await fetch(base+'/api/health')).json()).ready,false);assert.equal((await fetch(base+'/api/analyze',{method:'POST'})).status,503);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/server.mjs')).status,404);}));
test('analysis rejects missing auth and unauthorized origins',()=>withServer({apiKey:'test-not-a-real-key',token:'test-private-token',analyze:()=>{throw Error('should not run');}},async base=>{assert.equal((await fetch(base+'/api/analyze',{method:'POST'})).status,401);assert.equal((await fetch(base+'/api/health',{headers:{Origin:'https://untrusted.example'}})).status,403);}));
test('authorized audio reaches analyzer, no credentials returned',()=>withServer({apiKey:'test-not-a-real-key',token:'test-private-token',analyze:async bytes=>({duration:wavDuration(bytes),words:[],plan:{scenes:[]}})},async base=>{const response=await fetch(base+'/api/analyze',{method:'POST',headers:{Authorization:'Bearer test-private-token','Content-Type':'audio/wav'},body:await audio()});assert.equal(response.status,200);const text=await response.text();assert.match(text,/"duration":6/);assert.ok(!text.includes('key'));}));
test('provider integration asks for word timings and a strict plan',async()=>{let calls=0;const result=await analyzeAudio(await audio(),{apiKey:'test-only',fetchImpl:async(url,options)=>{calls++;if(url.endsWith('transcriptions')){assert.equal(options.body.get('model'),'whisper-1');assert.equal(options.body.get('timestamp_granularities[]'),'word');return Response.json({words:[{word:'Bonjour',start:0,end:1}]});}const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"scenes":[]}'}]}]});}});assert.equal(calls,2);assert.equal(result.words[0].word,'Bonjour');});
test('provider refusal and invalid timestamps cannot generate motions',async()=>{await assert.rejects(analyzeAudio(await audio(),{apiKey:'test',fetchImpl:async()=>Response.json({words:[{word:'x',start:0,end:100}]})}));});
test('full montage sends only retained speech to the visual director',async()=>{
 const words=['Je','vais','je','recommence','Écrivez','puis','enregistrez','et','animez'].map((word,i)=>({word,start:i*.5+.1,end:i*.5+.4}));
 let calls=0;
 const result=await analyzeAudio(await audio(),{apiKey:'test',fullEdit:true,fetchImpl:async(url,options)=>{
  calls++;
  if(url.endsWith('transcriptions'))return Response.json({words});
  const body=JSON.parse(options.body);let plan;
  if(body.text.format.name==='speech_edit_plan')plan={removals:[{startWord:0,endWord:3,reason:'reprise'}]};
  else {assert.deepEqual(JSON.parse(body.input).words.map(w=>w[1]),['Écrivez','puis','enregistrez','et','animez']);assert.equal(JSON.parse(body.input).duration,4);plan={scenes:[]};}
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]});
 }});
 assert.equal(calls,3);assert.equal(result.sourceDuration,6);assert.equal(result.duration,4);assert.equal(result.cuts[0].reason,'reprise');
});
test('montage endpoint requires authentication and passes the selected rhythm',()=>withServer({apiKey:'test',token:'private',analyze:async(bytes,options)=>{assert.equal(options.fullEdit,true);assert.equal(options.pace,'dynamic');return {ok:true};}},async base=>{
 assert.equal((await fetch(base+'/api/montage',{method:'POST'})).status,401);
 const headers={Authorization:'Bearer private','Content-Type':'audio/wav'};
 assert.equal((await fetch(base+'/api/montage?pace=invalid',{method:'POST',headers,body:await audio()})).status,400);
 assert.equal((await fetch(base+'/api/montage?pace=dynamic',{method:'POST',headers,body:await audio()})).status,200);
}));
test('invalid visual output is repaired once and revalidated',async()=>{
 let plans=0;
 const result=await analyzeAudio(await audio(),{apiKey:'test',fetchImpl:async(url,options)=>{
  if(url.endsWith('transcriptions'))return Response.json({words:[{word:'Bonjour',start:0,end:1}]});
  plans++;const body=JSON.parse(options.body);
  assert.equal(body.text.format.schema.properties.scenes.items.properties.endWord.maximum,0);
  if(plans===2)assert.ok(JSON.parse(body.input).repair.error);
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(plans===1?{scenes:[{kind:'invalid'}]}:{scenes:[]})}]}]});
 }});assert.equal(plans,2);assert.deepEqual(result.plan,{scenes:[]});
});
test('local session requires same-origin browser and stays local',()=>withServer({apiKey:'test',token:'private',localSession:true,origins:['https://lurnschool.github.io'],analyze:async()=>({words:[],plan:{scenes:[]}})},async base=>{
 assert.equal((await fetch(base+'/api/local-session',{method:'POST'})).status,403);
 // Origin must also be allowed by the server's CORS configuration.
 assert.equal((await fetch(base+'/api/local-session',{method:'POST',headers:{Origin:'https://lurnschool.github.io','Sec-Fetch-Site':'same-origin'}})).status,403);
 assert.equal((await(await fetch(base+'/api/health')).json()).localSession,false);
}));
test('local browser session authenticates without exposing private token',async()=>{
 const server=createStudioServer({apiKey:'test',token:'private',localSession:true,origins:[],analyze:async()=>({words:[],plan:{scenes:[]}})});
 // Choose the port before declaring the one permitted origin.
 server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 const base=`http://127.0.0.1:${port}`;
 const connected=createStudioServer({apiKey:'test',token:'private',localSession:true,origins:[base],analyze:async()=>({words:[],plan:{scenes:[]}})});
 connected.listen(port,'127.0.0.1');await once(connected,'listening');
 try{
  const headers={Origin:base,'Sec-Fetch-Site':'same-origin'};
  const session=await fetch(base+'/api/local-session',{method:'POST',headers});assert.equal(session.status,200);
  const cookie=session.headers.get('set-cookie');assert.match(cookie,/HttpOnly; SameSite=Strict/);assert.ok(!cookie.includes('private'));
  const response=await fetch(base+'/api/analyze',{method:'POST',headers:{...headers,Cookie:cookie.split(';')[0],'Content-Type':'audio/wav'},body:await audio()});assert.equal(response.status,200);
  const foreign=await fetch(base+'/api/analyze',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'cross-site',Cookie:cookie.split(';')[0],'Content-Type':'audio/wav'},body:await audio()});assert.equal(foreign.status,401);
 }finally{await new Promise(resolve=>connected.close(resolve));}
});
