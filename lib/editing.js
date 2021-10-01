import { adjustFooterPosition, adjustFootnoteNumbering } from './layout.js';

export function handleInput(evt) {
  const { target } = evt;
  if (target.className === 'footer-content') {
    handleFootnoteInput(evt);
  } else if (target.id === 'article-content') {
    handleArticleInput(evt);
  }
}

export function handleKeyPress(evt) {
  const { target } = evt;
  if (target.className === 'footer-content') {
    handleFootnoteKeyPress(evt);
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
  // see if any item has gone missing
  const itemElements = [ ...contentElement.children ];
  const previousRefs = contentElement.dataset.refs.split(',').filter(Boolean);
  const currentRefs = itemElements.map(e => e.dataset.ref);
  const missingRefs = previousRefs.filter(r => !currentRefs.includes(r));
  for (let ref of missingRefs) {
    const refElement = document.getElementById(`ref-${ref}`);
    refElement.classList.add('removed');
  }
  // see if any item has resurfaced
  const resurfacedRefs = currentRefs.filter(r => !previousRefs.includes(r));
  for (let ref of resurfacedRefs) {
    const refElement = document.getElementById(`ref-${ref}`);
    refElement.classList.remove('removed');
  }
  if (missingRefs.length > 0 || resurfacedRefs.length > 0) {
    contentElement.dataset.refs = currentRefs;
    // adjust the footnote numbers
    adjustFootnoteNumbering();
  }
}

function handleArticleInput(evt) {
}

function isCursorAtListItemEnd() {
  const selection = getSelection();
  const range = selection.getRangeAt(0);
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
