import { initializeStorage, storageChange, getSettings } from './lib/storage.js';
import { loadDocument, setFilterMode } from './lib/document.js';
import { setEditMode, createMenuItems, attachEditingHandlers } from './lib/editing.js';
import { createArticleNavigation, initializeAutoCollapse } from './lib/side-bar.js';
import { setWindowName, openPage } from './lib/navigation.js';
import { applyDefaultFontSettings } from './lib/fonts.js';
import { l } from './lib/i18n.js';

async function start() {
  try {
    await initializeStorage();
    await applyDefaultFontSettings();
    const { searchParams } = new URL(location);
    const key = searchParams.get('t');
    setWindowName('article', [ key ]);
    // set filter
    const { filter } = getSettings();
    setFilterMode(filter);
    // load the document
    const existing = await loadDocument(key);
    // set edit mode
    const mode = (filter === 'manual' && !existing) ? 'clean' : 'annotate';
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
    // do time-consuming scan for fonts
    applyDefaultFontSettings({ scan: 'fonts' });
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
