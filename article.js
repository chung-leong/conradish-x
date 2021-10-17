import sampleText from './lib/sample.js';
import { generateFootnoteContents } from './lib/translation.js';
import { addText, addFootnotes } from './lib/layout.js';
import { handleInput, handleKeyPress, handlePaste } from './lib/editing.js';
import { loadObject } from './lib/storage.js';

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
    document.title = title;
    // look up definitions
    const footnotes = await generateFootnoteContents(content);
    // add the article text into the DOM
    addText(content);
    // add footnotes
    addFootnotes(footnotes);
    // attach handlers to elements for editing contents
    attachHandlers();
    setStatus('ready');
  } catch (e) {
    const errorElement = document.getElementById('error-text');
    errorElement.textContent = e.toString();
    setStatus('error');
  }
  done = true;
}

function attachHandlers() {
  const { body } = document;
  body.addEventListener('input', handleInput);
  body.addEventListener('keypress', handleKeyPress);
  body.addEventListener('paste', handlePaste);
}

addEventListener('load', start);
