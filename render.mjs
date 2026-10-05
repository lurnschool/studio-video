import {DIAGRAMS} from './motion-plan.mjs';
export function dimensions(format) {
  return format === '9:16' ? [720, 1280] : format === '1:1' ? [1080, 1080] : [1280, 720];
}

export function drawComposition(ctx, canvas, video, motions, time, zoom = 1) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#050608'; ctx.fillRect(0, 0, w, h);
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight) * zoom;
    const vw = video.videoWidth * scale, vh = video.videoHeight * scale;
    ctx.drawImage(video, (w - vw) / 2, (h - vh) / 2, vw, vh);
  }
  for (const motion of motions) {
    const local = time - motion.start;
    if (!motion.text || local < 0 || local >= motion.duration) continue;
    const enter = Math.min(1, local / Math.min(0.4, motion.duration / 3));
    const exit = Math.min(1, (motion.duration - local) / Math.min(0.3, motion.duration / 3));
    const ease = 1 - (1 - enter) ** 3;
    if (DIAGRAMS.includes(motion.preset)) { drawDiagram(ctx, canvas, motion, local, exit); continue; }
    if (motion.preset === 'editorial') { drawEditorial(ctx, canvas, motion, local, exit); continue; }
    if (motion.preset === 'gradient') { drawGradientCard(ctx, canvas, motion, local, enter, exit); continue; }
    const size = Math.round(Math.min(w, h) * 0.055);
    let text = motion.preset === 'type' ? motion.text.slice(0, Math.ceil(motion.text.length * enter)) : motion.text;
    const maxWidth = w * 0.8;
    ctx.save(); ctx.globalAlpha = Math.min(enter, exit);
    ctx.font = `800 ${size}px Manrope, system-ui, sans-serif`;
    ctx.textBaseline = 'middle'; ctx.textAlign = motion.preset === 'lower' ? 'left' : 'center';
    const lines = []; let line = '';
    for (const char of text) {
      if (char === '\n' || (ctx.measureText(line + char).width > maxWidth && line)) { lines.push(line); line = char === '\n' ? '' : char; }
      else line += char;
    }
    if (line) lines.push(line);
    const visible = lines.slice(0, 4);
    const blockHeight = Math.max(1, visible.length) * size * 1.25;
    const y = motion.position === 'top' ? h * 0.14 + blockHeight / 2 : motion.position === 'center' ? h / 2 : h * 0.86 - blockHeight / 2;
    const x = motion.position === 'left' ? w * 0.25 : motion.position === 'right' ? w * 0.75 : motion.preset === 'lower' ? w * 0.1 : w / 2;
    ctx.translate(x + (motion.preset === 'lower' ? (ease - 1) * w * 0.08 : 0), y + (motion.preset === 'fade' ? (1 - ease) * size : 0));
    if (motion.preset === 'pop') { const scale = 0.72 + 0.28 * ease; ctx.scale(scale, scale); }
    const blockWidth = Math.min(maxWidth, Math.max(...visible.map(value => ctx.measureText(value).width), 1)) + size;
    if (motion.preset === 'pop' || motion.preset === 'lower') {
      const left = motion.preset === 'lower' ? -size / 2 : -blockWidth / 2;
      ctx.fillStyle = motion.preset === 'pop' ? motion.color : '#10121aed';
      ctx.fillRect(left, -blockHeight / 2 - size * 0.25, blockWidth, blockHeight + size * 0.5);
      if (motion.preset === 'lower') { ctx.fillStyle = motion.color; ctx.fillRect(left, -blockHeight / 2 - size * 0.25, size * 0.12, blockHeight + size * 0.5); }
    }
    if (motion.preset === 'fade') { ctx.fillStyle = motion.color; ctx.fillRect(-blockWidth / 2, blockHeight / 2 + 7, blockWidth * ease, 4); }
    ctx.fillStyle = motion.preset === 'pop' ? '#110c19' : '#fff';
    if (motion.preset !== 'pop') { ctx.shadowColor = '#000'; ctx.shadowBlur = 7; }
    visible.forEach((value, index) => ctx.fillText(value, 0, (index - (visible.length - 1) / 2) * size * 1.25, maxWidth));
    ctx.restore();
  }
}

function drawEditorial(ctx, canvas, motion, local, exit) {
  const {width:w,height:h}=canvas, size=Math.min(w,h)*0.045;
  const side=['left','right'].includes(motion.position);
  const maxWidth=w*(side?0.36:0.8), left=motion.position==='right'?w*0.6:side?w*0.07:w*0.1;
  const top=motion.position==='top'?h*.14:motion.position==='bottom'?h*.75:side?h*.27:h*.46;
  const accentStart=motion.accent?motion.text.toLocaleLowerCase().indexOf(motion.accent.toLocaleLowerCase()):-1;
  const accentEnd=accentStart<0?-1:accentStart+motion.accent.length;
  const words=[...motion.text.matchAll(/\S+/g)];
  const reveal=Math.min(.19,Math.max(.035,motion.duration*.6/Math.max(1,words.length)));
  const lines=[[]];let lineWidth=0;
  ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';
  for(let index=0;index<words.length;index++){
    const match=words[index],highlight=accentStart>=0&&match.index<accentEnd&&match.index+match[0].length>accentStart;
    const font=highlight?`italic ${size*1.45}px Georgia, serif`:`700 ${size}px Manrope, system-ui, sans-serif`;
    ctx.font=font;const width=Math.min(maxWidth,ctx.measureText(match[0]).width),space=size*.27;
    if(lineWidth+width>maxWidth&&lines.at(-1).length){lines.push([]);lineWidth=0;}
    lines.at(-1).push({word:match[0],font,highlight,width,x:lineWidth,index});lineWidth+=width+space;
  }
  lines.slice(0,5).forEach((line,row)=>{
    const width=line.reduce((sum,word)=>sum+word.width+size*.27,0)-size*.27;
    const base=side?left:left+(maxWidth-width)/2;
    for(const word of line){const progress=Math.max(0,Math.min(1,(local-word.index*reveal)/.16));if(progress<=0)continue;ctx.globalAlpha=progress*exit;ctx.font=word.font;ctx.fillStyle=word.highlight?motion.color:'#fff';ctx.shadowColor=word.highlight?'#38117755':'#0005';ctx.shadowBlur=word.highlight?4:2;ctx.fillText(word.word,base+word.x,top+row*size*1.6+(1-progress)*size*.4,maxWidth);}
  });ctx.restore();
}

function drawGradientCard(ctx, canvas, motion, local, enter, exit) {
  const {width:w,height:h}=canvas;
  ctx.save();ctx.globalAlpha=Math.min(enter,exit);ctx.fillStyle='#e6dff7';ctx.fillRect(0,0,w,h);
  const drift=Math.sin(local*.6)*w*.06;
  for(const [x,y,color,radius] of [[-w*.05+drift,0,motion.color,w*.8],[w+drift,h,motion.color,w*.72],[w,0,'#ffffff',w*.6],[0,h,'#ffffff',w*.55]]){
    const gradient=ctx.createRadialGradient(x,y,0,x,y,radius);gradient.addColorStop(0,color);gradient.addColorStop(1,color+'00');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  }
  const title=(motion.accent||motion.text).toLocaleUpperCase(),kicker=motion.accent?motion.text:'';
  const base=Math.min(w,h),titleSize=base*.115;
  ctx.textAlign='center';ctx.textBaseline='middle';
  if(kicker){ctx.font=`italic 800 ${base*.032}px Manrope, system-ui, sans-serif`;ctx.fillStyle='#fff';ctx.shadowColor='#6837ba55';ctx.shadowBlur=3;ctx.fillText(kicker.toLocaleUpperCase(),w/2,h*.39,w*.78);}
  const progress=Math.max(0,Math.min(1,(local-.22)/.42)),ease=1-(1-progress)**3;
  if(progress>0){ctx.save();ctx.globalAlpha*=progress;ctx.translate(w/2,h*.51);ctx.scale(.82+.18*ease,.82+.18*ease);ctx.font=`italic 800 ${titleSize}px Manrope, system-ui, sans-serif`;ctx.fillStyle=motion.color;
    for(let i=4;i>=1;i--){ctx.save();ctx.globalAlpha*=.08*(1-ease);ctx.fillText(title,-i*(1-ease)*22,0,w*.82);ctx.restore();}
    ctx.shadowColor=motion.color+'66';ctx.shadowBlur=9;ctx.shadowOffsetY=3;ctx.fillText(title,0,0,w*.82);ctx.restore();}
  const detailProgress=Math.max(0,Math.min(1,(local-.65)/.3));
  if(motion.detail&&detailProgress>0){ctx.globalAlpha*=detailProgress;ctx.font=`italic ${base*.055}px Georgia, serif`;ctx.fillStyle='#fff';ctx.fillText(motion.detail,w*.63,h*.62+(1-detailProgress)*20,w*.65);}
  ctx.restore();
}

function wrapText(ctx,text,x,y,width,size,lines=3){
  const chunks=[];let line='';
  for(const word of text.split(/\s+/)){if(ctx.measureText(`${line} ${word}`).width>width&&line){chunks.push(line);line=word;}else line=line?`${line} ${word}`:word;}
  if(line)chunks.push(line);
  const visible=chunks.slice(0,lines);
  if(chunks.length>lines)visible[lines-1]+='…';
  visible.forEach((value,index)=>ctx.fillText(value,x,y+(index-(visible.length-1)/2)*size*1.25,width));
}
function rounded(ctx,x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
function arrow(ctx,from,to,progress,color,base){
  if(progress<=0)return;const x=from[0]+(to[0]-from[0])*progress,y=from[1]+(to[1]-from[1])*progress;
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=base*.003;ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(x,y);ctx.stroke();
  if(progress>.9){const angle=Math.atan2(to[1]-from[1],to[0]-from[0]),size=base*.012;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-size*Math.cos(angle-.5),y-size*Math.sin(angle-.5));ctx.lineTo(x-size*Math.cos(angle+.5),y-size*Math.sin(angle+.5));ctx.closePath();ctx.fill();}
}
export function drawDiagram(ctx,canvas,motion,local,exit){
  const {width:w,height:h}=canvas,b=Math.min(w,h),portrait=h>w;
  const fade=Math.min(1,local/.28)*exit,nodes=motion.nodes||[];
  ctx.save();ctx.globalAlpha=fade;
  const background=ctx.createLinearGradient(0,0,w,h);background.addColorStop(0,'#f7f3ff');background.addColorStop(1,'#e1d6fa');ctx.fillStyle=background;ctx.fillRect(0,0,w,h);
  const glow=ctx.createRadialGradient(w*.8,h*.15,0,w*.8,h*.15,w*.8);glow.addColorStop(0,motion.color+'35');glow.addColorStop(1,motion.color+'00');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.fillStyle=motion.color;ctx.textAlign='left';ctx.textBaseline='middle';ctx.font=`800 ${b*.018}px Manrope, system-ui, sans-serif`;
  ctx.fillText(({sequence:'ÉTAPE PAR ÉTAPE',compare:'DEUX APPROCHES',hub:'LES IDÉES CLÉS',stat:'EN UN CHIFFRE'})[motion.preset],w*.07,h*.1);
  ctx.textAlign='center';ctx.fillStyle='#23123d';ctx.font=`800 ${b*.048}px Manrope, system-ui, sans-serif`;
  if(motion.preset!=='hub')wrapText(ctx,motion.text,w*.5,h*.23,w*.84,b*.048,2);
  const nodeWidth=portrait?w*.72:motion.preset==='sequence'?w*.61/Math.max(2,nodes.length):w*.32;
  const nodeHeight=portrait?h*.115:h*.26;
  const positions=nodes.map((node,i)=>{
    if(motion.preset==='sequence')return portrait?[w*.5,h*(.35+i*.16)]:[w*.12+(i+.5)*(w*.76/nodes.length),h*.57];
    if(motion.preset==='compare')return portrait?[w*.5,h*(.43+i*.24)]:[w*(i?.72:.28),h*.57];
    if(motion.preset==='hub')return portrait?[w*.5,h*(.36+i*.15)]:[[w*.24,h*.28],[w*.76,h*.28],[w*.24,h*.77],[w*.76,h*.77]][i];
    return [w*.5,h*.53];
  });
  const progress=node=>Math.max(0,Math.min(1,(local-(node.at||0))/.42));
  if(motion.preset==='hub'){
    ctx.fillStyle=motion.color;ctx.font=`italic ${b*.049}px Georgia, serif`;wrapText(ctx,motion.text,w*.5,h*(portrait?.23:.51),w*(portrait?.84:.35),b*.049,3);
  }
  nodes.forEach((node,i)=>{
    const p=progress(node),[x,y]=positions[i];if(p<=0)return;
    if(motion.preset==='sequence'&&i>0){const prev=positions[i-1];arrow(ctx,portrait?[prev[0],prev[1]+nodeHeight/2]:[prev[0]+nodeWidth/2,prev[1]],portrait?[x,y-nodeHeight/2-.008*h]:[x-nodeWidth/2-.008*w,y],p,motion.color,b);}
    if(motion.preset==='hub')arrow(ctx,portrait?[w*.5,h*.29]:[w*(i%2?.66:.34),h*(i<2?.43:.60)],portrait?[x,y-nodeHeight/2]:[x,y+(i<2?nodeHeight/2:-nodeHeight/2)],p,motion.color+'88',b);
  });
  nodes.forEach((node,i)=>{
    const p=progress(node),ease=1-(1-p)**3,[x,y]=positions[i];if(p<=0)return;
    ctx.save();ctx.globalAlpha*=p;ctx.translate(x,y+(1-ease)*b*.035);
    if(motion.preset==='stat'){
      ctx.fillStyle=motion.color;ctx.font=`800 ${b*.16}px Manrope, system-ui, sans-serif`;ctx.fillText(node.label,0,0,w*.8);ctx.fillStyle='#564768';ctx.font=`600 ${b*.03}px Manrope, system-ui, sans-serif`;wrapText(ctx,node.detail,0,b*.14,w*.78,b*.03,2);
    }else{
      ctx.shadowColor='#5a347318';ctx.shadowBlur=b*.03;ctx.shadowOffsetY=b*.015;ctx.lineWidth=b*.0015;
      rounded(ctx,-nodeWidth/2,-nodeHeight/2,nodeWidth,nodeHeight,b*.02,'#ffffff',motion.color+'30');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      ctx.fillStyle=motion.color;ctx.font=`800 ${b*.018}px Manrope, system-ui, sans-serif`;ctx.fillText(String(i+1).padStart(2,'0'),0,-nodeHeight*.32);
      ctx.fillStyle='#291541';ctx.font=`800 ${b*.028}px Manrope, system-ui, sans-serif`;wrapText(ctx,node.label,0,-nodeHeight*.06,nodeWidth*.86,b*.028,2);
      if(node.detail){ctx.fillStyle='#776784';ctx.font=`500 ${b*.019}px Manrope, system-ui, sans-serif`;wrapText(ctx,node.detail,0,nodeHeight*.29,nodeWidth*.86,b*.019,2);}
    }ctx.restore();
  });
  if(motion.detail&&motion.preset!=='stat'){ctx.fillStyle='#776784';ctx.font=`italic ${b*.027}px Georgia, serif`;wrapText(ctx,motion.detail,w*.5,h*.91,w*.8,b*.027,2);}
  ctx.restore();
}
