import { initializeStorage, findObjects, loadObject, deleteObjects } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers, attachRippleEffectHandlers, separateWords } from './lib/ui.js';

const listContainer = document.getElementById('list-container');
const toolbarContainer = document.getElementById('toolbar-container');
const cards = [];
let selection;
let searching = false;

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
  const items = [];
  // create all the items first, leaving the title blank initially
  for (const { key, date, type } of docs.reverse()) {
    const item = createItem(key, date, type);
    items.push(item);
    if (!days.includes(item.day)) {
      days.push(item.day);
    }
  }
  // add card for displaying search results
  const searchCard = createCard(null, []);
  cards.push(searchCard);
  // add a card for each day, then attach the list elements
  for (const day of days) {
    const card = createCard(day, items.filter(i => i.day === day));
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
  for (const item of items.reverse()) {
    const doc = await loadObject(item.key);
    if (doc) {
      item.titleElement.textContent = doc.title;
      item.lang = doc.lang;
      item.searchStrings = findSearchStrings(doc);
    }
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
  return { day, time, key, itemElement, titleElement };
}

function createCard(day, items) {
  const headerElement = e('DIV', { className: 'card-title' });
  // stick items from that day into the card
  const listElement = e('UL', {
    className: 'card-list',
  }, items.map(i => i.itemElement));
  const cardElement = e('DIV', {
    className: 'card',
  }, [ headerElement, listElement ]);
  return { day, cardElement, headerElement, listElement, items };
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
  const visible = cards.filter(c => !c.day === searching && c.items.length > 0);
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
      const { listElement } = card;
      for (const [ index, item ] of card.items.entries()) {
        const { itemElement } = item;
        if (!itemElement.parentNode) {
          const prevItem = card.items[index - 1];
          const refNode = prevItem ? prevItem.itemElement.nextSibling : null;
          listElement.insertBefore(itemElement, refNode);
        }
      }
    }
    searching = false;
  }
  updateCards();
  updateCardTitles();
  updateSelection();
}

function searchItem(item, words) {
  const { lang, searchStrings } = item;
  const lcWords = words.map(w => w.toLocaleLowerCase(lang));
  return lcWords.every((w) => {
    return searchStrings.some(s => s.includes(w));
  });
}

function findSearchStrings(doc) {
  const list = [];
  const { title, lang, content } = doc;
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
  for (const card of cards) {
    for (let i = card.items.length - 1; i >= 0; i--) {
      const item = card.items[i];
      if (selection.includes(item.key)) {
        card.items.splice(i, 1);
        item.itemElement.remove();
      }
    }
  }
  const keys = selection;
  updateCards();
  updateSelection();
  updateToolbar();
  //await deleteObjects(keys);
}

function handleScroll(evt) {
  const { target } = evt;
  const { classList } = toolbarContainer;
  classList.toggle('shadow', target.scrollTop > 0);
}

start();
