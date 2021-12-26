import { e, attachCustomCheckboxHandlers } from './lib/ui.js';
import { l } from './lib/i18n.js';
import { initializeStorage, getSettings, saveSettings, storageChange } from './lib/storage.js';
import { setWindowName } from './lib/navigation.js';
import { createTopBar, attachShadowHandlers } from './lib/top-bar.js';

const listContainer = document.getElementById('list-container');

const cards = [];
let activeCardType = 'basic';

async function start() {
  await initializeStorage();
  setWindowName('options');
  const title = document.title = l('extension_options');
  createTopBar('toolbar-title', { left: title });
  createBasicOptionCard();
  showActiveCards();
  attachCustomCheckboxHandlers();
}

function createBasicOptionCard() {
  const container = e('DIV', { className: 'input-container' });
  const { contextMenu, filter } = getSettings();
  // add checkbox for controlling the presence of Conradish item in context menu
  const contextMenuCheckbox = addCheckbox(container, l('add_context_menu_item'), contextMenu);
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
      settings.filter = filterSelect.value;
    });
  });
  const filterCheckbox = addCheckbox(container, [ l('filter_page_content'), ' ', filterSelect ], filtering);
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
  return addCard(l('basic_options'), 'basic', container);
}

function addCheckbox(container, label, checked) {
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
  container.append(sectionElement);
  return checkboxElement;
}

function addCard(title, type, children) {
  if (!(children instanceof Array)) {
    children = (children) ? [ children ] : [];
  }
  const headerElement = e('DIV', { className: 'card-title' }, title);
  const cardElement = e('DIV', { className: 'card' }, [ headerElement, ...children ]);
  const card = { type, headerElement, cardElement };
  cards.push(card);
  return card;
}

function showActiveCards() {
  while(listContainer.firstChild) {
    listContainer.firstChild.remove();
  }
  const activeCards = cards.filter(c => c.type === activeCardType);
  const elements = activeCards.map(c => c.cardElement);
  listContainer.append(...elements);
}

async function changeSettings(cb) {
  const settings = getSettings();
  cb(settings);
  await saveSettings();
}

start();
