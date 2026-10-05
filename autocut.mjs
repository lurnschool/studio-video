export const PROFILES = {
  natural: { minPause: .65, head: .14, tail: .18, relativeDb: 28, minDb: -52, maxDb: -34, minSegment: .4 },
  dynamic: { minPause: .38, head: .10, tail: .12, relativeDb: 23, minDb: -48, maxDb: -30, minSegment: .3 },
};

export function audioEnvelope(channels, sampleRate, frameSeconds = .02) {
  if (!channels.length || !sampleRate) throw new Error('Piste audio vide.');
  const step = Math.max(1, Math.round(sampleRate * frameSeconds));
  const count = Math.ceil(channels[0].length / step), levels = new Float32Array(count);
  for (let frame = 0; frame < count; frame++) {
    const from = frame * step, to = Math.min(channels[0].length, from + step);
    let energy = 0;
    for (const channel of channels) for (let i = from; i < to; i++) energy += channel[i] * channel[i];
    const rms = Math.sqrt(energy / Math.max(1, (to - from) * channels.length));
    levels[frame] = 20 * Math.log10(Math.max(rms, 1e-8));
  }
  return { levels, frameSeconds: step / sampleRate, duration: channels[0].length / sampleRate };
}

export function findPauseCuts(envelope, start = 0, end = envelope.duration, profileName = 'natural') {
  const profile = PROFILES[profileName] || PROFILES.natural;
  const { levels, frameSeconds } = envelope;
  const from = Math.max(0, Math.floor(start / frameSeconds));
  const to = Math.min(levels.length, Math.ceil(end / frameSeconds));
  const sorted = Array.from(levels.slice(from, to)).sort((a, b) => a - b);
  if (!sorted.length) return { cuts: [], reason: 'empty', thresholdDb: null };
  const loud = sorted[Math.floor((sorted.length - 1) * .9)];
  if (loud < -55) return { cuts: [], reason: 'quiet', thresholdDb: null };
  const thresholdDb = Math.min(profile.maxDb, Math.max(profile.minDb, loud - profile.relativeDb));
  const candidates = [];
  let silenceStart = null;
  for (let i = from; i <= to; i++) {
    const quiet = i < to && levels[i] < thresholdDb;
    if (quiet && silenceStart === null) silenceStart = Math.max(start, i * frameSeconds);
    if ((!quiet || i === to) && silenceStart !== null) {
      const silenceEnd = Math.min(end, i * frameSeconds);
      if (silenceEnd - silenceStart >= profile.minPause) {
        const cutStart = silenceStart <= start + frameSeconds ? start : silenceStart + profile.tail;
        const cutEnd = silenceEnd >= end - frameSeconds ? end : silenceEnd - profile.head;
        if (cutEnd - cutStart >= .12) candidates.push({ start: cutStart, end: cutEnd });
      }
      silenceStart = null;
    }
  }
  // Retain extra silence whenever a proposed cut would isolate a tiny spoken fragment.
  const cuts = []; let lastEnd = start;
  for (const candidate of candidates) {
    const kept = candidate.start - lastEnd;
    if (kept > frameSeconds && kept < profile.minSegment) continue;
    if (end - candidate.end > frameSeconds && end - candidate.end < profile.minSegment) continue;
    cuts.push(candidate); lastEnd = candidate.end;
  }
  if (cuts.reduce((sum, cut) => sum + cut.end - cut.start, 0) > (end - start) * .92) return { cuts: [], reason: 'quiet', thresholdDb };
  return { cuts, reason: cuts.length ? 'cuts' : 'continuous', thresholdDb };
}
