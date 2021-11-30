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
    } else if (value !== undefined) {
      object[key] = value;
    }
  }
}

function appendContent(element, content) {
  if (content == null) {
    return;
  }
  if (content instanceof Node) {
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

export function parseMarkdown(text) {
  const re = /(\*+)(.+?)(\*+)/g;
  let m, startIndex = 0;
  const arr = [];
  while (m = re.exec(text)) {
    if (startIndex < m.index) {
      arr.push(text.substring(startIndex, m.index));
    }
    const style = {};
    if (m[1].length === 1) {
      style.fontStyle = 'italic';
    } else if (m[1].length === 2) {
      style.fontWeight = 700;
    } else {
      style.fontStyle = 'italic';
      style.fontWeight = 700;
    }
    arr.push(createElement('SPAN', { style }, m[2]));
    startIndex = m.index + m[0].length;
  }
  if (startIndex < text.length) {
    arr.push(text.substring(startIndex));
  }
  return arr;
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

export function separateWords(text) {
  // stick the text into the scratch-pad document in the iframe
  // so we can take advantage of the browser's sophisticated
  // word detection ability without affecting the selection in this
  // document
  const iframe = document.getElementById('scratch-pad');
  const win = iframe.contentWindow;
  const doc = win.document;
  const bin = doc.getElementById('bin');
  bin.textContent = text.trim();
  // select the text we inserted
  const sel = win.getSelection();
  sel.removeAllRanges();
  const range = doc.createRange();
  range.selectNode(bin);
  sel.addRange(range);
  // ask the browser to move selection back by one word
  const words = [];
  let remaining = range.toString();
  while (remaining.trim()) {
    sel.modify('extend', 'backward', 'word');
    const rangeAfter = sel.getRangeAt(0);
    const previous = remaining;
    remaining = rangeAfter.toString();
    words.unshift(previous.substr(remaining.length));
  }
  return words;
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
  const rect = button.getBoundingClientRect();
  ripple.style.width = ripple.style.height = `${diameter}px`;
  ripple.style.left = `${event.clientX - (rect.left + radius)}px`;
  ripple.style.top = `${event.clientY - (rect.top + radius)}px`;
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

let lastCheckbox;

function toggleCheckbox(checkbox, shiftKey) {
  let range;
  if (shiftKey) {
    const checkboxes = [ ...document.getElementsByClassName('checkbox') ];
    const index = checkboxes.indexOf(checkbox);
    const lastIndex = checkboxes.indexOf(lastCheckbox);
    if (index !== -1 && lastIndex !== -1 && index !== lastIndex) {
      const s = (index > lastIndex) ? lastIndex : index;
      const e = (index > lastIndex) ? index + 1 : lastIndex + 1;
      range = checkboxes.slice(s, e);
    }
  }
  if (range) {
    const allChecked = range.every((c) => c.classList.contains('checked'));
    for (const checkbox of range) {
      checkbox.classList.toggle('checked', !allChecked);
      triggerChangeEvent(checkbox);
    }
  } else {
    checkbox.classList.toggle('checked');
    triggerChangeEvent(checkbox);
  }
  lastCheckbox = checkbox;
}

function handleCustomCheckboxClick(evt) {
  const { target, shiftKey } = evt;
  if (target.classList.contains('checkbox')) {
    toggleCheckbox(target, shiftKey);
    setTimeout(() => target.classList.add('clicked'), 200);
  }
}

function handleCustomCheckboxKeyPress(evt) {
  const { target, key, shiftKey } = evt;
  if (target.classList.contains('checkbox')) {
    if (key === ' ' || key === 'Enter') {
      toggleCheckbox(target, shiftKey);
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
