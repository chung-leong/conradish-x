import sampleText from './lib/sample.js';
import { addText } from './lib/layout.js';
import { createMenuItems, attachEditingHandlers } from './lib/editing.js';
import { initializeStorage, loadObject, storageChange } from './lib/storage.js';
import { createArticleNavigation } from './lib/side-bar.js';
import { setSourceLanguage } from './lib/settings.js';

const sampleDoc = { title: 'Test', lang: 'en', content: sampleText };

async function start() {
  const setStatus = (status) => document.body.className = status;
  // show loader only when loading takes a while
  let done = false;
  setTimeout(() => done || setStatus('pending'), 250);
  try {
    await initializeStorage();
    const { searchParams } = new URL(location);
    const key = searchParams.get('t');
    const doc = (key) ? await loadObject(key) : sampleDoc;
    const { title, content, lang } = doc;
    // set the source language
    setSourceLanguage(lang);
    // create menu items
    createMenuItems();
    // create side navigation
    createArticleNavigation();
    document.title = title;
    // add the article text into the DOM
    addText(content);
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
  done = true;
}

addEventListener('load', start);
