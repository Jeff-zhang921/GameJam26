export const OPENING_DURATION = 27700;
export const NEWSPAPER_DURATION = 36000;
export const STORY_ASSETS = ['/art/story/start-1.jpg', '/art/story/start-2.jpg', '/art/story/start-3.jpg'];
export const NEWSPAPER_ASSET = '/art/story/newspaper.png';
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const ramp = (time, start, end) => ease((time - start) / (end - start));
export function openingFrame(time, reduced = false) {
  const pull = ramp(time, 26000, OPENING_DURATION);
  return {
    phase: time < 3500 ? 'door' : time < 11000 ? 'story-1' : time < 18500 ? 'story-2' : time < 26000 ? 'story-3' : 'pull',
    door: reduced ? 0 : ramp(time, 400, 4000), backdrop: 1 - ramp(time, 3500, 4500),
    cards: [ramp(time, 3500, 4500), ramp(time, 11000, 12000), ramp(time, 18500, 19500)],
    opacity: 1 - pull, lift: reduced ? 0 : -115 * pull,
  };
}
const shots = [
  { phase: 'whole', start: 0, travel: 0, x: .5, y: .5, zoom: 1 },
  { phase: 'top-left', start: 4500, travel: 2000, x: .25, y: .25, zoom: 1.9 },
  { phase: 'bottom-left', start: 11000, travel: 2000, x: .25, y: .75, zoom: 1.9 },
  { phase: 'top-right', start: 17500, travel: 2000, x: .75, y: .25, zoom: 1.9 },
  { phase: 'bottom-right', start: 24000, travel: 2000, x: .75, y: .75, zoom: 1.9 },
  { phase: 'pullback', start: 30500, travel: 2500, x: .5, y: .5, zoom: 1 },
];
export function newspaperFrame(time, reduced = false) {
  const index = shots.findLastIndex(shot => time >= shot.start), current = shots[Math.max(0, index)], previous = shots[Math.max(0, index - 1)];
  const t = current.travel ? ramp(time, current.start, current.start + current.travel) : 1;
  const mix = key => previous[key] + (current[key] - previous[key]) * t;
  const pose = t < .5 ? previous : current;
  const transitionOpacity = reduced && current.travel ? t < .5 ? 1 - ease(t * 2) : ease((t - .5) * 2) : 1;
  return { phase: time >= 33000 ? 'fade' : current.phase, x: reduced ? pose.x : mix('x'), y: reduced ? pose.y : mix('y'),
    zoom: reduced ? pose.zoom : mix('zoom'), opacity: 1 - ramp(time, 33000, NEWSPAPER_DURATION), transitionOpacity };
}
export function newspaperTransform(frame, width, height, imageWidth = 1122, imageHeight = 1402) {
  const fit = Math.min(width * .94 / imageWidth, height * .94 / imageHeight), scale = fit * frame.zoom;
  return { x: width / 2 - imageWidth * scale * frame.x, y: height / 2 - imageHeight * scale * frame.y, scale };
}
