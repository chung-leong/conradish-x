import { initializeStorage, findObjects, loadObject, deleteObjects } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers, attachRippleEffectHandlers } from './lib/ui.js';

const listContainer = document.getElementById('list-container');
const toolbarContainer = document.getElementById('toolbar-container');
let cards;
let items;
let selection;

async function start() {
  await initializeStorage();
  attachRippleEffectHandlers();
  attachCustomCheckboxHandlers();
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  createSearchToolbar();
  createCommandToolbar();
  await createCards();
  listContainer.parentNode.addEventListener('scroll', handleScroll);
}

function createSearchToolbar() {
  const leftElement = e('DIV', { className: 'toolbar-left' }, 'Documents');
  const inputElement = e('INPUT', { type: 'text', placeholder: 'Search documents' });
  const iconElement = e('SPAN', { className: 'magnifying-glass', title: 'Search documents' });
  const buttonElement = e('SPAN', {
    className: 'x-button',
    title: 'Clear search',
  });
  const searchElement = e('DIV', {
    id: 'search-input',
  }, [ inputElement, iconElement, buttonElement ]);
  const centerElement = e('DIV', {
    className: 'toolbar-center'
  }, searchElement);
  const rightElement = e('DIV', { className: 'toolbar-right' });
  const container = document.getElementById('toolbar-search');
  container.append(leftElement, centerElement, rightElement);
  inputElement.addEventListener('input', handleSearchInput);
  inputElement.addEventListener('focus', handleSearchFocus);
  inputElement.addEventListener('blur', handleSearchBlur);
  buttonElement.addEventListener('click', handleClearClick);
}

function createCommandToolbar() {
  const container = document.getElementById('toolbar-commands');
  const leftElement = e('DIV', { className: 'toolbar-left' });
  const xButtonElement = e('SPAN', {
    className: 'x-button',
    title: 'Cancel',
  });
  const spanElement = e('SPAN', { id: 'selection-status' });
  const centerLeftElement = e('DIV', {
    id: 'toolbar-commands-left',
  }, [ xButtonElement, spanElement ]);
  const deleteButtonElement = e('BUTTON', {}, 'Delete');
  const centerRightElement = e('DIV', {
    id: 'toolbar-commands-lright',
  }, [ deleteButtonElement ]);
  const centerElement = e('DIV', {
    className: 'toolbar-center'
  }, [ centerLeftElement, centerRightElement ] );
  const rightElement = e('DIV', { className: 'toolbar-right' });
  container.append(leftElement, centerElement, rightElement);
  xButtonElement.addEventListener('click', handleCancelClick);
  deleteButtonElement.addEventListener('click', handleDeleteClick);
}

async function createCards() {
  const docs = await findObjects('DOC');
  const days = [];
  items = [];
  const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const timeOpts = { timeStyle: 'short' };
  // create all the items first, leaving the title blank initially
  for (const { key, date, type } of docs.reverse()) {
    const day = date.toLocaleDateString(undefined, dateOpts);
    const time = date.toLocaleTimeString(undefined, timeOpts);
    const rippleElement = e('SPAN', { className: 'ripple' });
    const checkboxElement = e('SPAN', {
      className: 'checkbox',
      tabIndex: 0
    }, rippleElement);
    const timeElement = e('SPAN', {
      className: 'time',
    }, time);
    const titleElement = e('SPAN', {
      className: 'title',
    }, '...');
    const itemElement = e('LI', {
      dataset: { key, type }
    }, [ checkboxElement, timeElement, titleElement ]);
    items.push({ day, time, key, itemElement, titleElement });
    if (!days.includes(day)) {
      days.push(day);
    }
  }
  // add a card for each day, then attach the list elements
  clearList();
  cards = [];
  const d1 = new Date, d2 = new Date;
  d2.setDate(d2.getDate() - 1);
  const today = d1.toLocaleDateString(undefined, dateOpts);
  const yesterday = d2.toLocaleDateString(undefined, dateOpts);
  for (const day of days) {
    let title;
    if (day === today) {
      title = 'Today - ' + day;
    } else if(day === yesterday) {
      title = 'Yesterday - ' + day;
    } else {
      title = day;
    }
    const headerElement = e('DIV', {
      className: 'card-title',
    }, title);
    const matchingItems = items.filter(item => item.day === day);
    const listElement = e('UL', {
      className: 'card-list',
    }, matchingItems.map(item => item.itemElement));
    const cardElement = e('DIV', {
      className: 'card',
    }, [ headerElement, listElement ]);
    cards.push({ day, cardElement, listElement });
    listContainer.append(cardElement);
  }
  listContainer.append(e('DIV', { id: 'list-end-spacer' }, '\u00a0'));
  // load the titles now
  for (const item of items) {
    const doc = await loadObject(item.key);
    if (doc) {
      item.titleElement.textContent = doc.title;
      item.doc = doc;
    }
  }
}

function clearList() {
  while(listContainer.lastChild) {
    listContainer.lastChild.remove();
  }
}

function getSelectedCheckboxes() {
  return [ ...document.querySelectorAll('.checkbox.checked') ];
}

function handleClick(evt) {
  const { target } = evt;
  if (target.classList.contains('title')) {
    // ask the service worker to open the document
    const { key, type } = target.parentNode.dataset;
    const command = `open${type}`;
    const arg = key;
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
    const checkboxes = getSelectedCheckboxes();
    const toolbar = document.getElementById('toolbar-commands');
    const status = document.getElementById('selection-status');
    selection = checkboxes.map(cb => cb.parentNode.dataset.key);
    if (selection.length > 0) {
      toolbar.classList.add('active');
      status.textContent = `${selection.length} selected`;
    } else {
      toolbar.classList.remove('active');
    }
  }
}

function handleSearchInput(evt) {
  const { target } = evt;
  const { classList } = target.parentNode;
  const query = target.value.trim();
  if (query) {
    classList.add('active');
  } else {
    classList.remove('active');
  }
}

function handleSearchFocus(evt) {
  const { target } = evt;
  const { classList } = target.parentNode;
  classList.add('focus');
}

function handleSearchBlur(evt) {
  const { target } = evt;
  const { classList } = target.parentNode;
  classList.remove('focus');
}

function handleClearClick(evt) {
  const { target } = evt;
  const { classList } = target.parentNode;
  const [ input ] = target.parentNode.getElementsByTagName('INPUT');
  classList.remove('active');
  input.value = '';
}

function handleCancelClick(evt) {
  const checkboxes = getSelectedCheckboxes();
  for (const cb of checkboxes) {
    cb.classList.remove('checked');
  }
  const toolbar = document.getElementById('toolbar-commands');
  toolbar.classList.remove('active');
  selection = [];
}

async function handleDeleteClick(evt) {
  const selectedItems = items.filter(item => selection.includes(item.key));
  const emptyLists = [];
  for (const { itemElement } of selectedItems) {
    const listElement = itemElement.parentNode;
    itemElement.remove();
    if (!listElement.hasChildNodes()) {
      emptyLists.push(listElement);
    }
  }
  const emptyCards = cards.filter(card => emptyLists.includes(card.listElement));
  for (const { cardElement } of emptyCards) {
    cardElement.remove();
  }
  cards = cards.filter((card) => !emptyCards.includes(card));
  items = items.filter((item) => !selectedItems.includes(item));
  const toolbar = document.getElementById('toolbar-commands');
  toolbar.classList.remove('active');
  await deleteObjects(selection);
  selection = [];
}

function handleScroll(evt) {
  const { target } = evt;
  const { classList } = toolbarContainer;
  if (target.scrollTop > 0) {
    classList.add('shadow');
  } else {
    classList.remove('shadow');
  }
}

start();
