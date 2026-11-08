export const CONVERSATIONS = [
  [
    [0, 'Just before midnight, even the rain and our footsteps slowed to a crawl.'],
    [1, 'I turned the old man’s watch. It wound time back fifteen minutes.'],
    [0, 'Time’s moving again. Let’s find the Time Manager before it stops.'],
    [1, 'Being invisible won’t get us across this gap. Let’s use the crate.'],
  ],
  [
    [1, 'We’re on Bureau grounds now. I’ll lure that snail to the right wall.'],
    [0, 'I’ll slow it so we can climb. Then you can age the rope and drop the crate.'],
  ],
  [
    [0, 'Arrows and a bottomless canyon. The Bureau really doesn’t want visitors.'],
    [1, 'I’ll grow us a way through. First a mushroom, then vines from both cliffs.'],
    [0, 'Past the canyon, the two platforms meet halfway. We cross together.'],
  ],
  [
    [1, 'The shift log says the night clerk left the main clock’s brake on.'],
    [0, 'That’s why the city slowed down. At midnight, time stopped altogether.'],
    [1, 'Time runs backward here. I’ll rewind that tree so we can reach the tunnel.'],
  ],
  [
    [1, 'The Time Manager’s office is just past those lifts. We’re nearly there.'],
    [0, 'Gold follows your steps. Teal follows mine. We have to carry each other.'],
    [1, 'Once we’re through, we’ll show the Time Manager what we found in the log.'],
  ],
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
