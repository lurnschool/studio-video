import test from 'node:test';
import assert from 'node:assert/strict';
import {montageAudio} from '../audio.mjs';

test('a short high-bitrate video over 350 MB produces only the kept audio',async()=>{
 const previous=globalThis.AudioContext;let closed=false,decoded=0;
 const pcm=Float32Array.from({length:32000},(_,i)=>i<16000?.25:-.25);
 globalThis.AudioContext=class {
  async decodeAudioData(){decoded++;return {numberOfChannels:1,getChannelData:()=>pcm};}
  async close(){closed=true;}
 };
 try{
  const media=[{id:'4k',duration:2,file:{size:1_400_000_000,arrayBuffer:async()=>new ArrayBuffer(8)}}];
  const wav=await montageAudio([{mediaId:'4k',start:1,end:2}],media,()=>{});
  const bytes=Buffer.from(await wav.arrayBuffer());
  assert.equal(bytes.length,32044);assert.equal(bytes.readUInt32LE(24),16000);
  assert.equal(bytes.readInt16LE(44),-8192);assert.equal(decoded,1);assert.equal(closed,true);
 }finally{globalThis.AudioContext=previous;}
});

test('cancelling a large source read prevents decoding and closes the context',async()=>{
 const previous=globalThis.AudioContext,controller=new AbortController();let decoded=false,closed=false;
 globalThis.AudioContext=class {async decodeAudioData(){decoded=true;}async close(){closed=true;}};
 try{
  const media=[{id:'4k',duration:2,file:{size:1_400_000_000,arrayBuffer:async()=>{controller.abort();return new ArrayBuffer(8);}}}];
  await assert.rejects(montageAudio([{mediaId:'4k',start:0,end:1}],media,()=>{},controller.signal),{name:'AbortError'});
  assert.equal(decoded,false);assert.equal(closed,true);
 }finally{globalThis.AudioContext=previous;}
});
