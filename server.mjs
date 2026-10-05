import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual,randomBytes} from 'node:crypto';
import {PLAN_SCHEMA,DIRECTOR_PROMPT,validateWords,planToMotions} from './motion-plan.mjs';

const ROOT=new URL('./',import.meta.url);
const PUBLIC=new Set(['index.html','style.css','main.js','project.mjs','render.mjs','autocut.mjs','motion-plan.mjs','audio.mjs']);
const MAX_AUDIO=20_000_000;
const error=(status,message)=>Object.assign(new Error(message),{status});
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
function authenticate(req,token){const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${token}`);return !!token&&supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_AUDIO)throw error(413,'La piste audio dépasse la limite de 10 minutes.');chunks.push(chunk);}return Buffer.concat(chunks);}
export function wavDuration(bytes){
  if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.toString('ascii',12,16)!=='fmt '||bytes.readUInt32LE(16)!==16||bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==16000||bytes.readUInt16LE(34)!==16||bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44)throw error(400,'La piste audio doit être un WAV mono PCM 16 kHz.');
  const duration=(bytes.length-44)/32000;if(duration<=0||duration>600)throw error(400,'La piste doit durer entre 0 et 600 secondes.');return duration;
}
export async function analyzeAudio(bytes,{apiKey,model='gpt-4o-mini',fetchImpl=fetch,signal}={}) {
  const duration=wavDuration(bytes);
  const request=async(path,options)=>{
    const response=await fetchImpl(`https://api.openai.com/v1/${path}`,{...options,headers:{...options.headers,Authorization:`Bearer ${apiKey}`},signal});
    if(!response.ok){const message=response.status===401?'La clé OpenAI configurée sur le serveur est invalide.':response.status===429?'Le quota ou la limite OpenAI est atteint. Vérifiez le compte du serveur.':'Le service IA n’a pas pu terminer l’analyse. Réessayez plus tard.';throw error(502,message);}
    return response.json();
  };
  const form=new FormData();form.set('file',new Blob([bytes],{type:'audio/wav'}),'montage.wav');form.set('model','whisper-1');form.set('response_format','verbose_json');form.append('timestamp_granularities[]','word');form.set('language','fr');
  const transcript=await request('audio/transcriptions',{method:'POST',body:form});
  const words=validateWords(transcript.words,duration);
  const response=await request('responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:7000,instructions:DIRECTOR_PROMPT,input:JSON.stringify({duration,words:words.map((word,i)=>[i,word.word,Number(word.start.toFixed(2)),Number(word.end.toFixed(2))])}),text:{format:{type:'json_schema',name:'motion_design_plan',strict:true,schema:PLAN_SCHEMA}}})});
  if(response.status==='incomplete')throw error(502,'Le plan visuel est incomplet. Essayez un montage plus court.');
  const content=response.output?.flatMap(item=>item.content||[])||[];
  if(content.some(item=>item.type==='refusal'))throw error(422,'Le service IA n’a pas pu proposer de visuels pour ce contenu.');
  let plan;try{plan=JSON.parse(content.filter(item=>item.type==='output_text').map(item=>item.text).join(''));planToMotions(plan,words,duration);}catch{throw error(502,'Le plan visuel reçu est invalide. Le montage est conservé.');}
  return {words,plan,duration};
}
export function createStudioServer({apiKey=process.env.OPENAI_API_KEY,token=process.env.STUDIO_ACCESS_TOKEN,model=process.env.OPENAI_MOTION_MODEL||'gpt-4o-mini',origins=(process.env.ALLOWED_ORIGINS||'http://localhost:8787,http://127.0.0.1:8787,https://lurnschool.github.io').split(',').map(value=>value.trim()),analyze=analyzeAudio,localSession=process.env.STUDIO_LOCAL_SESSION==='1'}={}) {
  let busy=false;
  const sessionToken=randomBytes(32).toString('hex');
  const isLocalBrowser=req=>{
    const port=req.socket.localPort,host=req.headers.host;
    return localSession&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&[`127.0.0.1:${port}`,`localhost:${port}`].includes(host)&&req.headers['sec-fetch-site']==='same-origin'&&(!req.headers.origin||req.headers.origin===`http://${host}`);
  };
  const hasLocalSession=req=>isLocalBrowser(req)&&(req.headers.cookie||'').split(';').some(cookie=>cookie.trim()===`studio_session=${sessionToken}`);
  return http.createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      const origin=req.headers.origin;
      if(origin&&!origins.includes(origin))throw error(403,'Cette origine n’est pas autorisée.');
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(path==='/api/health'&&req.method==='GET'){json(res,200,{ready:!!apiKey&&!!token,localSession:isLocalBrowser(req)});return;}
      if(path==='/api/local-session'&&req.method==='POST'){
        if(!isLocalBrowser(req)||!req.headers.origin)throw error(403,'La connexion automatique est réservée au studio local.');
        res.setHeader('Set-Cookie',`studio_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200`);
        json(res,200,{ready:!!apiKey&&!!token});return;
      }
      if(path==='/api/analyze'&&req.method==='POST'){
        if(!apiKey||!token)throw error(503,'Le service IA n’est pas encore configuré. Ajoutez la clé OpenAI et le code d’accès côté serveur.');
        if(!authenticate(req,token)&&!hasLocalSession(req))throw error(401,'Le code d’accès du service IA est incorrect.');
        if(busy)throw error(429,'Une analyse est déjà en cours. Réessayez après sa fin.');
        if(!req.headers['content-type']?.startsWith('audio/wav'))throw error(415,'Une piste WAV est requise.');
        if(Number(req.headers['content-length'])>MAX_AUDIO)throw error(413,'La piste audio est trop volumineuse.');
        busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),240000);
        res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        try{const bytes=await body(req);wavDuration(bytes);const result=await analyze(bytes,{apiKey,model,signal:controller.signal});if(!res.destroyed)json(res,200,result);}
        finally{busy=false;clearTimeout(timer);}return;
      }
      if(req.method==='GET'){
        const name=path==='/'?'index.html':path.slice(1);
        if(PUBLIC.has(name)){const bytes=await readFile(new URL(name,ROOT));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff'});res.end(bytes);return;}
      }
      throw error(404,'Ressource introuvable.');
    }catch(cause){if(!res.headersSent&&!res.destroyed)json(res,cause.status||500,{error:cause.status?cause.message:cause.name==='AbortError'?'Analyse interrompue ou délai dépassé.':'L’analyse a échoué. Le montage est conservé.'});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||8787),host=process.env.HOST||'127.0.0.1';
  createStudioServer().listen(port,host,()=>console.log(`Studio Vidéo : http://${host}:${port} — IA ${process.env.OPENAI_API_KEY&&process.env.STUDIO_ACCESS_TOKEN?'configurée':'à configurer'}`));
}
