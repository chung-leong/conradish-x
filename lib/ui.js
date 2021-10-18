export function attachRippleEffectHandlers() {
  document.addEventListener('mousedown', handleRippleEffectMouseDown);
  document.addEventListener('mouseup', handleRippleEffectMouseUp);
}

let currentRipple = null;

function handleRippleEffectMouseDown(evt) {
  const button = event.target;
  if (button.tagName !== 'BUTTON') {
    return;
  }
  const ripple = document.createElement('span');
  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;
  ripple.style.width = ripple.style.height = `${diameter}px`;
  ripple.style.left = `${event.clientX - (button.offsetLeft + radius)}px`;
  ripple.style.top = `${event.clientY - (button.offsetTop + radius)}px`;
  ripple.className = 'ripple';
  if (currentRipple) {
    currentRipple.remove();
  }
  currentRipple = ripple;
  button.appendChild(ripple);
}

function handleRippleEffectMouseUp(evt) {
  if (currentRipple) {
    currentRipple.remove();
    currentRipple = null;
  }
}
