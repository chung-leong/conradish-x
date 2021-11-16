import { initializeStorage, getSettings, saveSettings, storageChange } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers } from './lib/ui.js';

async function start() {
  await initializeStorage();
  const binary = [ false, true ];
  const filters = [ 'none', 'automatic', 'manual' ];
  addCheckbox('contextMenu', binary, 'Add option to context menu');
  addCheckbox('filter', filters, 'Filter page content');
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  storageChange.addEventListener('settings', handleSettings);
  attachCustomCheckboxHandlers();
}

const checkPossibileValueLists = {};

function addCheckbox(name, possible, label) {
  checkPossibileValueLists[name] = possible;
  const rippleElement = e('SPAN', { className: 'ripple' });
  const checkboxElement = e('SPAN', {
     className: 'checkbox',
     dataset: { name },
     tabIndex: 0
   }, rippleElement);
  const labelElement = e('LABEL', {}, label);
  const sectionElement = e('SECTION', {}, [ checkboxElement, labelElement ]);
  if (isSet(name)) {
    checkboxElement.classList.add('checked');
  }
  document.body.append(sectionElement);
  return checkboxElement;
}

function isSet(name) {
  const possible = checkPossibileValueLists[name];
  const settings = getSettings();
  const value = settings[name];
  return possible.indexOf(value) > 0;
}

function handleSettings(evt) {
  if (!evt.detail.self) {
    const checkboxes = document.getElementsByClassName('checkbox');
    for (const checkbox of checkboxes) {
      const { name } = checkbox.dataset;
      checkbox.classList.toggle('checked', isSet(name));
    }
  }
}

function handleClick(evt) {
  const { target } = evt;
  if (target.tagName === 'LABEL') {
    // focus the checkbox and toggle it
    const [ checkbox ] = target.parentNode.getElementsByClassName('checkbox');
    checkbox.focus();
    const kbEvent = new KeyboardEvent('keypress', { key: ' ', bubbles: true });
    checkbox.dispatchEvent(kbEvent);
  }
}

async function handleChange(evt) {
  const { target } = evt;
  const { name } = target.dataset;
  const checked = target.classList.contains('checked');
  const possible = checkPossibileValueLists[name];
  const index = (checked) ? 1 : 0;
  const value = possible[index];
  const settings = getSettings();
  settings[name] = value;
  await saveSettings();
}

start();
