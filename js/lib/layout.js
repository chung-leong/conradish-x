import { e } from './ui.js';
import { applyStyles, getPageProperties, setSourceLanguage } from './settings.js';
import { insertContent, replaceUselessElements, removeEmptyNodes } from './capturing.js';
import { loadObject, saveObject } from './storage.js';

import sampleText from './sample.js';
const sampleDoc = { title: 'Test', lang: 'en', content: sampleText };

const contentElement = document.getElementById('article-text');
const backgroundElement = document.getElementById('article-background');
const footerRootElement = document.getElementById('article-footers');
const scrollElement = document.getElementById('article-container');

const pages = [];
const footnotes = [];

let documentKey;
let documentTitle;
let documentLanguage;

let deletionCount = 1;

export async function loadDocument(key) {
  const doc = (key) ? await loadObject(key) : sampleDoc;
  const { title, content, lang } = doc;
  // set the source language
  setSourceLanguage(lang);
  document.title = title;
  // alter CSS rules based on settings
  applyStyles();
  // add the article text into the DOM
  addContent(contentElement, content);
  // adjust layout, inserting footnotes into appropriate page
  adjustLayout();
  documentKey = key;
  documentTitle = title;
  documentLanguage = lang;
}

export async function saveDocument() {
  const root = extractContent(contentElement);
  const doc = {
    title: documentTitle,
    lang: documentLanguage,
    content: root.content,
  };
  if (!documentKey) {
    console.log(doc);
    return;
  }
  saveObject(documentKey, doc);
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
              remove(footnote.page.footer.footnotes, footnote);
            }
            const prevIndex = footnotes.indexOf(prevFootnote);
            if (prevIndex !== -1) {
              // insert after the previous footnote
              listElement.insertBefore(footnote.itemElement, prevFootnote.itemElement.nextSibling);
              footnotes.splice(prevIndex + 1, 0, footnote);
            } else {
              // put it at the beginning
              listElement.prepend(footnote.itemElement);
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

export function adjustFootnotes(options = {}) {
  const { updateReferences, updateItems, updateNumbering, updateContent } = options;
  let changed = false;
  if (updateReferences) {
    for (const footnote of footnotes) {
      const { supElement, itemElement } = footnote;
      if (footnote.deleted) {
        if (supElement.parentElement) {
          // itemElement will get added back by adjustLayout()
          footnote.deleted = 0;
          changed = true;
        }
      } else {
        if (!supElement.parentElement) {
          footnote.deleted = deletionCount++;
          itemElement.remove();
          // take it out the page where it's attached
          remove(footnote.page.footer.footnotes, footnote);
          footnote.page = null;
          changed = true;
        }
      }
    }
  }
  const newContents = new Map;
  if (updateItems || updateContent) {
    // the content of the list items are needed for handling item deletion
    for (const { footer } of pages) {
      const { listElement } = footer;
      for (const itemElement of listElement.children) {
        const { content } = extractContent(itemElement);
        newContents.set(itemElement, content);
      }
    }
  }
  if (updateItems) {
    for (const { footer } of pages) {
      const { listElement } = footer;
      const count = footer.footnotes.length;
      const domCount = listElement.children.length;
      if (count > domCount) {
        // some items have been deleted by the users
        // unfortunately, instead of removing the actual LI elements,
        // Chrome will shift contents upward and delete items from the end
        // we need to therefore figure out which footnotes remain based on
        // the content of the nodes
        //
        // first, marked all of them as deleted
        for (const footnote of footer.footnotes) {
          footnote.deleted = 1;
        }
        for (const itemElement of listElement.children) {
          const newContent = newContents.get(itemElement);
          const matchingFootnote = footer.footnotes.find(f => matchContent(f.content, newContent, '='))
                                || footer.footnotes.find(f => matchContent(f.content, newContent, '~'))
                                || footer.footnotes.find(f => f.deleted);
          matchingFootnote.deleted = 0;
          if (matchingFootnote.itemElement !== itemElement) {
            // remember that the item orignally belonged to another footnote
            if (matchingFootnote.previousItemElements) {
              matchingFootnote.previousItemElements.push(matchingFootnote.itemElement);
            } else {
              matchingFootnote.previousItemElements = [ matchingFootnote.itemElement ];
            }
            matchingFootnote.itemElement = itemElement;
          }
        }
        remove(footer.footnotes, (f) => {
          if (f.deleted) {
            // hide the sup element instead of removing it, as it's hard
            // to figure out where to put it when we need to restore it
            f.supElement.classList.add('hidden');
            f.deleted = deletionCount++;
            return true;
          }
        });
        changed = true;
      } else if (count < domCount) {
        // some items have reappeared due to user undoing a delete operation
        //
        // undo borrowing first
        for (const footnote of footer.footnotes) {
          if (footnote.previousItemElements) {
            footnote.itemElement = footnote.previousItemElements.pop();
            if (footnote.previousItemElements.length === 0) {
              delete footnote.previousItemElements;
            }
          }
        }
        // restore delete footnotes, use deletion order to deal with multiple
        // instances of empty notes
        const deletedFootnotes = footnotes.filter(f => f.deleted).sort((f1, f2) => f2.deleted - f1.deleted);
        for (const itemElement of listElement.children) {
          const footnote = footnotes.find(f => !f.deleted && f.itemElement === itemElement);
          if (footnote) {
            // it's there--don't need to do anything
            continue;
          }
          // usually, the original DOM node will reappear
          // Chrome could create new ones sometimes however in which we need
          // to match by content
          const newContent = newContents.get(itemElement);
          const deletedFootnote = deletedFootnotes.find(f => f.itemElement === itemElement)
                               || deletedFootnotes.find(f => matchContent(f.content, newContent, '='))
                               || deletedFootnotes.find(f => matchContent(f.content, newContent, '~'))
                               || deletedFootnotes[0];
          deletedFootnote.deleted = 0;
          deletedFootnote.itemElement = itemElement;
          remove(deletedFootnotes, deletedFootnote);
          // unhide the sup element
          deletedFootnote.supElement.classList.remove('hidden');
          // adjustLayout() will put the footnote back into the page
        }
        changed = true;
      }
    }
  }
  if (updateContent) {
    for (const footnote of footnotes) {
      if (!footnote.deleted) {
        const content = newContents.get(footnote.itemElement);
        footnote.content = content;
      }
    }
  }
  if (changed || updateNumbering) {
    let number = 1;
    for (const footnote of footnotes) {
      if (!footnote.deleted) {
        footnote.supElement.textContent = footnote.number = number++;
      }
    }
  }
  return changed;
}

export function addContent(element, content) {
  if (typeof(content) === 'string') {
    element.append(content);
  } else if (content instanceof Array) {
    for (const item of content) {
      addContent(element, item);
    }
  } else if (content instanceof Object) {
    addElement(element, content);
  }
}

function addElement(element, { tag, style, content, footnote }) {
  const child = e(tag, { style });
  addContent(child, content);
  if (footnote instanceof Object) {
    const { content, ...extra } = footnote;
    const number = footnotes.length + 1;
    const supElement = child;
    supElement.className = 'footnote-number';
    supElement.contentEditable = false;
    const itemElement = e('LI', { className: 'footnote-item' });
    addContent(itemElement, content);
    const page = null, deleted = 0, height = '';
    footnotes.push({ number, page, deleted, supElement, itemElement, height, content, extra });
  }
  element.append(child);
}

export function annotateRange(range) {
  // figure out what number it should have
  let number = 1;
  for (const { supElement } of footnotes.filter(f => !f.deleted)) {
    if (supElement.compareDocumentPosition(range.endContainer) === Node.DOCUMENT_POSITION_FOLLOWING) {
      number++;
    } else {
      break;
    }
  }
  return e('SUP', { className: 'footnote-number pending' }, number);
}

export function attachFootnote(content) {
  const supElement = document.querySelectorAll('.footnote-number.pending')[0];
  supElement.classList.remove('pending');
  supElement.contentEditable = false;
  const itemElement = e('LI', { className: 'footnote-item' }, content);
  const number = parseInt(supElement.textContent);
  const page = null, deleted = 0, height = '';
  const footnote = { number, page, deleted, supElement, itemElement, height };
  footnotes.splice(number - 1, 0, footnote);
  return footnote;
}

function extractContent(node) {
  const includeFootnotes = (node === contentElement);
  const extractFromNode = (node) => {
    const { nodeType, nodeValue } = node;
    if (nodeType === Node.TEXT_NODE) {
      return nodeValue;
    } else if (nodeType === Node.ELEMENT_NODE) {
      const { tagName, className, childNodes, style } = node;
      const object = { tag: tagName, content: undefined };
      for (const child of childNodes) {
        const content = extractFromNode(child);
        insertContent(object, content);
      }
      const newStyle = {};
      const styleNames = [ 'fontWeight', 'fontStyle', 'fontSize', 'textDecorationLine', 'verticalAlign' ];
      for (const name of styleNames) {
        const value = style[name];
        if (value) {
          newStyle[name] = value;
        }
      }
      if (Object.entries(newStyle).length > 0) {
        object.style = newStyle;
      }
      if (includeFootnotes) {
        if (tagName === 'SUP') {
          const footnote = footnotes.find((f) => f.supElement === node);
          if (footnote) {
            const { content, extra } = footnote;
            object.footnote = { content };
            Object.assign(object.footnote, extra)
          }
        }
      }
      return object;
    }
  };
  const root = extractFromNode(node);
  replaceUselessElements(root);
  removeEmptyNodes(root);
  return root;
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

function flattenContent(content) {
  if (typeof(content) === 'string') {
    return content;
  } else if (content instanceof Array) {
    return content.map(c => flattenContent(c)).join('');
  } else if (content instanceof Object) {
    return flattenContent(content.content);
  } else {
    return '';
  }
}

function matchContent(c1, c2, mode) {
  const s1 = flattenContent(c1).trim();
  const s2 = flattenContent(c2).trim();
  if (mode === '=') {
    if (s1 === s2) {
      return true;
    }
  } else if (mode === '~') {
    if (s1.startsWith(s2) || s1.endsWith(s2)) {
      return true;
    }
  }
  return false;
}

function alter(arr, cb) {
  let i = 0;
  while (i < arr.length) {
    const r = cb(arr[i], i, arr);
    if (r !== undefined) {
      arr[i++] = r;
    } else {
      arr.splice(i, 1);
    }
  }
}

function remove(arr, cb) {
  if (typeof(cb) !== 'function') {
    const value = cb;
    cb = (e) => e === value;
  }
  alter(arr, e => cb(e) ? undefined : e);
}
