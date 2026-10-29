// Tiny synchronous event bus shared by the simulation and the UI.

export function createBus() {
  const handlers = new Map();

  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    const set = handlers.get(type);
    if (set) set.delete(fn);
  }

  function once(type, fn) {
    const stop = on(type, (payload) => {
      stop();
      fn(payload);
    });
    return stop;
  }

  function emit(type, payload) {
    const set = handlers.get(type);
    if (set) for (const fn of [...set]) fn(payload);
    const any = handlers.get('*');
    if (any) for (const fn of [...any]) fn({ type, payload });
  }

  return { on, off, once, emit };
}
