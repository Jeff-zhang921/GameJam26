const STORY_START = 6800, PLAYBACK_RATE = 2;
const OPENING_BASE_DURATION = 32600, NEWSPAPER_BASE_DURATION = 38500;
export const OPENING_DURATION = STORY_START + (OPENING_BASE_DURATION - STORY_START) / PLAYBACK_RATE;
export const NEWSPAPER_DURATION = NEWSPAPER_BASE_DURATION / PLAYBACK_RATE;
export const STORY_ASSETS = ['/art/story/start-1.jpg', '/art/story/start-2.jpg', '/art/story/start-3.jpg'];
export const NEWSPAPER_ASSET = '/art/story/newspaper.png';
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const ramp = (time, start, end) => ease((time - start) / (end - start));
export function openingFrame(time, reduced = false) {
  const cameraTime = time;
  time = time <= STORY_START ? time : STORY_START + (time - STORY_START) * PLAYBACK_RATE;
  const pull = ramp(time, 30900, OPENING_BASE_DURATION);
  return {
    phase: time < 4000 ? 'door' : time < 6800 ? 'approach' : time < 15900 ? 'story-1' : time < 23400 ? 'story-2' : time < 30900 ? 'story-3' : 'pull',
    door: reduced ? 0 : ramp(cameraTime, 400, 4000), approach: reduced ? 0 : ramp(cameraTime, 4000, 7400), backdrop: 1 - ramp(time, 6800, 9400),
    cards: [ramp(time, 6800, 9400), ramp(time, 15900, 16900), ramp(time, 23400, 24400)],
    opacity: 1 - pull, lift: reduced ? 0 : -115 * pull,
  };
}
export function openingTransform(frame, width, height) {
  const cover = Math.max(width / 1600, height / 1000), w = 1600 * cover, h = 1000 * cover;
  const baseX = (width - w) * .68, baseY = (height - h) / 2;
  const doorX = 1125 * cover, doorY = 659 * cover, progress = frame.approach;
  const scale = 1 + 3.2 * progress;
  return { x: baseX + (width / 2 - baseX - doorX) * progress - doorX * (scale - 1),
    y: baseY + (height / 2 - baseY - doorY) * progress - doorY * (scale - 1), scale, width: w, height: h };
}
const shots = [
  { phase: 'whole', start: 0, travel: 0, x: .5, y: .5, zoom: 1 },
  { phase: 'top-left', start: 11200, travel: 1200, x: .25, y: .25, zoom: 1.9 },
  { phase: 'bottom-left', start: 16900, travel: 1200, x: .25, y: .75, zoom: 1.9 },
  { phase: 'top-right', start: 22600, travel: 1200, x: .75, y: .25, zoom: 1.9 },
  { phase: 'bottom-right', start: 28300, travel: 1200, x: .75, y: .75, zoom: 1.9 },
  { phase: 'pullback', start: 34000, travel: 2000, x: .5, y: .5, zoom: 1 },
];
export function newspaperFrame(time, reduced = false) {
  time *= PLAYBACK_RATE;
  const index = shots.findLastIndex(shot => time >= shot.start), current = shots[Math.max(0, index)], previous = shots[Math.max(0, index - 1)];
  const t = current.travel ? ramp(time, current.start, current.start + current.travel) : 1;
  const mix = key => previous[key] + (current[key] - previous[key]) * t;
  const pose = t < .5 ? previous : current;
  const transitionOpacity = reduced && current.travel ? t < .5 ? 1 - ease(t * 2) : ease((t - .5) * 2) : 1;
  const opacity = 1 - ramp(time, 36000, NEWSPAPER_BASE_DURATION);
  return { phase: time < 1200 ? 'black' : time < 5700 ? 'caption' : time < 7900 ? 'reveal' : time >= 36000 ? 'fade' : current.phase,
    x: reduced ? pose.x : mix('x'), y: reduced ? pose.y : mix('y'), zoom: reduced ? pose.zoom : mix('zoom'),
    backdrop: ramp(time, 0, 1200) * opacity, caption: ramp(time, 1200, 2200) * (1 - ramp(time, 4700, 5700)),
    reveal: ramp(time, 5700, 7900), opacity, transitionOpacity };
}
export function newspaperTransform(frame, width, height, imageWidth = 1122, imageHeight = 1402) {
  const fit = Math.min(width * .94 / imageWidth, height * .94 / imageHeight), scale = fit * frame.zoom;
  return { x: width / 2 - imageWidth * scale * frame.x, y: height / 2 - imageHeight * scale * frame.y, scale };
}
