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

function adjustFooterPosition(pusherElement, contentElement) {
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
  addContent(term, itemElement);
  addContent({ tag: 'br' }, itemElement);
  addContent({ tag: 'br' }, itemElement);
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
    element.appendChild(supElement);
    element.dataset.ref = ref;
    element.id = `ref-${ref}`;
    element.className = 'reference';
  }
}

function isBetween(a, b) {
  return (a.top >= b.top && a.bottom <= b.bottom);
}
