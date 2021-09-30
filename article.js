import sampleText from './lib/sample.js';
import { generateFootnoteContents } from './lib/translation.js';
import { addText, addFootnotes } from './lib/layout.js';
import { handleInput, handleKeyPress } from './lib/editing.js';

async function start() {
  const setStatus = (status) => document.body.className = status;
  // show loader only when loading takes a while
  let done = false;
  setTimeout(() => done || setStatus('pending'), 250);
  try {
    const title = 'This is a test';
    const content = sampleText;
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
}

addEventListener('load', start);
