import { loadDocument } from './lib/layout.js';
import { createMenuItems, attachEditingHandlers } from './lib/editing.js';
import { initializeStorage, storageChange } from './lib/storage.js';
import { createArticleNavigation } from './lib/side-bar.js';

async function start() {
  const setStatus = (status) => document.body.className = status;
  try {
    await initializeStorage();
    const { searchParams } = new URL(location);
    const key = searchParams.get('t');
    // load the document
    await loadDocument(key);
    // create menu items
    createMenuItems();
    // create side navigation
    createArticleNavigation();
    // attach handlers to elements for editing contents
    attachEditingHandlers();
    setStatus('ready');
    // close the window if the document is deleted
    storageChange.addEventListener('delete', (evt) => {
      if (evt.detail.key === key) {
        window.close();
      }
    });
  } catch (e) {
    console.error(e);
    const errorElement = document.getElementById('error-text');
    errorElement.textContent = e;
    setStatus('error');
  }
}

addEventListener('load', start);
