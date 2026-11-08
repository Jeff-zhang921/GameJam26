export const CONVERSATIONS = [
  [[0, 'The bridge is broken. Perhaps we can borrow a moment.'], [1, 'Throw the crate. I trust you to slow its fall.']],
  [[1, 'I can lure that snail to the right edge. There is a crate hanging above the ledge.'], [0, 'I will slow the snail so we can climb. Then you can age the rope.']],
  [[0, 'Arrows from the wall, and a canyon with no floor beyond.'], [1, 'Then I will grow us a way: a mushroom between the darts, vines from both cliffs.'], [0, 'And past the canyon, two platforms that meet halfway. We cross together.']],
  [[1, 'This seed is waiting. I can wake it, but it will keep growing and ageing.'], [0, 'I can slow it while we climb. Then let the old vine wither and open the way.']],
  [[1, 'Every step I take, the gold things take with me. Back a step, and they go back.'], [0, 'And the teal ones keep mine. Then neither of us can carry ourselves.'], [1, 'So you walk for me, and I walk for you.']],
];
// How long a line stays up once typed (ms): long enough to read it, at least DIALOGUE_HOLD.
export const DIALOGUE_HOLD = 3500;
export const lineHold = text => Math.max(DIALOGUE_HOLD, text.length * 60);
export function dialogueFrame(lines, elapsed) {
  let time = Math.max(0, elapsed);
  for (const [speaker, text] of lines) {
    const typing = text.length * 28, duration = typing + lineHold(text);
    if (time < duration) return { speaker, text, shown: text.slice(0, Math.floor(time / 28)), typing: time < typing, opacity: Math.max(0, Math.min(1, time / 160, (duration - time) / 600)) };
    time -= duration;
  }
  return null;
}
// `onType(speaker)` is called for every few letters typed, so the line can be heard being written.
export function createDialogue(root, { onType } = {}) {
  const body = root.querySelector('.dialogue-text'), label = root.querySelector('.dialogue-speaker');
  const accessible = root.querySelector('.dialogue-announcement');
  let scene, elapsed = 0, previous = null, skipped = false, lastLine = null;
  root.querySelector('button').addEventListener('click', () => { skipped = true; root.hidden = true; });
  return {
    update({ sceneKey, level, time, enabled }) {
      if (scene !== sceneKey) { scene = sceneKey; elapsed = 0; previous = null; skipped = false; lastLine = null; }
      if (!enabled || skipped) { root.hidden = true; previous = null; return; }
      if (previous !== null) elapsed += Math.min(100, Math.max(0, time - previous));
      previous = time;
      const frame = dialogueFrame(CONVERSATIONS[level] ?? CONVERSATIONS[0], elapsed);
      root.hidden = !frame;
      if (!frame) return;
      root.style.opacity = String(frame.opacity);
      if (lastLine !== frame.text) {
        lastLine = frame.text; root.dataset.speaker = String(frame.speaker);
        label.textContent = frame.speaker === 0 ? 'STILL' : 'BLOOM';
        accessible.textContent = `${label.textContent}: ${frame.text}`;
      }
      if (body.textContent !== frame.shown) {
        const before = body.textContent, typed = frame.shown;
        // Tick on every other new letter (skipping spaces) while the line is still typing out.
        if (frame.typing && typed.startsWith(before) && typed.length > before.length && Math.floor(typed.length / 2) > Math.floor(before.length / 2) && typed.at(-1) !== ' ') onType?.(frame.speaker);
        body.textContent = typed;
      }
      root.classList.toggle('typing', frame.typing);
    },
  };
}
