import { initializeStorage, findObjects, loadObject } from './lib/storage.js';

async function start() {
  const list = document.createElement('UL');
  list.addEventListener('click', handleClick);
  document.body.appendChild(list);
  // add menu item for creating new document
  const create = document.createElement('LI');
  create.textContent = 'Create annotated document';
  create.className = 'create disabled';
  create.title = 'Select portion of document you wish to annotate first';
  create.dataset.command = 'create';
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
    const sep1 = document.createElement('LI');
    sep1.className = 'separator';
    list.appendChild(sep1);
    // list up to 8 recent documents
    const recentDocs = docs.slice(-8).reverse();
    for (const { key, date, type } of recentDocs) {
      // add menu item for opening existing doc
      const doc = await loadObject(key);
      const open = document.createElement('LI');
      open.textContent = doc.title;
      open.className = 'document';
      open.dataset.command = 'open' + type;
      open.dataset.arg = key;
      open.title = `Created on ${date.toLocaleString()}`;
      list.appendChild(open);
    }
    // add another separator
    const sep2 = document.createElement('LI');
    sep2.className = 'separator';
    list.appendChild(sep2);
    // add menu item for opening document list page
    const show = document.createElement('LI');
    show.textContent = 'Show all documents';
    show.className = 'folder';
    show.dataset.command = 'list';
    list.appendChild(show);
  }
}

function handleClick(evt) {
  const { target } = evt;
  if (!target.classList.contains('disabled')) {
    const { command, arg } = target.dataset;
    if (command) {
      // ask service worker to carry out the command
      chrome.runtime.sendMessage(undefined, { type: 'command', command, arg });
      window.close();
    }
  }
}

addEventListener('load', start);
