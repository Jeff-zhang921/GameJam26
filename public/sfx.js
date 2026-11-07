// Short, synthesized foley and magical accents; no external audio assets.
export function playEffect(context, event) {
  if (context.state !== 'running') return;
  const kind = event.kind, now = context.currentTime;
  const profiles = {
    step: [110, 65, .065, .018], collision: [150, 55, .12, .035],
    seedLand: [700, 260, .09, .025], crateLand: [100, 35, .2, .045],
    jump: [240, 540, .18, .025], land: [150, 55, .15, .035],
    grab: [400, 650, .1, .02], drop: [500, 200, .12, .02],
    throw: [600, 160, .18, .025], growth: [480, 720, .3, .012],
    wither: [420, 140, .4, .018], switch: [520, 780, .12, .018],
    freeze: [1000, 1500, .4, .025], unfreeze: [1300, 600, .3, .02],
    wake: [330, 660, .45, .025], grow: [440, 880, .4, .025],
    plant: [260, 520, .25, .025], vanish: [330, 80, .45, .02],
    shard: [880, 1760, .45, .025], win: [392, 784, .8, .03],
    return: [180, 440, .35, .02], rewind: [800, 200, .5, .025],
    hit: [300, 90, .35, .035], checkpoint: [523, 1046, .5, .025],
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
  oscillator.connect(gain); gain.connect(context.destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(now); oscillator.stop(now + duration + .01);
}
