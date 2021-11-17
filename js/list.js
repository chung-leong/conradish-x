import { initializeStorage, findObjects, loadObject, deleteObjects, storageChange } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers, attachRippleEffectHandlers, separateWords } from './lib/ui.js';

const listContainer = document.getElementById('list-container');
const toolbarContainer = document.getElementById('toolbar-container');
const cards = [];
let selection;
let searching = false;

async function start() {
  document.title = 'Documents';
  await initializeStorage();
  attachRippleEffectHandlers();
  attachCustomCheckboxHandlers();
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  createSearchToolbar();
  createCommandToolbar();
  await createCards();
  listContainer.parentNode.addEventListener('scroll', handleScroll);
  storageChange.addEventListener('create', handleCreate);
  storageChange.addEventListener('delete', handleDelete);
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
  const days = [], ids = [];
  const items = [];
  // create all the items first, leaving the title blank initially
  for (const { key, date, type } of docs.reverse()) {
    const item = createItem(key, date, type);
    items.push(item);
    if (!days.includes(item.day)) {
      days.push(item.day);
      ids.push(date.toISOString().substr(0, 10));
    }
  }
  // add card for displaying search results
  const searchCard = createCard('?', '', []);
  cards.push(searchCard);
  // add a card for each day, then attach the list elements
  for (const [ index, id ] of ids.entries()) {
    const day = days[index];
    const card = createCard(id, day, items.filter(i => i.day === day));
    cards.push(card);
  }
  // set up periodic updating of the titles, as today can become yesterday
  refreshDates();
  setInterval(() => {
    if (refreshDates()) {
      updateCardTitles();
    }
  }, 60 * 1000);
  updateCardTitles();
  updateCards();
  // load the title of each document now
  for (const item of items) {
    await loadItem(item);
  }
}

async function loadItem(item) {
  const doc = await loadObject(item.key);
  if (doc) {
    const { url, title, lang } = doc;
    item.titleElement.textContent = title;
    item.titleElement.title = url;
    item.lang = lang;
    item.searchStrings = findSearchStrings(doc);
  }
}

function createItem(key, date, type) {
  const day = getDateString(date);
  const time = getTimeString(date);
  const rippleElement = e('SPAN', { className: 'ripple' });
  const checkboxElement = e('SPAN', { className: 'checkbox', tabIndex: 0 }, rippleElement);
  const timeElement = e('SPAN', { className: 'time' }, time);
  const titleElement = e('SPAN', { className: 'title' }, '...');
  const itemElement = e('LI', {
    dataset: { key, type }
  }, [ checkboxElement, timeElement, titleElement ]);
  return { day, time, key, date, itemElement, titleElement };
}

function createCard(id, day, items) {
  const headerElement = e('DIV', { className: 'card-title' });
  // stick items from that day into the card
  const listElement = e('UL', {
    className: 'card-list',
  }, items.map(i => i.itemElement));
  const cardElement = e('DIV', {
    className: 'card',
  }, [ headerElement, listElement ]);
  return { id, day, cardElement, headerElement, listElement, items };
}

function updateCardTitles() {
  for (const card of cards) {
    const { day, items, query, headerElement } = card;
    let title;
    if (day) {
      if (isToday(day)) {
        title = 'Today - ' + day;
      } else if(isYesterday(day)) {
        title = 'Yesterday - ' + day;
      } else {
        title = day;
      }
    } else {
      // search results
      const count = items.length;
      const results = (count === 1) ? `1 search result` : `${count} search results`;
      title = `${results} for "${query}"`;
    }
    headerElement.textContent = title;
  }
}

function updateCards() {
  while (listContainer.firstChild) {
    listContainer.firstChild.remove();
  }
  const visible = cards.filter(c => (c.id === '?') === searching && c.items.length > 0);
  for (const card of visible) {
    listContainer.append(card.cardElement);
  }
  if (visible.length > 0) {
    const spacerElement = e('DIV', { className: 'list-end-spacer' }, '\u00a0');
    listContainer.append(spacerElement);
  } else {
    const message = (searching) ? 'No search results found' : 'No documents';
    const messageElement = e('DIV', { className: 'message' }, message);
    listContainer.append(messageElement);
  }
}

function updateSelection() {
  const checkboxes = getSelectedCheckboxes();
  selection = checkboxes.map(cb => cb.parentNode.dataset.key);
}

function updateToolbar() {
  const toolbar = document.getElementById('toolbar-commands');
  const status = document.getElementById('selection-status');
  if (selection.length > 0) {
    toolbar.classList.add('active');
    status.textContent = `${selection.length} selected`;
  } else {
    toolbar.classList.remove('active');
  }
}

function search(query) {
  const searchCard = cards[0];
  const { listElement } = searchCard;
  while (listElement.firstChild) {
    listElement.firstChild.remove();
  }
  searchCard.items = [];
  searchCard.query = query;
  if (query) {
    const words = separateWords(query);
    for (const card of cards) {
      for (const item of card.items) {
        if (searchItem(item, words)) {
          searchCard.items.push(item);
          listElement.append(item.itemElement);
        }
      }
    }
    searching = true;
  } else {
    // insert the items back into the cards
    for (const card of cards) {
      for (const [ index, item ] of card.items.entries()) {
        if (!item.itemElement.parentNode) {
          insertItemElement(card, item, index);
        }
      }
    }
    searching = false;
  }
  updateCards();
  updateCardTitles();
  updateSelection();
}

function removeItems(keys) {
  let changed = false;
  for (const card of cards) {
    for (let i = card.items.length - 1; i >= 0; i--) {
      const item = card.items[i];
      if (keys.includes(item.key)) {
        card.items.splice(i, 1);
        item.itemElement.remove();
        changed = true;
      }
    }
  }
  if (changed) {
    updateCards();
    updateSelection();
  }
}

function searchItem(item, words) {
  const { lang, searchStrings } = item;
  const lcWords = words.map(w => w.toLocaleLowerCase(lang));
  return lcWords.every((w) => {
    return searchStrings.some(s => s.includes(w));
  });
}

function findSearchStrings(doc) {
  const { url, title, lang, content } = doc;
  const list = [ url ];
  addSearchString(title, lang, list);
  addSearchString(content, lang, list);
  return list;
}

function addSearchString(content, lang, list) {
  if (typeof(content) === 'string') {
    const lc = content.toLocaleLowerCase(lang);
    list.push(lc);
  } else if (content instanceof Array) {
    for (const item of content) {
      addSearchString(item, lang, list);
    }
  } else if (content instanceof Object) {
    addSearchString(content.content, lang, list);
  }
}

function getInsertionIndex(array, item) {
  const sorted = array.concat(item).sort().reverse();
  return sorted.indexOf(item);
}

function insertItemElement(card, item, index) {
  const { listElement } = card;
  const { itemElement } = item;
  const prevItem = card.items[index - 1];
  if (prevItem) {
    const refNode = prevItem.itemElement.nextSibling;
    listElement.insertBefore(itemElement, refNode);
  } else {
    listElement.prepend(itemElement);
  }
}

function getSelectedCheckboxes() {
  return [ ...document.querySelectorAll('.checkbox.checked') ];
}

function getTimeString(date) {
  const timeOpts = { timeStyle: 'short' };
  return date.toLocaleTimeString(undefined, timeOpts);
}

function getDateString(date) {
  const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString(undefined, dateOpts);
}

let today, yesterday;

function isToday(day) {
  return (today === day);
}

function isYesterday(day) {
  return (yesterday === day);
}

function refreshDates() {
  const now = new Date;
  const todayNew = getDateString(now);
  if (today !== todayNew) {
    const earlier = new Date(now.getTime());
    earlier.setDate(earlier.getDate() - 1);
    yesterday = getDateString(earlier)
    today = todayNew;
    return true;
  }
  return false;
}

function handleClick(evt) {
  const { target, shiftKey } = evt;
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
    const kbEvent = new KeyboardEvent('keypress', { key: ' ', bubbles: true, shiftKey });
    checkbox.dispatchEvent(kbEvent);
  }
}

function handleChange(evt) {
  const { target } = evt;
  if (target.classList.contains('checkbox')) {
    updateSelection();
    updateToolbar();
  }
}

function handleSearchInput(evt) {
  const { target } = evt;
  const { classList } = target.parentNode;
  const query = target.value.trim();
  classList.toggle('active', !!query);
  search(query);
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
  search('');
}

function handleCancelClick(evt) {
  const checkboxes = getSelectedCheckboxes();
  for (const cb of checkboxes) {
    cb.classList.remove('checked');
  }
  updateSelection();
  updateToolbar();
}

async function handleDeleteClick(evt) {
  const keys = selection;
  removeItems(keys);
  updateToolbar();
  updateCardTitles();
  await deleteObjects(keys);
}

function handleScroll(evt) {
  const { target } = evt;
  const { classList } = toolbarContainer;
  classList.toggle('shadow', target.scrollTop > 0);
}

async function handleCreate(evt) {
  const { key, date, type } = evt.detail;
  const item = createItem(key, date, type);
  await loadItem(item);
  // look for a existing card for that day
  let card = cards.find(c => c.day === item.day);
  if (!card) {
    // add a new one and insert it into the right position
    const id = date.toISOString().substr(0, 10);
    const index = getInsertionIndex(cards.map(c => c.id), id);
    card = createCard(id, item.day, []);
    cards.splice(index, 0, card);
    updateCardTitles();
  }
  // insert the item
  const index = getInsertionIndex(card.items.map(i => i.date), date);
  card.items.splice(index, 0, item);
  insertItemElement(card, item, index);
  updateCards();
}

function handleDelete(evt) {
  const { key } = evt.detail;
  removeItems([ key ]);
}

start();
