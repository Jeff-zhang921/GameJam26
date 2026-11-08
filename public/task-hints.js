import { atExit, meta, cloudPhase } from '../src/logic.js';
import { guardPlatform } from '../src/enemies.js';

export function taskHintOpacity(seconds) {
  return Math.max(0, Math.min(1, seconds / .2, (6 - seconds) / 1.2));
}

// Derived from the shared world, never from the locally selected character.
export function taskHints(state) {
  if (![0, 1].includes(state.level) || state.status !== 'playing') return [];
  const [still, bloom] = state.actors;
  const hints = ['', ''];
  const start = state.platforms[0];
  const gate = state.platforms.find(p => state.exit.x >= p.x && state.exit.x <= p.x + p.w && p.y === state.exit.y);
  const plants = state.objects.filter(o => o.kind === 'plant');
  const plant = plants.find(o => !o.barrier && !o.withered && !o.wall);
  const looseSeed = state.objects.some(o => o.kind === 'seed' && o.held == null);
  const carriesCrate = p => state.objects.find(o => o.id === p.carrying)?.kind === 'crate';
  const pit = state.pits.find(p => p.plantable !== false && !p.wall && p.plant === null);
  const ancient = plants.find(o => o.barrier && !o.withered);
  const carriesSeed = state.objects.some(o => o.kind === 'seed' && o.held === 1);
  const needsSeed = state.seeds <= 0 && !plant;
  const bank = state.platforms.filter(p => p.x >= start.x + start.w).sort((a, b) => a.x - b.x)[0];
  const crossing = state.level === 0 && bank && state.actors.some(p => p.x < bank.x);
  const guard = state.level === 1 && state.objects.find(o => o.kind === 'guard');
  const guardFloor = guard && guardPlatform(state, guard);
  // The middle ledge: the nearest one past the trench (the high ledge and the basin lie farther on).
  const middle = state.level === 1 && state.platforms.filter(p => p.x >= (guardFloor?.x ?? Infinity) + (guardFloor?.w ?? 0) && p !== gate).sort((a, b) => a.x - b.x)[0];
  // Past the middle ledge (on the high ledge, over the basin or in it) counts as past the guard too.
  const pastMiddle = p => middle && p.x > middle.x + middle.w;
  const beyondGuard = p => middle && p.x >= middle.x && (p.y <= middle.y + 2 || pastMiddle(p));
  const rope = state.level === 1 && state.objects.find(o => o.kind === 'rope');
  const stepCrate = state.level === 1 && state.objects.find(o => o.kind === 'crate');
  // Past the climb: wait for the water to rise as a cloud (Speed brings it sooner, Freeze holds it), drop onto it and
  // jump on to the gate's ledge. Freeze and Speed are only suggested while there is a charge to spend.
  const cloud = state.level === 1 && state.objects.find(o => o.kind === 'cloud');
  const cloudHint = (p, actor) => {
    const { form } = cloudPhase(cloud);
    // Once someone has landed on it, the cloud blinks and fades within three seconds.
    const fading = cloud.vanish !== null && cloud.vanish !== undefined;
    if (p.on === cloud.id) return fading ? 'It is fading: walk right and jump to the gate.' : 'Walk to its right end; jump to the gate\'s ledge.';
    if (form === 'cloud' && fading) return 'The cloud is fading: jump on now.';
    if (form === 'cloud') return actor === 0 && !cloud.frozen && state.freezeCharges > 0 ? 'Freeze the cloud so it waits for you.' : 'Jump onto the cloud together.';
    if (form === 'mist') return 'The cloud is forming: get ready.';
    if (p.y > cloud.y + meta.cloud.h) return 'Wait for the cloud, then jump onto it.';
    if (actor === 1 && state.bloomCharges > 0 && cloud.speed < meta.time.maxSpeed) return 'From the edge, use Speed on the water.';
    return 'Wait at the edge for the cloud to form.';
  };

  if (guard && guardFloor && state.actors.some(p => !beyondGuard(p))) {
    const nearEdge = guard.x >= guardFloor.x + guardFloor.w - 190;
    if (guard.frozen && nearEdge) {
      state.actors.forEach((p, actor) => { hints[actor] = beyondGuard(p) ? 'Wait here while your partner climbs.' : p.on === guard.id ? 'Jump from its shell to the right platform.' : 'Jump onto the slowed snail\'s shell.'; });
    } else if (guard.frozen) {
      hints[0] = 'End Freeze; lure the snail farther right.';
      hints[1] = 'Bring the snail closer to the right wall.';
    } else if (nearEdge) {
      hints[0] = 'Freeze the snail at the right edge.';
      hints[1] = 'Stay clear until Still slows the snail.';
    } else {
      hints[0] = guard.target === 0 ? 'Lure it right, then Freeze it at the edge.' : 'Wait nearby; Freeze the snail at the edge.';
      hints[1] = guard.target === 0 ? 'Keep clear while Still lures the snail.' : 'Lure the snail toward the right wall.';
    }
    state.actors.forEach((p, actor) => { if (beyondGuard(p)) hints[actor] = 'Wait here while your partner climbs.'; });
  } else if (rope) {
    hints[0] = 'Wait for Bloom to drop the crate.';
    hints[1] = rope.speed ? 'Watch for the rope to snap.' : 'Walk up to the rope and use Speed.';
  } else if (stepCrate) {
    state.actors.forEach((p, actor) => {
      if (cloud && pastMiddle(p)) hints[actor] = cloudHint(p, actor);
      else if (p.carrying === stepCrate.id) hints[actor] = 'Set the crate near the right edge.';
      else if (p.on === stepCrate.id) hints[actor] = 'Jump right to the high ledge.';
      else hints[actor] = cloud ? 'Jump onto the crate, then up to the high ledge.' : 'Jump onto the crate, then up to the gate.';
    });
  } else if (crossing) {
    const crates = state.objects.filter(o => o.kind === 'crate');
    const slowed = crates.find(o => o.frozen && o.x > start.x + start.w - 35 && o.x < bank.x);
    const flying = crates.find(o => o.held === null && !o.frozen && o.x > start.x + start.w - 35 && o.x < bank.x);
    state.actors.forEach((p, actor) => {
      if (p.x >= bank.x) { hints[actor] = actor === 0 ? 'Help Bloom across: slow the next crate.' : 'Wait on this ledge for Still.'; return; }
      if (p.on === slowed?.id) hints[actor] = 'Jump from the crate to the next ledge.';
      else if (slowed) hints[actor] = 'Jump onto the slowed crate.';
      else if (actor === 0 && flying) hints[actor] = 'Cast Freeze around the flying crate.';
      else if (carriesCrate(p)) hints[actor] = 'Throw the crate across the gap.';
      else hints[actor] = actor === 0 ? 'Pick up a crate. Throw, then Freeze it.' : 'Pick up a crate; Still will slow it.';
    });
  } else if (carriesSeed && !plant) {
    hints[1] = 'Throw the seed into the empty pit.';
    hints[0] = 'Let Bloom throw the seed.';
  } else if (needsSeed && looseSeed) {
    hints[1] = carriesCrate(bloom) ? 'Throw the crate, then collect the seed.' : 'Walk over the seed to collect it.';
    hints[0] = 'Let Bloom collect the seed.';
  } else if (ancient) {
    hints[1] = ancient.speed >= meta.time.maxSpeed ? 'Let the ancient mushroom wither.' : 'Use Speed on the ancient mushroom.';
    hints[0] = 'Let Bloom clear the ancient mushroom.';
  } else if (!plant && pit && state.seeds > 0) {
    hints[1] = carriesCrate(bloom) ? 'Throw the crate, then plant the seed.' : Math.abs(bloom.x - pit.x) > meta.controls.pitReach ? 'Bring the seed to the empty pit.' : 'Plant the seed in this pit.';
    hints[0] = 'Meet Bloom beside the empty pit.';
  } else if (plant) {
    const highEnough = gate && plant.base - plant.height - gate.y < 120;
    hints[1] = plant.speed === 0 ? 'Stand on the mushroom; tap Speed.' : highEnough ? 'Jump from the mushroom to the high ledge.' : 'Ride the mushroom as it grows.';
    hints[0] = highEnough ? (plant.frozen ? 'Jump to the high ledge before time returns.' : 'Freeze the mushroom to give both time.') : still.on === plant.id ? 'Ride the mushroom with Bloom.' : 'Climb onto the growing mushroom.';
  } else {
    hints[0] = hints[1] = 'Reach the moon gate together.';
  }

  state.actors.forEach((p, actor) => {
    if (atExit(state, p)) hints[actor] = `Wait at the gate for ${actor === 0 ? 'Bloom' : 'Still'}.`;
    else if (gate && p.x >= gate.x && p.y <= gate.y + 2) hints[actor] = 'Walk to the moon gate.';
    else if (actor === 0 && state.freezeCharges <= 0 && /\b(Freeze|slow)\b/i.test(hints[actor]) && !hints[actor].startsWith('End Freeze')) {
      hints[actor] = state.pickups.some(p => p.kind === 'frost' && !p.taken) ? 'Jump for an hourglass to restore Freeze.' : 'No Freeze left — restart from Pause.';
    } else if (actor === 1 && state.bloomCharges <= 0 && /Speed/.test(hints[actor])) {
      hints[actor] = state.pickups.some(p => p.kind === 'bolt' && !p.taken) ? 'Jump for lightning to restore Speed.' : plant?.speed > 0 ? 'Ride the mushroom; save your jump.' : 'No Speed left — restart from Pause.';
    }
  });
  return hints.map((text, actor) => ({ actor, name: actor === 0 ? 'STILL' : 'BLOOM', text }));
}

export function createTaskHints(root, { story, hud } = {}) {
  root.innerHTML = [0, 1].map(actor => `<div class="task-hint" data-actor="${actor}" data-testid="task-hint-${actor}" hidden><strong></strong><span></span></div>`).join('');
  const nodes = [...root.children];
  let scene, lastTick = -1;
  const shown = new Map();
  return {
    update(state, view, camera, enabled, sceneKey) {
      if (scene !== sceneKey || state.tick < lastTick) { scene = sceneKey; shown.clear(); }
      lastTick = state.tick;
      const hints = (enabled ? taskHints(state) : []).filter(hint => {
        let current = shown.get(hint.actor);
        if (current?.text !== hint.text) { current = { text: hint.text, start: state.tick }; shown.set(hint.actor, current); }
        hint.opacity = taskHintOpacity((state.tick - current.start) / 60);
        return state.tick - current.start < 360;
      });
      const width = root.clientWidth, height = root.clientHeight;
      const cardWidth = Math.min(208, (width - 32) / 2), cardHeight = 66;
      const boxes = hints.map(hint => {
        const p = view.actors[hint.actor];
        const x = p.x * camera.scale + camera.offsetX, y = (p.y - 94) * camera.scale + camera.offsetY;
        return { hint, x, top: Math.max(8, Math.min(height - cardHeight - 100, y - cardHeight)), left: Math.max(8, Math.min(width - cardWidth - 8, x - cardWidth / 2)) };
      });
      // Nearby travellers share a row of separate cards instead of overlapping.
      if (boxes.length === 2 && Math.abs(boxes[0].left - boxes[1].left) < cardWidth + 10 && Math.abs(boxes[0].top - boxes[1].top) < cardHeight + 8) {
        const order = [...boxes].sort((a, b) => a.x - b.x);
        const left = Math.max(8, Math.min(width - cardWidth * 2 - 18, (order[0].x + order[1].x) / 2 - cardWidth - 5));
        order[0].left = left; order[1].left = left + cardWidth + 10;
      }
      const origin = story || hud ? root.getBoundingClientRect() : { left: 0, top: 0 };
      const visibleRect = node => {
        if (!node || node.hidden) return null;
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
        const r = node.getBoundingClientRect();
        return { left: r.left - origin.left, top: r.top - origin.top, right: r.right - origin.left, bottom: r.bottom - origin.top };
      };
      const storyRect = visibleRect(story), hudRect = visibleRect(hud), placed = [];
      const overlaps = (box, r) => r && box.left < r.right + 8 && box.left + cardWidth + 8 > r.left && box.top < r.bottom + 8 && box.top + cardHeight + 8 > r.top;
      for (const box of boxes) {
        // On a short screen the story can share the travellers' head height. Move those cards
        // into the free column beside it, below the HUD, rather than obscuring either text.
        if (overlaps(box, storyRect)) {
          if (storyRect.right + 12 + cardWidth <= width - 8) box.left = storyRect.right + 12;
          else box.top = storyRect.bottom + 10;
        }
        if (overlaps(box, hudRect)) box.top = hudRect.bottom + 10;
        for (const other of placed) if (overlaps(box, other)) box.top = other.bottom + 10;
        placed.push({ left: box.left, right: box.left + cardWidth, top: box.top, bottom: box.top + cardHeight });
      }
      for (let actor = 0; actor < 2; actor++) {
        const node = nodes[actor], box = boxes.find(b => b.hint.actor === actor);
        node.hidden = !box;
        if (!box) continue;
        node.style.opacity = String(box.hint.opacity);
        const label = node.querySelector('strong'), text = node.querySelector('span');
        if (label.textContent !== box.hint.name) label.textContent = box.hint.name;
        if (text.textContent !== box.hint.text) text.textContent = box.hint.text;
        node.style.width = `${cardWidth}px`; node.style.left = `${box.left}px`; node.style.top = `${box.top}px`;
        node.style.setProperty('--tail', `${Math.max(12, Math.min(cardWidth - 12, box.x - box.left))}px`);
      }
    },
  };
}
