// Short, synthesized foley and magical accents; no external audio assets.
export function playEffect(context, event) {
  if (context.state !== 'running') return;
  const kind = event.kind, now = context.currentTime;
  const master = context.createGain();
  master.gain.value = 1.5;
  master.connect(context.destination);
  // Release the shared output after the longest effect finishes.
  setTimeout(() => master.disconnect(), 1500);
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
  if (kind === 'land') {
    const impact = .25 + .75 * Math.max(0, Math.min(1, event.strength ?? 1));
    tone(105, 48, .16, .045 * impact);
    texture(.13, .055 * impact, 650, 160, 'lowpass');
    return;
  }
  if (kind === 'jump') {
    texture(.17, .045, 550, 2100);
    tone(180, 320, .11, .012);
    return;
  }
  if (['growth', 'grow', 'wake'].includes(kind)) {
    // One soft swell, with no pitched tones or percussive transients.
    const duration = .85;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), envelope = context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass'; filter.frequency.value = 950; filter.Q.value = .4;
    const peak = kind === 'growth' ? .014 : .022;
    const curve = new Float32Array(128);
    for (let i = 0; i < curve.length; i++) curve[i] = peak * Math.sin(Math.PI * i / (curve.length - 1)) ** 2;
    envelope.gain.setValueCurveAtTime(curve, now, duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(master);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    source.start(now); source.stop(now + duration);
    return;
  }
  const profiles = {
    step: [110, 65, .065, .018], collision: [150, 55, .12, .035],
    seedLand: [700, 260, .09, .025], crateLand: [100, 35, .2, .045],
    grab: [400, 650, .1, .02], drop: [500, 200, .12, .02],
    throw: [600, 160, .18, .025],
    wither: [420, 140, .4, .018], switch: [520, 780, .12, .018],
    freeze: [1000, 1500, .4, .025], unfreeze: [1300, 600, .3, .02],
    plant: [260, 520, .25, .025], vanish: [330, 80, .45, .02],
    shard: [880, 1760, .45, .025], win: [392, 784, .8, .03],
    return: [180, 440, .35, .02], rewind: [800, 200, .5, .025],
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
