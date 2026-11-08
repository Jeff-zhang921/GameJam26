// Short, synthesized foley and magical accents; no external audio assets.
const outputs = new WeakMap();
export function createRewindAudio() {
  let voice;
  return {
    sync(context, progress) {
      if (progress === null || !context || context.state !== 'running') {
        if (voice) {
          const { source, gain, context: owner } = voice;
          gain.gain.cancelScheduledValues(owner.currentTime);
          gain.gain.setTargetAtTime(0, owner.currentTime, .04);
          source.stop(owner.currentTime + .25);
          voice = null;
        }
        return;
      }
      if (!voice) {
        const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = buffer; source.loop = true;
        filter.type = 'bandpass'; filter.Q.value = .8;
        gain.gain.value = 0;
        source.connect(filter); filter.connect(gain); gain.connect(effectsOutput(context));
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
        source.start();
        voice = { source, filter, gain, context };
      }
      const u = Math.max(0, Math.min(1, progress));
      // A descending airy pull with reverse-like swells, tied to visual progress.
      const flutter = .7 + .3 * Math.sin(2 * Math.PI * (3 * u + 4 * u * u));
      voice.filter.frequency.setTargetAtTime(1800 * (300 / 1800) ** u, context.currentTime, .04);
      voice.gain.gain.setTargetAtTime(.032 * Math.sin(Math.PI * u) ** .6 * flutter, context.currentTime, .035);
    },
  };
}
// Quiet organic friction; growth changes gesture timing, never noise pitch.
export function createGrowthAudio() {
  const voices = new Map();
  let buffer;
  return {
    sync(context, plants) {
      const active = new Set(plants.map(p => p.id));
      for (const [id, voice] of voices) if (!active.has(id)) {
        voice.gain.gain.setTargetAtTime(0, voice.context.currentTime, .06);
        voice.source.stop(voice.context.currentTime + .3);
        voices.delete(id);
      }
      if (!context || context.state !== 'running') return;
      for (const plant of plants) {
        let voice = voices.get(plant.id);
        if (!voice) {
          if (!buffer) {
            buffer = context.createBuffer(1, context.sampleRate * 7, context.sampleRate);
            const samples = buffer.getChannelData(0);
            let soft = 0;
            for (let i = 0; i < samples.length; i++) {
              soft += .18 * (Math.random() * 2 - 1 - soft);
              samples[i] = soft;
            }
            // Make the noise loop continuous without a recurring volume swell.
            const overlap = Math.round(context.sampleRate * .05);
            for (let i = 0; i < overlap; i++) {
              const mix = i / overlap;
              const tail = samples.length - overlap + i;
              samples[tail] = samples[tail] * (1 - mix) + samples[i] * mix;
            }
          }
          const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
          source.buffer = buffer; source.loop = true; source.loopStart = .05;
          filter.type = 'bandpass'; filter.frequency.value = 1400; filter.Q.value = .55;
          gain.gain.value = 0;
          source.connect(filter); filter.connect(gain); gain.connect(effectsOutput(context));
          source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
          source.start(0, .05 + Math.random() * 6.9);
          voice = { source, gain, context, last: context.currentTime, until: 0, level: 0 }; voices.set(plant.id, voice);
        }
        const elapsed = Math.max(0, context.currentTime - voice.last);
        voice.last = context.currentTime;
        voice.until -= elapsed * plant.rate;
        if (voice.until <= 0) {
          // Uneven tiny brush gestures with breathing room between them.
          voice.until = .22 + Math.random() * .65;
          voice.level = Math.random() < .35 ? .0012 : .006 + Math.random() * .018;
        }
        const frozenQuiet = Math.min(1, plant.rate);
        voice.gain.gain.setTargetAtTime(voice.level * frozenQuiet / Math.sqrt(plants.length), context.currentTime, .12);
      }
    },
  };
}
function effectsOutput(context) {
  if (outputs.has(context)) return outputs.get(context);
  const volume = context.createGain(), compressor = context.createDynamicsCompressor();
  volume.gain.value = 10;
  compressor.threshold.value = -10;
  compressor.knee.value = 6;
  compressor.ratio.value = 12;
  compressor.attack.value = .003;
  compressor.release.value = .15;
  volume.connect(compressor); compressor.connect(context.destination);
  outputs.set(context, volume);
  return volume;
}
export function playEffect(context, event) {
  if (context.state !== 'running') return;
  const kind = event.kind, now = context.currentTime;
  const master = effectsOutput(context);
  // Filtered noise adds physical texture instead of a pitched UI beep.
  function texture(duration, volume, from, to, type = 'bandpass', delay = 0) {
    const start = now + delay;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = buffer; filter.type = type; filter.Q.value = .65;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(master);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(start); source.stop(start + duration);
  }
  function tone(frequency, end, duration, volume, delay = 0) {
    const start = now + delay, oscillator = context.createOscillator(), envelope = context.createGain();
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(volume, start + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(master);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .01);
  }
  if (kind === 'strike' && event.sourceKind === 'guard') {
    tone(130, 48, .14, .035);
    texture(.13, .045, 900, 150, 'lowpass');
    tone(460, 210, .09, .012, .015);
    return;
  }
  if (kind === 'win') {
    // A quiet D-major/add9 coda beside the Satie background: 72 BPM,
    // rounded attacks, no pitch sweeps, percussion, or triumphant accent.
    function note(midi, delay, duration, volume) {
      const start = now + delay;
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      for (const [partial, weight] of [[1, 1], [2, .16], [3, .035]]) {
        const oscillator = context.createOscillator(), envelope = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency * partial;
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(volume * weight, start + .045);
        envelope.gain.exponentialRampToValueAtTime(.00001, start + duration);
        oscillator.connect(envelope); envelope.connect(master);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(start); oscillator.stop(start + duration + .02);
      }
    }
    // An open fifth supports a small arch that settles gently home.
    note(50, 0, 4.5, .004);
    note(57, .12, 4.2, .003);
    for (const [midi, delay, volume] of [
      [66, .2, .007], [69, 1.03, .006], [76, 1.87, .005],
      [73, 2.7, .005], [69, 3.53, .0045], [62, 4.15, .005],
    ]) note(midi, delay, 2.2, volume);
    note(66, 4.2, 2.1, .0025);
    return;
  }
  if (kind === 'land') {
    const impact = .25 + .75 * Math.max(0, Math.min(1, event.strength ?? 1));
    tone(105, 48, .16, .045 * impact);
    texture(.13, .055 * impact, 650, 160, 'lowpass');
    return;
  }
  if (kind === 'jump') {
    // A rounded, fixed-pitch pluck without noise or frequency sweeps.
    const duration = .14;
    const oscillator = context.createOscillator(), envelope = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = 294;
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(.035, now + .018);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(envelope); envelope.connect(master);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(now); oscillator.stop(now + duration + .01);
    return;
  }
  if (['growth', 'grow', 'wake'].includes(kind)) {
    // Documentary-inspired close-up: soft air and irregular earthy rustle.
    // Procedural texture, rather than a recording or a musical notification.
    const duration = kind === 'growth' ? 1.5 : 1.9;
    const peak = kind === 'growth' ? .018 : .023;
    for (const earthy of [true, false]) {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < samples.length; i++) {
        const noise = Math.random() * 2 - 1;
        brown = (brown + .025 * noise) / 1.025;
        samples[i] = earthy ? brown * 6 : noise;
      }
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass'; filter.Q.value = .45;
      filter.frequency.value = earthy ? 380 : 1700;
      const curve = new Float32Array(256);
      const phase = Math.random() * Math.PI * 2;
      for (let i = 0; i < curve.length; i++) {
        const progress = i / (curve.length - 1);
        const flutter = .78 + .14 * Math.sin(progress * 19 + phase) + .08 * Math.sin(progress * 43);
        curve[i] = peak * (earthy ? 1 : .22) * Math.sin(Math.PI * progress) ** 2 * flutter;
      }
      envelope.gain.setValueCurveAtTime(curve, now, duration);
      source.connect(filter); filter.connect(envelope); envelope.connect(master);
      source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
      source.start(now); source.stop(now + duration);
    }
    return;
  }
  const profiles = {
    step: [110, 65, .065, .018], collision: [150, 55, .12, .035],
    seedLand: [700, 260, .09, .025], crateLand: [100, 35, .2, .045],
    grab: [400, 650, .1, .02], drop: [500, 200, .12, .02],
    throw: [600, 160, .18, .025],
    wither: [420, 140, .4, .018], switch: [520, 780, .12, .018],
    freeze: [1000, 1500, .4, .025], unfreeze: [1300, 600, .3, .02],
    plant: [260, 520, .25, .025], vanish: [330, 80, .45, .02], crateLost: [240, 55, .5, .03],
    frost: [980, 1510, .2, .02], bolt: [690, 1290, .2, .02], seedPick: [620, 1240, .16, .022], seedTake: [620, 1240, .16, .022],
    shard: [880, 1760, .45, .025],
    return: [180, 440, .35, .02],
    hit: [300, 90, .35, .035], checkpoint: [523, 1046, .5, .025], strike: [260, 70, .18, .04],
  };
  const profile = profiles[kind]; if (!profile) return;
  const [from, to, duration, volume] = profile;
  const gain = context.createGain(), oscillator = context.createOscillator();
  const strength = kind === 'land' ? .3 + .7 * (event.strength ?? 1) : 1;
  oscillator.type = ['step', 'collision', 'crateLand'].includes(kind) ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume * strength, now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(gain); gain.connect(master);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(now); oscillator.stop(now + duration + .01);
}
