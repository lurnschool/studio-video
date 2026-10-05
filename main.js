const $ = (selector) => document.querySelector(selector);
const els = {
  file: $('#fileInput'), upload: $('.upload-zone'), media: $('#mediaList'), mediaCount: $('#mediaCount'),
  timeline: $('#timeline'), clipCount: $('#clipCount'), duration: $('#durationBadge'),
  preview: $('#previewVideo'), empty: $('#emptyPreview'), caption: $('#previewCaption'),
  play: $('#playBtn'), seek: $('#projectSeek'), time: $('#timeLabel'), mute: $('#muteBtn'),
  format: $('#formatSelect'), captionInput: $('#captionInput'), inspector: $('#clipInspector'),
  motionPreset: $('#motionPreset'), motionStart: $('#motionStart'), motionDuration: $('#motionDuration'), motionColor: $('#motionColor'),
  addClip: $('#addClipBtn'), export: $('#exportBtn'), modal: $('#exportModal'),
  exportStatus: $('#exportStatus'), progress: $('#exportProgress'), cancelExport: $('#cancelExportBtn'), toast: $('#toast'),
};

const state = { media: [], clips: [], selected: null, currentIndex: 0, playing: false, muted: false, exporting: false, cancel: false };
let toastTimer;
let objectCounter = 0;

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3500);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const n = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function clipDuration(clip) { return Math.max(0, clip.end - clip.start); }
function totalDuration() { return state.clips.reduce((sum, clip) => sum + clipDuration(clip), 0); }
function getMedia(clip) { return state.media.find((item) => item.id === clip.mediaId); }

function motionSettings() {
  return {
    text: els.captionInput.value.trim(), preset: els.motionPreset.value,
    start: Math.max(0, Number(els.motionStart.value) || 0),
    duration: Math.max(0.5, Number(els.motionDuration.value) || 3),
    color: els.motionColor.value,
  };
}

function motionFrame(position, settings = motionSettings()) {
  const local = position - settings.start;
  if (!settings.text || local < 0 || local > settings.duration) return null;
  const enter = Math.min(1, local / 0.45);
  const exit = Math.min(1, (settings.duration - local) / 0.35);
  return { opacity: Math.max(0, Math.min(enter, exit)), enter, local };
}

function renderMotionPreview(position) {
  const settings = motionSettings(), frame = motionFrame(position, settings);
  els.caption.hidden = !frame || !state.clips.length;
  if (!frame) return;
  els.caption.className = `preview-caption motion-${settings.preset}`;
  els.caption.style.setProperty('--motion-accent', settings.color);
  els.caption.style.opacity = frame.opacity;
  els.caption.textContent = settings.preset === 'type' ? settings.text.slice(0, Math.max(1, Math.ceil(settings.text.length * frame.enter))) : settings.text;
  if (settings.preset === 'pop') els.caption.style.transform = `translateX(-50%) scale(${0.65 + 0.35 * frame.enter})`;
  else if (settings.preset === 'lower') els.caption.style.transform = `translateX(${(frame.enter - 1) * 55}px)`;
  else els.caption.style.transform = `translateY(${(1 - frame.enter) * 25}px)`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function makeThumbnail(url) {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.preload = 'auto';
  try {
    await waitEvent(video, 'loadeddata', 12000);
    if (video.duration > 1) {
      video.currentTime = Math.min(1, video.duration / 3);
      await waitEvent(video, 'seeked', 3000).catch(() => {});
    }
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 90;
    canvas.getContext('2d').drawImage(video, 0, 0, 160, 90);
    return canvas.toDataURL('image/jpeg', 0.75);
  } catch { return ''; }
  finally { video.removeAttribute('src'); video.load(); }
}

function waitEvent(target, name, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(name, done); target.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Impossible de lire ce fichier vidéo.')); };
    target.addEventListener(name, done, { once: true });
    target.addEventListener('error', fail, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error('Lecture de la vidéo trop longue.')); }, timeout);
  });
}

async function readDuration(url) {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = url;
  try {
    await waitEvent(video, 'loadedmetadata', 12000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Durée de vidéo invalide.');
    return video.duration;
  } finally { video.removeAttribute('src'); video.load(); }
}

async function importFiles(files) {
  const videos = Array.from(files).filter((file) => file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|ogv)$/i.test(file.name));
  if (!videos.length) { showToast('Choisissez un ou plusieurs fichiers vidéo.'); return; }
  for (const file of videos) {
    const url = URL.createObjectURL(file);
    try {
      const duration = await readDuration(url);
      const item = { id: ++objectCounter, name: file.name, url, duration, thumbnail: await makeThumbnail(url) };
      state.media.push(item);
      state.clips.push({ id: ++objectCounter, mediaId: item.id, start: 0, end: duration });
    } catch (error) { URL.revokeObjectURL(url); showToast(`${file.name} : ${error.message}`); }
  }
  if (state.selected === null && state.clips.length) state.selected = state.clips[0].id;
  render();
  if (state.clips.length === videos.length) loadClip(0, false);
}

function render() {
  els.mediaCount.textContent = state.media.length;
  els.clipCount.textContent = `${state.clips.length} clip${state.clips.length > 1 ? 's' : ''}`;
  els.duration.textContent = formatTime(totalDuration());
  els.export.disabled = !state.clips.length || state.exporting;
  els.play.disabled = !state.clips.length;
  els.seek.disabled = !state.clips.length;
  els.mute.disabled = !state.clips.length;
  els.addClip.disabled = !state.media.length;
  els.empty.hidden = !!state.clips.length;
  els.preview.hidden = !state.clips.length;
  renderMotionPreview(projectPosition());
  els.media.innerHTML = state.media.length ? state.media.map((media) => `
    <div class="media-item"><img class="media-thumb" src="${media.thumbnail}" alt="" /><div class="media-meta"><strong title="${escapeHtml(media.name)}">${escapeHtml(media.name)}</strong><small>${formatTime(media.duration)}</small></div><button class="media-add" data-add="${media.id}" aria-label="Ajouter ${escapeHtml(media.name)} à la timeline">＋</button></div>`).join('') : '<div class="empty-media">Vos clips apparaîtront ici.</div>';
  els.timeline.innerHTML = state.clips.length ? state.clips.map((clip, index) => {
    const media = getMedia(clip);
    return `<div class="clip-card ${clip.id === state.selected ? 'selected' : ''}" data-select="${clip.id}" role="button" tabindex="0" aria-label="Sélectionner ${escapeHtml(media.name)}"><img src="${media.thumbnail}" alt="" /><strong title="${escapeHtml(media.name)}">${escapeHtml(media.name)}</strong><small>${formatTime(clipDuration(clip))} · clip ${index + 1}</small><div class="clip-controls"><button data-move="${clip.id}" data-dir="-1" aria-label="Déplacer à gauche" ${index === 0 ? 'disabled' : ''}>←</button><button data-move="${clip.id}" data-dir="1" aria-label="Déplacer à droite" ${index === state.clips.length - 1 ? 'disabled' : ''}>→</button><button data-remove="${clip.id}" aria-label="Supprimer">×</button></div></div>`;
  }).join('') : '<div class="timeline-empty"><span>✦</span><strong>Prêt à créer ?</strong><p>Importez une vidéo pour commencer votre timeline.</p></div>';
  renderInspector();
  updateTime();
}

function renderInspector() {
  const clip = state.clips.find((item) => item.id === state.selected);
  if (!clip) { els.inspector.className = 'clip-inspector-empty'; els.inspector.textContent = 'Cliquez sur un clip dans la timeline pour régler son début et sa fin.'; return; }
  const media = getMedia(clip);
  els.inspector.className = '';
  els.inspector.innerHTML = `<div class="selected-name" title="${escapeHtml(media.name)}">${escapeHtml(media.name)}</div><div class="trim-row"><label>Début (secondes)<input id="trimStart" type="number" min="0" max="${Math.max(0, media.duration - 0.1)}" step="0.1" value="${clip.start.toFixed(1)}" /></label><label>Fin (secondes)<input id="trimEnd" type="number" min="0.1" max="${media.duration}" step="0.1" value="${clip.end.toFixed(1)}" /></label></div><p class="field-help">Durée du clip : ${formatTime(clipDuration(clip))} · source : ${formatTime(media.duration)}</p>`;
}

function projectPosition() {
  let position = 0;
  for (let i = 0; i < state.currentIndex; i++) position += clipDuration(state.clips[i]);
  const clip = state.clips[state.currentIndex];
  if (clip) position += Math.min(clipDuration(clip), Math.max(0, els.preview.currentTime - clip.start));
  return position;
}

function updateTime() {
  const total = totalDuration();
  const position = Math.min(total, projectPosition());
  els.time.textContent = `${formatTime(position)} / ${formatTime(total)}`;
  els.seek.value = total ? Math.round(position / total * 1000) : 0;
  els.play.textContent = state.playing ? 'Ⅱ' : '▶';
  els.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Lire');
  els.mute.textContent = state.muted ? '♩' : '♫';
  renderMotionPreview(position);
}

async function loadClip(index, autoplay) {
  const clip = state.clips[index];
  if (!clip) return;
  const media = getMedia(clip);
  state.currentIndex = index;
  els.preview.pause();
  if (els.preview.src !== media.url) {
    els.preview.src = media.url;
    await waitEvent(els.preview, 'loadedmetadata').catch(() => {});
  }
  try { els.preview.currentTime = clip.start; } catch {}
  els.preview.muted = state.muted;
  if (autoplay) {
    try { await els.preview.play(); state.playing = true; }
    catch { state.playing = false; showToast('Cliquez sur lecture pour lancer l’aperçu.'); }
  }
  updateTime();
}

async function seekTo(position) {
  let remaining = Math.max(0, position);
  for (let index = 0; index < state.clips.length; index++) {
    const clip = state.clips[index];
    if (remaining <= clipDuration(clip) || index === state.clips.length - 1) {
      const keepPlaying = state.playing;
      if (index !== state.currentIndex) await loadClip(index, keepPlaying);
      els.preview.currentTime = Math.min(clip.end, clip.start + remaining);
      updateTime();
      return;
    }
    remaining -= clipDuration(clip);
  }
}

function stopPlayback() { state.playing = false; els.preview.pause(); updateTime(); }

els.file.addEventListener('change', async (event) => { await importFiles(event.target.files); event.target.value = ''; });
for (const eventName of ['dragenter', 'dragover']) els.upload.addEventListener(eventName, (event) => { event.preventDefault(); els.upload.classList.add('drag-over'); });
for (const eventName of ['dragleave', 'drop']) els.upload.addEventListener(eventName, (event) => { event.preventDefault(); els.upload.classList.remove('drag-over'); });
els.upload.addEventListener('drop', (event) => importFiles(event.dataTransfer.files));
els.media.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]'); if (!button) return;
  const media = state.media.find((item) => item.id === Number(button.dataset.add));
  if (!media) return;
  const clip = { id: ++objectCounter, mediaId: media.id, start: 0, end: media.duration };
  state.clips.push(clip); state.selected = clip.id; render(); showToast('Clip ajouté à la timeline.');
});
els.addClip.addEventListener('click', () => { els.media.querySelector('[data-add]')?.click(); });
els.timeline.addEventListener('click', (event) => {
  const move = event.target.closest('[data-move]');
  if (move) {
    const index = state.clips.findIndex((clip) => clip.id === Number(move.dataset.move));
    const next = index + Number(move.dataset.dir);
    if (next >= 0 && next < state.clips.length) {
      stopPlayback(); [state.clips[index], state.clips[next]] = [state.clips[next], state.clips[index]];
      loadClip(0, false); render();
    }
    return;
  }
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    stopPlayback();
    state.clips = state.clips.filter((clip) => clip.id !== Number(remove.dataset.remove));
    if (!state.clips.some((clip) => clip.id === state.selected)) state.selected = state.clips[0]?.id ?? null;
    state.currentIndex = 0;
    if (state.clips.length) loadClip(0, false); else { els.preview.removeAttribute('src'); els.preview.load(); }
    render(); return;
  }
  const card = event.target.closest('[data-select]');
  if (card) { state.selected = Number(card.dataset.select); stopPlayback(); loadClip(state.clips.findIndex((clip) => clip.id === state.selected), false); render(); }
});
els.timeline.addEventListener('keydown', (event) => { if (event.key === 'Enter' && event.target.matches('[data-select]')) event.target.click(); });
els.inspector.addEventListener('change', (event) => {
  if (!['trimStart', 'trimEnd'].includes(event.target.id)) return;
  const clip = state.clips.find((item) => item.id === state.selected);
  const media = clip && getMedia(clip); if (!media) return;
  const start = Number($('#trimStart').value), end = Number($('#trimEnd').value);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > media.duration + 0.01 || end - start < 0.1) {
    showToast('Gardez au moins 0,1 seconde et respectez la durée de la source.'); renderInspector(); return;
  }
  clip.start = start; clip.end = end;
  stopPlayback(); loadClip(state.currentIndex, false); render();
});
for (const control of [els.captionInput, els.motionPreset, els.motionStart, els.motionDuration, els.motionColor]) {
  control.addEventListener('input', updateTime);
  control.addEventListener('change', updateTime);
}
els.format.addEventListener('change', () => { $('#previewFrame').style.aspectRatio = els.format.value.replace(':', '/'); $('#previewFrame').style.height = 'auto'; $('#previewFrame').style.maxHeight = '55vh'; });
els.play.addEventListener('click', async () => {
  if (state.playing) { stopPlayback(); return; }
  if (projectPosition() >= totalDuration() - 0.05) await loadClip(0, false);
  try { await els.preview.play(); state.playing = true; updateTime(); }
  catch { showToast('Impossible de lire cette vidéo dans ce navigateur.'); }
});
els.preview.addEventListener('timeupdate', () => {
  const clip = state.clips[state.currentIndex]; if (!clip) return;
  if (state.playing && els.preview.currentTime >= clip.end - 0.04) {
    if (state.currentIndex + 1 < state.clips.length) loadClip(state.currentIndex + 1, true);
    else { els.preview.currentTime = clip.end; stopPlayback(); }
  } else updateTime();
});
els.preview.addEventListener('ended', () => {
  if (!state.playing) return;
  if (state.currentIndex + 1 < state.clips.length) loadClip(state.currentIndex + 1, true);
  else stopPlayback();
});
els.seek.addEventListener('input', () => seekTo(Number(els.seek.value) / 1000 * totalDuration()));
els.mute.addEventListener('click', () => { state.muted = !state.muted; els.preview.muted = state.muted; updateTime(); });

function drawFrame(context, canvas, video, settings, projectTime) {
  context.fillStyle = '#050608'; context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
  if (Number.isFinite(scale) && scale > 0) {
    const width = video.videoWidth * scale, height = video.videoHeight * scale;
    context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }
  const frame = motionFrame(projectTime, settings);
  if (frame) {
    const caption = settings.preset === 'type' ? settings.text.slice(0, Math.max(1, Math.ceil(settings.text.length * frame.enter))) : settings.text;
    context.save(); context.globalAlpha = frame.opacity;
    const fontSize = Math.round(canvas.height * 0.052);
    context.font = `800 ${fontSize}px Manrope, sans-serif`;
    context.textAlign = settings.preset === 'lower' ? 'left' : 'center'; context.textBaseline = 'bottom'; context.lineJoin = 'round';
    const maxWidth = canvas.width * 0.82;
    const words = caption.split(/\s+/); const lines = []; let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    lines.slice(0, 4).forEach((text, index) => {
      const y = canvas.height * 0.88 - (Math.min(lines.length, 4) - 1 - index) * fontSize * 1.2 + (1 - frame.enter) * 25;
      const x = settings.preset === 'lower' ? canvas.width * 0.09 + (frame.enter - 1) * 55 : canvas.width / 2;
      if (settings.preset === 'pop' || settings.preset === 'lower') {
        const width = Math.min(maxWidth, context.measureText(text).width + fontSize * 0.65);
        context.fillStyle = settings.preset === 'pop' ? settings.color : '#090914df';
        context.fillRect(settings.preset === 'lower' ? x - fontSize * 0.25 : x - width / 2, y - fontSize * 1.05, width, fontSize * 1.25);
        if (settings.preset === 'lower') { context.fillStyle = settings.color; context.fillRect(x - fontSize * 0.32, y - fontSize * 1.05, fontSize * 0.08, fontSize * 1.25); }
      }
      if (settings.preset === 'fade') {
        context.fillStyle = settings.color; context.fillRect(x - Math.min(maxWidth, context.measureText(text).width) / 2, y + fontSize * 0.1, Math.min(maxWidth, context.measureText(text).width), Math.max(3, fontSize * 0.05));
      }
      if (settings.preset !== 'pop') { context.lineWidth = Math.max(3, fontSize * 0.16); context.strokeStyle = '#000b'; context.strokeText(text, x, y, maxWidth); }
      context.fillStyle = settings.preset === 'pop' ? '#100c17' : 'white'; context.fillText(text, x, y, maxWidth);
    });
    context.restore();
  }
}

function chooseMimeType() {
  if (!window.MediaRecorder) return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

async function exportVideo() {
  if (!state.clips.length || state.exporting) return;
  const mimeType = chooseMimeType();
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream || !window.AudioContext) { showToast('L’export vidéo n’est pas pris en charge par ce navigateur.'); return; }
  stopPlayback(); state.exporting = true; state.cancel = false; els.modal.hidden = false; els.progress.style.width = '0%'; render();
  const [ratioW, ratioH] = els.format.value.split(':').map(Number);
  const canvas = document.createElement('canvas');
  canvas.width = ratioW > ratioH ? 1280 : ratioW < ratioH ? 720 : 1080;
  canvas.height = Math.round(canvas.width * ratioH / ratioW);
  const context = canvas.getContext('2d');
  const video = document.createElement('video'); video.playsInline = true; video.preload = 'auto';
  const audioContext = new AudioContext();
  const source = audioContext.createMediaElementSource(video);
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);
  const stream = canvas.captureStream(30);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = (event) => reject(event.error || new Error('Échec de l’export.')); });
  let frameId = 0;
  const motion = motionSettings();
  const total = totalDuration();
  let elapsed = 0;
  let recorderStarted = false;
  try {
    await audioContext.resume();
    for (let index = 0; index < state.clips.length; index++) {
      if (state.cancel) break;
      const clip = state.clips[index], media = getMedia(clip);
      els.exportStatus.textContent = `Clip ${index + 1} sur ${state.clips.length} · ${media.name}`;
      video.src = media.url;
      await waitEvent(video, 'loadedmetadata', 12000);
      if (Math.abs(video.currentTime - clip.start) > 0.01) {
        video.currentTime = clip.start;
        await waitEvent(video, 'seeked', 12000);
      }
      if (video.readyState < 2) await waitEvent(video, 'loadeddata', 12000);
      drawFrame(context, canvas, video, motion, elapsed);
      if (!recorderStarted) { recorder.start(1000); recorderStarted = true; }
      await video.play();
      await new Promise((resolve) => {
        const tick = () => {
          if (state.cancel || video.currentTime >= clip.end - 0.02 || video.ended) { video.pause(); resolve(); return; }
          drawFrame(context, canvas, video, motion, elapsed + Math.max(0, video.currentTime - clip.start));
          els.progress.style.width = `${Math.min(100, (elapsed + Math.max(0, video.currentTime - clip.start)) / total * 100)}%`;
          frameId = requestAnimationFrame(tick);
        };
        tick();
      });
      elapsed += clipDuration(clip);
    }
    cancelAnimationFrame(frameId);
    if (recorderStarted && recorder.state !== 'inactive') recorder.stop();
    if (recorderStarted) await stopped;
    if (!state.cancel && chunks.length) {
      els.progress.style.width = '100%';
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `studio-video-${Date.now()}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast('Votre vidéo est prête et téléchargée.');
    } else if (state.cancel) showToast('Export annulé.');
    else throw new Error('Aucune donnée vidéo produite.');
  } catch (error) {
    cancelAnimationFrame(frameId);
    if (recorderStarted && recorder.state !== 'inactive') recorder.stop();
    showToast(`Export impossible : ${error.message}`);
  } finally {
    video.pause(); video.removeAttribute('src'); video.load();
    stream.getTracks().forEach((track) => track.stop());
    await audioContext.close();
    els.modal.hidden = true; state.exporting = false; render();
  }
}

els.export.addEventListener('click', exportVideo);
els.cancelExport.addEventListener('click', () => { state.cancel = true; els.exportStatus.textContent = 'Annulation…'; });
render();
