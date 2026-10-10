import test from 'node:test';
import assert from 'node:assert/strict';
import {planToMotions} from '../motion-plan.mjs';
import {drawComposition,dimensions} from '../render.mjs';
import {validateProject,removeRange} from '../project.mjs';
import {applyMontage,buildEdit} from '../autopilot.mjs';
import {analyzeAudio,createStudioServer} from '../server.mjs';
import {encodeWav} from '../audio.mjs';
const words=[{word:'Une',start:.7,end:1},{word:'idée',start:1.1,end:1.6},{word:'puis',start:3,end:3.4},{word:'agir',start:4,end:4.6}];
const opening={kind:'editorial',startWord:0,endWord:1,title:'Une idée',accent:'idée',detail:'',nodes:[]};
const ending={kind:'cards',startWord:2,endWord:3,title:'Passer à l’action',accent:'',detail:'',nodes:[{label:'Agir',detail:'',wordIndex:3}]};
const plan={scenes:[opening,ending]};
const motions=()=>planToMotions(plan,words,6,undefined,{visualMode:'motion'});
const project=()=>({version:1,format:'16:9',visualMode:'motion',media:[{id:'m',name:'voix.wav',duration:6,size:100}],clips:[{id:'c',mediaId:'m',start:0,end:6}],motions:motions()});
test('full motion covers leading, middle and trailing silences without shifting node speech cues',()=>{
 const m=motions();assert.equal(m[0].start,0);assert.equal(m[0].duration,3);assert.equal(m[1].start,3);assert.equal(m[1].duration,3);assert.equal(m[1].start+m[1].nodes[0].at,4);
 const first=planToMotions({scenes:[{...ending,startWord:0,endWord:3}]},words,6,undefined,{visualMode:'motion'});
 assert.equal(first[0].nodes[0].at,4);assert.equal(first[0].duration,6);
});
test('director must cover all narration and cannot skip or duplicate a phrase',()=>{
 for(const scenes of [[],[opening],[ending],[opening,{...ending,startWord:1}],[{...opening,endWord:0},ending]])assert.throws(()=>planToMotions({scenes},words,6,undefined,{visualMode:'motion'}));
});
test('full motion survives saving, reopening, cutting and old project migration',()=>{
 const p=validateProject(project());assert.equal(p.visualMode,'motion');assert.equal(p.motions[1].preset,'cards');
 assert.equal(validateProject(removeRange(p,2,2.5)).visualMode,'motion');
 delete p.visualMode;assert.equal(validateProject(p).visualMode,'footage');p.visualMode='unknown';assert.throws(()=>validateProject(p));
});
test('automatic full motion replaces the storyboard without unnecessary camera cuts',()=>{
 const p=project();p.motions[0].origin='manual';
 const result=applyMontage(p,{sourceDuration:6,duration:6,words,plan,cuts:[]},{zoom:true});
 assert.equal(result.clips.length,1);assert.equal(result.motions.length,2);assert.ok(result.motions.every(m=>m.origin==='ai'));
});
test('full motion never samples source images, even in gaps and after the last scene',()=>{
 const calls=[];const ctx=new Proxy({globalAlpha:1,measureText:t=>({width:t.length*15}),createRadialGradient:()=>({addColorStop(){}})}, {get(o,k){return k in o?o[k]:(...args)=>calls.push([k,...args]);}});
 const video=new Proxy({}, {get(){throw new Error('Footage must not be read');}});
 for(const format of ['16:9','9:16','1:1']){
  const [width,height]=dimensions(format);
  for(const time of [0,.1,2.9,3,3.2,6,20])drawComposition(ctx,{width,height},video,motions(),time,1,'motion');
  drawComposition(ctx,{width,height},video,[],0,1,'motion');
 }
 assert.equal(calls.filter(c=>c[0]==='drawImage').length,0);assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]==='Agir'));
});
test('full motion request uses the continuous director and repairs incomplete coverage',async()=>{
 const wav=Buffer.from(await encodeWav(new Float32Array(96000)).arrayBuffer());let attempts=0;
 const result=await analyzeAudio(wav,{apiKey:'test',visualMode:'motion',fetchImpl:async(url,options)=>{
  if(url.endsWith('transcriptions'))return Response.json({words});
  const request=JSON.parse(options.body);assert.match(request.instructions,/Couvre TOUS les mots/);attempts++;
  if(attempts===2)assert.ok(JSON.parse(request.input).repair.error);
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(attempts===1?{scenes:[opening]}:plan)}]}]});
 }});assert.equal(attempts,2);assert.equal(result.plan.scenes.length,2);
});
test('HTTP route validates and forwards visual mode',async()=>{
 let received;
 const server=createStudioServer({apiKey:'test',token:'private',analyze:async(_,options)=>{received=options.visualMode;return {ok:true};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url=`http://127.0.0.1:${server.address().port}/api/montage`,headers={Authorization:'Bearer private','Content-Type':'audio/wav'},body=await encodeWav(new Float32Array(16000)).arrayBuffer();
  assert.equal((await fetch(url+'?visualMode=bad',{method:'POST',headers,body})).status,400);
  assert.equal((await fetch(url+'?visualMode=motion',{method:'POST',headers,body})).status,200);assert.equal(received,'motion');
 }finally{await new Promise(r=>server.close(r));}
});

test('unique connecting words cannot be mislabeled as an abandoned take',()=>{
 const phrase='Pour créer une vidéo il y a trois étapes'.split(' ').map((word,i)=>({word,start:i*.5,end:i*.5+.3}));
 assert.throws(()=>buildEdit(phrase,5,{removals:[{startWord:4,endWord:6,reason:'reprise'}]}));
});
test('uncertain editorial cuts retain every word and report the fallback',async()=>{
 const wav=Buffer.from(await encodeWav(new Float32Array(96000)).arrayBuffer());
 const result=await analyzeAudio(wav,{apiKey:'test',visualMode:'motion',fullEdit:true,fetchImpl:async(url,options)=>{
  if(url.endsWith('transcriptions'))return Response.json({words});
  const body=JSON.parse(options.body);
  const value=body.text.format.name==='speech_edit_plan'?{removals:[{startWord:0,endWord:3,reason:'reprise'}]}:plan;
  return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
 }});
 assert.deepEqual(result.words,words);assert.deepEqual(result.cuts,[]);assert.match(result.warnings[0],/conservées/);
});
