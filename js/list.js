import { attachCustomCheckboxHandlers, attachRippleEffectHandlers } from './lib/ui.js';

async function start() {
  attachRippleEffectHandlers();
  attachCustomCheckboxHandlers();
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  updateCommandToolbar();
}

function handleClick(evt) {
  const { target } = evt;
  if (target.classList.contains('title')) {
    // ask the service worker to open the document
    const { id, type } = target.parentNode.dataset;
    const command = `open${type}`;
    const arg = id;
    chrome.runtime.sendMessage(undefined, { type: 'command', command, arg });
  } else if (target.classList.contains('time')) {
    // focus the checkbox and toggle it
    const [ checkbox ] = target.parentNode.getElementsByClassName('checkbox');
    checkbox.focus();
    const kbEvent = new KeyboardEvent('keypress', { key: ' ', bubbles: true });
    checkbox.dispatchEvent(kbEvent);
  }
}

function handleChange(evt) {
  const { target } = evt;
  if (target.classList.contains('checkbox')) {
    updateCommandToolbar();
  }
}

function updateCommandToolbar() {
  const selection = getSelectedCheckBoxes();
  const toolbar = document.getElementById('toolbar-commands');
  if (selection.length > 0) {
    toolbar.classList.add('active');
  } else {
    toolbar.classList.remove('active');
  }
}

function getSelectedCheckBoxes() {
  return [ ...document.querySelectorAll('.checkbox.checked') ];
}

function getSelectedDocumentIds() {
  return getSelectedCheckBoxes.map(cb => cb.parentNode.dataset.id);
}

start();
