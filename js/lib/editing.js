import { e, separateWords } from './ui.js';
import { adjustLayout, adjustFootnoteReferences, annotateRange, attachFootnote, saveDocument } from './layout.js';
import { transverseRange } from './capturing.js';
import { translate } from './translation.js';
import { getSourceLanguage, getTargetLanguage } from './settings.js';

export function attachEditingHandlers() {
  document.addEventListener('input', handleInput);
  document.addEventListener('keypress', handleKeyPress);
  document.addEventListener('paste', handlePaste);
  document.addEventListener('selectionchange', handleSelectionChange);
  document.execCommand('styleWithCSS', false, true);
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

async function addFootnote(includeTerm) {
  // set the selection to what was last selected
  const selection = getSelection();
  const range = normalizeRange(lastSelectedRange.cloneRange());
  const textSelected = range.toString();
  // trim off whitespaces
  const wsAfter = textSelected.length - textSelected.trimRight().length;
  // for some reason execCommand('insertHTML') only works correctly
  // when we replace some of the existing text
  range.setEnd(range.endContainer, range.endOffset - wsAfter);
  range.setStart(range.endContainer, range.endOffset - 1);
  selection.removeAllRanges();
  selection.addRange(range);
  const element = annotateRange(range);
  document.execCommand('insertHTML', false, range.toString() + element.outerHTML);
  // attach placeholder text
  const term = textSelected.trim();
  const sourceLang = getSourceLanguage();
  const targetLang = getTargetLanguage();
  const translating = (targetLang && targetLang !== sourceLang);
  const placeholder = (translating) ? '...' : '';
  const initialText = (includeTerm) ? `${term} - ${placeholder}` : placeholder;
  const footnote = attachFootnote(initialText);
  adjustFootnoteReferences({ updateNumbering: true });
  adjustLayout({ updateFooterPosition: true });
  if (translating) {
    const result = await translate(term, sourceLang, targetLang, includeTerm);
    const { itemElement } = footnote;
    if (itemElement.textContent === initialText) {
      const { term, translation, ...extra } = result;
      const text = (includeTerm) ? `${term} - ${translation}` : translation;
      itemElement.textContent = text;
      adjustFootnoteReferences({ updateContent: true });
      adjustLayout({ updateFooterPosition: true });
      // save additional information from Google Translate
      footnote.extra = { term, ...extra };
      autosave(500);
    }
  } else {
    const { footer } = footnote.page;
    footer.listElement.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNode(footnote.itemElement.lastChild);
    range.collapse();
    sel.addRange(range);
    autosave();
  }
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

function inFootnoteNumber(node) {
  for (let n = node; n; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.tagName === 'SUP' && n.classList.contains('footnote-number')) {
        return true;
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

function isMultiparagraph(range) {
  let count = 0;
  transverseRange(range, (node, startIndex, endIndex) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (endIndex > startIndex) {
        const style = getComputedStyle(node);
        if (style.display === 'block') {
          count++;
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      if (count === 0) {
        count++;
      }
    }
    return !(count > 1);
  });
  return (count > 1);
}

function atFootnoteNumber(range) {
  const { endContainer, endOffset } = range;
  if (endContainer.nodeType === Node.TEXT_NODE) {
    const { nodeValue } = endContainer;
    if (endOffset > 0 && endOffset < nodeValue.length) {
      // ignore whitespaces
      if (nodeValue.substring(0, endOffset).trim()) {
        return false;
      }
    }
  }
  const isFootnoteNumber = (node) => {
    return node.tagName === 'SUP' && node.className === 'footnote-number';
  };
  const getNextNode = (node) => {
    const { nextSibling, parentNode } = node;
    if (nextSibling) {
      return nextSibling;
    } else if (parentNode) {
      getNextNode(parentNode);
    }
  };
  const nextNode = getNextNode(endContainer);
  if (nextNode && isFootnoteNumber(nextNode)) {
    return true;
  }
  const getPreviousNode = (node) => {
    const { previousSibling, parentNode } = node;
    if (previousSibling) {
      return previousSibling;
    } else if (parentNode) {
      getPreviousNode(parentNode);
    }
  };
  const prevNode = getPreviousNode(endContainer);
  if (prevNode && isFootnoteNumber(prevNode)) {
    return true;
  }
  if (prevNode.textContent.trim())
  return false;
}

function normalizeRange(range) {
  let startContainer, endContainer;
  let startOffset = 0, endOffset = 0;
  transverseRange(range, (node, startIndex, endIndex) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!startContainer) {
        startContainer = node;
        startOffset = startIndex;
      }
      endContainer = node;
      endOffset = endIndex;
    }
  });
  if (startContainer && endContainer) {
    range.setStart(startContainer, startOffset);
    range.setEnd(endContainer, endOffset);
  }
  return range;
}

let autosaveTimeout = 0;

function autosave(delay = 2000) {
  clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(async() => await saveDocument(), 2000);
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

function preserveCursorPosition() {
  const range = getSelectionRange();
  let { startContainer, endContainer, startOffset, endOffset } = range;
  if (startContainer.tagName === 'OL') {
    startContainer = startContainer.childNodes[startOffset];
    startOffset = 0;
  }
  if (endContainer.tagName === 'OL') {
    endContainer = endContainer.childNodes[endOffset];
    endOffset = newEndContainer.childNodes.length;
  }
  return { startContainer, endContainer, startOffset, endOffset };
}

function restoreCursorPosition(cursor) {
  const { startContainer, endContainer, startOffset, endOffset } = cursor;
  // find the list element where the cursor is suppose to be
  let listElement;
  for (let n = endContainer; n; n = n.parentNode) {
    if (n.tagName === 'OL') {
      listElement = n;
      break;
    }
  }
  // give the list focus if it isn't focused and scroll it into view
  if (listElement && document.activeElement !== listElement) {
    listElement.focus();
    listElement.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }
  // restore the cursor
  const range = getSelectionRange();
  range.setStart(startContainer, startOffset);
  range.setEnd(endContainer, endOffset);
}

function handleFootnoteInput(evt) {
  // remember which item has the cursor
  const cursor = preserveCursorPosition();
  // see if any item has gone missing or resurfaced, hiding and restoring
  // the referencing sup elements accordingly
  adjustFootnoteReferences({ updateReferences: true, updateContent: true });
  // adjust the adjust the page layout in case the height is different
  adjustLayout({ updateFooterPosition: true });
  // put the cursor back onto the correct item, in the event it got moved
  // to another footer
  restoreCursorPosition(cursor);
  // save changes
  autosave();
}

function handleArticleInput(evt) {
  const changed = adjustFootnoteReferences({ updateFootnotes: true });
  adjustLayout({ updateFooterPosition: changed });
  autosave();
}

function handleArticleKeyPress(evt) {
}

function handleSelectionChange(evt) {
  const range = getSelectionRange();
  const container = getRangeContainer(range);
  const inArticle = (container && container.id  === 'article-text');
  const inFootntoe = (container && container.className === 'footnote-content');
  if (inArticle && !range.collapsed && !isMultiparagraph(range) && !atFootnoteNumber(range)) {
    const words = separateWords(range.toString());
    if (words.length > 0) {
      const r1 = range.getBoundingClientRect();
      const r2 = container.parentNode.getBoundingClientRect();
      const left = r1.left - r2.left + 2;
      let top = r1.bottom - r2.top + 2;
      articleMenuElement.style.left = `${left}px`;
      articleMenuElement.style.top = `${top}px`;
      // show/hide menu item depending on how many words are selected
      const count = words.length;
      toggle(articleMenuItems.addTranslation, count > 1);
      toggle(articleMenuItems.addDefinition, count <= 10);
      toggle(articleMenuElement, true);
      articleMenuElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // remember the range
      lastSelectedRange = range;
    } else {
      toggle(articleMenuElement, false);
      lastSelectedRange = null;
    }
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
