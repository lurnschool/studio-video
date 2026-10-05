import {DIAGRAMS} from './motion-plan.mjs';
export const MIN_CLIP = 1 / 30;
export const length = clip => clip.end - clip.start;
export const duration = clips => clips.reduce((sum, clip) => sum + length(clip), 0);
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => crypto.randomUUID();

export function locate(clips, time) {
  let offset = 0;
  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index];
    if (time < offset + length(clip) || index === clips.length - 1) {
      return { index, clip, offset, sourceTime: clip.start + Math.min(length(clip), Math.max(0, time - offset)) };
    }
    offset += length(clip);
  }
  return null;
}

export function splitAt(clips, time, id = uid()) {
  const point = locate(clips, time);
  if (!point || point.sourceTime - point.clip.start < MIN_CLIP || point.clip.end - point.sourceTime < MIN_CLIP) return null;
  return clips.flatMap((clip, index) => index === point.index ? [
    { ...clip, end: point.sourceTime }, { ...clip, id, start: point.sourceTime },
  ] : [{ ...clip }]);
}

export function removeRange(project, start, end) {
  const total = duration(project.clips);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > total + 0.001 || end - start < MIN_CLIP) throw new Error('Choisissez un passage valide à supprimer.');
  let offset = 0;
  const clips = [];
  for (const clip of project.clips) {
    const next = offset + length(clip);
    if (next <= start || offset >= end) clips.push({ ...clip });
    else {
      if (start - offset >= MIN_CLIP) clips.push({ ...clip, end: clip.start + start - offset });
      if (next - end >= MIN_CLIP) clips.push({ ...clip, id: uid(), start: clip.start + end - offset });
    }
    offset = next;
  }
  const shift = time => time <= start ? time : time < end ? start : time - (end - start);
  const motions = project.motions.map(motion => ({ ...motion, start: shift(motion.start), duration: shift(motion.start + motion.duration) - shift(motion.start), nodes: (motion.nodes || []).map(node => ({...node, at: Math.max(0, shift(motion.start + node.at) - shift(motion.start))})) })).filter(motion => motion.duration >= MIN_CLIP);
  return { ...project, clips, motions };
}

export function validateProject(input) {
  const fail = () => { throw new Error('Ce fichier ne contient pas un projet Studio Vidéo valide.'); };
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  if (!input || input.version !== 1 || !['16:9', '9:16', '1:1'].includes(input.format) || !Array.isArray(input.media) || !Array.isArray(input.clips) || !Array.isArray(input.motions) || input.media.length > 500 || input.clips.length > 1000 || input.motions.length > 200) fail();
  const media = new Map(); const ids = new Set();
  for (const item of input.media) {
    if (typeof item.id !== 'string' || media.has(item.id) || typeof item.name !== 'string' || !item.name || item.name.length > 500 || !finite(item.duration) || item.duration <= 0 || !finite(item.size) || item.size < 0) fail();
    media.set(item.id, item);
  }
  for (const clip of input.clips) {
    if (typeof clip.id !== 'string' || ids.has(clip.id) || !media.has(clip.mediaId) || !finite(clip.start) || !finite(clip.end) || clip.start < 0 || clip.end > media.get(clip.mediaId).duration + 0.001 || length(clip) < MIN_CLIP) fail();
    if (clip.zoom !== undefined && (!finite(clip.zoom) || clip.zoom < 1 || clip.zoom > 1.5)) fail();
    ids.add(clip.id);
  }
  for (const motion of input.motions) {
    if (typeof motion.id !== 'string' || ids.has(motion.id) || typeof motion.text !== 'string' || motion.text.length > 300 || !['editorial', 'gradient', 'fade', 'pop', 'lower', 'type', ...DIAGRAMS].includes(motion.preset) || !['left', 'right', 'top', 'center', 'bottom'].includes(motion.position) || !/^#[0-9a-f]{6}$/i.test(motion.color) || !finite(motion.start) || motion.start < 0 || !finite(motion.duration) || motion.duration < MIN_CLIP) fail();
    if ([motion.accent, motion.detail].some(value => value !== undefined && (typeof value !== 'string' || value.length > 100))) fail();
    if (motion.origin !== undefined && !['ai','manual'].includes(motion.origin)) fail();
    if (motion.nodes !== undefined && (!Array.isArray(motion.nodes) || motion.nodes.length > 4 || motion.nodes.some(node => typeof node.label !== 'string' || node.label.length > 45 || typeof node.detail !== 'string' || node.detail.length > 75 || !finite(node.at) || node.at < 0))) fail();
    if (DIAGRAMS.includes(motion.preset) && (!motion.nodes?.length || (motion.preset === 'compare' && motion.nodes.length !== 2) || (motion.preset === 'stat' && motion.nodes.length !== 1) || (['sequence','hub'].includes(motion.preset) && motion.nodes.length < 2))) fail();
    ids.add(motion.id);
  }
  return {
    version: 1, format: input.format,
    media: input.media.map(({ id, name, size, duration, lastModified }) => ({ id, name, size, duration, lastModified: finite(lastModified) ? lastModified : 0 })),
    clips: input.clips.map(({ id, mediaId, start, end, zoom }) => ({ id, mediaId, start, end, zoom: zoom ?? 1 })),
    motions: input.motions.map(({ id, text, preset, position, color, start, duration, accent, detail, nodes, origin }) => ({ id, text, preset, position, color, start, duration, accent: accent ?? '', detail: detail ?? '', nodes: (nodes || []).map(({label, detail, at}) => ({label, detail, at})), origin: origin || 'manual' })),
  };
}
