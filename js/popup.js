import { e } from './lib/ui.js';
import { initializeStorage, findObjects, loadObject } from './lib/storage.js';
import { openPage } from './lib/navigation.js';
import { l, getLanguageDirection } from './lib/i18n.js';

async function start() {
  const list = document.createElement('UL');
  list.addEventListener('click', handleClick);
  document.body.appendChild(list);
  // add menu item for creating new document
  const create = e('LI', {
    className: 'create disabled',
    title: l('selection_portion_of_document'),
    dataset: { command: 'create' }
  }, l('create_print_version'));
  list.appendChild(create);
  // ask service worker whether current tab has selection
  chrome.runtime.sendMessage({ type: 'query' }, (response) => {
    // response is true if there is selection, false if there isn't, and null
    // if we're in a page with unsupported protocol (e.g. chrome://)
    if (response !== false) {
      if (response) {
        create.classList.remove('disabled');
      }
      create.title = '';
    }
  });
  await initializeStorage();
  const docs = findObjects();
  if (docs.length > 0) {
    // add separator
    list.appendChild(e('LI', { className: 'separator' }));
    // list up to 8 recent documents
    const recentDocs = docs.slice(-8).reverse();
    for (const { key, date, type } of recentDocs) {
      // add menu item for opening existing doc
      const doc = await loadObject(key);
      const direction = getLanguageDirection(doc.lang);
      const open = e('LI', {
        className: `document ${direction}`,
        dataset: { command: 'open' + type, arg: key },
        title: l('created_on', date.toLocaleString()),
      }, doc.title);
      list.appendChild(open);
    }
    // add another separator
    list.appendChild(e('LI', { className: 'separator' }));
    // add menu item for opening document list page
    const show = e('LI', {
      className: 'folder',
      dataset: { command: 'list' }
    }, l('show_all_documents'));
    list.appendChild(show);
  }
}

function handleClick(evt) {
  const { target } = evt;
  if (!target.classList.contains('disabled')) {
    const { command, arg } = target.dataset;
    if (command) {
      switch (command) {
        case 'create':
        // close window only after message is delivered
          chrome.runtime.sendMessage({ type: 'capture' }, () => {
            // the message port could be closed before we receive a response
            // due to the pop-up being forcibly closed by the opening of a new tab
            chrome.runtime.lastError;
            close();
          });
          break;
        case 'openDOC':
          openPage('article', { t: arg });
          close();
          break;
        case 'list':
          openPage('list');
          close();
          break;
      }
    }
  }
}

addEventListener('load', start);
