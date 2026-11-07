// The music uses its own context so pausing it never cuts off the victory chime.
// Each courtyard names its track in its theme (MUSIC in themes.js); `select` switches tracks, and each track
// keeps its own decoded loop and play position, so returning to a courtyard resumes where its music left off.
export function createMusic() {
  let context, gain, source, startedAt = 0, wanted = false, track = null;
  const buffers = new Map(), loading = new Map(), offsets = new Map();
  const loopStart = t => t.fade ?? 0;
  function stop() {
    if (!source) return;
    const buffer = buffers.get(track.src), start = loopStart(track);
    let offset = (offsets.get(track.src) ?? 0) + context.currentTime - startedAt;
    if (offset >= buffer.duration) offset = start + (offset - start) % (buffer.duration - start);
    offsets.set(track.src, offset);
    source.stop(); source.disconnect(); source = null;
  }
  function play() {
    const buffer = track && buffers.get(track.src);
    if (!wanted || !buffer || source || context.state !== 'running') return;
    source = context.createBufferSource(); source.buffer = buffer;
    source.loop = true; source.loopStart = loopStart(track); source.loopEnd = buffer.duration;
    source.connect(gain); startedAt = context.currentTime;
    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(track.volume ?? 1, startedAt + .8);
    source.start(0, offsets.get(track.src) ?? 0);
  }
  // Decode the first `length` seconds and blend the last `fade` seconds into the first `fade`, so the loop
  // (from `fade` to the end) has no seam. Linear complementary weights keep the overlap from boosting volume.
  function load(t) {
    if (!context || buffers.has(t.src) || loading.has(t.src)) return;
    loading.set(t.src, fetch(t.src)
      .then(r => { if (!r.ok) throw new Error('Music unavailable'); return r.arrayBuffer(); })
      .then(data => context.decodeAudioData(data))
      .then(decoded => {
        const seconds = t.length ?? decoded.duration;
        if (decoded.duration < seconds) throw new Error('Music too short');
        const length = Math.round(decoded.sampleRate * seconds), overlap = Math.round(decoded.sampleRate * (t.fade ?? 0));
        const buffer = context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const original = decoded.getChannelData(channel), samples = buffer.getChannelData(channel);
          samples.set(original.subarray(0, length));
          for (let i = 0; i < overlap; i++) {
            const mix = i / overlap, tail = length - overlap + i;
            samples[tail] = original[tail] * (1 - mix) + original[i] * mix;
          }
        }
        buffers.set(t.src, buffer);
        if (track === t) play();
      }).catch(error => { console.warn('Background music failed to load:', error); }).finally(() => { loading.delete(t.src); }));
  }
  return {
    unlock() {
      try {
        context ??= new (window.AudioContext || window.webkitAudioContext)();
        if (!gain) { gain = context.createGain(); gain.connect(context.destination); }
        context.resume().then(play).catch(() => { });
        if (track) load(track);
      } catch { /* Audio support is optional. */ }
    },
    // The current courtyard's track; switching fades the new one in from its own saved position.
    select(next) {
      if (!next || next.src === track?.src) return;
      if (source) stop();
      track = next;
      load(track); if (context) play();
    },
    sync(enabled) {
      wanted = enabled;
      if (wanted) play(); else stop();
    },
  };
}
