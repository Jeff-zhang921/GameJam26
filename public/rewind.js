// Time-rewind restart: a bounded history of the current courtyard and a 4-second backwards playback of it.
//
// History: one compact frame every `stride` ticks. When the buffer reaches `capacity`, every other frame is
// dropped and the stride doubles, so memory stays bounded however long a courtyard is played, while the frames
// always span the whole run, from its first tick to the latest one. Only what is drawn is kept (travellers,
// objects, Freeze Areas, crystals, pits, shards, lamps); nothing here is shared with prediction, reconciliation
// or reconnection state.
export const REWIND = { duration: 4000, capacity: 180 };

const clone = value => JSON.parse(JSON.stringify(value));

export function compactFrame(state) {
  return clone({
    tick: state.tick, level: state.level,
    actors: state.actors, objects: state.objects, freezeAreas: state.freezeAreas ?? [], pickups: state.pickups ?? [],
    freezeCharges: state.freezeCharges, bloomCharges: state.bloomCharges,
    pits: state.pits, shards: state.shards, checkpoints: state.checkpoints ?? [], checkpoint: state.checkpoint ?? null,
  });
}

export function createHistory({ capacity = REWIND.capacity } = {}) {
  let frames = [], stride = 1;
  const api = {
    get frames() { return frames; },
    get stride() { return stride; },
    reset(state) { frames = state ? [compactFrame(state)] : []; stride = 1; },
    // Feed every tick (local play) or every snapshot (online); a new courtyard or a restart starts over.
    record(state) {
      const last = frames[frames.length - 1];
      if (!last || last.level !== state.level || state.tick < last.tick) { api.reset(state); return; }
      if (state.tick - last.tick < stride) return;
      frames.push(compactFrame(state));
      if (frames.length > capacity) { frames = frames.filter((_, i) => i % 2 === 0); stride *= 2; }
    },
    bytes() { return JSON.stringify(frames).length; },
  };
  return api;
}

// Slow at both ends, fast in the middle: a short run still rewinds gracefully, a long one sweeps through.
export const easeRewind = u => { const t = Math.max(0, Math.min(1, u)); return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };

const lerp = (a, b, t) => a + (b - a) * t;
function blendFrames(a, b, t) {
  const base = t < .5 ? a : b, other = t < .5 ? b : a, k = t < .5 ? t : 1 - t;
  const byId = new Map(other.objects.map(o => [o.id, o]));
  const mix = (p, q) => {
    if (!q || !Number.isFinite(p.x) || !Number.isFinite(q.x) || Math.hypot(q.x - p.x, (q.y ?? 0) - (p.y ?? 0)) > 160) return p;
    const out = { ...p, x: lerp(p.x, q.x, k) };
    if (Number.isFinite(p.y) && Number.isFinite(q.y)) out.y = lerp(p.y, q.y, k);
    if (Number.isFinite(p.height) && Number.isFinite(q.height)) out.height = lerp(p.height, q.height, k);
    return out;
  };
  return {
    ...base,
    actors: base.actors.map((p, i) => mix(p, other.actors[i])),
    objects: base.objects.map(o => mix(o, byId.get(o.id))),
    freezeAreas: base.freezeAreas.map(area => { const q = other.freezeAreas.find(x => x.id === area.id); return q ? { ...area, ticksLeft: lerp(area.ticksLeft, q.ticksLeft, k) } : area; }),
  };
}

// The picture `u` (0..1) of the way through a rewind: u = 0 is now (last frame), u = 1 is the courtyard's start.
export function rewindFrame(frames, u) {
  if (!frames.length) return null;
  const pos = (1 - easeRewind(u)) * (frames.length - 1), i = Math.floor(pos), t = pos - i;
  return i >= frames.length - 1 ? frames[frames.length - 1] : blendFrames(frames[i], frames[i + 1], t);
}
