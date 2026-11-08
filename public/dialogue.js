export const CONVERSATIONS = [
  [[0, 'The bridge is broken. Perhaps we can borrow a moment.'], [1, 'Throw the crate. I trust you to slow its fall.']],
  [[1, 'There is a seed in my pocket. This little hollow looks promising.'], [0, 'Let it grow beneath us. I can give us time to jump.']],
  [[0, 'Even this ancient mushroom has an ending.'], [1, 'Then let it finish its story. We will plant another.']],
  [[1, 'That platform is waiting for a little encouragement.'], [0, 'Grow a path to it. We will cross the last gap together.']],
  [[0, 'The garden is restless. Watch for the glow before they strike.'], [1, 'And the moon lamps?'], [0, 'A place to begin again. Stay close.']],
];
export function dialogueFrame(lines, elapsed) {
  let time = Math.max(0, elapsed);
  for (const [speaker, text] of lines) {
    const typing = text.length * 28, duration = typing + 2100;
    if (time < duration) return { speaker, text, shown: text.slice(0, Math.floor(time / 28)), typing: time < typing };
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
