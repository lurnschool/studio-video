import {applyMontage} from './autopilot.mjs';
import {DIAGRAMS, validateWords, planToMotions} from './motion-plan.mjs';
import {montageAudio} from './audio.mjs';
import { MIN_CLIP, length, duration, locate, splitAt, removeRange, validateProject, clone, uid } from './project.mjs';
import { audioEnvelope, findPauseCuts } from './autocut.mjs';
import { dimensions, drawComposition } from './render.mjs';
const $ = selector => document.querySelector(selector);
const video = $('#previewVideo'), canvas = $('#previewCanvas'), ctx = canvas.getContext('2d');
const state = { media: [], clips: [], motions: [], format: '16:9', selected: null, motionId: null, position: 0, playing: false, loading: false, exporting: false, cancel: false, muted: false, analyzing: false, report: null };
const history = [], future = [];
let toastTimer, loadToken = 0, resultUrl, aiController, localAiSession=false;
const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const mediaFor = clip => state.media.find(item => item.id === clip?.mediaId);
const total = () => duration(state.clips);
const timeLabel = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2,'0')}:${(Math.max(0,seconds)%60).toFixed(2).padStart(5,'0')}`;
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500); }
function snapshot() { return clone({ clips:state.clips, motions:state.motions, format:state.format, selected:state.selected, motionId:state.motionId, position:state.position, report:state.report }); }
function checkpoint() { history.push(snapshot()); if(history.length>60)history.shift(); future.length=0; state.report=null; }
function pause() { state.playing=false; video.pause(); renderClock(); }
function recordEdit(edit) { pause(); checkpoint(); state.report=null; edit(); state.position=Math.min(state.position,total()); render(); void seek(state.position); }
function restore(from,to) { if(!from.length || state.exporting)return; pause(); to.push(snapshot()); Object.assign(state,from.pop()); render(); fillMotionForm(); void seek(state.position); }
function waitMedia(target, event, timeout=15000) { return new Promise((resolve,reject)=>{ const cleanup=()=>{clearTimeout(timer);target.removeEventListener(event,done);target.removeEventListener('error',fail);}; const done=()=>{cleanup();resolve();}; const fail=()=>{cleanup();reject(new Error('Vidéo illisible dans ce navigateur.'));}; const timer=setTimeout(()=>{cleanup();reject(new Error('La vidéo ne répond pas.'));},timeout);target.addEventListener(event,done,{once:true});target.addEventListener('error',fail,{once:true}); }); }
async function prepare(target,url,position) { if(target.src!==url) { const ready=waitMedia(target,'loadedmetadata'); target.src=url; await ready; } if(Math.abs(target.currentTime-position)>0.0001) { const ready=waitMedia(target,'seeked');target.currentTime=position;await ready; } if(target.readyState<2)await waitMedia(target,'loadeddata'); }
function draw() { drawComposition(ctx,canvas,video,state.motions,state.position,locate(state.clips,state.position)?.clip.zoom||1); }
async function seek(position,autoplay=false) {
  const token=++loadToken; state.position=Math.min(total(),Math.max(0,position));state.loading=true;video.pause();renderClock();
  const point=locate(state.clips,state.position), media=mediaFor(point?.clip);
  try { if(point && media?.url) { await prepare(video,media.url,point.sourceTime);if(token!==loadToken)return; video.muted=state.muted; if(autoplay && state.position<total()) {await video.play();state.playing=true;} } else {state.playing=false;video.removeAttribute('src');video.load();} }
  catch(error) {if(token===loadToken){state.playing=false;toast(error.message);}}
  finally {if(token===loadToken){state.loading=false;renderClock();draw();}}
}
function renderClock() { $('#timeLabel').textContent=`${timeLabel(state.position)} / ${timeLabel(total())}`;$('#projectSeek').value=total()?state.position/total()*1000:0;$('#playBtn').textContent=state.playing?'Ⅱ':'▶';$('#playBtn').setAttribute('aria-label',state.playing?'Pause':'Lire'); if(document.activeElement!==$('#positionInput'))$('#positionInput').value=state.position.toFixed(3); $('#splitBtn').disabled=!state.clips.length||state.exporting||state.loading; }
function render() {
  const missing=state.media.filter(item=>!item.url && state.clips.some(clip=>clip.mediaId===item.id));
  $('#missingMedia').hidden=!missing.length;$('#missingMedia').textContent=`Réimportez les vidéos originales pour continuer : ${missing.map(item=>item.name).join(', ')}`;
  $('#mediaCount').textContent=state.media.length;$('#clipCount').textContent=`${state.clips.length} clip${state.clips.length>1?'s':''}`;$('#durationBadge').textContent=timeLabel(total());
  for(const id of ['playBtn','projectSeek','removeRangeBtn','stepBackBtn','stepForwardBtn','muteBtn','generateMotionBtn'])$('#'+id).disabled=!state.clips.length||state.exporting||!!missing.length;
  $('#autopilotBtn').disabled=!state.clips.length||state.exporting||state.analyzing||!!missing.length;
  renderAutopilotReport();
  $('#exportBtn').disabled=!state.clips.length||state.exporting||state.analyzing||!!missing.length;$('#autoCutBtn').disabled=!state.clips.length||state.exporting||state.analyzing||!!missing.length;$('#addClipBtn').disabled=!state.media.some(item=>item.url);$('#undoBtn').disabled=!history.length||state.exporting;$('#redoBtn').disabled=!future.length||state.exporting;
  $('#emptyPreview').hidden=!!state.clips.length;canvas.hidden=!state.clips.length;video.hidden=true;
  $('#formatSelect').value=state.format;[canvas.width,canvas.height]=dimensions(state.format);
  $('#previewFrame').style.aspectRatio=state.format.replace(':','/');
  $('#mediaList').innerHTML=state.media.length?state.media.map(item=>`<div class="media-item">${item.thumbnail?`<img class="media-thumb" src="${item.thumbnail}" alt="" />`:'<span class="media-thumb missing-icon">◇</span>'}<div class="media-meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${item.url?timeLabel(item.duration):'Vidéo à relier'}</small></div><button class="media-add" data-add="${item.id}" aria-label="Ajouter ${esc(item.name)} à la timeline" ${item.url?'':'disabled'}>＋</button></div>`).join(''):'<div class="empty-media">Vos clips apparaîtront ici.</div>';
  let offset=0;
  $('#timeline').innerHTML=state.clips.length?state.clips.map((clip,index)=>{const media=mediaFor(clip),start=offset;offset+=length(clip);return `<div class="clip-card ${clip.id===state.selected?'selected':''}"><button class="clip-select" data-select="${clip.id}" aria-label="Sélectionner le clip ${index+1}">${media?.thumbnail?`<img src="${media.thumbnail}" alt="" />`:''}<strong>${index+1}. ${esc(media?.name||'Vidéo manquante')}</strong><small>${timeLabel(length(clip))} · dès ${timeLabel(start)}</small></button><div class="clip-controls"><button data-move="${clip.id}" data-dir="-1" aria-label="Déplacer le clip ${index+1} à gauche" ${index?'':'disabled'}>←</button><button data-move="${clip.id}" data-dir="1" aria-label="Déplacer le clip ${index+1} à droite" ${index===state.clips.length-1?'disabled':''}>→</button><button data-remove="${clip.id}" aria-label="Supprimer le clip ${index+1}">×</button></div></div>`;}).join(''):'<div class="timeline-empty"><span>✦</span><strong>Prêt à créer ?</strong><p>Importez une vidéo pour commencer.</p></div>';
  renderInspector();renderMotions();renderClock();draw();
}
function renderInspector() {const clip=state.clips.find(item=>item.id===state.selected);const box=$('#clipInspector');if(!clip){box.textContent='Sélectionnez un clip pour ajuster ses points de coupe.';return;}const media=mediaFor(clip);box.innerHTML=`<div class="selected-name">${esc(media.name)}</div><div class="trim-row"><label>Début source (s)<input id="trimStart" type="number" min="0" step="0.001" value="${clip.start}" /></label><label>Fin source (s)<input id="trimEnd" type="number" min="0" step="0.001" value="${clip.end}" /></label></div><label class="field-label" for="clipZoom">Zoom du clip</label><select id="clipZoom"><option value="1" ${(clip.zoom||1)===1?'selected':''}>100 % · original</option><option value="1.1" ${clip.zoom===1.1?'selected':''}>110 % · léger</option><option value="1.2" ${clip.zoom===1.2?'selected':''}>120 % · rapproché</option><option value="1.35" ${clip.zoom===1.35?'selected':''}>135 % · accent</option></select><p class="field-help">Durée : ${timeLabel(length(clip))}. Les fichiers originaux sont conservés.</p>`;}
const presetNames={sequence:'Étapes et flèches',compare:'Comparaison',hub:'Idées reliées',stat:'Chiffre clé',editorial:'Mots éditoriaux',gradient:'Carton violet',fade:'Fondu',pop:'Pop',lower:'Bandeau',type:'Texte progressif'};
function renderMotions() {$('#motionList').innerHTML=state.motions.length?state.motions.map(motion=>`<div class="motion-item ${state.motionId===motion.id?'selected':''}"><button data-motion="${motion.id}"><span style="background:${motion.color}"></span><strong>${esc(motion.text||'Sans texte')}</strong><small>${presetNames[motion.preset]} · ${timeLabel(motion.start)} → ${timeLabel(motion.start+motion.duration)}</small></button><button data-delete-motion="${motion.id}" aria-label="Supprimer l’animation ${esc(motion.text)}">×</button></div>`).join(''):'<p class="field-help">Ajoutez des mots clés et des bandeaux aux moments importants.</p>';}
function fillMotionForm() {const motion=state.motions.find(item=>item.id===state.motionId);$('#captionInput').value=motion?.text||'';$('#motionPreset').value=motion?.preset||'editorial';$('#motionStart').value=motion?.start??Number(state.position.toFixed(2));$('#motionDuration').value=motion?.duration??2;$('#motionColor').value=motion?.color||'#6736ee';$('#motionAccent').value=motion?.accent||'';$('#motionDetail').value=motion?.detail||'';$('#motionPosition').value=motion?.position||'left';$('#saveMotionBtn').textContent=motion?'Appliquer les changements':'Ajouter cette animation';renderMotions();fillNodeForm(motion);}
async function importFiles(files) {
  if(state.exporting)return;pause();let added=0;
  for(const file of files) {if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(file.name))continue;const url=URL.createObjectURL(file),probe=document.createElement('video');probe.muted=true;
    try {await prepare(probe,url,0);const seconds=probe.duration;if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Durée invalide.');const thumb=document.createElement('canvas');thumb.width=160;thumb.height=90;thumb.getContext('2d').drawImage(probe,0,0,160,90);
      const pending=state.media.find(item=>!item.url&&item.name===file.name&&item.size===file.size);
      if(pending){if(Math.abs(pending.duration-seconds)>0.1)throw new Error('Cette vidéo ne correspond pas à la source du projet.');Object.assign(pending,{url,file,thumbnail:thumb.toDataURL('image/jpeg',0.7)});}
      else {checkpoint();const item={id:uid(),name:file.name,size:file.size,lastModified:file.lastModified,duration:seconds,url,file,thumbnail:thumb.toDataURL('image/jpeg',0.7)};state.media.push(item);const clip={id:uid(),mediaId:item.id,start:0,end:seconds};state.clips.push(clip);state.selected=clip.id;added++;}
    } catch(error){URL.revokeObjectURL(url);toast(`${file.name} : ${error.message}`);}finally{probe.removeAttribute('src');probe.load();}
  }
  render();await seek(state.position);if(added)toast(`${added} vidéo${added>1?'s':''} ajoutée${added>1?'s':''}.`);
}
$('#fileInput').addEventListener('change',async event=>{await importFiles(event.target.files);event.target.value='';});
for(const name of ['dragenter','dragover'])$('.upload-zone').addEventListener(name,event=>{event.preventDefault();$('.upload-zone').classList.add('drag-over');});
for(const name of ['dragleave','drop'])$('.upload-zone').addEventListener(name,event=>{event.preventDefault();$('.upload-zone').classList.remove('drag-over');});
$('.upload-zone').addEventListener('drop',event=>importFiles(event.dataTransfer.files));
$('#mediaList').addEventListener('click',event=>{const button=event.target.closest('[data-add]');if(!button)return;const media=state.media.find(item=>item.id===button.dataset.add);recordEdit(()=>{const clip={id:uid(),mediaId:media.id,start:0,end:media.duration};state.clips.push(clip);state.selected=clip.id;});});
$('#addClipBtn').addEventListener('click',()=>$('#mediaList [data-add]:not(:disabled)')?.click());
$('#timeline').addEventListener('click',event=>{
 const select=event.target.closest('[data-select]');if(select){pause();state.selected=select.dataset.select;const index=state.clips.findIndex(clip=>clip.id===state.selected);render();void seek(duration(state.clips.slice(0,index)));return;}
 const move=event.target.closest('[data-move]');if(move){const index=state.clips.findIndex(clip=>clip.id===move.dataset.move),next=index+Number(move.dataset.dir);if(next>=0&&next<state.clips.length)recordEdit(()=>{[state.clips[index],state.clips[next]]=[state.clips[next],state.clips[index]];});return;}
 const remove=event.target.closest('[data-remove]');if(remove){const index=state.clips.findIndex(clip=>clip.id===remove.dataset.remove),start=duration(state.clips.slice(0,index));recordEdit(()=>{const edited=removeRange(state,start,start+length(state.clips[index]));state.clips=edited.clips;state.motions=edited.motions;state.selected=state.clips[0]?.id??null;state.position=start;});fillMotionForm();}
});
$('#splitBtn').addEventListener('click',()=>{const clips=splitAt(state.clips,state.position);if(!clips){toast('Placez le curseur à l’intérieur d’un clip, à au moins une image de ses bords.');return;}recordEdit(()=>{state.clips=clips;state.selected=locate(clips,state.position)?.clip.id;});toast('Clip coupé en deux.');});
$('#removeRangeBtn').addEventListener('click',()=>{try{const start=Number($('#removeStart').value),end=Number($('#removeEnd').value),edited=removeRange(state,start,end);recordEdit(()=>{state.clips=edited.clips;state.motions=edited.motions;state.selected=state.clips[0]?.id??null;state.position=start;});fillMotionForm();toast('Passage retiré. Les animations suivantes ont été décalées.');}catch(error){toast(error.message);}});
$('#clipInspector').addEventListener('change',event=>{if(event.target.id==='clipZoom'){recordEdit(()=>{state.clips.find(item=>item.id===state.selected).zoom=Number(event.target.value);});return;}if(!['trimStart','trimEnd'].includes(event.target.id))return;const clip=state.clips.find(item=>item.id===state.selected),start=Number($('#trimStart').value),end=Number($('#trimEnd').value);if(!clip||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>mediaFor(clip).duration||end-start<MIN_CLIP){toast('La coupe doit rester dans la source et garder au moins une image.');renderInspector();return;}recordEdit(()=>{clip.start=start;clip.end=end;});});
$('#newMotionBtn').addEventListener('click',()=>{state.motionId=null;fillMotionForm();$('#captionInput').focus();});
$('#saveMotionBtn').addEventListener('click',()=>{const motion={id:state.motionId||uid(),text:$('#captionInput').value.trim(),preset:$('#motionPreset').value,start:Number($('#motionStart').value),duration:Number($('#motionDuration').value),color:$('#motionColor').value,position:$('#motionPosition').value,accent:$('#motionAccent').value.trim(),detail:$('#motionDetail').value.trim()};motion.nodes=readNodeForm();motion.origin='manual';if(DIAGRAMS.includes(motion.preset)&&(!motion.nodes.length||(motion.preset==='compare'&&motion.nodes.length!==2)||(motion.preset==='stat'&&motion.nodes.length!==1)||(['sequence','hub'].includes(motion.preset)&&motion.nodes.length<2)||motion.nodes.some(node=>!node.label||!Number.isFinite(node.at)||node.at<0||node.at>=motion.duration))){toast('Ajoutez des blocs valides avec une apparition dans la durée du schéma (deux blocs pour une comparaison).');return;}if(!motion.text||!Number.isFinite(motion.start)||motion.start<0||!Number.isFinite(motion.duration)||motion.duration<MIN_CLIP){toast('Ajoutez un texte, un début et une durée valides.');return;}recordEdit(()=>{const index=state.motions.findIndex(item=>item.id===motion.id);if(index>=0)state.motions[index]=motion;else state.motions.push(motion);state.motionId=motion.id;state.position=Math.min(total(),motion.start+Math.min(.5,motion.duration/2));});fillMotionForm();});
$('#motionList').addEventListener('click',event=>{const button=event.target.closest('[data-motion]'),remove=event.target.closest('[data-delete-motion]');if(button){state.motionId=button.dataset.motion;fillMotionForm();const motion=state.motions.find(item=>item.id===state.motionId);pause();void seek(motion.start+Math.min(.5,motion.duration/2));}if(remove){recordEdit(()=>{state.motions=state.motions.filter(item=>item.id!==remove.dataset.deleteMotion);state.motionId=null;});fillMotionForm();}});
$('#formatSelect').addEventListener('change',event=>recordEdit(()=>{state.format=event.target.value;}));
$('#undoBtn').addEventListener('click',()=>restore(history,future));$('#redoBtn').addEventListener('click',()=>restore(future,history));
$('#playBtn').addEventListener('click',async()=>{if(state.playing){pause();return;}await seek(state.position>=total()-.01?0:state.position,true);});
$('#projectSeek').addEventListener('input',event=>{pause();void seek(Number(event.target.value)/1000*total());});
$('#positionInput').addEventListener('change',event=>{pause();void seek(Number(event.target.value)||0);});
$('#stepBackBtn').addEventListener('click',()=>{pause();void seek(state.position-1/30);});$('#stepForwardBtn').addEventListener('click',()=>{pause();void seek(state.position+1/30);});
$('#muteBtn').addEventListener('click',()=>{state.muted=!state.muted;video.muted=state.muted;$('#muteBtn').textContent=state.muted?'♩':'♫';$('#muteBtn').setAttribute('aria-label',state.muted?'Activer le son de l’aperçu':'Couper le son de l’aperçu');});
document.addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select')||state.exporting||state.analyzing||!$('#demoModal').hidden)return;if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();restore(event.shiftKey?future:history,event.shiftKey?history:future);}if(event.key.toLowerCase()==='s'&&!event.metaKey&&!event.ctrlKey){event.preventDefault();$('#splitBtn').click();}if(event.code==='Space'){event.preventDefault();$('#playBtn').click();}});
function tick(){if(state.playing&&!state.loading){const point=locate(state.clips,state.position);if(point){state.position=point.offset+Math.min(length(point.clip),Math.max(0,video.currentTime-point.clip.start));if(video.currentTime>=point.clip.end-.008||video.ended){const next=point.offset+length(point.clip);if(next>=total()-.001){state.position=total();pause();}else void seek(next+.000001,true);}}renderClock();draw();}requestAnimationFrame(tick);}
requestAnimationFrame(tick);
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('#saveProjectBtn').addEventListener('click',()=>{const project=validateProject({version:1,format:state.format,media:state.media,clips:state.clips,motions:state.motions});downloadBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'studio-video.projet.json');toast('Projet enregistré. Conservez aussi vos vidéos originales.');});
$('#openProjectBtn').addEventListener('click',()=>$('#projectInput').click());
$('#projectInput').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2_000_000)throw new Error('Le fichier de projet est trop volumineux.');const project=validateProject(JSON.parse(await file.text()));pause();const previous=state.media;project.media=project.media.map(item=>{const existing=previous.find(media=>media.name===item.name&&media.size===item.size&&Math.abs(media.duration-item.duration)<.1);return existing?{...item,url:existing.url,file:existing.file,thumbnail:existing.thumbnail}:item;});Object.assign(state,project,{selected:project.clips[0]?.id??null,motionId:null,position:0,report:null});history.length=0;future.length=0;render();fillMotionForm();await seek(0);toast('Projet ouvert. Réimportez les vidéos indiquées si nécessaire.');}catch(error){toast(error.message);}finally{event.target.value='';}});
async function exportVideo(){
 if(state.exporting||!state.clips.length)return;const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(type=>window.MediaRecorder?.isTypeSupported(type));if(!mime||!canvas.captureStream||!window.AudioContext){toast('Ce navigateur ne prend pas en charge l’export.');return;}
 pause();$('#resultPanel').hidden=true;state.exporting=true;state.cancel=false;$('.workspace').inert=true;$('.topbar').inert=true;$('#taskTitle').textContent='Export en cours';$('#exportModal').hidden=false;$('#exportProgress').style.width='0%';render();const clips=clone(state.clips),motions=clone(state.motions),output=document.createElement('canvas');[output.width,output.height]=dimensions(state.format);const outCtx=output.getContext('2d'),player=document.createElement('video');player.playsInline=true;player.preload='auto';let audio,stream,recorder,recordError,stopped,started=false;
 try{audio=new AudioContext();await audio.resume();const source=audio.createMediaElementSource(player),destination=audio.createMediaStreamDestination();source.connect(destination);stream=output.captureStream(30);destination.stream.getAudioTracks().forEach(track=>stream.addTrack(track));recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});const chunks=[];recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};stopped=new Promise(resolve=>{recorder.onstop=resolve;});recorder.onerror=event=>{recordError=event.error||new Error('Échec de l’encodage.');};let elapsed=0;
 for(let i=0;i<clips.length;i++){if(state.cancel)break;const clip=clips[i],media=mediaFor(clip);$('#exportStatus').textContent=`Clip ${i+1} sur ${clips.length}`;await prepare(player,media.url,clip.start);if(state.cancel)break;drawComposition(outCtx,output,player,motions,elapsed,clip.zoom||1);if(!started){recorder.start(500);started=true;}else recorder.resume();await player.play();
 await new Promise((resolve,reject)=>{let last=performance.now(),lastTime=player.currentTime;const frame=()=>{if(recordError){reject(recordError);return;}if(state.cancel||player.currentTime>=clip.end-.008||player.ended){player.pause();resolve();return;}if(player.currentTime!==lastTime){last=performance.now();lastTime=player.currentTime;}if(performance.now()-last>15000){reject(new Error('Lecture interrompue pendant l’export.'));return;}drawComposition(outCtx,output,player,motions,elapsed+Math.max(0,player.currentTime-clip.start),clip.zoom||1);$('#exportProgress').style.width=`${Math.min(100,(elapsed+player.currentTime-clip.start)/duration(clips)*100)}%`;setTimeout(frame,16);};frame();});elapsed+=length(clip);if(recorder.state==='recording')recorder.pause();}
 if(started&&recorder.state!=='inactive'){recorder.stop();await stopped;}if(recordError)throw recordError;if(state.cancel){toast('Export annulé.');return;}if(!chunks.length)throw new Error('Aucune vidéo produite.');if(resultUrl)URL.revokeObjectURL(resultUrl);const blob=new Blob(chunks,{type:recorder.mimeType||mime});resultUrl=URL.createObjectURL(blob);$('#downloadVideo').href=resultUrl;$('#downloadVideo').download=`studio-video.${mime.startsWith('video/mp4')?'mp4':'webm'}`;$('#resultPanel').hidden=false;toast('Export terminé. Cliquez sur Télécharger la vidéo.');
 }catch(error){toast(`Export impossible : ${error.message}`);}finally{player.pause();player.removeAttribute('src');player.load();if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(track=>track.stop());if(audio)await audio.close();state.exporting=false;$('#exportModal').hidden=true;$('.workspace').inert=false;$('.topbar').inert=false;render();}
}
$('#exportBtn').addEventListener('click',exportVideo);$('#cancelExportBtn').addEventListener('click',()=>{state.cancel=true;aiController?.abort();$('#exportStatus').textContent='Annulation…';});$('#closeResult').addEventListener('click',()=>{$('#resultPanel').hidden=true;});
render();fillMotionForm();

async function autoCut() {
 if(state.analyzing||state.exporting||!state.clips.length)return;
 pause();state.analyzing=true;state.cancel=false;$('#taskTitle').textContent='Montage automatique';$('#exportStatus').textContent='Analyse de la piste audio…';$('#exportProgress').style.width='0%';$('#exportModal').hidden=false;$('.workspace').inert=true;$('.topbar').inert=true;render();
 let audio;
 try {
  audio=new AudioContext({sampleRate:16000});
  const profile=$('#autoProfile').value, cuts=[];let offset=0;const before=total();
  for(let index=0;index<state.clips.length;index++){
   if(state.cancel)break;
   const clip=state.clips[index],media=mediaFor(clip);
   $('#exportStatus').textContent=`Analyse du clip ${index+1} sur ${state.clips.length}…`;
   if(!media.envelope){
    const bytes=media.file?await media.file.arrayBuffer():await fetch(media.url).then(response=>response.arrayBuffer());
    let decoded;
    try{decoded=await audio.decodeAudioData(bytes);}catch{throw new Error(`La piste audio de « ${media.name} » ne peut pas être analysée dans ce navigateur. Essayez une version MP4 avec son AAC.`);}
    media.envelope=audioEnvelope(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate);
   }
   const result=findPauseCuts(media.envelope,clip.start,clip.end,profile);
   cuts.push(...result.cuts.map(cut=>({start:offset+cut.start-clip.start,end:offset+cut.end-clip.start})));
   offset+=length(clip);$('#exportProgress').style.width=`${(index+1)/state.clips.length*100}%`;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(state.cancel){toast('Analyse annulée.');return;}
  if(!cuts.length){$('#autoSummary').textContent='Aucune pause suffisamment nette à retirer avec ce rythme. Le montage est conservé. Une musique continue ou du bruit peuvent limiter la détection.';toast('Analyse terminée : aucune coupe nécessaire.');return;}
  let edited={clips:clone(state.clips),motions:clone(state.motions)};
  for(const cut of cuts.sort((a,b)=>b.start-a.start))edited=removeRange(edited,cut.start,cut.end);
  checkpoint();state.clips=edited.clips;state.motions=edited.motions;
  if($('#autoZoom').checked)state.clips=state.clips.map((clip,index)=>({...clip,zoom:index%2?1.1:1}));
  state.position=0;state.selected=state.clips[0]?.id??null;state.motionId=null;
  const saved=before-total();$('#autoSummary').textContent=`${cuts.length} pause${cuts.length>1?'s':''} retirée${cuts.length>1?'s':''} · ${saved.toFixed(2)} s gagnées · ${timeLabel(before)} → ${timeLabel(total())}. Une marge de respiration est conservée autour des coupes. Écoutez l’aperçu pour vérifier le rythme. Cette opération peut être annulée.`;
  fillMotionForm();toast('Les cuts automatiques sont appliqués. Lancez l’aperçu pour vérifier le rythme.');
 }catch(error){toast(error.message);}finally{if(audio)await audio.close();state.analyzing=false;$('#exportModal').hidden=true;$('.workspace').inert=false;$('.topbar').inert=false;render();void seek(state.position);}
}
$('#autoCutBtn').addEventListener('click',autoCut);

function readNodeForm(){return [...$('#diagramNodes').children].map(row=>({label:row.querySelector('[data-label]').value.trim(),detail:row.querySelector('[data-detail]').value.trim(),at:Number(row.querySelector('[data-at]').value)}));}
function fillNodeForm(motion){
 const diagram=DIAGRAMS.includes($('#motionPreset').value);$('#diagramEditor').hidden=!diagram;
 let nodes=motion?.nodes?.length?motion.nodes:diagram?[{label:'Première idée',detail:'',at:0},{label:'Deuxième idée',detail:'',at:.8}]:[];
 if($('#motionPreset').value==='stat')nodes=nodes.slice(0,1);
 $('#diagramNodes').innerHTML=nodes.map((node,i)=>`<div class="node-field"><label>Bloc ${i+1}<input data-label maxlength="45" value="${esc(node.label)}" aria-label="Titre du bloc ${i+1}" /></label><input data-detail maxlength="75" value="${esc(node.detail)}" placeholder="Explication courte" aria-label="Détail du bloc ${i+1}" /><label>Apparition dans le schéma (s)<input data-at type="number" min="0" step="0.1" value="${node.at}" aria-label="Apparition du bloc ${i+1}" /></label><button class="text-button" data-remove-node="${i}">Retirer ce bloc</button></div>`).join('');
 $('#addNodeBtn').disabled=nodes.length>=4||$('#motionPreset').value==='stat';
}
$('#motionPreset').addEventListener('change',()=>fillNodeForm({nodes:readNodeForm()}));
$('#addNodeBtn').addEventListener('click',()=>{const nodes=readNodeForm();if(nodes.length>=4)return;nodes.push({label:'Nouvelle idée',detail:'',at:Math.min(1.5,Math.max(0,Number($('#motionDuration').value)-.2))});fillNodeForm({nodes});});
$('#diagramNodes').addEventListener('click',event=>{const button=event.target.closest('[data-remove-node]');if(button){const nodes=readNodeForm().filter((_,i)=>i!==Number(button.dataset.removeNode));fillNodeForm({nodes});}});
function aiAddress(){const raw=$('#aiEndpoint').value.trim();if(!raw)throw new Error('Configurez le service IA pour analyser votre voix.');const url=new URL(raw);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new Error('Utilisez une adresse HTTPS de service, ou une adresse locale.');return url.origin;}
if(location.port==='8787')$('#aiEndpoint').value=location.origin;
$('#checkAiBtn').addEventListener('click',async()=>{try{const endpoint=aiAddress(),response=await fetch(`${endpoint}/api/health`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Service indisponible à cette adresse.');const data=await response.json();$('#aiSummary').textContent=data.ready?(localAiSession&&endpoint===location.origin?'Service IA local connecté. Autorisez l’envoi audio pour générer vos visuels.':'Service IA disponible. Saisissez son code d’accès et autorisez l’envoi audio.'):'Serveur joignable. La clé OpenAI et le code d’accès restent à configurer.';}catch(error){$('#aiSummary').textContent=error.message;}});
$('#generateMotionBtn').addEventListener('click',async()=>{
 if(state.analyzing||state.exporting||!state.clips.length)return;
 let endpoint;try{endpoint=aiAddress();if(!(localAiSession&&endpoint===location.origin)&&!$('#aiToken').value.trim())throw new Error('Saisissez le code d’accès privé du service.');if(!$('#aiConsent').checked)throw new Error('Autorisez l’envoi de l’audio pour générer les visuels.');}catch(error){$('#aiConnection').open=true;$('#aiSummary').textContent=error.message;return;}
 pause();state.analyzing=true;state.cancel=false;aiController=new AbortController();
 $('.workspace').inert=true;$('.topbar').inert=true;$('#taskTitle').textContent='Création du motion design';$('#exportProgress').style.width='8%';$('#exportModal').hidden=false;render();
 try{
   const wav=await montageAudio(state.clips,state.media,message=>{$('#exportStatus').textContent=message;},aiController.signal);
   $('#exportProgress').style.width='35%';$('#exportStatus').textContent='Transcription de la voix et composition des schémas…';
   const response=await fetch(`${endpoint}/api/analyze`,{method:'POST',headers:{'Content-Type':'audio/wav',...(localAiSession&&endpoint===location.origin?{}:{Authorization:`Bearer ${$('#aiToken').value.trim()}`})},body:wav,signal:AbortSignal.any([aiController.signal,AbortSignal.timeout(250000)])});
   const data=await response.json();if(!response.ok)throw new Error(data.error||'Le service IA n’a pas terminé l’analyse.');
   const words=validateWords(data.words,total()),motions=planToMotions(data.plan,words,total());
   if(state.cancel)return;
   checkpoint();state.motions=[...state.motions.filter(motion=>motion.origin!=='ai'),...motions];state.motionId=motions[0]?.id??null;state.position=motions[0]?.start??0;
   $('#transcriptText').textContent=words.map(word=>word.word).join(' ');$('#transcriptPanel').hidden=false;
   $('#aiSummary').textContent=motions.length?`${motions.length} visuel${motions.length>1?'s':''} créé${motions.length>1?'s':''} à partir de votre voix. Ils sont placés sur le montage et restent modifiables. Vérifiez les textes et le rythme dans l’aperçu.`:'La voix a été transcrite, mais aucun visuel pertinent n’a été proposé pour ce passage.';
   fillMotionForm();toast('Analyse terminée. Les visuels sont prêts à être vérifiés.');
 }catch(error){const message=state.cancel?'Création annulée. Le montage est conservé.':error.name==='TimeoutError'?'L’analyse a dépassé le délai. Réessayez avec un montage plus court.':error.message;$('#aiSummary').textContent=message;toast(message);}
 finally{state.analyzing=false;aiController=null;$('#exportModal').hidden=true;$('.workspace').inert=false;$('.topbar').inert=false;render();void seek(state.position);}
});

const demoCanvas=$('#demoCanvas'),demoCtx=demoCanvas.getContext('2d');let demoStart=0,demoKind='sequence',demoFrame;
const demoScenes={
 sequence:{text:'Un parcours en trois étapes',detail:'Chaque étape apparaît au moment où elle est évoquée.',nodes:[{label:'Attirer',detail:'Faire découvrir votre offre',at:.3},{label:'Convertir',detail:'Transformer l’intérêt en action',at:1.6},{label:'Fidéliser',detail:'Construire la relation',at:3}]},
 compare:{text:'Deux façons de créer',detail:'Une comparaison structurée à partir des paroles.',nodes:[{label:'Tout faire à la main',detail:'Couper, titrer, animer',at:.3},{label:'Partir de sa voix',detail:'Expliquer, générer, ajuster',at:1.8}]},
 hub:{text:'Une idée, plusieurs leviers',detail:'Les liens se dessinent progressivement.',nodes:[{label:'Le message',detail:'Ce que l’on veut transmettre',at:.3},{label:'La voix',detail:'Le rythme de l’explication',at:1.3},{label:'Les visuels',detail:'Rendre l’idée plus claire',at:2.3},{label:'Le montage',detail:'Garder l’attention',at:3.3}]},
 stat:{text:'Un chiffre pour illustrer une idée',detail:'',nodes:[{label:'3',detail:'étapes dans cet exemple',at:.4}]}
};
function animateDemo(){if($('#demoModal').hidden)return;const time=((performance.now()-demoStart)/1000)%7;drawComposition(demoCtx,demoCanvas,{readyState:0},[{...demoScenes[demoKind],preset:demoKind,color:'#6736ee',start:0,duration:7}],time);demoFrame=requestAnimationFrame(animateDemo);}
$('#demoMotionBtn').addEventListener('click',()=>{$('#demoModal').hidden=false;$('.workspace').inert=true;$('.topbar').inert=true;demoStart=performance.now();animateDemo();});
$('#closeDemo').addEventListener('click',()=>{$('#demoModal').hidden=true;$('.workspace').inert=false;$('.topbar').inert=false;cancelAnimationFrame(demoFrame);});
$('.demo-types').addEventListener('click',event=>{const button=event.target.closest('[data-demo]');if(button){demoKind=button.dataset.demo;demoStart=performance.now();$('.demo-top h2').textContent=demoScenes[demoKind].text;for(const item of $('.demo-types').children)item.classList.toggle('active',item===button);}});

async function connectLocalStudio(){
 if(location.protocol!=='http:'||!['localhost','127.0.0.1'].includes(location.hostname))return;
 try{const health=await fetch('/api/health',{signal:AbortSignal.timeout(3000)});if(!health.ok)return;const status=await health.json();if(!status.localSession)return;const response=await fetch('/api/local-session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)return;const session=await response.json();localAiSession=true;$('#aiEndpoint').value=location.origin;$('#aiToken').hidden=true;$('label[for="aiToken"]').hidden=true;$('#aiSummary').textContent=session.ready?'Service IA local connecté. Autorisez l’envoi audio pour générer vos visuels.':'Studio local connecté. La clé OpenAI reste à configurer.';}catch{}
}
$('#aiEndpoint').addEventListener('input',()=>{const same=localAiSession&&$('#aiEndpoint').value.trim().replace(/\/$/,'')===location.origin;$('#aiToken').hidden=same;$('label[for="aiToken"]').hidden=same;});
void connectLocalStudio();

function renderAutopilotReport(){
 const report=state.report;$('#autopilotReport').hidden=!report;
 if(!report)return;
 $('#autopilotSummary').textContent=`${timeLabel(report.before)} → ${timeLabel(report.after)} · ${report.cuts.length} coupe${report.cuts.length===1?'':'s'} · ${report.visuals} animation${report.visuals===1?'':'s'}. Écoutez le résultat pour vérifier le sens et le rythme.`;
 $('#autopilotCuts').innerHTML=report.cuts.length?report.cuts.map(c=>`<li><strong>${esc(c.reason)}</strong> · ${timeLabel(c.start)} à ${timeLabel(c.end)} dans le montage de départ</li>`).join(''):'<li>Aucune coupe nécessaire pour ce passage.</li>';
 $('#undoAutopilotBtn').disabled=!history.length||state.analyzing||state.exporting;
}
$('#undoAutopilotBtn').addEventListener('click',()=>{restore(history,future);$('#resultPanel').hidden=true;$('#autopilotStatus').textContent='Montage annulé. La version précédente est rétablie.';});
$('#autopilotBtn').addEventListener('click',async()=>{
 if(state.analyzing||state.exporting||!state.clips.length)return;
 let endpoint;
 try{endpoint=aiAddress();if(!(localAiSession&&endpoint===location.origin)&&!$('#aiToken').value.trim())throw new Error('Connectez le service IA pour confier le montage à votre monteur.');if(!$('#aiConsent').checked)throw new Error('Cochez l’autorisation d’envoi audio au-dessus du bouton pour lancer le montage.');}
 catch(error){$('#autopilotStatus').textContent=error.message;if(!$('#aiEndpoint').value||(!(localAiSession&&endpoint===location.origin)&&!$('#aiToken').value.trim()))$('#aiConnection').open=true;return;}
 const before=total(),source=snapshot(),shouldExport=$('#autoExport').checked;
 pause();state.analyzing=true;state.cancel=false;aiController=new AbortController();
 $('.workspace').inert=true;$('.topbar').inert=true;$('#resultPanel').hidden=true;$('#taskTitle').textContent='Votre monteur IA travaille';$('#exportProgress').style.width='8%';$('#exportModal').hidden=false;render();
 let applied=false;
 try{
  const wav=await montageAudio(source.clips,state.media,message=>{$('#exportStatus').textContent=message;},aiController.signal);
  $('#exportProgress').style.width='30%';$('#exportStatus').textContent='Écoute de la voix, choix des coupes et composition des animations…';
  const response=await fetch(`${endpoint}/api/montage?pace=${encodeURIComponent($('#autoProfile').value)}`,{method:'POST',headers:{'Content-Type':'audio/wav',...(localAiSession&&endpoint===location.origin?{}:{Authorization:`Bearer ${$('#aiToken').value.trim()}`})},body:wav,signal:AbortSignal.any([aiController.signal,AbortSignal.timeout(430000)])});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Le monteur IA n’a pas pu terminer.');
  aiController.signal.throwIfAborted();
  const result=applyMontage(source,data,{zoom:$('#autoZoom').checked});
  checkpoint();Object.assign(state,{clips:result.clips,motions:result.motions,position:0,selected:result.clips[0]?.id??null,motionId:result.motions.find(m=>m.origin==='ai')?.id??null,report:{before,after:data.duration,cuts:data.cuts,visuals:result.motions.filter(m=>m.origin==='ai').length}});
  $('#transcriptText').textContent=result.words.map(w=>w.word).join(' ');$('#transcriptPanel').hidden=false;
  $('#autopilotStatus').textContent=shouldExport?'Montage créé. Préparation de la vidéo à télécharger…':'Montage créé. Lancez la lecture pour découvrir le résultat.';
  fillMotionForm();applied=true;
 }catch(error){$('#autopilotStatus').textContent=state.cancel?'Montage annulé. La version précédente est conservée.':error.name==='TimeoutError'?'Le montage a dépassé le délai. Essayez un passage plus court.':error.message;toast($('#autopilotStatus').textContent);}
 finally{state.analyzing=false;aiController=null;$('#exportModal').hidden=true;$('.workspace').inert=false;$('.topbar').inert=false;render();await seek(state.position);}
 if(applied&&shouldExport&&!state.cancel){await exportVideo();$('#autopilotStatus').textContent=$('#resultPanel').hidden?'Le montage est prêt dans l’aperçu. Vous pouvez relancer l’export.':'Votre montage complet est prêt à regarder et à télécharger.';}
});
