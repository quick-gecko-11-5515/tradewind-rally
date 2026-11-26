// Unified keyboard + mouse drag flight controls with clean action callbacks.

export function createInputController(canvas, callbacks) {
  const keys = new Set();
  const mouse = {
    dragging: false,
    anchorX: 0,
    anchorY: 0,
    roll: 0,
    pitch: 0,
  };

  function handleKeyDown(e) {
    const code = e.code;
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space'
    ) {
      e.preventDefault();
    }

    if (!e.repeat) {
      if (code === 'KeyP' || code === 'Escape') callbacks.onTogglePause();
      if (code === 'KeyM') callbacks.onToggleMute();
      if (code === 'KeyR') callbacks.onRestart();
    }
    keys.add(code);
    callbacks.onUserGesture();
  }

  function handleKeyUp(e) {
    keys.delete(e.code);
  }

  function handlePointerDown(e) {
    if (e.target !== canvas) return;
    callbacks.onUserGesture();
    mouse.dragging = true;
    mouse.anchorX = e.clientX;
    mouse.anchorY = e.clientY;
    mouse.roll = 0;
    mouse.pitch = 0;
  }

  function handlePointerMove(e) {
    if (!mouse.dragging) return;
    const dx = (e.clientX - mouse.anchorX) / 110;
    const dy = (e.clientY - mouse.anchorY) / 110;
    mouse.roll = Math.max(-1, Math.min(1, dx));
    mouse.pitch = Math.max(-1, Math.min(1, dy));
  }

  function handlePointerUp() {
    mouse.dragging = false;
    mouse.roll = 0;
    mouse.pitch = 0;
  }

  function handleBlur() {
    keys.clear();
    handlePointerUp();
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('blur', handleBlur);

  function sampleFlightControls() {
    let roll = 0;
    let pitch = 0;
    let throttleDelta = 0;

    if (keys.has('ArrowLeft') || keys.has('KeyA')) roll -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) roll += 1;

    // Flight yoke convention: Down / S pulls nose up; Up / W pushes nose down
    if (keys.has('ArrowDown') || keys.has('KeyS')) pitch += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) pitch -= 1;

    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyE') || keys.has('Equal')) {
      throttleDelta += 1;
    }
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyQ') || keys.has('Minus')) {
      throttleDelta -= 1;
    }

    if (mouse.dragging) {
      roll = Math.max(-1, Math.min(1, roll + mouse.roll));
      pitch = Math.max(-1, Math.min(1, pitch + mouse.pitch));
    }

    return {
      roll,
      pitch,
      throttleDelta,
      airbrake: keys.has('Space'),
    };
  }

  return {
    sampleFlightControls,
  };
}
