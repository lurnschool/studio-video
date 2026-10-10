// Deterministic, code-native scenes. The same painter drives preview and export.
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => 1 - (1-clamp(n)) ** 3;
const font = (ctx,size,weight=600) => {ctx.font=`${weight} ${size}px system-ui, -apple-system, sans-serif`;};
function panel(ctx,x,y,w,h,r=20,fill='#191b22',stroke='#ffffff18') {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}
}
function label(ctx,text,x,y,size,width,color='#fff',weight=600,lines=2) {
  font(ctx,size,weight);ctx.fillStyle=color;
  const rows=[];let line='';
  for(const word of String(text||'').split(/\s+/)){
    const candidate=line?line+' '+word:word;
    if(line&&ctx.measureText(candidate).width>width){rows.push(line);line=word;}else line=candidate;
  }
  if(line)rows.push(line);
  const visible=rows.slice(0,lines);
  if(rows.length>lines)visible[lines-1]+='…';
  visible.forEach((row,i)=>ctx.fillText(row,x,y+(i-(visible.length-1)/2)*size*1.22,width));
}
function glow(ctx,x,y,r,color,alpha=.3) {
  ctx.save();ctx.globalAlpha*=alpha;
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
}
function dot(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function line(ctx,a,b,p,color,size=2){
  ctx.strokeStyle=color;ctx.lineWidth=size;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(a[0]+(b[0]-a[0])*p,a[1]+(b[1]-a[1])*p);ctx.stroke();
}
function icon(ctx,x,y,r,index,color) {
  ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=r*.12;ctx.lineCap='round';
  if(index%4===0){ctx.beginPath();ctx.moveTo(-r*.4,0);ctx.lineTo(-r*.08,r*.3);ctx.lineTo(r*.45,-r*.35);ctx.stroke();}
  if(index%4===1){ctx.strokeRect(-r*.4,-r*.36,r*.8,r*.72);line(ctx,[-r*.4,-r*.1],[r*.4,-r*.1],1,color,r*.1);}
  if(index%4===2){for(let i=0;i<3;i++)line(ctx,[-r*.35+i*r*.35,r*.35],[-r*.35+i*r*.35,-r*(.05+i*.17)],1,color,r*.16);}
  if(index%4===3){ctx.beginPath();ctx.arc(0,0,r*.42,0,Math.PI*2);ctx.moveTo(0,-r*.22);ctx.lineTo(0,0);ctx.lineTo(r*.21,r*.12);ctx.stroke();}
  ctx.restore();
}
function background(ctx,w,h,t,color) {
  ctx.fillStyle='#090b10';ctx.fillRect(0,0,w,h);
  glow(ctx,w*(.53+Math.sin(t*.22)*.12),h*.72,w*.58,color,.19);
  glow(ctx,w*.85,h*.03,w*.43,color,.08);
  // Quiet technical grid; no invented data or fake charts.
  ctx.strokeStyle='#ffffff04';ctx.lineWidth=1;
  const gap=Math.min(w,h)*.09;
  for(let x=0;x<w;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
}
function card(ctx,node,x,y,w,h,b,color,index,p,{light=false}={}) {
  if(p<=0)return;
  ctx.save();ctx.globalAlpha*=p;ctx.translate(x,y+(1-ease(p))*b*.065);
  ctx.shadowColor='#0005';ctx.shadowBlur=b*.05;ctx.shadowOffsetY=b*.018;
  panel(ctx,-w/2,-h/2,w,h,b*.025,light?'#f4f1ef':'#1b1b22',light?'#fff7':'#ffffff20');ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  panel(ctx,-b*.028,-h*.38,b*.056,b*.056,b*.017,light?color:color+'18',null);
  icon(ctx,0,-h*.38+b*.028,b*.027,index,light?'#241511':color);
  ctx.textAlign='center';
  label(ctx,node.label,0,h*.03,b*.03,w*.85,light?'#191720':'#f7f5fa',650,2);
  if(node.detail)label(ctx,node.detail,0,h*.31,b*.019,w*.85,light?'#645a57':'#aba6b0',450,2);
  ctx.restore();
}
function kinetic(ctx,m,w,h,b,t,color) {
  const text=m.text||'',accent=m.accent||'';
  const words=text.split(/\s+/),wide=h<w;
  const size=b*(wide?.105:.082),max=w*.82;
  font(ctx,size,650);
  const rows=[[]];let width=0;
  for(const [i,word] of words.entries()){
    const ww=Math.min(max,ctx.measureText(word).width),gap=size*.28;
    if(width+ww>max&&rows.at(-1).length){rows.push([]);width=0;}
    rows.at(-1).push({word,width:ww,index:i});width+=ww+gap;
  }
  const shown=rows.slice(0,4),lineHeight=size*1.2,top=h*.46-(shown.length-1)*lineHeight/2;
  shown.forEach((row,j)=>{
    let x=(w-row.reduce((n,q)=>n+q.width,0)-(row.length-1)*size*.28)/2;
    for(const part of row){
      const p=ease((t-part.index*Math.min(.09,1/Math.max(1,words.length)))/.5);
      ctx.save();ctx.globalAlpha*=p;ctx.textAlign='left';
      const highlighted=accent&&accent.toLocaleLowerCase().includes(part.word.toLocaleLowerCase().replace(/[.,!?]/g,''));
      ctx.fillStyle=highlighted?color:'#f6f4f8';font(ctx,size,650);
      ctx.fillText(part.word,x,top+j*lineHeight+(1-p)*b*.05,part.width);ctx.restore();x+=part.width+size*.28;
    }
  });
  if(m.detail){ctx.save();ctx.globalAlpha*=ease((t-.5)/.5);ctx.textAlign='center';label(ctx,m.detail,w/2,top+shown.length*lineHeight+b*.06,b*.027,w*.76,'#aaa4af',450,2);ctx.restore();}
  if(m.preset==='gradient'){
    const p=ease(t/.8);line(ctx,[w*.42,h*.76],[w*.42+w*.16*p,h*.76],1,color,b*.005);
    glow(ctx,w/2,h*.44,b*.48,color,.1);
  }
}
function scene(ctx,canvas,m,t,index) {
  const {width:w,height:h}=canvas,b=Math.min(w,h),portrait=h>w,color=m.color||'#ff916d',nodes=m.nodes||[];
  ctx.save();ctx.textBaseline='middle';ctx.textAlign='center';
  const enter=ease(t/.6);ctx.translate(w/2,h/2);ctx.scale(.965+.035*enter,.965+.035*enter);ctx.translate(-w/2,-h/2);
  // A small sequence marker provides rhythm without imposing an invented label.
  ctx.textAlign='left';label(ctx,String(index+1).padStart(2,'0'),w*.065,h*.085,b*.018,w*.1,color,650,1);
  line(ctx,[w*.065+b*.045,h*.085],[w*.065+b*.1,h*.085],1,color+'66',1);
  if(['editorial','gradient','fade','pop','lower','type'].includes(m.preset)||!nodes.length){kinetic(ctx,m,w,h,b,t,color);ctx.restore();return;}
  ctx.textAlign='center';
  if(m.preset!=='hub')label(ctx,m.text,w/2,h*.205,b*.055,w*.82,'#f8f5f9',650,2);
  const progress=node=>ease((t-(node.at||0))/.55);
  if(m.preset==='stat'){
    const node=nodes[0],p=progress(node);ctx.save();ctx.globalAlpha*=p;ctx.translate(w/2,h*.51);ctx.scale(.8+.2*p,.8+.2*p);
    glow(ctx,0,0,b*.4,color,.23);label(ctx,node.label,0,0,b*.2,w*.8,color,700,1);
    label(ctx,node.detail,0,b*.17,b*.032,w*.75,'#c4bcc7',450,2);ctx.restore();
  }else if(m.preset==='messages'){
    const bw=w*(portrait?.79:.56),bh=h*(portrait?.115:.145),gap=bh*.18,top=h*.35;
    nodes.forEach((node,i)=>{
      const p=progress(node);if(p<=0)return;const x=w/2+(i%2?1:-1)*w*.035,y=top+i*(bh+gap);
      ctx.save();ctx.globalAlpha*=p;ctx.translate((i%2?1:-1)*(1-p)*b*.06,0);
      panel(ctx,x-bw/2,y-bh/2,bw,bh,b*.022,i%2?'#f2efeb':'#202027',i%2?'#fff9':'#ffffff22');
      dot(ctx,x-bw/2+b*.045,y-b*.013,b*.018,color);ctx.textAlign='left';
      label(ctx,node.label,x-bw/2+b*.083,y-(node.detail?bh*.12:0),b*.027,bw-b*.13,i%2?'#221b19':'#faf7fb',600,1);
      if(node.detail)label(ctx,node.detail,x-bw/2+b*.083,y+bh*.2,b*.019,bw-b*.13,i%2?'#6b5f5a':'#aaa4af',450,1);
      ctx.restore();
    });
  }else if(m.preset==='hub'){
    const cy=h*(portrait?.23:.5),cw=w*(portrait?.83:.31),ch=h*(portrait?.14:.2);
    const positions=nodes.map((_,i)=>portrait?[w/2,h*(.4+i*.14)]:[[w*.21,h*.29],[w*.79,h*.29],[w*.21,h*.75],[w*.79,h*.75]][i]);
    positions.forEach(([x,y],i)=>{
      const p=progress(nodes[i]);line(ctx,portrait?[w/2,cy+ch/2]:[w/2+(i%2?cw/2:-cw/2),cy],[x,y],p,color+'66',b*.002);
      if(p>0)dot(ctx,(w/2)+(x-w/2)*((t*.32+i*.2)%1),cy+(y-cy)*((t*.32+i*.2)%1),b*.004,color);
    });
    panel(ctx,(w-cw)/2,cy-ch/2,cw,ch,b*.026,color,null);ctx.textAlign='center';label(ctx,m.text,w/2,cy,b*.034,cw*.87,'#231914',650,3);
    nodes.forEach((node,i)=>card(ctx,node,...positions[i],w*(portrait?.78:.25),h*(portrait?.105:.22),b,color,i,progress(node)));
  }else{
    const n=nodes.length,isSequence=m.preset==='sequence',isCompare=m.preset==='compare',grid=m.preset==='cards'&&n>2;
    let positions,cardW,cardH;
    if(portrait){cardW=w*.8;cardH=h*(n>2?.12:.18);positions=nodes.map((_,i)=>[w/2,h*(n>2?.35:.42)+i*(cardH+h*.035)]);}
    else if(grid){cardW=w*.33;cardH=h*.23;positions=nodes.map((_,i)=>[w*(i%2?.685:.315),h*(i<2?.44:.72)]);}
    else{cardW=Math.min(w*.34,w*.8/n-w*.02);cardH=h*.31;positions=nodes.map((_,i)=>[w/2+(i-(n-1)/2)*(cardW+w*.035),h*.56]);}
    if(isSequence)positions.forEach(([x,y],i)=>{if(!i)return;const prev=positions[i-1],p=progress(nodes[i]);line(ctx,portrait?[prev[0],prev[1]+cardH/2]:[prev[0]+cardW/2,prev[1]],portrait?[x,y-cardH/2]:[x-cardW/2,y],p,color,b*.003);});
    if(isCompare&&!portrait){label(ctx,'↔',w/2,h*.56,b*.035,w*.08,color,500,1);}
    nodes.forEach((node,i)=>card(ctx,node,...positions[i],cardW,cardH,b,color,i,progress(node),{light:isCompare&&i===1}));
  }
  if(m.detail&&m.preset!=='stat'){ctx.textAlign='center';label(ctx,m.detail,w/2,h*.93,b*.022,w*.8,'#9b939e',450,2);}
  ctx.restore();
}
export function drawFullMotion(ctx,canvas,motions,time) {
  const scenes=motions.filter(m=>m.text).slice().sort((a,b)=>a.start-b.start);
  let index=scenes.findLastIndex(m=>m.start<=time);
  if(index<0)index=0;
  const m=scenes[index]||{text:'Votre voix, en mouvement',accent:'mouvement',preset:'editorial',start:0,color:'#ff916d'};
  const local=Math.max(0,time-m.start),{width:w,height:h}=canvas;
  background(ctx,w,h,time,m.color||'#ff916d');
  const transition=clamp(local/.38);
  // Hold each composition through silences, with a short outgoing/incoming move.
  if(index>0&&transition<1){ctx.save();ctx.globalAlpha=1-transition;ctx.translate(-w*.025*transition,0);scene(ctx,canvas,scenes[index-1],time-scenes[index-1].start,index-1);ctx.restore();}
  ctx.save();ctx.globalAlpha=index===0?1:transition;ctx.translate(index? w*.025*(1-ease(transition)):0,0);scene(ctx,canvas,m,local,index);ctx.restore();
}
