import { applyStyles, getPageProperties } from './settings.js';

const contentElement = document.getElementById('article-text');
const backgroundElement = document.getElementById('article-background');
const footerRootElement = document.getElementById('article-footers');

const footerMarginTop = '10mm';

let references = [];

export function addText(content) {
  applyStyles();
  addContent(content,  contentElement);
  // add sheets of paper to background
  addPapers();
  // attach footer to each page
  addFooters();
  // addition of footers could lead to the need for new pages
  addPapers();
  addFooters();
}

export function addPapers() {
  for (;;) {
    const backgroundRect = backgroundElement.getBoundingClientRect();
    const contentRect = contentElement.getBoundingClientRect();
    if (contentRect.bottom <= backgroundRect.bottom) {
      break;
    } else {
      addPaper(backgroundElement);
    }
  }
}

export function addPaper() {
  const paperElement = document.createElement('DIV');
  paperElement.className = 'paper';
  backgroundElement.appendChild(paperElement);
}

export function addFooters() {
  while (footerRootElement.childElementCount < backgroundElement.childElementCount) {
    addFooter();
  }
}

export function addFooter() {
  // add pusher to push the footer down the page, while leaving a space
  // that the main text can float into
  const pusherElement = document.createElement('DIV');
  pusherElement.className = 'footer-pusher';
  pusherElement.textContent = '\u00a0';
  const contentElement = document.createElement('OL');
  contentElement.className = 'footer-content';
  // add spacer to account of space between sheets of paper in display mode
  // it'll be hidden in print mode
  const spacerElement = document.createElement('DIV');
  spacerElement.className = 'footer-spacer';
  spacerElement.textContent = '\u00a0';
  const footerElement = document.createElement('DIV');
  footerElement.appendChild(pusherElement);
  footerElement.appendChild(contentElement);
  footerElement.appendChild(spacerElement);
  adjustFooterPosition(pusherElement, contentElement);
  footerRootElement.appendChild(footerElement);
}

export function adjustFooterPosition(pusherElement, contentElement) {
  const page = getPageProperties();
  // substract top and bottom margin from height of page
  const dims = [ page.height, page.margins.top, page.margins.bottom ];
  const footerHeight = contentElement.offsetHeight;
  if (footerHeight > 0) {
    // substract height of foooter and its top margin
    dims.push(`${footerHeight}px`, footerMarginTop);
  }
  // use CSS to do the final calculation
  pusherElement.style.height = `calc(${dims.join(' - ')})`;
}

export function addFootnotes(footnotes) {
  const paperElements = backgroundElement.children;
  const footerElements = footerRootElement.children;
  const paperRects = [];
  for (const footnote of footnotes) {
    // get the bounding rect of the paper elements
    for (let i = paperRects.length; i < paperElements.length; i++) {
      const rect = paperElements[i].getBoundingClientRect();
      paperRects.push(rect);
    }
    const refElement = document.getElementById(`ref-${footnote.ref}`);
    const supElement = refElement.lastChild;
    const supRect = supElement.getBoundingClientRect();
    // see which paper contains the sup element
    const paperIndex = paperRects.findIndex(r => isBetween(supRect, r));
    // add the footnote
    addFootnote(footnote, footerElements[paperIndex]);
    // addition of footnote could lead to the need for new pages
    addPapers();
    addFooters();
  }
}

export function addFootnote(footnote, footerElement) {
  const [ pusherElement, contentElement ] = footerElement.children;
  const { ref, term, definition } = footnote;
  const itemElement = document.createElement('LI');
  itemElement.id = `footnote-${ref}`;
  itemElement.className = 'footnote-item';
  itemElement.dataset.ref = ref;
  addContent(term, itemElement);
  addContent(' - ', itemElement);
  addContent(definition, itemElement);
  contentElement.appendChild(itemElement);
  // set the starting number if it's the first item
  if (contentElement.childElementCount === 1) {
    contentElement.start = ref;
    contentElement.contentEditable = true;
  }
  adjustFooterPosition(pusherElement, contentElement);
}

export function adjustFootnotes() {
  let changed = false;
  for (const ref of references) {
    const state = isReferenceActive(ref);
    if (toggleFootnote(ref, state)) {
      changed = true;
    }
  }
  if (changed) {
    // adjust the footnote numbers
    adjustFootnoteNumbering();
    // adjust the positions of all footers
    const footerElements = footerRootElement.children;
    for (const footerElement of footerElements) {
      const [ pusherElement, contentElement ] = footerElement.children;
      adjustFooterPosition(pusherElement, contentElement);
    }
  }
}

export function adjustFootnoteReferences() {
  let changed = false;
  for (const ref of references) {
    const state = isFootnoteActive(ref);
    if (toggleReference(ref, state)) {
      changed = true;
    }
  }
  if (changed) {
    // adjust the footnote numbers
    adjustFootnoteNumbering();
  }
}

export function adjustFootnoteNumbering() {
  const supElements = contentElement.getElementsByClassName('footnote-number');
  let number = 1;
  const listElements = [];
  for (const supElement of supElements) {
    const { ref } = supElement.parentNode.dataset;
    const itemElement = document.getElementById(`footnote-${ref}`);
    const listElement = itemElement.parentNode;
    if (!listElements.includes(listElement)) {
      listElement.start = number;
      listElements.push(listElement);
    }
    supElement.textContent = number++;
  }
}

function toggleFootnote(ref, state) {
  const itemElement = document.getElementById(`footnote-${ref}`);
  if (!itemElement) {
    return false;
  }
  const { classList } = itemElement;
  if (state && classList.contains('removed')) {
    classList.remove('removed');
    return true;
  } else if (!state && !classList.contains('removed')) {
    classList.add('removed');
    return true;
  }
  return false;
}

function isFootnoteActive(ref) {
  const itemElement = document.getElementById(`footnote-${ref}`);
  if (!itemElement) {
    return false;
  }
  return !itemElement.classList.contains('removed');
}

export function addContent(content, element) {
  if (typeof(content) === 'string') {
    const child = document.createTextNode(content);
    element.appendChild(child);
  } else if (content instanceof Array) {
    for (const item of content) {
      addContent(item, element);
    }
  } else if (content instanceof Object) {
    const child = createElement(content);
    element.appendChild(child);
  }
}

export function createElement({ tag, content, style, ref }) {
  const element = document.createElement(tag);
  addContent(content, element);
  applyStyle(style, element);
  addReference(ref, element);
  return element;
}

export function applyStyle(style, element) {
  if (style instanceof Object) {
    for (const [ key, value ] of Object.entries(style)) {
      element.style[key] = value;
    }
  }
}

function addReference(ref, element) {
  if (ref) {
    addSupElement(ref, element);
    element.dataset.ref = ref;
    element.id = `ref-${ref}`;
    element.className = 'reference';
    references.push(ref);
  }
}

function addSupElement(ref, element) {
  const supElement = document.createElement('SUP');
  supElement.textContent = ref;
  supElement.className = 'footnote-number';
  element.appendChild(supElement);
}

function toggleReference(ref, state) {
  const refElement = document.getElementById(`ref-${ref}`);
  if (!refElement) {
    return false;
  }
  const supElement = refElement.lastChild;
  const exists = (supElement && supElement.className === 'footnote-number');
  if (state && !exists) {
    addSupElement(ref, refElement);
    return true;
  } else if(!state && exists) {
    refElement.removeChild(supElement);
    return true;
  }
  return false;
}

function isReferenceActive(ref) {
  const refElement = document.getElementById(`ref-${ref}`);
  if (!refElement) {
    return false;
  }
  const supElement = refElement.lastChild;
  const exists = (supElement && supElement.className === 'footnote-number');
  return (exists && !!supElement.textContent);
}

function isBetween(a, b) {
  return (a.top >= b.top && a.bottom <= b.bottom);
}
