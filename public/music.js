// The music uses its own context so pausing it never cuts off the victory chime.
export function createMusic() {
  let context, buffer, loading, source, gain, offset = 0, startedAt = 0, wanted = false;
  function stop() {
    if (!source) return;
    offset += context.currentTime - startedAt;
    if (offset >= 50) offset = 2 + (offset - 2) % 48;
    source.stop(); source.disconnect(); source = null;
  }
  function play() {
    if (!wanted || !buffer || source || context.state !== 'running') return;
    source = context.createBufferSource(); source.buffer = buffer;
    source.loop = true; source.loopStart = 2; source.loopEnd = 50;
    source.connect(gain); startedAt = context.currentTime;
    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(1.5, startedAt + .8);
    source.start(0, offset);
  }
  return {
    unlock() {
      try {
        context ??= new (window.AudioContext || window.webkitAudioContext)();
        if (!gain) { gain = context.createGain(); gain.connect(context.destination); }
        context.resume().then(play).catch(() => { });
        if (!buffer && !loading) {
          loading = fetch('/audio/gymnopedie-no-1.mp3')
            .then(r => { if (!r.ok) throw new Error('Music unavailable'); return r.arrayBuffer(); })
            .then(data => context.decodeAudioData(data))
            .then(decoded => {
              if (decoded.duration < 50) throw new Error('Music too short');
              const length = Math.round(decoded.sampleRate * 50);
              buffer = context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
              // Blend seconds 48–50 with 0–2; then continue at second 2.
              // Linear complementary weights keep the overlap from boosting volume.
              const overlap = Math.round(decoded.sampleRate * 2);
              for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const original = decoded.getChannelData(channel);
                const samples = buffer.getChannelData(channel);
                samples.set(original.subarray(0, length));
                for (let i = 0; i < overlap; i++) {
                  const mix = i / overlap;
                  const tail = length - overlap + i;
                  samples[tail] = original[tail] * (1 - mix) + original[i] * mix;
                }
              }
              play();
            }).catch(error => { console.warn('Background music failed to load:', error); }).finally(() => { loading = null; });
        }
      } catch { /* Audio support is optional. */ }
    },
    sync(enabled) {
      wanted = enabled;
      if (wanted) play(); else stop();
    },
  };
}
