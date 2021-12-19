import { e, separateWords } from './ui.js';
import { findDeletedFootnote, annotateRange, setFilterMode, getTitle, setTitle } from './document.js';
import { transverseRange } from './capturing.js';
import { l, translate, getSourceLanguage, getTargetLanguage, getLanguageDirection, detectDirection } from './i18n.js';

export const modeChange = new EventTarget;

const articleMenuElement = document.getElementById('article-menu');
const articleElement = document.getElementById('article');
const articleMenuItems = {};
let lastSelectedRange = null;
let articleMenuClicked = false;
let editMode = 'annotate';
let topDrawer = null;

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
  document.addEventListener('click', handleClick);
  document.addEventListener('mousedown', handleMouseDown);
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('insertBrOnReturn', false, false);
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'rename') {
      startEditingTitle();
    }
  });
  const restoreAllButton = document.getElementById('restore-all-button');
  restoreAllButton.addEventListener('click', handleRestoreAllClick);
  restoreAllButton.title = l('keep_all');
}

export function createMenuItems() {
  const itemDefs = {
    addDefinition: {
      label: l('add_definition'),
      title: l('show_term_and_definition'),
      handler: handleAddDefinition,
    },
    addTranslation: {
      label: l('add_translation'),
      title: l('show_translation_only'),
      handler: handleAddTranslation,
    },
    addExplanation: {
      label: l('add_explanation'),
      title: l('show_explanation'),
      handler: handleAddTranslation,
    }
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

function getSelectedText(range) {
  const fragment = range.cloneContents();
  const fragmentDIV = e('DIV', {}, fragment);
  for (const supElement of [ ...fragmentDIV.getElementsByClassName('footnote-number') ]) {
    supElement.remove();
  }
  return fragmentDIV.innerText.trim();
}

async function addFootnote(includeTerm) {
  // set the text of what was last selected
  const range = normalizeRange(lastSelectedRange.cloneRange());
  let backstoppingNode;
  if (isWithinCell(range) && atContainerEnd(range, 'TD')) {
    // Chrome for some reason would add the SUP element outside the TD if the
    // cursor happens to be at the very end of the cell; we need to stick
    // a zero-width string behind the cursor to prevent this
    backstoppingNode = document.createTextNode('\u2060');
    range.endContainer.parentNode.append(backstoppingNode);
  }
  let term = getSelectedText(range);
  const sourceLang = getSourceLanguage();
  const targetLang = getTargetLanguage();
  const translating = (targetLang && targetLang !== sourceLang);
  // put placeholder text in footer initially
  const placeholder = (translating) ? '...' : '';
  const initialText = (includeTerm) ? `${term} - ${placeholder}` : placeholder;
  const footnote = annotateRange(range, initialText, { term, lang: `${sourceLang},${targetLang}` });
  if (backstoppingNode) {
    backstoppingNode.remove();
  }
  if (translating) {
    const result = await translate(term, sourceLang, targetLang, includeTerm);
    const { itemElement } = footnote;
    if (itemElement.textContent === initialText) {
      const { translation, ...extra } = result;
      if (extra.term) {
        // case is different
        term = extra.term;
      }
      const text = (includeTerm) ? `${term} - ${translation}` : translation;
      itemElement.textContent = text;
      footnote.content = text;
      // save additional information from Google Translate
      Object.assign(footnote.extra, extra);
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
  }
}

function atContainerEnd(range, tagName) {
  const { endContainer, endOffset } = range;
  const container = findParent(endContainer, n => n.tagName === tagName);
  if (!container) {
    return false;
  }
  const nodeContent = endContainer.nodeValue || endContainer.childNodes;
  if (endOffset !== nodeContent.length) {
    return false;
  }
  // make sure all parent node are the last node
  if (endContainer !== container) {
    for (let n = endContainer.parentNode; n !== container; n = n.parentNode) {
      if (n.nextSibling) {
        return false;
      }
    }
  }
  return true;
}

function getSelectionRange() {
  const selection = getSelection();
  if (selection.rangeCount > 0) {
    return selection.getRangeAt(0);
  }
}

function isMultiparagraph(range) {
  let count = 0;
  transverseRange(range, (node, startIndex, endIndex, endTag) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!endTag && endIndex > startIndex) {
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

function getFootnoteNumber(range, ignoreWhitespaceBefore = false) {
  const { endContainer, endOffset } = range;
  const { nodeValue, nodeType, childNodes, parentNode } = endContainer;
  let atEnd;
  if (nodeType === Node.TEXT_NODE) {
    atEnd = (endOffset === nodeValue.length);
  } else {
    atEnd = (endOffset === childNodes.length);
  }
  let atBeginning = (endOffset === 0);
  if (ignoreWhitespaceBefore && nodeValue && endOffset > 0) {
    if (!nodeValue.substring(0, endOffset).trim()) {
      atBeginning = true;
    }
  }
  const isFootnoteNumber = (node) => {
    if (node && node.nodeType === Node.ELEMENT_NODE) {
      const { classList } = node;
      return classList.contains('footnote-number') && !classList.contains('hidden');
    }
    return false;
  };
  if (isFootnoteNumber(parentNode)) {
    return { node: parentNode, position: (atEnd) ? 'before' : 'at' };
  }
  if (atEnd) {
    const getNextNode = (node) => {
      const { nextSibling, parentNode } = node;
      if (nextSibling) {
        return nextSibling;
      } else if (parentNode) {
        getNextNode(parentNode);
      }
    };
    const nextNode = getNextNode(endContainer);
    if (isFootnoteNumber(nextNode)) {
      return { node: nextNode, position: 'after' };
    }
  } else if (atBeginning) {
    const getPreviousNode = (node) => {
      const { previousSibling, parentNode } = node;
      if (previousSibling) {
        return previousSibling;
      } else if (parentNode) {
        getPreviousNode(parentNode);
      }
    };
    const prevNode = getPreviousNode(endContainer);
    if (isFootnoteNumber(prevNode)) {
      return { node: prevNode, position: 'before' };
    }
  }
  return;
}

function atFootnoteNumber(range) {
  return !!getFootnoteNumber(range, true);
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

function findParent(node, cb) {
  for (let n = node; n; n = n.parentNode) {
    if (cb(n)) {
      return n;
    }
  }
}

function isArticleEditor(node) {
  return !!findParent(node, n => n.id === 'article-text');
}

function isFootnoteEditor(node) {
  return !!findParent(node, n => n.className === 'footer-content');
}

function isSpanningCells(range) {
  const { endContainer, startContainer } = range;
  const cellElement = findParent(endContainer, n => n.tagName === 'TD');
  if (cellElement) {
    if (!cellElement.contains(startContainer)) {
      return true;
    }
  }
  return false;
}

function isWithinCell(range) {
  const { endContainer, startContainer } = range;
  const cellElement = findParent(endContainer, n => n.tagName === 'TD');
  if (cellElement && cellElement.contains(startContainer)) {
    return true;
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
    if (node.tagName !== 'TD') {
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
                keep = (value === 'smaller');
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
    }
    for (const child of children) {
      scan(child);
    }
  };
  scan(container);
}

function handleInput(evt) {
  const { target } = evt;
  if (isArticleEditor(target)) {
    // clean up the tags, making sure they all have the "conradish" class
    adjustAttributes(target, true);
  } else if (isFootnoteEditor(target)) {
    // clean up the tags
    adjustAttributes(target);
  }
}

function handleBeforeInput(evt) {
  const { target, ctrlKey } = evt;
  if (isArticleEditor(target)) {
    const range = getSelectionRange();
    if (isSpanningCells(range)) {
      evt.preventDefault();
      evt.stopPropagation();
    }
    if (atContainerEnd(range, 'TD') && lastKeyDown === 'Delete') {
      // prevent contents in the next cell from being pulled into this one
      evt.preventDefault();
      evt.stopPropagation();
    }
    // prevent editing of footnote numbers
    const number = getFootnoteNumber(range);
    if (number) {
      switch (lastKeyDown) {
        case 'Backspace':
          if (number.position !== 'after') {
            // delete the whole number
            range.selectNode(number.node);
          }
          break;
        case 'Delete':
          if (number.position !== 'before') {
            range.selectNode(number.node);
          }
          break;
        case 'Enter':
          if (number.position === 'before') {
            break;
          }
        default:
          if (number.position !== 'after') {
            switch (lastKeyCombo) {
              case 'Ctrl-KeyY':
              case 'Ctrl-KeyZ':
                break;
              default:
                evt.preventDefault();
                evt.stopPropagation();
            }
          }
      }
    }
  }
}

let lastKeyDown = '';
let lastKeyCombo = '';

function handleKeyDown(evt) {
  const { code, ctrlKey, altKey, shiftKey } = evt;
  const keys = [];
  if (ctrlKey) {
    keys.push('Ctrl');
  }
  if (altKey) {
    keys.push('Alt');
  }
  if (shiftKey) {
    keys.push('Shift');
  }
  switch (code) {
    case 'ControlRight':
    case 'ControlLeft':
    case 'ShiftLeft':
    case 'ShiftRight':
    case 'AltLeft':
    case 'AltRight':
      return;
    default:
      keys.push(code);
  }
  const combo = keys.join('-');
  let command, arg;
  switch (combo) {
    case 'Ctrl-Digit0': command = 'formatBlock'; arg = 'P'; break;
    case 'Ctrl-Digit1': command = 'formatBlock'; arg = 'H1'; break;
    case 'Ctrl-Digit2': command = 'formatBlock'; arg = 'H2'; break;
    case 'Ctrl-Digit3': command = 'formatBlock'; arg = 'H3'; break;
    case 'Ctrl-Digit4': command = 'formatBlock'; arg = 'H4'; break;
    case 'Ctrl-Digit5': command = 'formatBlock'; arg = 'H5'; break;
    case 'Ctrl-Digit6': command = 'formatBlock'; arg = 'H6'; break;
    case 'Ctrl-Shift-Minus': command = 'subscript'; break;
    case 'Ctrl-Shift-Equal': command = 'superscript'; break;
    case 'Alt-Shift-Digit5': command = 'strikeThrough'; break;
    case 'Ctrl-Backslash': command = 'removeFormat'; break;
    case 'Ctrl-Shift-KeyH': toggleMode(); break;
  }
  if (command) {
    document.execCommand(command, false, arg);
    evt.preventDefault();
    evt.stopPropagation();
  }
  if (code === 'Escape') {
    hideArticleMenu();
  }
  // remember the last key pressed
  lastKeyDown = code;
  lastKeyCombo = combo;
}

function handleKeyPress(evt) {
  const { target } = evt;
  const { key, shiftKey, ctrlKey, altKey } = evt;
  // need to intercept Enter in certain situations, since the default behavior is to split the element
  // where the cursor reside
  if (key === 'Enter' && !shiftKey && !ctrlKey && !altKey) {
    const range = getSelectionRange();
    let containerTag;
    if (isFootnoteEditor(target)) {
      containerTag = 'LI';
    } else if (isArticleEditor(target)) {
      if (isWithinCell(range)) {
        containerTag = 'TD';
      }
    }
    if (containerTag) {
      // cancel default behavior
      evt.preventDefault();
      evt.stopPropagation();
      // at the end of the list item we need to insert two linefeed
      const count = atContainerEnd(range, containerTag) ? 2 : 1;
      document.execCommand('insertHTML', false, '\n'.repeat(count));
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
    const supElements = [ ...div.getElementsByClassName('footnote-number') ];
    for (const supElement of supElements) {
      if (!findDeletedFootnote(supElement.id)) {
        supElement.remove();
      }
    }
    // remove BR tags
    const brElements = [ ...div.getElementsByTagName('BR') ];
    for (const brElement of brElements) {
      brElement.remove();
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
    const sourceLang = getSourceLanguage();
    const sourceLangDir = getLanguageDirection(sourceLang);
    const targetLang = getTargetLanguage();
    const r1 = range.getBoundingClientRect();
    const r2 = articleMenuElement.parentNode.getBoundingClientRect();
    if (sourceLangDir === 'ltr') {
      articleMenuElement.style.left = `${r1.left - r2.left}px`;
    } else {
      articleMenuElement.style.right = `${r2.right - r1.right}px`;
    }
    articleMenuElement.style.top = `${r1.bottom - r2.top + 2}px`;
    // show/hide menu item depending on how many words are selected
    const count = words.length;
    const translating = (targetLang && targetLang !== sourceLang);
    toggle(articleMenuItems.addTranslation, translating && count > 1);
    toggle(articleMenuItems.addExplanation, !translating && count > 1);
    toggle(articleMenuItems.addDefinition, count < 8);
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

function toggle(element, shown) {
  element.classList.toggle('hidden', !shown);
}

function checkArticleSelection() {
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

export function getEditMode(mode) {
  return editMode;
}

export function setEditMode(mode) {
  if (editMode === 'annotate') {
    hideArticleMenu();
  }
  document.body.classList.remove(editMode);
  editMode = mode;
  document.body.classList.add(editMode);
  setFilterMode(editMode === 'clean' ? 'manual' : 'automatic');
  if (editMode === 'annotate') {
    checkArticleSelection();
  }
  modeChange.dispatchEvent(new CustomEvent('change'));
}

function toggleMode() {
  setEditMode(editMode === 'annotate' ? 'clean' : 'annotate');
}

async function startEditingTitle() {
  if (topDrawer) {
    return;
  }
  const originalTitle = getTitle();
  // create top drawer DIV
  const container = document.getElementById('article-container');
  const inputElement = e('INPUT', { type: 'text', value: originalTitle });
  const direction = await detectDirection(originalTitle);
  if (direction === 'rtl') {
    inputElement.style.direction = 'rtl';
  }
  const buttonElement = e('BUTTON', {}, 'Save');
  const drawerElement = e('DIV', { id: 'top-drawer' }, [ inputElement, buttonElement ]);
  container.append(drawerElement);
  // position it, putting it a few pixels above the container so the shadow looks right
  const verticalOffset = 8;
  drawerElement.style.top = `${-drawerElement.offsetHeight - verticalOffset}px`;
  await new Promise(resolve => setTimeout(resolve, 0));
  // start transition
  drawerElement.style.top = `${-verticalOffset}px`;
  drawerElement.addEventListener('transitionend', () => {
    inputElement.focus();
  }, { once: true });
  buttonElement.addEventListener('click', () => {
    stopEditingTitle();
  });
  inputElement.addEventListener('keydown', (evt) => {
    switch (evt.key) {
      case 'Escape':
        inputElement.value = originalTitle;
      case 'Enter':
        stopEditingTitle();
        break;
    }
  });
  topDrawer = { drawerElement, inputElement, originalTitle, verticalOffset };
}

async function stopEditingTitle() {
  const { drawerElement, inputElement, originalTitle, verticalOffset } = topDrawer;
  const newTitle = inputElement.value;
  if (newTitle !== originalTitle) {
    setTitle(newTitle);
  }
  drawerElement.style.top = `${-drawerElement.offsetHeight - verticalOffset}px`;
  drawerElement.addEventListener('transitionend', () => {
    drawerElement.remove();
  }, { once: true });
  topDrawer = null;
}

function handlePaste(evt) {
  const { target, clipboardData } = evt;
  if (isArticleEditor(target) || isFootnoteEditor(target)) {
    const range = getSelectionRange();
    const number = isArticleEditor(target) ? getFootnoteNumber(range) : null;
    if (!number || number.position === 'after') {
      insertData(target, clipboardData);
    }
    evt.preventDefault();
    evt.stopPropagation();
  }
}

let dropSource = null;

function handleDragStart(evt) {
  const { target } = evt;
  dropSource = target;
  hideArticleMenu();
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

function handleSelectionChange(evt) {
  if (editMode === 'annotate') {
    checkArticleSelection();
  }
}

function handleClick(evt) {
  const { target } = evt;
  if (editMode === 'clean') {
    for (let n = target; n && n.parentNode; n = n.parentNode) {
      if (n.parentNode.id === 'article-text') {
        const { classList } = n;
        if (classList.contains('possibly-junk')) {
          classList.remove('possibly-junk');
          classList.add('likely-junk');
        } else if (classList.contains('likely-junk')) {
          classList.remove('likely-junk');
        } else {
          classList.add('likely-junk');
        }
        break;
      }
    }
    evt.preventDefault();
    evt.stopPropagation();
  }
}

function handleMouseDown(evt) {
  const { target } = evt;
  if (editMode === 'clean') {
    if (articleElement.contains(target)) {
      evt.preventDefault();
      evt.stopPropagation();
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

function handleRestoreAllClick(evt) {
  const contentElement = document.getElementById('article-text');
  for (const element of contentElement.children) {
    element.classList.remove('possibly-junk', 'likely-junk');
  }
}
