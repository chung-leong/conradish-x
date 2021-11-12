import { initializeStorage, getSettings, saveSettings, storageChange } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers } from './lib/ui.js';

async function start() {
  await initializeStorage();
  const settings = getSettings();
  const { body } = document;
  const label = 'Add option to context menu';
  const rippleElement = e('SPAN', { className: 'ripple' });
  const checkboxElement = e('SPAN', {
     className: 'checkbox',
     dataset: { name: 'contextMenu'},
     tabIndex: 0
   }, rippleElement);
  const labelElement = e('LABEL', {}, label);
  const sectionElement = e('SECTION', {}, [ checkboxElement, labelElement ]);
  document.body.append(sectionElement);
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  storageChange.addEventListener('settings', handleSettings);
  if (settings.contextMenu)  {
    checkboxElement.classList.add('checked');
  }
  attachCustomCheckboxHandlers();
}

function handleSettings(evt) {
  if (!evt.detail.self) {
    const settings = getSettings();
    const checkboxes = document.getElementsByClassName('checkbox');
    for (const checkbox of checkboxes) {
      const { name } = checkbox.dataset;
      checkbox.classList.toggle('checked', settings[name]);
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
  const settings = getSettings();
  settings[name] = target.classList.contains('checked');
  await saveSettings();
}

start();
