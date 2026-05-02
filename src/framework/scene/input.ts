export interface PointerSnapshot {
  active: boolean;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  pointerType: string;
}

type PointerListener = (e: PointerEvent) => void;

export interface InputBus {
  pointer: PointerSnapshot;
  onPointerDown(cb: PointerListener): () => void;
  onPointerMove(cb: PointerListener): () => void;
  onPointerUp(cb: PointerListener): () => void;
  onPointerCancel(cb: PointerListener): () => void;
}

const isInDebugPanel = (e: PointerEvent): boolean => {
  const t = e.target as Element | null;
  return !!t?.closest?.('#debug-panel');
};

export const createInputBus = (): InputBus => {
  const pointer: PointerSnapshot = {
    active: false, x: 0, y: 0, lastX: 0, lastY: 0, pointerType: 'mouse',
  };
  const downSubs = new Set<PointerListener>();
  const moveSubs = new Set<PointerListener>();
  const upSubs   = new Set<PointerListener>();
  const cancelSubs = new Set<PointerListener>();

  const fire = (subs: Set<PointerListener>, e: PointerEvent) => {
    for (const cb of subs) {
      try { cb(e); } catch (err) { console.error(err); }
    }
  };

  window.addEventListener('pointerdown', (e) => {
    pointer.pointerType = e.pointerType;
    if (!isInDebugPanel(e)) {
      pointer.active = true;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
    }
    fire(downSubs, e);
  });
  window.addEventListener('pointermove', (e) => {
    pointer.pointerType = e.pointerType;
    if (pointer.active) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    fire(moveSubs, e);
  });
  const endHandler = (subs: Set<PointerListener>) => (e: PointerEvent) => {
    pointer.active = false;
    fire(subs, e);
  };
  window.addEventListener('pointerup', endHandler(upSubs));
  window.addEventListener('pointercancel', endHandler(cancelSubs));

  const sub = (set: Set<PointerListener>, cb: PointerListener): () => void => {
    set.add(cb);
    return () => { set.delete(cb); };
  };

  return {
    pointer,
    onPointerDown: (cb) => sub(downSubs, cb),
    onPointerMove: (cb) => sub(moveSubs, cb),
    onPointerUp:   (cb) => sub(upSubs, cb),
    onPointerCancel: (cb) => sub(cancelSubs, cb),
  };
};
