export function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const label = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  label(0,'RIFF');view.setUint32(4,36+samples.length*2,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i)=>{const s=Math.max(-1,Math.min(1,sample));view.setInt16(44+i*2,s<0?s*32768:s*32767,true);});
  return new Blob([buffer],{type:'audio/wav'});
}

// Concatenate only kept intervals, so generated word timings match the edited timeline.
export async function montageAudio(clips, media, onProgress, signal) {
  const rate=16000, total=clips.reduce((sum,clip)=>sum+clip.end-clip.start,0);
  if(total>600)throw new Error('L’analyse IA accepte pour le moment un montage de 10 minutes maximum.');
  const samples=new Float32Array(Math.round(total*rate));
  const context=new AudioContext({sampleRate:rate});
  try {
    let outputOffset=0, elapsed=0, cachedId, decoded;
    for(let i=0;i<clips.length;i++) {
      signal?.throwIfAborted();const clip=clips[i],source=media.find(item=>item.id===clip.mediaId);
      if(!source?.file)throw new Error('Réimportez les vidéos originales avant de générer le motion design.');
      if(source.file.size>350_000_000||source.duration>1800)throw new Error('Pour l’analyse IA, utilisez des sources de moins de 350 Mo et 30 minutes.');
      onProgress(`Préparation de la voix · clip ${i+1}/${clips.length}`);
      if(cachedId!==source.id){decoded=await context.decodeAudioData(await source.file.arrayBuffer());cachedId=source.id;}
      elapsed+=clip.end-clip.start;
      const start=Math.round(clip.start*rate), count=Math.round(elapsed*rate)-outputOffset;
      for(let channel=0;channel<decoded.numberOfChannels;channel++) {
        const data=decoded.getChannelData(channel);
        for(let n=0;n<count;n++) samples[outputOffset+n]+=(data[start+n]||0)/decoded.numberOfChannels;
      }
      outputOffset+=count;await new Promise(resolve=>setTimeout(resolve,0));
    }
    signal?.throwIfAborted();return encodeWav(samples,rate);
  } finally {await context.close();}
}
