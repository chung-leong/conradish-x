import { initializeStorage, storageChange, getSettings } from './lib/storage.js';
import { loadDocument, setFilterMode } from './lib/document.js';
import { setEditMode, createMenuItems, attachEditingHandlers } from './lib/editing.js';
import { createArticleNavigation, initializeAutoCollapse } from './lib/side-bar.js';
import { setWindowName, openPage } from './lib/navigation.js';
import { l } from './lib/i18n.js';

async function start() {
  try {
    await initializeStorage();
    const { searchParams } = new URL(location);
    const key = searchParams.get('t');
    setWindowName('article', [ key ]);
    // load the document
    const existing = await loadDocument(key);
    // set filter and edit mode
    const { filter } = getSettings();
    const mode = (filter === 'manual' && !existing) ? 'clean' : 'annotate';
    setFilterMode(filter);
    setEditMode(mode);
    // create menu items
    createMenuItems();
    // create side navigation
    createArticleNavigation();
    // attach handlers to elements for editing contents
    attachEditingHandlers();
    attachHelpButtonHandler();
    // collapse the side-bar if browser is narrow (unless we're scrubbing)
    if (mode !== 'clean') {
      initializeAutoCollapse();
    }
    // close the window if the document is deleted
    storageChange.addEventListener('delete', (evt) => {
      if (evt.detail.key === key) {
        window.close();
      }
    });
  } catch (e) {
    console.error(e);
    const statusElement = document.getElementById('status-container');
    statusElement.append(e.message);
  }
}

function attachHelpButtonHandler() {
  const buttonElement = document.getElementById('help-button');
  buttonElement.addEventListener('click', evt => openPage('help'));
  buttonElement.title = l('user_guide');
}

start();
