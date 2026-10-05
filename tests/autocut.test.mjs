import test from 'node:test';import assert from 'node:assert/strict';import {audioEnvelope,findPauseCuts} from '../autocut.mjs';
const make=(segments,seconds=6,amplitude=.2)=>{const rate=16000,pcm=new Float32Array(rate*seconds);for(let i=0;i<pcm.length;i++){let t=i/rate;pcm[i]=segments.some(([a,b])=>t>=a&&t<b)?amplitude*Math.sin(2*Math.PI*220*t):0;}return audioEnvelope([pcm],rate);};
test('removes two long pauses and retains speech margins',()=>{const result=findPauseCuts(make([[.2,1.5],[2.5,4],[5,5.8]]));assert.equal(result.cuts.length,2);assert.ok(result.cuts[0].start>=1.65);assert.ok(result.cuts[0].end<=2.37);assert.ok(result.cuts[1].start>=4.15);});
test('natural preserves short breaths while dynamic shortens them',()=>{const e=make([[0,2],[2.5,6]]);assert.equal(findPauseCuts(e,0,6,'natural').cuts.length,0);assert.equal(findPauseCuts(e,0,6,'dynamic').cuts.length,1);});
test('continuous audio and fully silent media are preserved',()=>{assert.equal(findPauseCuts(make([[0,6]])).cuts.length,0);assert.equal(findPauseCuts(make([])).cuts.length,0);});
test('quiet but audible speech remains intact',()=>{const r=findPauseCuts(make([[0,1.5],[2.5,6]],6,.007));assert.equal(r.cuts.length,1);assert.ok(r.cuts[0].start>1.5);});
test('stereo inversion does not cancel detected speech',()=>{const a=new Float32Array(16000).fill(.1),b=new Float32Array(16000).fill(-.1);const e=audioEnvelope([a,b],16000);assert.ok(e.levels[0]>-25);});
test('source range limits detected pauses',()=>{const e=make([[0,1],[3,6]]);const r=findPauseCuts(e,3,6);assert.equal(r.cuts.length,0);});
