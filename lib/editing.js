import { adjustFooterPosition, adjustFootnotes, adjustFootnoteReferences, createElement } from './layout.js';
import { extractContent } from './capture.js';

const articleMenuElement = document.getElementById('article-menu');
const articleMenuItems = {};
let lastSelectedRange = null;
let articleMenuClicked = false;

export function createMenuItems() {
  const itemDefs = {
    addDefinition: {
      label: 'Add definition',
      tooltip: 'show both term and definition in footnote',
      handler: handleAddDefinition,
    },
    addTranslation: {
      label: 'Add translation',
      tooltip: 'show translated sentence only in footnote',
      handler: handleAddTranslation,
    },
  };
  const list = document.createElement('UL');
  list.addEventListener('mousedown', handleMenuMouseDown);
  for (const [ key, itemDef ] of Object.entries(itemDefs)) {
    const { label, tooltip, handler } = itemDef;
    const item = document.createElement('LI');
    item.textContent = label;
    item.setAttribute('title', tooltip);
    item.addEventListener('click', handler);
    list.appendChild(item);
    articleMenuItems[key] = item;
  }
  articleMenuElement.appendChild(list);
}

export function handleInput(evt) {
  const { target } = evt;
  if (target.className === 'footer-content') {
    handleFootnoteInput(evt);
  } else if (target.id === 'article-text') {
    handleArticleInput(evt);
  }
}

export function handleKeyPress(evt) {
  const { target } = evt;
  if (target.className === 'footer-content') {
    handleFootnoteKeyPress(evt);
  } else if (target.id === 'article-text') {
    handleArticleKeyPress(evt);
  }
}

export function handlePaste(evt) {
  const html = evt.clipboardData.getData('text/html');
  if (html) {
    // cancel default behavior
    evt.preventDefault();
    evt.stopPropagation();
    // parse HTML ourselves
    const range = document.createRange();
    range.selectNode(evt.target);
    const fragment = range.createContextualFragment(html);
    // grab content from fragment and recreate it
    const content = extractContent(fragment);
    const element = createElement({ tag: 'DIV', content });
    const filteredHTML = element.innerHTML;
    // paste it
    document.execCommand('insertHTML', false, filteredHTML);
  }
}

function handleFootnoteKeyPress(evt) {
  const { key, shiftKey, ctrlKey, altKey } = evt;
  if (key === 'Enter' && !shiftKey && !ctrlKey && !altKey) {
    // cancel default behavior
    evt.preventDefault();
    evt.stopPropagation();
    // at the end of the list item we need to insert two <BR>s
    const count = isCursorAtListItemEnd() ? 2 : 1;
    document.execCommand('insertHTML', false, '<br>'.repeat(count));
  }
}

function handleFootnoteInput(evt) {
  // adjust the position of the footer in case the height is different
  const contentElement = evt.target;
  const pusherElement = contentElement.previousSibling;
  adjustFooterPosition(pusherElement, contentElement);
  // see if any item has gone missing or resurfaced, hiding and restoring
  // the referencing sup elements accordingly
  adjustFootnoteReferences();
}

function handleArticleInput(evt) {
  adjustFootnotes();
}

function handleArticleKeyPress(evt) {
  // prevent modification to sup elements
  if (isCursorInFootnoteRef()) {
    evt.preventDefault();
    evt.stopPropagation();
  }
}

export function handleSelectionChange(evt) {
  const range = getSelectionRange();
  const container = getRangeContainer(range);
  const inArticle = (container && container.id  === 'article-text');
  const inFootntoe = (container && container.className === 'footnote-content');
  if (inArticle && !range.collapsed) {
    const r1 = range.getBoundingClientRect();
    const r2 = container.parentNode.getBoundingClientRect();
    const left = r1.left - r2.left + 2;
    let top = r1.bottom - r2.top + 2;
    articleMenuElement.style.left = `${left}px`;
    articleMenuElement.style.top = `${top}px`;
    // show/hide menu item depending on how many words are selected
    const count = getWordCount(range.toString());
    toggle(articleMenuItems.addTranslation, count > 1);
    toggle(articleMenuItems.addDefinition, count <= 10);
    toggle(articleMenuElement, true);
    // remember the range
    lastSelectedRange = range;
  } else {
    const clear = () => {
      toggle(articleMenuElement, false);
      lastSelectedRange = null;
    };
    if (articleMenuClicked) {
      // clear the menu after a small delay, so we don't lose the click event
      articleMenuClicked = false;
      setTimeout(clear, 150);
    } else {
      clear();
    }
  }
}

function handleMenuMouseDown(evt) {
  articleMenuClicked = true;
}

function handleAddDefinition(evt) {
  console.log('Definition: ' + lastSelectedRange.toString());
}

function handleAddTranslation(evt) {
  console.log('Translation: ' + lastSelectedRange.toString());
}

function getWordCount(text) {
  // stick the text into the scratch-pad document in the iframe
  // so we can take advantage of the browser's sophisticated
  // word detection ability without affecting the selection in this
  // document
  const iframe = document.getElementById('scratch-pad');
  const win = iframe.contentWindow;
  const doc = win.document;
  const bin = doc.getElementById('bin');
  bin.textContent = text.trim();
  // select the text we inserted
  const sel = win.getSelection();
  sel.removeAllRanges();
  const range = doc.createRange();
  range.selectNode(bin);
  sel.addRange(range);
  // ask the browser to move selection back by one word
  let count = 0;
  let remaining = text;
  while (remaining) {
    sel.modify('extend', 'backward', 'word');
    const rangeAfter = sel.getRangeAt(0);
    remaining = rangeAfter.toString().trim();
    count++;
  }
  return count;
}

function isCursorAtListItemEnd() {
  const { endContainer, endOffset } = getSelectionRange();
  // see if offset is at the end of the text node
  if (endContainer.length !== endOffset) {
    return false;
  }
  // make sure the node and its ancestors are all the last nodes
  for (let c = endContainer; c && c.tagName === 'LI'; c = c.parentNode) {
    if (c.parentNode.lastChild !== c) {
      return false;
    }
  }
  return true;
}

function isCursorInFootnoteRef() {
  const range = getSelectionRange();
  const { startContainer, endContainer } = getSelectionRange();
  if (startContainer === endContainer) {
    for (let n = endContainer; n; n = n.parentNode) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.tagName === 'SUP' && n.className === 'footnote-number') {
          return true;
        } else {
          break;
        }
      }
    }
  }
  return false;
}

function getSelectionRange() {
  const selection = getSelection();
  return selection.getRangeAt(0);
}

function toggle(element, shown) {
  element.style.display = (shown) ? 'block' : 'none';
}

function getRangeContainer(range) {
  for (let n = range.startContainer; n; n = n .parentNode) {
    if (n.contentEditable === 'true') {
      return n;
    }
  }
}
