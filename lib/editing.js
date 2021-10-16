import { adjustFooterPosition, adjustFootnotes, adjustFootnoteReferences, createElement } from './layout.js';
import { extractContent } from './capture.js';

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
