import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEdit,applyMontage,transcriptionBreaks} from '../autopilot.mjs';
import {duration} from '../project.mjs';
const words=['Je','vais','je','recommence','Pour','créer','une','vidéo','écrivez','puis','enregistrez','et','animez'].map((word,i)=>({word,start:i*.5+.1,end:i*.5+.4}));
const edit={removals:[{startWord:0,endWord:3,reason:'reprise'}]};
const plan={scenes:[{kind:'sequence',startWord:0,endWord:8,title:'Créer une vidéo',accent:'',detail:'',nodes:[{label:'Écrire',detail:'',wordIndex:4},{label:'Enregistrer',detail:'',wordIndex:6},{label:'Animer',detail:'',wordIndex:8}]}]};
test('semantic edit removes false start and rebases every kept word',()=>{
 const result=buildEdit(words,7,edit);
 assert.equal(result.cuts.length,1);assert.equal(result.words[0].word,'Pour');
 assert.ok(Math.abs(result.words[0].start-.1)<1e-6);
 assert.ok(Math.abs(result.duration-5)<1e-6);
 assert.deepEqual(result.words.map(w=>w.word),words.slice(4).map(w=>w.word));
});
test('silence cuts never remove speech even when acoustic detection disagrees',()=>{
 const result=buildEdit(words,8,{removals:[]},[{start:.2,end:.8},{start:7,end:8}]);
 assert.deepEqual(result.cuts,[{start:7,end:8,reason:'pause'}]);assert.equal(result.words.length,words.length);
});
test('invalid, overlapping and destructive semantic ranges are rejected',()=>{
 for(const removals of [[{startWord:0,endWord:12,reason:'reprise'}],[{startWord:0,endWord:3,reason:'other'}],[{startWord:0,endWord:3,reason:'reprise'},{startWord:2,endWord:4,reason:'reprise'}],[{startWord:2,endWord:99,reason:'reprise'}]])assert.throws(()=>buildEdit(words,7,{removals}));
 const overlap=words.map(w=>({...w}));overlap[3].end=2.2;
 assert.throws(()=>buildEdit(overlap,7,edit),/chevauchent/);
});
test('complete edit maps cuts across sources and aligns diagram to retained speech',()=>{
 const project={clips:[{id:'a',mediaId:'x',start:10,end:11},{id:'b',mediaId:'y',start:3,end:9}],motions:[{id:'manual',origin:'manual',start:4,duration:2,nodes:[]},{id:'old-ai',origin:'ai',start:0,duration:3,nodes:[]}]};
 const result={...buildEdit(words,7,edit),sourceDuration:7,plan};
 const original=JSON.stringify(project),applied=applyMontage(project,result);
 assert.equal(JSON.stringify(project),original);assert.ok(Math.abs(duration(applied.clips)-5)<1e-6);
 assert.equal(applied.clips[0].mediaId,'y');assert.equal(applied.clips[0].start,4);
 assert.equal(applied.motions.find(m=>m.id==='manual').start,2);assert.ok(!applied.motions.some(m=>m.id==='old-ai'));
 const motion=applied.motions.find(m=>m.origin==='ai');
 assert.equal(motion.nodes[2].at,result.words[8].start-motion.start);
});
test('stale analysis and invalid visual plan leave input untouched',()=>{
 const project={clips:[{id:'a',mediaId:'x',start:0,end:7}],motions:[]};
 const result={...buildEdit(words,7,edit),sourceDuration:7,plan};
 assert.throws(()=>applyMontage(project,{...result,sourceDuration:8}));
 assert.throws(()=>applyMontage(project,{...result,plan:{scenes:[{kind:'invalid'}]}}));
 assert.equal(project.clips[0].end,7);
});
test('WAV sample rounding at the end of a video does not reject a valid cut',()=>{
 const total=7.1234567,encoded=Math.round(total*16000)/16000;
 const project={clips:[{id:'a',mediaId:'x',start:0,end:total}],motions:[]};
 const applied=applyMontage(project,{sourceDuration:encoded,duration:6.5,cuts:[{start:6.5,end:encoded,reason:'pause'}],words,plan:{scenes:[]}},{zoom:false});
 assert.equal(duration(applied.clips),6.5);
});
test('collapsed repeated utterance timestamps trigger a separate transcription',()=>{
 const pauses=[{start:1.1,end:1.9}];
 assert.deepEqual(transcriptionBreaks([{word:'une',start:.4,end:2.5}],pauses,6),[1.5]);
 assert.deepEqual(transcriptionBreaks([{word:'une',start:.4,end:.6},{word:'vidéo',start:2,end:2.5}],pauses,6),[]);
});
test('a repeated introduction cannot be removed in all its versions',()=>{
 const input=['Pour','créer','une','vidéo','Pour','créer','une','vidéo','il','y','a','trois','étapes'].map((word,i)=>({word,start:i*.4,end:i*.4+.3}));
 assert.throws(()=>buildEdit(input,6,{removals:[{startWord:0,endWord:7,reason:'reprise'}]}),/idée unique/);
 assert.equal(buildEdit(input,6,{removals:[{startWord:0,endWord:3,reason:'reprise'}]}).words[0].word,'Pour');
 assert.throws(()=>buildEdit(input,6,{removals:[{startWord:0,endWord:3,reason:'hésitation'}]}),/sons de remplissage/);
});
