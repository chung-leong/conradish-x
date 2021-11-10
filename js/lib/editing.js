import { e } from './ui.js';
import { adjustLayout, adjustFootnoteReferences, annotateRange, attachFootnote } from './layout.js';
import { extractContent } from './capture.js';
import { queryDefinition } from './translation.js';
import { getSourceLanguage, getTargetLanguage } from './settings.js';

export function attachEditingHandlers() {
  document.addEventListener('input', handleInput);
  document.addEventListener('keypress', handleKeyPress);
  document.addEventListener('paste', handlePaste);
  document.addEventListener('selectionchange', handleSelectionChange);
}

const articleMenuElement = document.getElementById('article-menu');
const articleMenuItems = {};
let lastSelectedRange = null;
let articleMenuClicked = false;

export function createMenuItems() {
  const itemDefs = {
    addDefinition: {
      label: 'Add definition',
      title: 'show both term and definition in footnote',
      handler: handleAddDefinition,
    },
    addTranslation: {
      label: 'Add translation',
      title: 'show translated sentence only in footnote',
      handler: handleAddTranslation,
    },
  };
  const list = e('UL');
  list.addEventListener('mousedown', handleMenuMouseDown);
  for (const [ key, itemDef ] of Object.entries(itemDefs)) {
    const { label, title, handler } = itemDef;
    const item = e('LI', { title }, label);
    item.addEventListener('click', handler);
    list.append(item);
    articleMenuItems[key] = item;
  }
  articleMenuElement.appendChild(list);
}

function handleInput(evt) {
  const { target } = evt;
  if (target.className === 'footer-content') {
    handleFootnoteInput(evt);
  } else if (target.id === 'article-text') {
    handleArticleInput(evt);
  }
}

function handleKeyPress(evt) {
  const { target } = evt;
  if (target.className === 'footer-content') {
    handleFootnoteKeyPress(evt);
  } else if (target.id === 'article-text') {
    handleArticleKeyPress(evt);
  }
}

function handlePaste(evt) {
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
    const element = e('DIV');
    addContent(element, content);
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
  // see if any item has gone missing or resurfaced, hiding and restoring
  // the referencing sup elements accordingly
  adjustFootnoteReferences({ updateReferences: true });
  // adjust the adjust the page layout in case the height is different
  adjustLayout({ updateFooterPosition: true });
}

function handleArticleInput(evt) {
  adjustFootnoteReferences({ updateFootnotes: true });
  adjustLayout();
}

function handleArticleKeyPress(evt) {
  // prevent modification to sup elements
  if (isCursorInFootnoteRef()) {
    evt.preventDefault();
    evt.stopPropagation();
  }
}

function handleSelectionChange(evt) {
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
  addFootnote(true);
}

function handleAddTranslation(evt) {
  addFootnote(false);
}

async function addFootnote(includeTerm) {
  // set the selection to what was last selected
  const selection = getSelection();
  const range = lastSelectedRange.cloneRange();
  const textSelected = range.toString();
  // trim off whitespaces
  const wsBefore = textSelected.length - textSelected.trimLeft().length;
  const wsAfter = textSelected.length - textSelected.trimRight().length;
  range.setStart(range.startContainer, range.startOffset + wsBefore);
  range.setEnd(range.endContainer, range.endOffset - wsAfter);
  selection.removeAllRanges();
  selection.addRange(range);
  // create a <span> with <sup> and replace the selection
  const element = annotateRange(range);
  document.execCommand('insertHTML', false, element.outerHTML);
  // attach placeholder text
  const term = textSelected.trim();
  const sourceLang = getSourceLanguage();
  const targetLang = getTargetLanguage();
  const noTranslation = (targetLang === sourceLang || !targetLang);
  const placeholder = (noTranslation) ? '' : '...';
  const initialText = formatDefinition(term, placeholder, includeTerm);
  const footnote = attachFootnote(initialText);
  adjustFootnoteReferences({ updateNumbering: true });
  adjustLayout();
  if (!noTranslation) {
    let definition = '';
    try {
      definition = await queryDefinition(term, sourceLang, targetLang);
    } catch (e) {
    }
    const { itemElement } = footnote;
    const currentText = itemElement.textContent;
    if (itemElement.textContent === initialText) {
      itemElement.textContent = formatDefinition(term, definition, includeTerm);
      adjustLayout();
    }
  }
}

function formatDefinition(term, definition, includeTerm) {
  const parts = [];
  if (includeTerm) {
    parts.push(term, '-');
  }
  parts.push(definition);
  return parts.join(' ');
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
  const range = getSelectionRange();
  if (!range) {
    return false;
  }
  const { endContainer, endOffset } = range;
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
  if (!range) {
    return false;
  }
  const { startContainer, endContainer } = range;
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
  if (selection.rangeCount > 0) {
    return selection.getRangeAt(0);
  }
}

function getRangeContainer(range) {
  for (let n = range.startContainer; n; n = n .parentNode) {
    if (n.contentEditable === 'true') {
      return n;
    }
  }
}

function toggle(element, shown) {
  element.style.display = (shown) ? 'block' : 'none';
}
