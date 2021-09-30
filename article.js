import sampleText from './lib/sample.js';
import { generateFootnoteContents } from './lib/translation.js';
import { addText,  addFootnotes } from './lib/layout.js';

async function start() {
  try {
    // look up definitions
    const content = sampleText;
    const footnotes = await generateFootnoteContents(content);
    // add the article text into the DOM
    addText(content);
    // add footnotes
    addFootnotes(footnotes);
  } catch (e) {
    console.error(e);
  }
}

addEventListener('load', start);
