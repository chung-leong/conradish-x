import { e } from './ui.js';
import { applyStyles, getPageProperties } from './settings.js';
import { setSourceLanguage, getSourceLanguage, getLanguageDirection } from './i18n.js';
import { insertContent, replaceUselessElements, removeEmptyNodes } from './capturing.js';
import { loadObject, saveObject, storageChange } from './storage.js';

const articleElement = document.getElementById('article');
const contentElement = document.getElementById('article-text');
const backgroundElement = document.getElementById('article-background');
const footerRootElement = document.getElementById('article-footers');
const scrollElement = document.getElementById('article-container');
const scrollElementRect = scrollElement.getBoundingClientRect();
const backstageElement = document.getElementById('footnote-backstage');
const overlayContainerElement = document.getElementById('overlays');

const pages = [];
const footnotes = [];

const articleObserver = new MutationObserver(handleArticleChanges);
const footnoteObserver = new MutationObserver(handleFootnoteChanges);
const observerConfig = { attributes: true, childList: true, subtree: true, characterData: true };
let observing = false;
let adjustingLayout = false;

let currentDocumentKey;
let currentDocument;
let deletionCount = 1;
let filterMode = 'automatic';

let autosaveTimeout = 0;

function autosave(delay = 2000) {
  clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(async() => await saveDocument(), delay);
}

export async function loadDocument(key) {
  currentDocument = await loadObject(key);
  currentDocumentKey = key;
  const { title, content, lang, raw } = currentDocument;
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
  // watch for changes to article
  observeChanges();
  // watch for change of title (which could be performed in list.html)
  storageChange.addEventListener('update', async (evt) => {
    if (!evt.detail.self && evt.detail.key === currentDocumentKey) {
      const { title } = await loadObject(currentDocumentKey);
      setTitle(title);
    }
  });
  //console.log(currentDocument);
  return !raw;
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

export function getTitle() {
  return currentDocument.title;
}

export function setTitle(title) {
  document.title = title;
  currentDocument.title = title;
}

function observeChanges() {
  if (!observing) {
    articleObserver.observe(contentElement, observerConfig);
    for (const { footer } of pages) {
      footnoteObserver.observe(footer.listElement, observerConfig);
    }
    observing = true;
  }
}

function adjustFooterDirection() {
  for (const page of pages) {
    const { footer } = page;
    const { listElement, footnotes } = footer;
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
      listElement.classList.toggle('rtl', rtlCount > ltrCount);
    }
  }
}

export function adjustLayout() {
  console.time('adjustLayout');
  // get the height of each footnote now, since we might detach some of them temporarily from the DOM
  const footnoteHeightMap = new WeakMap;
  for (const footnote of footnotes) {
    footnoteHeightMap.set(footnote, footnote.itemElement.offsetHeight);
  }
  let pageIndex = -1;
  let page = null;
  let availableArea = null;
  let contentArea = null;
  const addPage = () => {
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
  };
  const startNewPage = () => {
    pageIndex++;
    if (pageIndex < pages.length) {
      page = pages[pageIndex];
    } else {
      page = addPage();
    }
    availableArea = getContentArea(page, true);
    contentArea = getContentArea(page);
  };
  let totalFootnoteCount = 0;
  const attachFootnotes = (newList) => {
    if (!page) {
      return;
    }
    const { listElement, footnotes } = page.footer;
    // adjust starting number
    const startCounter = totalFootnoteCount + 1;
    if (listElement.start !== startCounter) {
      listElement.start = startCounter;
    }
    // enable/disable editing of footer depending on whether there's content inside
    const editable = (newList.length > 0) ? 'true' : 'false';
    if (listElement.contentEditable !== editable) {
      listElement.contentEditable = editable;
    }
    let changed = false;
    // first, take out the ones that's aren't supposed to be in this page anymore
    alter(footnotes, (footnote) => {
      if (!newList.includes(footnote)) {
        if (footnote.itemElement.parentNode === listElement) {
          footnote.itemElement.remove();
        }
        changed = true;
      } else {
        return footnote;
      }
    });
    for (const [ index, footnote ] of newList.entries()) {
      // see if it's attached to the page already
      const currentIndex = footnotes.indexOf(footnote);
      if (index !== currentIndex) {
        if (currentIndex !== -1) {
          // in the wrong position
          footnotes.splice(currentIndex, 1);
        }
        footnotes.splice(index, 0, footnote);
        if (index === 0) {
          // put it at the beginning
          listElement.prepend(footnote.itemElement);
        } else {
          // insert after the previous footnote
          const prevElement = newList[index - 1].itemElement;
          listElement.insertBefore(footnote.itemElement, prevElement.nextSibling);
        }
        changed = true;
      }
      totalFootnoteCount++;
    }
    adjustFooterPosition(page.footer);
  };
  const mapFootnotesToLines = (element, footnotes, lines) => {
    if (footnotes.length > 0) {
      const map = new Map;
      const baseRect = getRect(element);
      for (const footnote of footnotes) {
        const supRect = getRect(footnote.supElement);
        let { top } = baseRect;
        const lineIndex = lines.findIndex((lineHeight) => {
          const bottom = top + lineHeight;
          if (supRect.top >= top && supRect.bottom <= bottom) {
            return true;
          } else {
            top += lineHeight;
            return false;
          }
        });
        map.set(footnote, lineIndex);
      }
      return map;
    }
  };
  const isSpilling = (rect) => {
    return rect.bottom > contentArea.bottom || rect.top < contentArea.top;
  };
  const analyseContent = (element) => {
    const style = getComputedStyle(element);
    const rect = getRect(element);
    // if the element spills into the next page, then its bounding rect wouldn't give us
    // the actual height of its contents
    const height = isSpilling(rect) ? Infinity : rect.bottom - rect.top;
    // find footnotes for this chunk of text
    const footnotesInElement = footnotes.filter(f => element.contains(f.supElement));
    const footnoteHeight = footnotesInElement.reduce((total, f) => total + footnoteHeightMap.get(f), 0);
    return {
      element,
      height,
      domHeight: height,
      footnoteHeight,
      marginTop: parseFixed(style.marginTop),
      marginBottom: parseFixed(style.marginBottom),
      lines: null,
      footnotes: footnotesInElement,
      footnoteLineMap: null,
      skippedHeight: 0,
      skippedLines: null,
      skippedFootnotes: null,
      skippedFootnoteHeight: 0,
    };
  };
  const footerMargin = parseFixed(getComputedStyle(backstageElement).marginTop);
  const getSpaceRequired = (content, footerEmpty) => {
    let height = content.height;
    if (content.footnotes.length > 0) {
      if (footerEmpty) {
        height += footerMargin;
      }
      height += content.footnoteHeight;
    }
    return height;
  };
  const cropContent = (content, spaceAvailable, footerEmpty) => {
    // see if there's enough space for the whole paragraph (and its footnotes)
    let spaceRequired = getSpaceRequired(content, footerEmpty);
    if (spaceRequired <= spaceAvailable) {
      return spaceRequired;
    }
    if (!content.lines) {
      // figure out the numbers of actual lines in the element
      content.lines = detectLines(content.element);
      content.footnoteLineMap = mapFootnotesToLines(content.element, content.footnotes, content.lines);
      content.height = content.lines.reduce((total, n) => total + n, 0);
      content.skippedLines = [];
      content.skippedFootnotes = [];
      spaceRequired = getSpaceRequired(content, footerEmpty);
    }
    while (spaceRequired > spaceAvailable) {
      if (content.lines.length === 0) {
        return 0;
      }
      // see if we can omit a footnote in the present page
      const lastFootnote = content.footnotes[content.footnotes.length - 1];
      const lastLineIndex = content.lines.length - 1;
      let removedFootnote = false;
      if (lastFootnote) {
        const lineIndex = content.footnoteLineMap.get(lastFootnote);
        if (lineIndex === lastLineIndex) {
          // the footnote is referenced by the last line, we don't want to push that
          // to the next page ahead of the note itself, so we move the note
          content.footnotes.pop();
          const footnoteHeight = footnoteHeightMap.get(lastFootnote);
          content.footnoteHeight -= footnoteHeight;
          content.skippedFootnotes.unshift(lastFootnote);
          content.skippedFootnoteHeight += footnoteHeight;
          removedFootnote = true;
        }
      }
      if (!removedFootnote) {
        // remove a line from the paragraph if we can't shrink by shifting footnotes to the next page
        const lineHeight = content.lines.pop();
        content.height -= lineHeight;
        content.skippedHeight += lineHeight;
        content.skippedLines.unshift(lineHeight);
      }
      spaceRequired = getSpaceRequired(content, footerEmpty);
    }
    return spaceRequired;
  };
  const useSkippedContent = (content) => {
    // adjust the indices in the footnote-to-line map
    const used = content.lines.length;
    if (used > 0) {
      for (const footnote of content.footnotes) {
        content.footnoteLineMap[footnote] -= used;
      }
    } else {
      // is none of the lines ended up in the previous page, then restore the height obtain
      // from getBoundingClientRect() since that's more accurate than the line-height calculation
      content.height = content.domHeight;
    }
    content.lines = content.skippedLines;
    content.skippedLines = [];
    content.height = content.skippedHeight;
    content.skippedHeight = 0;
    content.footnotes = content.skippedFootnotes;
    content.skippedFootnotes = [];
    content.footnoteHeight = content.skippedFootnoteHeight;
    content.skippedFootnoteHeight = 0;
  };
  while (overlayContainerElement.firstChild) {
    overlayContainerElement.firstChild.remove();
  }
  const addContentOverlay = (top, content) => {
    if (content.lines) {
      const { left, right } = availableArea;
      for (const line of content.lines) {
        const bottom = top + line;
        const overlayElement = e('DIV', {
          className: 'overlay',
          style: {
            top: `${top}px`,
            left: `${left}px`,
            width: `${right - left}px`,
            height: `${bottom - top}px`
          }
        });
        overlayContainerElement.append(overlayElement);
        top = bottom;
      }
    }
  };
  const positionMap = new Map, positionAfterMap = new Map;
  let pageFootnotes = null;
  let spaceRemaining = 0;
  let position = 0;
  let previousMarginBottom = 0;
  let leftover = null;
  let atPageTop = true;
  const initiatePageBreak = () => {
    // add footnote assigned to the current page to its footer
    attachFootnotes(pageFootnotes);
    // go to the next page
    startNewPage();
    pageFootnotes = [];
    spaceRemaining = availableArea.bottom - availableArea.top;
    position = availableArea.top;
    previousMarginBottom = 0;
    atPageTop = true;
    if (leftover) {
      // the previous page ends with an element spilling into this one
      useSkippedContent(leftover);
      const spaceRequired = cropContent(leftover, spaceRemaining, !pageFootnotes.length);
      const { footnotes, marginBottom, height, skippedHeight, element } = leftover;
      addContentOverlay(position, leftover);
      pageFootnotes.push(...footnotes);
      if (skippedHeight === 0) {
        leftover = null;
        spaceRemaining -= spaceRequired;
        previousMarginBottom = marginBottom;
        position += height;
        positionAfterMap.set(element, position);
        atPageTop = false;
        // our prediction of where lines will go isn't always accurate
        // see how much we're off by
        const domPosition = getRect(element).bottom;
        const diff = domPosition - position;
        if (diff > 0) {
          //console.log(`Diff: ${diff}, text: ${element.textContent.substr(0, 20)} (${elementIndex})`);
          spaceRemaining -= diff;
          position = domPosition;
        }
      } else {
        // didn't fit completely into this either--need to start another page
        initiatePageBreak();
      }
    }
  };
  // create the first page
  initiatePageBreak();
  // determine where each paragraph (list or table) will land
  let elementIndex = 0;
  for (const element of contentElement.children) {
    // get info about this element
    const content = analyseContent(element);
    // calculate the top margin
    const margin = (atPageTop) ? 0 : Math.max(previousMarginBottom, content.marginTop);
    // trim the amount of content to fit space available in this page
    const spaceRequired = cropContent(content, spaceRemaining - margin, !pageFootnotes.length);
    //console.log(`${elementIndex}: ${spaceRequired}`);
    const { footnotes, marginBottom, height, skippedHeight } = content;
    if (spaceRequired) {
      position += margin;
      positionMap.set(element, position);
      if (skippedHeight > 0) {
        addContentOverlay(position, content);
      }
      pageFootnotes.push(...footnotes);
    }
    if (skippedHeight === 0) {
      // continue on this page if there's enough space for the bottom margin
      if (spaceRemaining > marginBottom) {
        spaceRemaining -= margin + spaceRequired;
        previousMarginBottom = marginBottom;
        position += height;
        positionAfterMap.set(element, position);
        atPageTop = false;
      } else {
        initiatePageBreak();
      }
    } else {
      leftover = content;
      initiatePageBreak();
    }
    elementIndex++;
  }
  attachFootnotes(pageFootnotes);
  // remove excess pages
  if (position <= availableArea.top) {
    pageIndex--;
  }
  const pageCount = pageIndex + 1;
  while (pages.length > pageCount) {
    const lastPage = pages.pop();
    const { paperElement, footer } = lastPage;
    paperElement.remove();
    footer.containerElement.remove();
  }
  console.timeEnd('adjustLayout');
  for (const [ element, position ] of positionMap) {
    const { top, bottom } = getRect(element);
    const positionAfter = positionAfterMap.get(element);
    if (top != position) {
      console.log(`Diff: ${top - position}, diffAfter: ${bottom - positionAfter}, text: ${element.textContent.substr(0, 20)}`);
    }
  }
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
  if (observing) {
    footnoteObserver.observe(listElement, observerConfig);
  }
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
      if (supElement.classList.contains('hidden')) {
        continue;
      }
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

function getContentArea(page, potential = false) {
  const { footer } = page;
  const pusherRect = getRect(footer.pusherElement);
  const listRect = getRect(footer.listElement)
  const top = pusherRect.top;
  const left = listRect.left;
  const right = pusherRect.left;
  const bottom = (potential) ? listRect.bottom : pusherRect.bottom;
  return { top, left, bottom, right };
}

const lineHeightDetectionElement = document.getElementById('line-height-detection');
const lineHeightDetectionMap = new Map;
const lineHeightAffectingStyles = [ 'font-family', 'font-style', 'font-weight', 'font-size', 'line-height' ];

function getLineHeight(styleMap) {
  const style = {};
  for (const name of lineHeightAffectingStyles) {
    style[name] = styleMap.get(name).toString();
  }
  const key = Object.values(style).join(';');
  let height = lineHeightDetectionMap.get(key);
  if (height === undefined) {
    const { firstChild } = lineHeightDetectionElement;
    for (const name of lineHeightAffectingStyles) {
      firstChild.style.setProperty(name, style[name]);
    }
    height = firstChild.getBoundingClientRect().height;
    lineHeightDetectionMap.set(key, height);
  }
  return height;
}

function parseFixed(s) {
  // chrome seems to be using fixed-point numbers internally (6 bits for decimals?)
  const num = parseFloat(s);
  return Math.floor(num * 64) / 64;
}

function detectLines(blockElement) {
  const range = document.createRange();
  // look for fragments and their positions
  let fragments = [];
  const scan = (element) => {
    const styleMap = element.computedStyleMap();
    const display = styleMap.get('display');
    if (display === 'inline-block' || display === 'inline-flex') {
      const { top, bottom, left, right } = element.getBoundingClientRect();
      const fragment = { lineTop: top, lineBottom: bottom, top, bottom, right, left };
      fragments.push(fragment);
    } else {
      const lineHeight = getLineHeight(styleMap);
      for (let node = element.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scan(node);
        } else if (node.nodeType === Node.TEXT_NODE) {
          range.selectNode(node);
          const rects = range.getClientRects();
          for (const { top, bottom, left, right, height } of rects) {
            // adjust rect based on the line height
            const offsetTop = Math.floor((lineHeight - height) / 2);
            const offsetBottom = (lineHeight - height) - offsetTop;
            const fragment = { lineTop: top - offsetTop, lineBottom: bottom + offsetBottom, top, bottom, right, left };
            fragments.push(fragment);
          }
        }
      }
    }
  };
  scan(blockElement);
  const lines = [];
  let highest = null, lowest = null;
  const wrap = () => {
    const height = lowest.lineBottom - highest.lineTop;
    lines.push(height);
    highest = lowest = null;
  };
  for (const fragment of fragments) {
    if (lowest && fragment.top >= lowest.bottom) {
      wrap();
    }
    if (!highest || fragment.top < highest.top) {
      highest = fragment;
    }
    if (!lowest || fragment.bottom > lowest.bottom) {
      lowest = fragment;
    }
  }
  if (highest && lowest) {
    wrap();
  }
  return lines;
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
    // stick the item into the list backstage so we can obtain its dimensions
    backstageElement.append(itemElement);
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
      if (classList.contains('hidden')) {
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
          if (footnote && !footnote.deleted) {
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
  const rect = element.getBoundingClientRect();
  const top = rect.top - scrollElementRect.top;
  const bottom = rect.bottom - scrollElementRect.top;
  const left = rect.left - scrollElementRect.left;
  const right = rect.right - scrollElementRect.left;
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

function handleArticleChanges(mutationsList) {
  //console.log(mutationsList);
}

function handleFootnoteChanges(mutationsList) {
  //console.log(mutationsList);
}
