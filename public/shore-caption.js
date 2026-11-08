// The first crossing is a subtitle cue, never a cutscene or a simulation pause.
export function createShoreCaption() {
  let scene, seen = false, startedAt = null;
  return {
    update(state, { sceneKey, enabled = true } = {}) {
      if (scene !== sceneKey) { scene = sceneKey; seen = false; startedAt = null; }
      if (state.level !== 0 || state.status === 'won') { startedAt = null; return null; }
      if (!enabled || state.status !== 'playing') return null;
      if (startedAt === null) {
        if (seen) return null;
        const start = state.platforms[0];
        const bank = start && state.platforms.reduce((nearest, p) =>
          p.x >= start.x + start.w && (!nearest || p.x < nearest.x) ? p : nearest, null);
        if (!bank || !state.actors.every(a => a.grounded && a.x >= bank.x + 16 && a.x <= bank.x + bank.w - 16 && Math.abs(a.y - bank.y) <= 2)) return null;
        seen = true; startedAt = state.tick;
      }
      const progress = (state.tick - startedAt) / 360;
      if (progress >= 1) { startedAt = null; return null; }
      return { progress: Math.max(0, progress) };
    },
  };
}
