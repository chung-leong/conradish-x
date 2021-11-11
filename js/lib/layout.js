import { e } from './ui.js';
import { applyStyles, getPageProperties } from './settings.js';

const contentElement = document.getElementById('article-text');
const backgroundElement = document.getElementById('article-background');
const footerRootElement = document.getElementById('article-footers');
const scrollElement = document.getElementById('article-container');

const pages = [];
const footnotes = [];

export function addText(content) {
  applyStyles();
  addContent(contentElement, content);
  adjustLayout();
}

export function adjustLayout(options = {}) {
  const { updatePaper, updateFooterPosition } = options;
  if (updatePaper) {
    // paper size has changed, need to update the client rects
    for (const page of pages) {
      page.paperRect = getRect(page.paperElement);
    }
  }
  if (updateFooterPosition || updatePaper) {
    for (const page of pages) {
      adjustFooterPosition(page.footer);
    }
  }
  let reflow, reflowCount = 0;
  do {
    reflow = false;
    reflowCount++;
    // add enough pages for the content
    while (hasExcessContent() || pages.length === 0) {
      addPage();
    }
    // assign footnotes to footers based on location of
    // <sup> element
    let prevFootnote;
    for (const footnote of footnotes.filter(f => !f.deleted)) {
      const supElementRect = getRect(footnote.supElement);
      for (const [ pageIndex, page ] of pages.entries()) {
        if (isBetween(supElementRect, page.paperRect)) {
          const { listElement, footnotes } = page.footer;
          if (!footnotes.includes(footnote)) {
            const prevPage = footnote.page;
            if (prevPage) {
              // don't move footnote to the previous page after a couple attempts
              // to get everything to fit
              const prevPageIndex = pages.indexOf(prevPage);
              if (reflowCount > 2 && pageIndex < prevPageIndex) {
                continue;
              }
              // remove it from the previous page
              const { footnotes } = footnote.page.footer;
              footnotes.splice(footnotes.indexOf(footnote), 1);
            }
            const prevIndex = footnotes.indexOf(prevFootnote);
            if (prevIndex !== -1) {
              // insert after the previous footnote
              listElement.insertBefore(footnote.itemElement, prevFootnote.itemElement.nextSibling);
              footnotes.splice(prevIndex + 1, 0, footnote);
            } else {
              // put it at the beginning
              listElement.insertBefore(footnote.itemElement, listElement.firstChild);
              footnotes.unshift(footnote);
            }
            footnote.page = page;
            adjustFooterPosition(page.footer);
            if (prevPage) {
              adjustFooterPosition(prevPage.footer);
            }
            // run the loop again since the layout is affected
            reflow = true;
          }
          break;
        }
      }
      prevFootnote = footnote;
    }
    // remove excess pages
    while(hasExcessPages()) {
      removePage();
    }
  } while(reflow && reflowCount <= 5);
  let start = 1;
  for (const page of pages) {
    // enable/disable editing of footer depending on whether there's content inside
    const { footer } = page;
    footer.listElement.contentEditable = (footer.footnotes.length > 0);
    // adjust list counter
    footer.listElement.start = start;
    start += footer.footnotes.length;
  }
}

function hasExcessContent() {
  const contentRect = getRect(contentElement);
  const backgroundRect = getRect(backgroundElement);
  return (contentRect.bottom >= backgroundRect.bottom);
}

function hasExcessPages() {
  if (pages.length > 0) {
    const lastPage = pages[pages.length - 1];
    const contentRect = getRect(contentElement)
    if (contentRect.bottom < lastPage.paperRect.top) {
      // the page is needed if there's a footnote there
      const { footer } = lastPage;
      if (footer.footnotes.length === 0) {
        return true;
      }
    }
  }
  return false;
}

function addPage() {
  if (pages.length === 0) {
    // remove the placeholder
    while (backgroundElement.firstChild) {
      backgroundElement.firstChild.remove();
    }
  }
  // add paper to background
  const paperElement = e('DIV', { className: 'paper' });
  backgroundElement.append(paperElement);
  const paperRect = getRect(paperElement);
  // add footer
  const footer = addFooter();
  const page = { paperElement, paperRect, footer };
  pages.push(page);
  return page;
}

function removePage() {
  const lastPage = pages.pop();
  const { paperElement, footer } = lastPage;
  paperElement.remove();
  footer.containerElement.remove();
}

export function addFooter() {
  // add pusher to push the footer down the page, while leaving a space
  // that the main text can float into
  const pusherElement = e('DIV', { className: 'footer-pusher' }, '\u00a0');
  const listElement = e('OL', { className: 'footer-content' });
  // add spacer to account of space between sheets of paper in display mode
  // it'll be hidden in print mode
  const spacerElement = e('DIV', { className: 'footer-spacer' }, '\u00a0');
  const containerElement = e('DIV', {}, [ pusherElement, listElement, spacerElement ]);
  footerRootElement.append(containerElement);
  const footer = { pusherElement, listElement, containerElement, footnotes: [] };
  adjustFooterPosition(footer);
  return footer;
}

export function adjustFooterPosition(footer) {
  const { pusherElement, listElement } = footer;
  const page = getPageProperties();
  // substract top and bottom margin from height of page
  const dims = [ page.height, page.margins.top, page.margins.bottom ];
  if (footer.footnotes.length > 0) {
    // substract height of foooter and the margin between it and the text
    dims.push(`${listElement.offsetHeight}px`, page.footerGap);
  }
  // use CSS to do the final calculation
  const height = `calc(${dims.join(' - ')})`;
  if (footer.height !== height) {
    footer.height = height;
    pusherElement.style.height = height;
  }
}

export function adjustFootnoteReferences(options = {}) {
  const { updateReferences, updateFootnotes, updateNumbering } = options;
  let changed = false;
  if (updateReferences || updateFootnotes) {
    for (const footnote of footnotes) {
      const { supElement, itemElement, refElement } = footnote;
      if (footnote.deleted) {
        if (supElement.parentElement || itemElement.parentElement) {
          footnote.deleted = false;
          if (!supElement.parentElement) {
            // stick the <sup> back on
            refElement.append(supElement);
          }
          changed = true;
        }
      } else {
        if (!supElement.parentElement || !itemElement.parentElement || !refElement.parentElement) {
          footnote.deleted = true;
          itemElement.remove();
          supElement.remove();
          const page = pages.find(p => p.footer.footnotes.includes(footnote));
          if (page) {
            const { footnotes } = page.footer;
            footnotes.splice(footnotes.indexOf(footnote), 1);
          }
          changed = true;
        }
      }
    }
  }
  if (changed || updateNumbering) {
    let number = 1;
    for (const footnote of footnotes.filter(f => !f.deleted)) {
      footnote.supElement.textContent = footnote.number = number++;
    }
  }
}

export function addContent(element, content) {
  if (typeof(content) === 'string') {
    element.append(content);
  } else if (content instanceof Array) {
    for (const item of content) {
      addContent(element, item);
    }
  } else if (content instanceof Object) {
    const child = e(content.tag);
    addContent(child, content.content);
    if (content.footnote) {
      const number = footnotes.length + 1;
      const refElement = child;
      const supElement = e('SUP', { className: 'footnote-number' }, number);
      const itemElement = e('LI', { className: 'footnote-item' });
      addContent(itemElement, content.footnote);
      const page = null, deleted = false, height = '';
      refElement.append(supElement);
      refElement.className = 'reference';
      footnotes.push({ number, page, deleted, supElement, itemElement, refElement, height });
    }
    element.append(child);
  }
}

export function annotateRange(range) {
  const content = range.cloneContents();
  let number = 1;
  for (const { supElement } of footnotes.filter(f => !f.deleted)) {
    if (supElement.compareDocumentPosition(range.endContainer) === Node.DOCUMENT_POSITION_FOLLOWING) {
      number++;
    } else {
      break;
    }
  }
  const supElement = e('SUP', { className: 'footnote-number' }, number);
  return e('SPAN', { className: 'reference' }, [ content, supElement ]);
}

export function attachFootnote(content) {
  const refElements = [ ...document.getElementsByClassName('reference') ];
  const refElement = refElements.find((element) => {
    const footnote = footnotes.find(f => f.refElement === element);
    return !footnote;
  });
  const supElement = refElement.getElementsByTagName('SUP')[0];
  const itemElement = e('LI', { className: 'footnote-item' }, content);
  const number = parseInt(supElement.textContent);
  const page = null, deleted = false, height = '';
  const footnote = { number, page, deleted, supElement, itemElement, refElement, height };
  footnotes.splice(number - 1, 0, footnote);
  return footnote;
}

function isBetween(a, b) {
  return (a.top >= b.top && a.bottom <= b.bottom);
}

function getRect(element) {
  let top = element.offsetTop;
  let left = element.offsetLeft;
  for (let e = element.offsetParent; e && e !== scrollElement; e = e.offsetParent) {
    top += e.offsetTop;
    left += e.offsetLeft;
  }
  const bottom = top + element.offsetHeight;
  const right = bottom + element.offsetWidth;
  return { top, left, bottom, right };
}
