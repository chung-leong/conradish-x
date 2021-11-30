import { e } from './ui.js';
import { applyStyles, getPageProperties } from './settings.js';
import { setSourceLanguage, getSourceLanguage, getLanguageDirection } from './i18n.js';
import { insertContent, replaceUselessElements, removeEmptyNodes } from './capturing.js';
import { loadObject, saveObject } from './storage.js';

const articleElement = document.getElementById('article');
const contentElement = document.getElementById('article-text');
const backgroundElement = document.getElementById('article-background');
const footerRootElement = document.getElementById('article-footers');
const scrollElement = document.getElementById('article-container');

const pages = [];
const footnotes = [];

let currentDocumentKey;
let currentDocument;
let deletionCount = 1;
let filterMode = 'automatic';

export async function loadDocument(key) {
  currentDocument = await loadObject(key);
  currentDocumentKey = key;
  const { title, content, lang } = currentDocument;
  // set the source language
  setSourceLanguage(lang);
  // use rtl layout for Arabic and Hebrew
  const direction = getLanguageDirection(lang);
  if (direction === 'rtl') {
    contentElement.classList.add('rtl');
  }
  document.title = title;
  // alter CSS rules based on settings
  applyStyles();
  // add the article text into the DOM
  addContent(contentElement, content);
  // adjust layout, inserting footnotes into appropriate page
  adjustLayout({ updateFooterDirection: true });
  //console.log(currentDocument);
}

export async function saveDocument() {
  const root = extractContent(contentElement);
  const doc = { ...currentDocument, content: root.content };
  if (!doc.lang) {
    doc.lang = getSourceLanguage();
  }
  currentDocument = doc;
  //console.log(doc);
  if (!currentDocumentKey) {
    return;
  }
  saveObject(currentDocumentKey, doc);
}

export function adjustLayout(options = {}) {
  const { updatePaper, updateFooterPosition, updateFooterDirection } = options;
  if (updatePaper) {
    // paper size has changed, need to update the client rects
    for (const page of pages) {
      page.paperRect = getRect(page.paperElement);
    }
  }
  if (pages.length === 0) {
    addPage();
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
    while (hasExcessContent()) {
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
    const { listElement, footnotes } = footer;
    listElement.contentEditable = (footnotes.length > 0);
    // adjust list counter
    listElement.start = start;
    start += footnotes.length;
    if (updateFooterDirection) {
      let ltrCount = 0, rtlCount = 0;
      for (const footnote of footnotes) {
        const { lang } = footnote.extra || {};
        if (lang) {
          const targetLang = lang.split(',')[1];
          if (targetLang) {
            if (getLanguageDirection(targetLang) === 'ltr') {
              ltrCount++;
            } else {
              rtlCount++;
            }
          }
        }
      }
      listElement.classList.toggle('rtl', rtlCount > ltrCount);
    }
  }
}

function hasExcessContent() {
  if (pages.length > 100) {
    // something is wrong
    return false;
  }
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
  const listElement = e('OL', { className: 'footer-content', spellcheck: false });
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
    const supElements = contentElement.getElementsByClassName('footnote-number');
    for (const [ index, supElement ] of [ ...supElements ].entries()) {
      let footnote = footnotes.find(f => f.supElement === supElement);
      if (!footnote) {
        const { id } = supElement;
        footnote = footnotes.find(f => f.id === id);
      }
      if (footnote) {
        if (footnote.deleted) {
          // mark it as not deleted
          // itemElement will get added back by adjustLayout()
          footnote.deleted = 0;
          changed = true;
        }
        // the sup element could be different if it reappears thanks to
        // a copy-and-paste operation or it's got overwritten during a
        // execCommand('insertHTML')
        footnote.supElement = supElement;
        const currentIndex = footnotes.indexOf(footnote);
        if (currentIndex !== index) {
          // put it in the correct position
          footnotes.splice(currentIndex, 1);
          footnotes.splice(index, 0, footnote);
        }
      }
    }
    // any extra ones must have been deleted by the user
    const extraFootnotes = footnotes.slice(supElements.length);
    for (const footnote of extraFootnotes) {
      const { supElement, itemElement } = footnote;
      if (!footnote.deleted) {
        // mark it as not deleted
        footnote.deleted = deletionCount++;
        itemElement.remove();
        // take it out the page where it's attached
        remove(footnote.page.footer.footnotes, footnote);
        footnote.page = null;
        changed = true;
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

export function setFilterMode(mode) {
  if (filterMode !== mode) {
    articleElement.classList.remove(`filter-${filterMode}`);
    filterMode = mode;
    articleElement.classList.add(`filter-${filterMode}`);
    adjustLayout();
  }
}

function addContent(element, content) {
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

export function findDeletedFootnote(id) {
  return footnotes.find(f => f.deleted && f.id === id);
}

let nextFootnoteId = Math.round(Math.random() * 0x00FFFFFF) * 1000;

function addElement(element, { tag, style, content, footnote, junk }) {
  const child = e(tag, { style, className: 'conradish' });
  addContent(child, content);
  if (junk > 0) {
    if (junk === 1) {
      child.classList.add('likely-junk');
    } else {
      child.classList.add('possibly-junk');
    }
  }
  if (footnote instanceof Object) {
    const { content, ...extra } = footnote;
    const number = footnotes.length + 1;
    const supElement = child;
    const id = `footnote-${nextFootnoteId++}`;
    supElement.id = id;
    supElement.classList.add('footnote-number');
    const itemElement = e('LI', { className: 'footnote-item' });
    addContent(itemElement, content);
    const page = null, deleted = 0, height = '';
    footnotes.push({ id, number, page, deleted, supElement, itemElement, height, content, extra });
  }
  element.append(child);
}

export function annotateRange(range, content, extra) {
  const id = `footnote-${nextFootnoteId++}`;
  // figure out what number it should have
  let number = 1;
  for (const { supElement } of footnotes.filter(f => !f.deleted)) {
    if (supElement.compareDocumentPosition(range.endContainer) === Node.DOCUMENT_POSITION_FOLLOWING) {
      number++;
    } else {
      break;
    }
  }
  const fragment = range.cloneContents();
  const fragmentHTML = e('DIV', {}, fragment).innerHTML;
  const className = 'conradish footnote-number pending';
  const tempSupElement = e('SUP', { id, className }, number);
  // trim off whitespaces
  const htmlBefore = fragmentHTML.trimRight();
  const wsAfter = fragmentHTML.substr(htmlBefore.length);
  const html = htmlBefore + tempSupElement.outerHTML + wsAfter;
  // insert into editor
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand('insertHTML', false, html);
  // find the <sup>
  const supElement = contentElement.querySelectorAll('.footnote-number.pending')[0];
  supElement.classList.remove('pending');
  const itemElement = e('LI', { className: 'footnote-item' }, content);
  const page = null, deleted = 0, height = '';
  const footnote = { id, number, page, deleted, supElement, itemElement, height, extra };
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
      const { tagName, classList, childNodes, style } = node;
      if (filterMode === 'automatic' && classList.contains('likely-junk')) {
        return;
      }
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
        if (classList.contains('footnote-number')) {
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
