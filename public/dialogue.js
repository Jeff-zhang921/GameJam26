export const CONVERSATIONS = [
  [[0, 'The bridge is broken. Perhaps we can borrow a moment.'], [1, 'Throw the crate. I trust you to slow its fall.']],
  [[1, 'Our seed rolled into the trench. I can lure that snail to the right edge.'], [0, 'It cannot leave its platform. I will slow it so we can climb on its shell.']],
  [[0, 'Arrows from the wall, and a canyon with no floor beyond.'], [1, 'Then I will grow us a way: a mushroom between the darts, vines from both cliffs.'], [0, 'And past the canyon, two platforms that meet halfway. We cross together.']],
  [[1, 'Something is wrong with my hands. Here, time runs backwards when I touch it.'], [0, 'Then let that dead tree be young again, just long enough to climb.']],
  [[1, 'Every step I take, the gold things take with me. Back a step, and they go back.'], [0, 'And the teal ones keep mine. Then neither of us can carry ourselves.'], [1, 'So you walk for me, and I walk for you.']],
];
export function dialogueFrame(lines, elapsed) {
  let time = Math.max(0, elapsed);
  for (const [speaker, text] of lines) {
    const typing = text.length * 28, duration = typing + 2100;
    if (time < duration) return { speaker, text, shown: text.slice(0, Math.floor(time / 28)), typing: time < typing, opacity: Math.max(0, Math.min(1, time / 160, (duration - time) / 600)) };
    time -= duration;
  }
  return null;
}
export function createDialogue(root) {
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
      if (body.textContent !== frame.shown) body.textContent = frame.shown;
      root.classList.toggle('typing', frame.typing);
    },
  };
}
