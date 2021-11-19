import { e, separateWords } from './ui.js';
import { adjustLayout, adjustFootnotes, findDeletedFootnote, annotateRange, saveDocument } from './layout.js';
import { transverseRange } from './capturing.js';
import { translate } from './translation.js';
import { getSourceLanguage, getTargetLanguage } from './settings.js';

export function attachEditingHandlers() {
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keypress', handleKeyPress);
  document.addEventListener('beforeinput', handleBeforeInput);
  document.addEventListener('input', handleInput);
  document.addEventListener('paste', handlePaste);
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('selectionchange', handleSelectionChange);
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('insertBrOnReturn', false, false);
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
  const range = normalizeRange(lastSelectedRange.cloneRange());
  // put placeholder text in footer initially
  const term = range.toString().trim();
  const sourceLang = getSourceLanguage();
  const targetLang = getTargetLanguage();
  const translating = (targetLang && targetLang !== sourceLang);
  const placeholder = (translating) ? '...' : '';
  const initialText = (includeTerm) ? `${term} - ${placeholder}` : placeholder;
  const footnote = annotateRange(range, initialText);
  adjustFootnotes({ updateNumbering: true });
  adjustLayout({ updateFooterPosition: true });
  if (translating) {
    const result = await translate(term, sourceLang, targetLang, includeTerm);
    const { itemElement } = footnote;
    if (itemElement.textContent === initialText) {
      const { term, translation, ...extra } = result;
      const text = (includeTerm) ? `${term} - ${translation}` : translation;
      itemElement.textContent = text;
      adjustFootnotes({ updateContent: true });
      adjustLayout({ updateFooterPosition: true });
      // save additional information from Google Translate
      footnote.extra = { term, ...extra };
      autosave(100);
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
      if (n.classList.contains('footnote-number')) {
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
    return node.classList.contains('footnote-number');
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
  autosaveTimeout = setTimeout(async() => await saveDocument(), delay);
}

function isArticleEditor(node) {
  if (node) {
    if (node.id === 'article-text') {
      return true;
    } else {
      return isArticleEditor(node.parentNode);
    }
  }
  return false;
}

function isFootnoteEditor(node) {
  if (node) {
    if (node.className === 'footer-content') {
      return true;
    } else {
      return isFootnoteEditor(node.parentNode);
    }
  }
  return false;
}

function adjustAttributes(container, addIdentifyingClass = false) {
  const scan = (node) => {
    const { classList, style, children } = node;
    if (addIdentifyingClass) {
      if (!classList.contains('conradish')) {
        classList.add('conradish');
      }
    }
    const styleAttr = node.getAttribute('style');
    if (styleAttr) {
      const items = styleAttr.split(/\s*;\s*/);
      const itemsKept = [];
      for (const item of items) {
        const [ name, value ] = item.split(/\s*:\s*/);
        if (value) {
          let keep = false;
          switch (name) {
            case 'font-style':
            case 'font-weight':
            case 'text-decoration-line':
            case 'text-decoration-style':
            case 'vertical-align':
              keep = true;
              break;
            case 'text-size':
              keep = value.endsWith('%');
              break;
          }
          if (keep) {
            itemsKept.push(item);
          }
        }
      }
      if (itemsKept.length > 0) {
        node.setAttribute('style', itemsKept.join(';'));
      } else {
        node.removeAttribute('style');
      }
    }
    for (const child of children) {
      scan(child);
    }
  };
  scan(container);
}

function preserveCursorPosition() {
  const range = getSelectionRange();
  let { startContainer, endContainer, startOffset, endOffset } = range;
  if (startContainer.tagName === 'OL') {
    startOffset = 0;
    startContainer = startContainer.childNodes[startOffset];
  }
  if (endContainer.tagName === 'OL') {
    endOffset = endContainer.childNodes.length;
    endContainer = endContainer.childNodes[endOffset];
  }
  return { startContainer, endContainer, startOffset, endOffset };
}

function restoreCursorPosition(cursor) {
  const { startContainer, endContainer, startOffset, endOffset } = cursor;
  if (!startContainer || !endContainer) {
    return;
  }
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

function handleInput(evt) {
  const { target } = evt;
  if (isArticleEditor(target)) {
    // see if any footnote number has been deleted
    const updateFooterPosition = adjustFootnotes({ updateReferences: true });
    // adjust the layout
    adjustLayout({ updateFooterPosition });
    // clean up the tags, making sure they all have the "conradish" class
    adjustAttributes(target, true);
    // save changes
    autosave();
  } else if (isFootnoteEditor(target)) {
    // remember which item has the cursor
    const cursor = preserveCursorPosition();
    // see if any item has gone missing or resurfaced, hiding and restoring
    // the referencing sup elements accordingly
    adjustFootnotes({ updateItems: true, updateContent: true });
    // adjust the adjust the page layout in case the height is different
    adjustLayout({ updateFooterPosition: true });
    // clean up the tags
    adjustAttributes(target);
    // put the cursor back onto the correct item, in the event it got moved
    // to another footer
    restoreCursorPosition(cursor);
    // save changes
    autosave();
  }
}

function handleBeforeInput(evt) {
  const { target } = evt;
  if (isArticleEditor(target)) {
    // prevent editing of footnote numbers
    const range = getSelectionRange();
    const { endContainer } = range;
    if (endContainer.nodeType === Node.TEXT_NODE) {
      const { parentNode } = endContainer;
      if (parentNode.className === 'footnote-number') {
        const allowKeys = [ 'Backspace', 'Delete', 'Enter' ];
        if (!allowKeys.includes(lastKeyDown)) {
          evt.preventDefault();
          evt.stopPropagation();
        }
      }
    }
  }
}

let lastKeyDown = '';

function handleKeyDown(evt) {
  if (evt.key === 'Escape') {
    hideArticleMenu();
  }
  // remember the last key pressed
  lastKeyDown = evt.key;
}

function handleKeyPress(evt) {
  const { target } = evt;
  if (isFootnoteEditor(target)) {
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
}

function filterHTML(html) {
  // tags in the article editor always have the "conradish" class
  //
  if (!html.includes('conradish')) {
    return;
  }
  // extract the actual fragment
  const startMarker = '<!--StartFragment-->', endMarker = '<!--EndFragment-->';
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker);
  if (startIndex !== -1 && endIndex !== -1) {
    html = html.substring(startIndex + startMarker.length, endIndex);
  }
  const div = e('DIV');
  div.innerHTML = html;
  if (div.getElementsByClassName('conradish').length > 0) {
    // remove footnote numbers that don't correspond to a footnote that
    // was deleted earlier
    const supElements = div.getElementsByClassName('footnote-number');
    for (const supElement of supElements) {
      if (!findDeletedFootnote(supElement.id)) {
        supElement.remove();
      }
    }
    adjustAttributes(div);
    return div.innerHTML;
  }
}

function insertData(target, dataTransfer) {
  if (isArticleEditor(target)) {
    const html = dataTransfer.getData('text/html');
    const filteredHTML = filterHTML(html);
    if (filteredHTML) {
      document.execCommand('insertHTML', false, filteredHTML);
    } else {
      const text = dataTransfer.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
  } else if (isFootnoteEditor(target)) {
    // always force plain-text
    // use insertHTML here to prevent creation of new list items
    const text = dataTransfer.getData('text/plain');
    const html = e('DIV', {}, text).innerHTML;
    document.execCommand('insertHTML', false, html);
  }
}

function handlePaste(evt) {
  const { target, clipboardData } = evt;
  insertData(target, clipboardData);
  evt.preventDefault();
  evt.stopPropagation();
}

let dropSource = null;

function handleDragStart(evt) {
  const { target } = evt;
  dropSource = target;
}

function handleDragEnd(evt) {
  const { target } = evt;
  dropSource = null;
}

function handleDrop(evt) {
  const { target, dataTransfer } = evt;
  const range = document.caretRangeFromPoint(evt.clientX, evt.clientY);
  const container = getEditableContainer(target);
  const sourceContainer = getEditableContainer(dropSource);
  if (container === sourceContainer && !evt.ctrlKey) {
    // a move within the container, let chrome take case of it
    return;
  }
  if (sourceContainer && !evt.ctrlKey) {
    // delete the content from the source container
    // unfortunately, this introduces a second op in the undo stack
    // drag-and-drop between article text and footnotes should be
    // pretty rare so this isn't too bad
    sourceContainer.focus();
    document.execCommand('delete', false);
  }
  container.focus();
  const selection = getSelection();
  selection.removeAllRanges()
  selection.addRange(range);
  insertData(container, dataTransfer);
  evt.preventDefault();
  evt.stopPropagation();
}

function getRangeContainer(range) {
  if (range) {
    return getEditableContainer(range.startContainer);
  }
}

function getEditableContainer(node) {
  for (let n = node; n; n = n .parentNode) {
    if (n.contentEditable === 'true') {
      return n;
    }
  }
}

function showArticleMenu(container, range) {
  const words = separateWords(range.toString());
  if (words.length > 0) {
    const r1 = range.getBoundingClientRect();
    const r2 = articleMenuElement.parentNode.getBoundingClientRect();
    const left = r1.left - r2.left;
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
    return true;
  }
  return false;
}

function hideArticleMenu() {
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

function handleSelectionChange(evt) {
  const range = getSelectionRange();
  const container = getRangeContainer(range);
  let hideMenu = true;
  if (isArticleEditor(container)) {
    if (!range.collapsed) {
      if (!isMultiparagraph(range) && !atFootnoteNumber(range)) {
        hideMenu = !showArticleMenu(container, range);
      }
    }
  }
  if (hideMenu) {
    hideArticleMenu();
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
