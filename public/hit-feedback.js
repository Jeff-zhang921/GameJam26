export function createHitFeedback({ vibrate = ms => globalThis.navigator?.vibrate?.(ms), visible = () => !globalThis.document?.hidden } = {}) {
  let seen = 0;
  return {
    reset(eventSeq = 0) { seen = eventSeq; },
    handle(event, actor) {
      if (!Number.isFinite(event.id) || event.id <= seen) return;
      seen = event.id;
      if (event.kind !== 'hit' || event.sourceKind !== 'guard' || event.actor !== actor || !visible()) return;
      try { vibrate(25); } catch { /* The visible hit and sound remain available without haptics. */ }
    },
  };
}
