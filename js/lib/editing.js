import { e, separateWords } from './ui.js';
import { findDeletedFootnote, annotateRange, updateFootnoteContent, setFilterMode, getTitle, setTitle,
  generateRangeHTML, generateRangeText } from './document.js';
import { transverseRange } from './capturing.js';
import { l, translate, getSourceLanguage, getTargetLanguage, getLanguageDirection, detectDirection } from './i18n.js';

export const modeChange = new EventTarget;

const articleMenuElement = document.getElementById('article-menu');
const articleElement = document.getElementById('article');
const articleMenuItems = {};
const articleMenuSections = {};
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
  document.addEventListener('copy', handleCopy);
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
  const annotationItemDefs = {
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
  const annotationMenu = articleMenuSections.annotation = e('UL', { id: 'menu-annotate' });
  annotationMenu.addEventListener('mousedown', handleAnnotationMenuMouseDown);
  for (const [ key, itemDef ] of Object.entries(annotationItemDefs)) {
    const { label, title, handler } = itemDef;
    const item = e('LI', { title }, label);
    item.addEventListener('click', handler);
    annotationMenu.append(item);
    articleMenuItems[key] = item;
  }
  const inlineStyleDefs = {
    bold: {
      className: 'bold',
      title: l('style_bold'),
    },
    italic: {
      className: 'italic',
      title: l('style_italic'),
    },
    underline: {
      className: 'underline',
      title: l('style_underline'),
    },
    strikeThrough: {
      className: 'strikethrough',
      title: l('style_strikethrough'),
    },
    subscript: {
      className: 'subscript',
      title: l('style_subscript'),
    },
    superscript: {
      className: 'superscript',
      title: l('style_superscript'),
    },
    removeFormat: {
      className: 'remove',
      title: l('style_remove'),
    },
  };
  const inlineStyleMenu = articleMenuSections.inlineStyle = e('DIV', { id: 'menu-inline-styles' });
  inlineStyleMenu.addEventListener('mousedown', handleInlineStyleMenuMouseDown);
  for (const [ key, itemDef ] of Object.entries(inlineStyleDefs)) {
    const { className, title } = itemDef;
    const item = e('DIV', { className: `style-button ${className}`, title });
    item.dataset.command = key;
    inlineStyleMenu.append(item);
    articleMenuItems[key] = item;
  }
  const blockStyleDefs = {
    heading1: {
      className: 'heading1',
      title: l('style_heading', [ 1 ]),
      tag: 'H1'
    },
    heading2: {
      className: 'heading2',
      title: l('style_heading', [ 2 ]),
      tag: 'H2'
    },
    heading3: {
      className: 'heading3',
      title: l('style_heading', [ 3 ]),
      tag: 'H3'
    },
    heading4: {
      className: 'heading4',
      title: l('style_heading', [ 4 ]),
      tag: 'H4'
    },
    heading5: {
      className: 'heading5',
      title: l('style_heading', [ 5 ]),
      tag: 'H5'
    },
    heading6: {
      className: 'heading6',
      title: l('style_heading', [ 6 ]),
      tag: 'H6'
    },
    paragraph: {
      className: 'paragraph',
      title: l('style_paragraph'),
      tag: 'P'
    },
  };
  const blockStyleMenu = articleMenuSections.blockStyle = e('DIV', { id: 'menu-block-styles' });
  blockStyleMenu.addEventListener('mousedown', handleBlockStyleMenuMouseDown);
  for (const [ key, itemDef ] of Object.entries(blockStyleDefs)) {
    const { className, title, tag } = itemDef;
    const item = e('DIV', { className: `style-button ${className}`, title });
    item.dataset.tag = tag;
    blockStyleMenu.append(item);
    articleMenuItems[key] = item;
  }
  articleMenuElement.append(annotationMenu, inlineStyleMenu, blockStyleMenu);
}

function getSelectedText(range) {
  const fragment = range.cloneContents();
  const fragmentDIV = e('DIV', {}, fragment);
  for (const supElement of [ ...fragmentDIV.getElementsByClassName('footnote-number') ]) {
    supElement.remove();
  }
  return fragmentDIV.innerText.trim();
}

function getSelectedRange() {
  let { startContainer, endContainer, startOffset, endOffset } = lastSelectedRange;
  const atBeginning = (container, offset) => {
    return offset === 0;
  };
  const atEnd = (container, offset) => {
    if (container.nodeType === Node.TEXT_NODE) {
      return (offset === container.nodeValue.length);
    } else if (container.nodeType === Node.ELEMENT_NODE) {
      return (offset === container.childNodes.length);
    }
  };
  const inline = (container) => {
    if (container.nodeType === Node.TEXT_NODE) {
      return true;
    } else if (container.nodeType === Node.ELEMENT_NODE) {
      const { display } = getComputedStyle(container);
      return display.includes('inline');
    } else {
      return false;
    }
  };
  const block = (container) => {
    if (container.nodeType === Node.ELEMENT_NODE) {
      const { display } = getComputedStyle(container);
      return display === 'block';
    } else {
      return false;
    }
  };
  // move selection to just in front of the node if is at the very beginning of its contents
  // so the element doesn't get replaced completely
  while (atBeginning(startContainer, startOffset)) {
    if (!inline(startContainer)) {
      break;
    }
    startOffset = [ ...startContainer.parentNode.childNodes ].indexOf(startContainer);
    startContainer = startContainer.parentNode;
  }
  // do the same at the end
  while (atEnd(endContainer, endOffset)) {
    if (!inline(endContainer)) {
      break;
    }
    endOffset = [ ...endContainer.parentNode.childNodes ].indexOf(endContainer) + 1;
    endContainer = endContainer.parentNode;
  }
  if (atBeginning(endContainer, endOffset)) {
    if (block(endContainer)) {
      endContainer = endContainer.previousElementSibling;
      endOffset = endContainer.childNodes.length;
    }
  }
  const range = document.createRange();
  range.setStart(startContainer, startOffset);
  range.setEnd(endContainer, endOffset);
  return range;
}

async function addFootnote(includeTerm) {
  const range = getSelectedRange();
  const selectedText = getSelectedText(range);
  const sourceLang = getSourceLanguage();
  const targetLang = getTargetLanguage();
  const translating = (targetLang && targetLang !== sourceLang);
  // put placeholder text in footer initially
  const initialContent = {
    term: { text: selectedText, lang: sourceLang },
    translation: { text: (translating) ? '...' : '', lang: targetLang },
  };
  const footnote = annotateRange(range, initialContent, includeTerm);
  if (translating) {
    const result = await translate(selectedText, sourceLang, targetLang, includeTerm);
    updateFootnoteContent(footnote, result, includeTerm);
  } else {
    const { itemElement } = footnote;
    const { listElement } = footnote.page.footer;
    listElement.focus();
    const range = getSelectionRange();
    range.selectNode(itemElement.lastChild);
    range.collapse();
  }
}

function atContainerEnd(range, cb) {
  const { endContainer, endOffset } = range;
  const container = findParent(endContainer, cb);
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

function isTableCell(node) {
  switch (node.tagName) {
    case 'TD':
    case 'TH': return true;
    default: return false;
  }
}

function isSpanningCells(range) {
  const { endContainer, startContainer } = range;
  const cellElement = findParent(endContainer, isTableCell);
  if (cellElement) {
    if (!cellElement.contains(startContainer)) {
      return true;
    }
  }
  return false;
}

function isWithinCell(range) {
  const { endContainer, startContainer } = range;
  const cellElement = findParent(endContainer, isTableCell);
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
    if (!isTableCell(node)) {
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
    if (atContainerEnd(range, isTableCell) && lastKeyDown === 'Delete') {
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
      const count = atContainerEnd(range, node => node.tagName === containerTag) ? 2 : 1;
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
    // replace BR with empty P element so DIV don't get created
    const brElements = [ ...div.getElementsByTagName('BR') ];
    for (const brElement of brElements) {
      brElement.replaceWith(e('P'));
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
  for (let n = node; n; n = n.parentNode) {
    if (n.contentEditable === 'true') {
      return n;
    }
  }
}

function showAnnotationMenu(range) {
  if (!range.collapsed) {
    if (!isMultiparagraph(range) && !atFootnoteNumber(range)) {
      const words = separateWords(range.toString());
      if (words.length > 0) {
        const sourceLang = getSourceLanguage();
        const targetLang = getTargetLanguage();
        const translating = (targetLang && targetLang !== sourceLang);
        // show/hide menu item depending on how many words are selected
        const count = words.length;
        toggle(articleMenuItems.addTranslation, translating && count > 1);
        toggle(articleMenuItems.addExplanation, !translating && count > 1);
        toggle(articleMenuItems.addDefinition, count < 8);
        showMenuSection('annotation');
        positionArticleMenu(range);
        toggle(articleMenuElement, true);
        return true;
      }
    }
  }
  return false;
}

function showStylingMenu(range, types) {
  const inEffect = {};
  const noteEffect = (name, state) => {
    const status = inEffect[name];
    if (state && !status) {
      inEffect[name] = 'set';
    } else if (state && status === 'off') {
      inEffect[name] = 'partial';
    } else if (!state && !status) {
      inEffect[name] = 'off';
    } else if (!state && status === 'set') {
      inEffect[name] = 'partial';
    }
  };
  const setButtonStatus = () => {
    for (const [ name, status ] of Object.entries(inEffect)) {
      const { classList } = articleMenuItems[name];
      classList.remove('set', 'partial');
      if (status !== 'off') {
        classList.add(status);
      }
    }
  };
  if (!range.collapsed) {
    if (!types.includes('inline')) {
      return false;
    }
    // get the styling of the selected text
    transverseRange(range, (node, startOffset, endOffset) => {
      if (node.nodeType === Node.TEXT_NODE && endOffset > startOffset) {
        const { fontWeight, fontStyle, textDecorationLine, verticalAlign } = getComputedStyle(node.parentNode);
        noteEffect('bold', fontWeight >= 600);
        noteEffect('italic', fontStyle === 'italic');
        noteEffect('underline', textDecorationLine.includes('underline'));
        noteEffect('strikeThrough', textDecorationLine.includes('line-through'));
        noteEffect('subscript', verticalAlign === 'sub');
        noteEffect('superscript', verticalAlign === 'super');
      }
    });
    setButtonStatus();
    showMenuSection('inlineStyle');
    positionArticleMenu(range);
    toggle(articleMenuElement, true);
    return true;
  } else {
    if (!types.includes('block')) {
      return false;
    }
    const blockElement = findParent(range.commonAncestorContainer, n => n.parentNode.id === 'article-text');
    if (blockElement) {
      const { tagName } = blockElement;
      if (tagName !== 'TABLE') {
        noteEffect('heading1', tagName === 'H1');
        noteEffect('heading2', tagName === 'H2');
        noteEffect('heading3', tagName === 'H3');
        noteEffect('heading4', tagName === 'H4');
        noteEffect('heading5', tagName === 'H5');
        noteEffect('heading6', tagName === 'H6');
        noteEffect('paragraph', tagName === 'P');
        setButtonStatus();
        showMenuSection('blockStyle');
        const blockRange = document.createRange();
        blockRange.selectNode(blockElement);
        positionArticleMenu(blockRange);
        toggle(articleMenuElement, true);
        return true;
      }
    }
  }
  return false;
}

function showMenuSection(selected) {
  for (const [ name, section ] of Object.entries(articleMenuSections)) {
    section.classList.toggle('hidden', name !== selected);
  }
}

function positionArticleMenu(range) {
  const sourceLang = getSourceLanguage();
  const sourceLangDir = getLanguageDirection(sourceLang);
  const r1 = range.getBoundingClientRect();
  const r2 = articleMenuElement.parentNode.getBoundingClientRect();
  if (sourceLangDir === 'ltr') {
    articleMenuElement.style.left = `${r1.left - r2.left}px`;
  } else {
    articleMenuElement.style.right = `${r2.right - r1.right}px`;
  }
  articleMenuElement.style.top = `${r1.bottom - r2.top + 2}px`;
  articleMenuElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

function updateArticleMenu() {
  let hideMenu = true;
  if (editMode === 'annotate' || editMode === 'style') {
    const range = getSelectionRange();
    const container = getRangeContainer(range);
    if (isArticleEditor(container)) {
      if (editMode === 'annotate') {
        hideMenu = !showAnnotationMenu(range);
      } else if (editMode === 'style') {
        hideMenu = !showStylingMenu(range, [ 'inline', 'block' ]);
      }
      // remember the range
      lastSelectedRange = range;
    } else if (isFootnoteEditor(container)) {
      hideMenu = !showStylingMenu(range, [ 'inline' ]);
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
  if (editMode !== mode) {
    document.body.classList.remove(editMode);
    editMode = mode;
    document.body.classList.add(editMode);
    setFilterMode(editMode === 'clean' ? 'manual' : 'automatic');
    updateArticleMenu();
    modeChange.dispatchEvent(new CustomEvent('change'));
  }
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
  const container = document.getElementById('document-area');
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
      const range = getSelectionRange();
      const element = findParent(range.endContainer, n => n.nodeType === Node.ELEMENT_NODE);
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    evt.preventDefault();
    evt.stopPropagation();
  }
}

function handleCopy(evt) {
  const range = getSelectionRange();
  const container = getRangeContainer(range);
  if (isArticleEditor(container)) {
    const html = generateRangeHTML(range, container);
    const text = generateRangeText(range, container);
    evt.clipboardData.setData('text/html', html);
    evt.clipboardData.setData('text/plain', text);
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
  updateArticleMenu();
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

function handleAnnotationMenuMouseDown(evt) {
  articleMenuClicked = true;
}

function handleInlineStyleMenuMouseDown(evt) {
  const { target } = evt;
  if (target.classList.contains('style-button')) {
    document.execCommand(target.dataset.command);
    updateArticleMenu();
    evt.preventDefault();
    evt.stopPropagation();
  }
}

function handleBlockStyleMenuMouseDown(evt) {
  const { target } = evt;
  if (target.classList.contains('style-button')) {
    let { tag } = target.dataset;
    if (target.classList.contains('set')) {
      // turn it into a paragraph unless it's one already
      tag = (tag !== 'P') ? 'P' : undefined;
    }
    if (tag) {
      document.execCommand('formatBlock', false, tag);
      updateArticleMenu();
    }
    evt.preventDefault();
    evt.stopPropagation();
  }
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
