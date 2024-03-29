import { initializeStorage, findObjects, loadObject, saveObject, deleteObjects, storageChange } from './lib/storage.js';
import { e, attachCustomCheckboxHandlers, attachRippleEffectHandlers, separateWords } from './lib/ui.js';
import { setWindowName, openPage } from './lib/navigation.js';
import { createTopBar, attachShadowHandlers } from './lib/top-bar.js';
import { l, lc, detectDirection, capitalize } from './lib/i18n.js';
import { getInflectionTables, getPossibleTypes, mergeInflectionTables, saveInflectionTables } from './lib/inflection.js';

const listContainer = document.getElementById('list-container');
const toolbarContainer = document.getElementById('toolbar-container');
const dialogBoxContainer = document.getElementById('dialog-box-container');
const dialogBoxTitle = document.getElementById('dialog-box-title');
const dialogBoxContent = document.getElementById('dialog-box-content');

const cards = [];
let kebabMenu;
let selection = [];
let selectedItem;
let searching = false;

async function start() {
  setWindowName('list');
  document.title = l('documents');
  await initializeStorage();
  attachRippleEffectHandlers();
  attachCustomCheckboxHandlers({ acceptCtrlA: true });
  attachShadowHandlers();
  attachHelpButtonHandler();
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  createSearchToolbar();
  createCommandToolbar();
  await createCards();
  storageChange.addEventListener('create', handleCreate);
  storageChange.addEventListener('delete', handleDelete);
  storageChange.addEventListener('update', handleUpdate);
}

function attachHelpButtonHandler() {
  const buttonElement = document.getElementById('help-button');
  buttonElement.addEventListener('click', evt => openPage('help'));
  buttonElement.title = l('user_guide');
}

function createSearchToolbar() {
  const inputElement = e('INPUT', { type: 'text', placeholder: l('search_documents') });
  inputElement.addEventListener('input', (evt) => {
    const query = evt.target.value.trim();
    searchElement.classList.toggle('active', !!query);
    search(query);
  });
  inputElement.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      searchElement.classList.remove('active');
      inputElement.value = '';
      search('');
    }
  });
  inputElement.addEventListener('focus', (evt) => searchElement.classList.add('focus'));
  inputElement.addEventListener('blur', (evt) => searchElement.classList.remove('focus'));
  const iconElement = e('SPAN', { className: 'magnifying-glass', title: l('search_documents') });
  const buttonElement = e('SPAN', { className: 'x-button', title: l('clear_search') });
  const searchElement = e('DIV', { id: 'search-input' }, [ inputElement, iconElement, buttonElement ]);
  buttonElement.addEventListener('click', (evt) => {
    searchElement.classList.remove('active');
    inputElement.value = '';
    inputElement.focus();
    search('');
  });
  createTopBar('toolbar-search', { left: l('documents'), center: searchElement });
}

let createInflectionTableButton;

function createCommandToolbar() {
  const xButtonElement = e('SPAN', { className: 'x-button', title: l('cancel') });
  xButtonElement.addEventListener('click', handleCancelClick);
  const spanElement = e('SPAN', { id: 'selection-status' });
  const centerLeftElement = e('DIV', { id: 'toolbar-commands-left' }, [ xButtonElement, spanElement ]);
  const deleteButtonElement = e('BUTTON', {}, l('delete'));
  deleteButtonElement.addEventListener('click', handleDeleteClick);
  const createButtonElement = e('BUTTON', {}, l('create_inflection_tables'))
  createButtonElement.addEventListener('click', handleCreateInflectionClick);
  createInflectionTableButton = createButtonElement;
  const centerRightElement = e('DIV', { id: 'toolbar-commands-right' }, [ createButtonElement, deleteButtonElement ]);
  createTopBar('toolbar-commands', { center: [ centerLeftElement, centerRightElement ] });
}

function openKebabMenu() {
  const { buttonElement, url } = selectedItem;
  const changeElement = e('LI', {}, l('change_title'));
  changeElement.addEventListener('click', handleChangeTitleClick);
  const openElement = e('A', { href: url, target: '_blank' }, l('open_original_page'));
  if (!url) {
    openElement.style.display = 'none';
  }
  const listElement = e('UL', {}, [ changeElement, openElement ]);
  const menuElement = e('DIV', { id: 'kebab-menu' }, listElement);
  menuElement.append(listElement);
  const r1 = buttonElement.getBoundingClientRect();
  const r2 = buttonElement.parentNode.getBoundingClientRect();
  menuElement.style.right = (r2.right - r1.right) + 'px';
  menuElement.style.top = (r1.top - r2.top) + 'px';
  buttonElement.parentNode.append(menuElement);
  menuElement.addEventListener('click', (evt) => {
    const { target } = evt;
    if (target !== menuElement) {
      menuElement.remove();
    }
  });
  document.addEventListener('mousedown', (evt) => {
    const { target } = evt;
    if (!menuElement.contains(target)) {
      menuElement.remove();
    }
  });
  document.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      menuElement.remove();
    }
  });
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
  try {
    const doc = await loadObject(item.key);
    const { url, title, lang, type } = doc;
    await adjustTextDirection(item.titleElement, title);
    item.titleElement.textContent = title;
    item.titleElement.title = url || '';
    item.lang = lang;
    item.url = url;
    item.title = title;
    item.searchStrings = findSearchStrings(doc);
    item.inflectionTables = await getInflectionTables(doc);
    if (type) {
      item.titleElement.classList.add(type);
    }
  } catch (err) {
  }
}

async function adjustTextDirection(element, text) {
  const direction = await detectDirection(text);
  if (direction === 'rtl') {
    element.classList.add('rtl');
  } else {
    element.classList.remove('rtl');
  }
}

function createItem(key, date, type) {
  const day = getDateString(date);
  const time = getTimeString(date);
  const rippleElement = e('SPAN', { className: 'ripple' });
  const checkboxElement = e('SPAN', { className: 'checkbox', tabIndex: 0 }, rippleElement);
  const timeElement = e('SPAN', { className: 'time' }, time);
  const titleElement = e('SPAN', { className: 'title' }, '...');
  const buttonElement = e('SPAN', { className: 'kebab' });
  const itemElement = e('LI', {
    dataset: { key, type }
  }, [ checkboxElement, timeElement, titleElement, buttonElement ]);
  return { day, time, key, date, itemElement, titleElement, buttonElement };
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
        title = l('today_being', day);
      } else if(isYesterday(day)) {
        title = l('yesterday_being', day);
      } else {
        title = capitalize(day);
      }
    } else {
      // search results
      const results = lc('search_result', items.length);
      title = l(`for_query`, [ results, query ]);
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
    const message = l(searching ? 'no_search_results' : 'no_documents');
    const messageElement = e('DIV', { className: 'message' }, message);
    listContainer.append(messageElement);
  }
}

function updateSelection() {
  const checkboxes = getSelectedCheckboxes();
  selection = checkboxes.map(cb => cb.parentNode.dataset.key);
  createInflectionTableButton.classList.toggle('hidden', !getSelectedInflectionTables());
}

function getSelectedInflectionTables() {
  const items = getItems(selection);
  const langSelected = {};
  for (const { lang } of items) {
    langSelected[lang] = true;
  }
  const langs = Object.keys(langSelected);
  const tableLists = items.map(i => i.inflectionTables).filter(t => !!t);
  if (langs.length === 1 && tableLists.length > 0) {
    const lang = langs[0];
    const tables = mergeInflectionTables(tableLists, lang);
    return { tables, lang };
  }
}

function updateToolbar() {
  const toolbar = document.getElementById('toolbar-commands');
  const status = document.getElementById('selection-status');
  if (selection.length > 0) {
    toolbar.classList.add('active');
    status.textContent = lc('selected_document', selection.length);
  } else {
    toolbar.classList.remove('active');
  }
}

function openInflectionDialogBox() {
  const selection = [];
  const { tables, lang } = getSelectedInflectionTables();
  getPossibleTypes(lang).forEach((type) => {
    const rippleElement = e('SPAN', { className: 'ripple' });
    const checkboxElement = e('SPAN', { className: 'checkbox', tabIndex: 0 }, rippleElement);
    const labelElement = e('LABEL', {}, l(`include_${type}s`));
    const sectionElement = e('SECTION', {}, [ checkboxElement, labelElement ]);
    dialogBoxContent.append(sectionElement);
    const available  = (tables[type].length > 0);
    checkboxElement.classList.toggle('checked', available);
    checkboxElement.classList.toggle('disabled', !available);
    labelElement.classList.toggle('disabled', !available);
    if (available) {
      selection.push(type);
    }
    checkboxElement.addEventListener('change', (evt) => {
      const { classList } = evt.target;
      if (classList.contains('checked')) {
        selection.push(type);
      } else {
        const index = selection.indexOf(type);
        if (index !== -1) {
          selection.splice(index, 1);
        }
      }
      createButton.disabled = (selection.length === 0);
    });
  });
  const cancelButton = e('BUTTON', {}, l('cancel'));
  cancelButton.addEventListener('click', (evt) => {
    closeDialogBox();
  });
  const createButton = e('BUTTON', { className: 'default' }, l('create'));
  createButton.addEventListener('click', async (evt) => {
    const key = await saveInflectionTables(tables, selection, lang);
    openPage('article', { t: key });
    closeDialogBox();
  });
  const buttonContainer = e('DIV', { className: 'button-container' }, [ cancelButton, createButton ]);
  dialogBoxContent.append(buttonContainer);
  dialogBoxTitle.append(l('inflection_tables'));
  dialogBoxContainer.classList.remove('hidden');
  createButton.focus();
}

function closeDialogBox() {
  while(dialogBoxTitle.firstChild) {
    dialogBoxTitle.firstChild.remove();
  }
  while(dialogBoxContent.firstChild) {
    dialogBoxContent.firstChild.remove();
  }
  dialogBoxContainer.classList.add('hidden');
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

function getItems(keys) {
  const list = [];
  for (const card of cards) {
    for (const item of card.items) {
      if (keys.includes(item.key)) {
        list.push(item);
      }
    }
  }
  return list;
}

function toLower(s, lang) {
  try {
    return s.toLocaleLowerCase(lang);
  } catch (err) {
    return s.toLowerCase();
  }
}

function searchItem(item, words) {
  const { lang, searchStrings } = item;
  const lcWords = words.map(w => toLower(w, lang));
  return lcWords.every((w) => {
    return searchStrings.some(s => s.includes(w));
  });
}

function findSearchStrings(doc) {
  const { url, title, lang, content } = doc;
  const list = [];
  if (url) {
    list.push(url);
  }
  addSearchString(title, lang, list);
  addSearchString(content, lang, list);
  return list;
}

function addSearchString(content, lang, list) {
  if (typeof(content) === 'string') {
    const lc = toLower(content, lang);
    list.push(lc);
  } else if (content instanceof Array) {
    for (const item of content) {
      addSearchString(item, lang, list);
    }
  } else if (content instanceof Object) {
    addSearchString(content.content, lang, list);
    addSearchString(content.footnote, lang, list);
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
    openPage('article', { t: key });
  } else if (target.classList.contains('time')) {
    // focus the checkbox and toggle it
    const [ checkbox ] = target.parentNode.getElementsByClassName('checkbox');
    checkbox.focus();
    const kbEvent = new KeyboardEvent('keypress', { key: ' ', bubbles: true, shiftKey });
    checkbox.dispatchEvent(kbEvent);
  } else if (target.classList.contains('kebab')) {
    for (const card of cards) {
      for (const item of card.items) {
        if (item.buttonElement === target) {
          selectedItem = item;
          openKebabMenu();
        }
      }
    }
  }
}

function handleChange(evt) {
  const { target } = evt;
  if (target.classList.contains('checkbox')) {
    updateSelection();
    updateToolbar();
  }
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

function handleCreateInflectionClick(evt) {
  openInflectionDialogBox();
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

function handleUpdate(evt) {
  const { key } = evt.detail;
  for (const card of cards) {
    for (const item of card.items) {
      if (item.key === key) {
        loadItem(item);
      }
    }
  }
}

function handleChangeTitleClick(evt) {
  const { key, titleElement } = selectedItem;
  const { parentNode, textContent } = titleElement;
  const inputElement = e('INPUT', { type: 'text', className: 'title-input', value: textContent });
  // need the DIV as INPUT doesn't position correctly using just left/right
  const containerElement = e('DIV', { className: 'title-input-container' }, inputElement);
  parentNode.append(containerElement);
  // position the text box over the title, accounting for padding
  const r1 = titleElement.getBoundingClientRect();
  const r2 = parentNode.getBoundingClientRect();
  const s1 = getComputedStyle(titleElement);
  const s2 = getComputedStyle(inputElement);
  const pTop1 = parseFloat(s1.paddingTop), pTop2 = parseFloat(s2.paddingTop);
  const pLeft1 = parseFloat(s1.paddingLeft), pLeft2 = parseFloat(s2.paddingLeft);
  const pRight1 = parseFloat(s1.paddingRight), pRight2 = parseFloat(s2.paddingRight);
  // not sure why the 1px adjustment is neccessary
  containerElement.style.top = (r1.top - r2.top - pTop1 + pTop2 - 1) + 'px';
  containerElement.style.left = (r1.left - r2.left + pLeft1 - pLeft2) + 'px';
  containerElement.style.right = (r2.right - r1.right - pRight1 + pRight2) + 'px';
  // use right-to-left layout if title uses it
  if (titleElement.classList.contains('rtl')) {
    inputElement.classList.add('rtl');
  }
  selectedItem.inputElement = inputElement;
  inputElement.addEventListener('blur', async (evt) => {
    if (selectedItem) {
      const { key, inputElement, titleElement } = selectedItem;
      const newTitle = inputElement.value;
      const oldTitle = titleElement.textContent;
      selectedItem = selectedItem.inputElement = null;
      inputElement.parentNode.remove();
      if (newTitle !== oldTitle) {
        titleElement.textContent = newTitle;
        try {
          const doc = await loadObject(key);
          doc.title = newTitle;
          await saveObject(key, doc);
        } catch (e) {
          // put in the old title if saving failed
          titleElement.textContent = oldTitle;
        }
      }
    }
  });
  inputElement.addEventListener('keydown', (evt) => {
    const { inputElement } = selectedItem;
    if (evt.key === 'Escape') {
      selectedItem = null;
      inputElement.parentNode.remove();
    } else if (evt.key === 'Enter') {
      inputElement.blur();
    }
  });
  inputElement.addEventListener('input', (evt) => {
    const { inputElement } = selectedItem;
    adjustTextDirection(inputElement, inputElement.value);
  });
  inputElement.focus();
}

start();
