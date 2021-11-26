import { e } from './lib/ui.js';
import { initializeStorage, findObjects, loadObject } from './lib/storage.js';
import { openPage } from './lib/navigation.js';

async function start() {
  const list = document.createElement('UL');
  list.addEventListener('click', handleClick);
  document.body.appendChild(list);
  // add menu item for creating new document
  const create = e('LI', {
    className: 'create disabled',
    title: 'Select portion of document you wish to print first',
    dataset: { command: 'create' }
  }, 'Create print version');
  list.appendChild(create);
  // ask service worker whether current tab has selection
  chrome.runtime.sendMessage(undefined, { type: 'query' }, (response) => {
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
      const open = e('LI', {
        className: 'document',
        dataset: { command: 'open' + type, arg: key },
        title: `Created on ${date.toLocaleString()}`,
      }, doc.title);
      list.appendChild(open);
    }
    // add another separator
    list.appendChild(e('LI', { className: 'separator' }));
    // add menu item for opening document list page
    const show = e('LI', {
      className: 'folder',
      dataset: { command: 'list' }
    }, 'Show all documents');
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
          chrome.runtime.sendMessage(undefined, { type: 'capture' });
          break;
        case 'openDOC':
          openPage('article', { t: arg });
          break;
        case 'list':
          openPage('list');
          break;
      }
      window.close();
    }
  }
}

addEventListener('load', start);
