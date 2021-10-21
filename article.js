import sampleText from './lib/sample.js';
import { generateFootnoteContents } from './lib/translation.js';
import { addText, addFootnotes } from './lib/layout.js';
import { createMenuItems, attachEditingHandlers } from './lib/editing.js';
import { loadObject } from './lib/storage.js';
import { createArticleNavigation } from './lib/side-nav.js';

const sampleDoc = { title: 'Test', content: sampleText };

async function start() {
  const setStatus = (status) => document.body.className = status;
  // show loader only when loading takes a while
  let done = false;
  setTimeout(() => done || setStatus('pending'), 250);
  try {
    const { searchParams } = new URL(location);
    const key = searchParams.get('t');
    const doc = (key) ? await loadObject(key) : sampleDoc;
    const { title, content, lang } = doc;
    // create menu items
    createMenuItems();
    // create side navigation
    createArticleNavigation();
    document.title = title;
    // look up definitions
    const footnotes = await generateFootnoteContents(content);
    // add the article text into the DOM
    addText(content);
    // add footnotes
    addFootnotes(footnotes);
    // attach handlers to elements for editing contents
    attachEditingHandlers();
    setStatus('ready');
  } catch (e) {
    console.error(e);
    const errorElement = document.getElementById('error-text');
    errorElement.textContent = e;
    setStatus('error');
  }
  done = true;
}

addEventListener('load', start);
