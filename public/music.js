// The music uses its own context so pausing it never cuts off the victory chime.
export function createMusic() {
  let context, buffer, loading, source, gain, offset = 0, startedAt = 0, wanted = false;
  function stop() {
    if (!source) return;
    offset = (offset + context.currentTime - startedAt) % 50;
    source.stop(); source.disconnect(); source = null;
  }
  function play() {
    if (!wanted || !buffer || source || context.state !== 'running') return;
    source = context.createBufferSource(); source.buffer = buffer;
    source.loop = true; source.loopStart = 0; source.loopEnd = 50;
    source.connect(gain); startedAt = context.currentTime;
    gain.gain.setValueAtTime(0, startedAt);
    gain.gain.linearRampToValueAtTime(.12, startedAt + .8);
    source.start(0, offset);
  }
  return {
    unlock() {
      try {
        context ??= new (window.AudioContext || window.webkitAudioContext)();
        if (!gain) { gain = context.createGain(); gain.connect(context.destination); }
        context.resume().then(play).catch(() => {});
        if (!buffer && !loading) {
          loading = fetch('/audio/gymnopedie-no-1.mp3')
            .then(r => { if (!r.ok) throw new Error('Music unavailable'); return r.arrayBuffer(); })
            .then(data => context.decodeAudioData(data))
            .then(decoded => {
              if (decoded.duration < 50) throw new Error('Music too short');
              const length = Math.round(decoded.sampleRate * 50);
              buffer = context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
              const fade = Math.round(decoded.sampleRate * .03);
              for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const samples = buffer.getChannelData(channel);
                samples.set(decoded.getChannelData(channel).subarray(0, length));
                for (let i = 0; i < fade; i++) {
                  samples[i] *= i / fade;
                  samples[length - 1 - i] *= i / fade;
                }
              }
              play();
            }).catch(() => {}).finally(() => { loading = null; });
        }
      } catch { /* Audio support is optional. */ }
    },
    sync(enabled) {
      wanted = enabled;
      if (wanted) play(); else stop();
    },
  };
}
