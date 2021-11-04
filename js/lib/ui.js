export function createElement(name, attrs, children) {
  const element = document.createElement(name);
  assignAttributes(element, attrs);
  appendContent(element, children);
  return element;
}

export { createElement as e };

function assignAttributes(object, props) {
  if (!props) {
    return;
  }
  for (const [ key, value ] of Object.entries(props)) {
    if (value instanceof Object) {
      assignAttributes(object[key], value);
    } else {
      object[key] = value;
    }
  }
}

function appendContent(element, content) {
  if (!content) {
    return;
  }
  if (content instanceof HTMLElement) {
    element.appendChild(content);
  } else if (content instanceof Array) {
    for (const item of content) {
      appendContent(element, item);
    }
  } else {
    const child = document.createTextNode(content);
    element.appendChild(child);
  }
}

export function attachRippleEffectHandlers() {
  document.addEventListener('mousedown', handleRippleEffectMouseDown);
  document.addEventListener('mouseup', handleRippleEffectMouseUp);
}

export function attachCustomCheckboxHandlers() {
  document.addEventListener('click', handleCustomCheckboxClick);
  document.addEventListener('keypress', handleCustomCheckboxKeyPress);
  document.addEventListener('keydown', handleCustomCheckboxKeyDown);
  document.addEventListener('focusin', handleCustomCheckboxFocusIn);
  document.addEventListener('mousedown', handleCustomCheckboxMouseDown);
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

function handleCustomCheckboxClick(evt) {
  const { target } = evt;
  if (target.classList.contains('checkbox')) {
    target.classList.toggle('checked');
    triggerChangeEvent(target);
    setTimeout(() => target.classList.add('clicked'), 200);
  }
}

function handleCustomCheckboxKeyPress(evt) {
  const { target, key } = evt;
  if (target.classList.contains('checkbox')) {
    if (key === ' ' || key === 'Enter') {
      target.classList.toggle('checked');
      triggerChangeEvent(target);
      evt.preventDefault();
    }
  }
}

function handleCustomCheckboxKeyDown(evt) {
  const { target, key } = evt;
  if (target.classList.contains('checkbox')) {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const checkboxes = [ ...document.getElementsByClassName('checkbox') ];
      const index = checkboxes.indexOf(target);
      const offset = (key === 'ArrowDown') ? +1 : -1;
      const nextTarget = checkboxes[index + offset];
      if (nextTarget) {
        nextTarget.focus();
      }
    }
    target.classList.remove('clicked');
  }
}

function handleCustomCheckboxFocusIn(evt) {
  const { target } = evt;
  if (target.classList.contains('checkbox')) {
    target.classList.remove('clicked');
  }
}

function handleCustomCheckboxMouseDown(evt) {
  const { target } = evt;
  if (target.classList.contains('checkbox')) {
    target.classList.remove('clicked');
  }
}

function triggerChangeEvent(target) {
  const evt = new Event('change', { bubbles: true });
  target.dispatchEvent(evt);
}
