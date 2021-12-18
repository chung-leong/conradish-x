import { initializeStorage, getSettings, saveSettings, storageChange } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers } from './lib/ui.js';
import { l } from './lib/i18n.js';

async function start() {
  await initializeStorage();
  const { contextMenu, filter } = getSettings();
  const value = [name];
  // add checkbox for controlling the presence of Conradish item in context menu
  const contextMenuCheckbox = addCheckbox(l('add_context_menu_item'), contextMenu);
  contextMenuCheckbox.addEventListener('change', (evt) => {
    const checked = evt.target.classList.contains('checked');
    changeSettings((settings) => {
      settings.contextMenu = checked;
    });
  });
  // add checkbox and drop-down for controlling content filtering
  const filterTypes = [ 'automatic', 'manual' ];
  const filtering = filterTypes.includes(filter);
  const filterSelect = e('SELECT', {}, filterTypes.map((value) => {
    const selected = (value === filter);
    return e('OPTION', { value, selected }, l(`filter_${value}`));
  }));
  filterSelect.style.visibility = (filtering) ? 'visible' : 'hidden';
  filterSelect.addEventListener('change', (evt) => {
    changeSettings((settings) => {
      console.log(settings);
      settings.filter = filterSelect.value;
    });
  });
  const filterCheckbox = addCheckbox([ l('filter_page_content'), ' ', filterSelect ], filtering);
  filterCheckbox.addEventListener('change', (evt) => {
    const checked = evt.target.classList.contains('checked');
    changeSettings((settings) => {
      settings.filter = (checked) ? filterSelect.value : 'none';
      filterSelect.style.visibility = (checked) ? 'visible' : 'hidden';
    });
  });
  storageChange.addEventListener('settings', (evt) => {
    if (!evt.detail.self) {
      const { contextMenu, filter } = getSettings();
      const filtering = filterTypes.includes(filter);
      contextMenuCheckbox.classList.toggle('checked', contextMenu);
      filterCheckbox.classList.toggle('checked', filtering);
      filterSelect.style.visibility = (filtering) ? 'visible' : 'hidden';
    }
  });
  document.addEventListener('click', handleClick);
  attachCustomCheckboxHandlers();
}

function addCheckbox(label, checked) {
  const rippleElement = e('SPAN', { className: 'ripple' });
  const checkboxElement = e('SPAN', {
     className: 'checkbox',
     tabIndex: 0
   }, rippleElement);
  const labelElement = e('LABEL', {}, label);
  const sectionElement = e('SECTION', {}, [ checkboxElement, labelElement ]);
  if (checked) {
    checkboxElement.classList.add('checked');
  }
  document.body.append(sectionElement);
  return checkboxElement;
}

async function changeSettings(cb) {
  const settings = getSettings();
  cb(settings);
  await saveSettings();
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

start();
