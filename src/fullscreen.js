/** Keep the table layout available even where native fullscreen is blocked. */
export function attachFullscreen(root, button, onChange, tr = text => text) {
  const doc = root.ownerDocument;
  let enabled = false;
  let native = false;
  let pending = false;
  const fullscreenElement = () => doc.fullscreenElement ?? doc.webkitFullscreenElement;

  function setEnabled(value) {
    if (enabled === value) return;
    enabled = value;
    root.toggleAttribute('data-focus-mode',enabled);
    button.setAttribute('aria-pressed',String(enabled));
    const label = tr(enabled ? 'Exit full screen' : 'Full screen');
    button.setAttribute('aria-label',label);
    button.title = label;
    button.querySelector('span').textContent = tr(enabled ? 'Exit' : 'Full screen');
    onChange();
  }

  function syncNative() {
    if (fullscreenElement() === root) {
      native = true;
      setEnabled(true);
    } else if (native) {
      native = false;
      setEnabled(false);
    }
  }

  async function toggle() {
    if (pending) return;
    pending = true;
    try {
      if (enabled) {
        if (fullscreenElement() === root) {
          const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
          if (exit) await exit.call(doc);
          syncNative();
        } else setEnabled(false);
        return;
      }
      const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
      if (request && doc.fullscreenEnabled !== false) await request.call(root);
      syncNative();
      setEnabled(true);
    } catch {
      if (!enabled) setEnabled(true);
    } finally {
      pending = false;
    }
  }

  button.onclick = toggle;
  doc.addEventListener('fullscreenchange',syncNative);
  doc.addEventListener('webkitfullscreenchange',syncNative);
  return {
    exitFallback() {
      if (!enabled || fullscreenElement() === root) return false;
      setEnabled(false);
      return true;
    }
  };
}
