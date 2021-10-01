const contentElement = document.getElementById('article-text');
const backgroundElement = document.getElementById('article-background');
const footerRootElement = document.getElementById('article-footers');

let pageHeight = 297;
let pageMarginTop = 20;
let pageMarginBottom = 20;
let footerMarginTop = 10;

export function addText(content) {
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
  let maxContentHeight = pageHeight - pageMarginTop - pageMarginBottom;
  const footerHeight = contentElement.offsetHeight;
  if (footerHeight > 0) {
    maxContentHeight -= footerMarginTop;
  }
  pusherElement.style.height = `calc(${maxContentHeight}mm - ${footerHeight}px)`;
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
  itemElement.className = 'footnote-item';
  itemElement.dataset.ref = ref;
  addContent(term, itemElement);
  addContent(' - ', itemElement);
  addContent(definition, itemElement);
  contentElement.appendChild(itemElement);
  // set the starting number if it's the first item
  if (contentElement.childElementCount === 1) {
    contentElement.start = ref;
    contentElement.dataset.refs = ref;
    contentElement.contentEditable = true;
  } else {
    contentElement.dataset.refs += ',' + ref;
  }
  adjustFooterPosition(pusherElement, contentElement);
}

export function adjustFootnotes() {
}

export function adjustFootnoteReferences(contentElement) {
  const itemElements = [ ...contentElement.children ];
  const previousRefs = contentElement.dataset.refs.split(',').filter(Boolean);
  const currentRefs = itemElements.map(e => e.dataset.ref);
  const missingRefs = previousRefs.filter(r => !currentRefs.includes(r));
  const resurfacedRefs = currentRefs.filter(r => !previousRefs.includes(r));
  for (let ref of missingRefs) {
    const refElement = document.getElementById(`ref-${ref}`);
    refElement.classList.add('removed');
  }
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

export function adjustFootnoteNumbering() {
  const supElements = contentElement.getElementsByClassName('footnote-number');
  let number = 1;
  const numbers = {};
  for (const supElement of supElements) {
    const refElement = supElement.parentNode;
    if (!refElement.classList.contains('removed')) {
      supElement.textContent = numbers[refElement.dataset.ref] = number++;
    }
  }
  const contentElements = footerRootElement.getElementsByClassName('footer-content');
  for (const contentElement of contentElements) {
    if (contentElement.childElementCount > 0) {
      const [ ref ] = contentElement.dataset.refs.split(',');
      contentElement.start = numbers[ref];
    }
  }
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

export function addReference(ref, element) {
  if (ref) {
    const supElement = document.createElement('SUP');
    supElement.textContent = ref;
    supElement.className = 'footnote-number';
    element.appendChild(supElement);
    element.dataset.ref = ref;
    element.id = `ref-${ref}`;
    element.className = 'reference';
  }
}

function isBetween(a, b) {
  return (a.top >= b.top && a.bottom <= b.bottom);
}
