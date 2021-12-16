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
const backstageElement = document.getElementById('footnote-backstage');
const overlayContainerElement = document.getElementById('overlays');

const pages = [];
const footnotes = [];
const footnoteRecylclingBin = [];

const articleObserver = new MutationObserver(handleArticleChanges);
const footnoteObserver = new MutationObserver(handleFootnoteChanges);
const observerConfig = { attributes: true, childList: true, subtree: true, characterData: true };
let observing = false;

let currentDocumentKey;
let currentDocument;
let deletionCount = 1;
let filterMode = 'automatic';

let autosaveTimeout = 0;

function autosave(delay = 5000) {
  const save = async() => {
    autosaveTimeout = 0
    await saveDocument();
  };
  clearTimeout(autosaveTimeout);
  if (delay > 0) {
    autosaveTimeout = setTimeout(save, delay);
  } else {
    save();
  }
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
  // make tables splitable between pages
  decomposeTables();
  // adjust layout, inserting footnotes into appropriate page
  adjustLayout({ breakAfterPage: 1 });
  // give browser a chance to render the first page, then finish the rest
  await new Promise(r => setTimeout(r, 0));
  adjustLayout();
  // watch for changes to article
  observeChanges();
  // watch for change of title (which could be performed in list.html)
  storageChange.addEventListener('update', async (evt) => {
    if (!evt.detail.self && evt.detail.key === currentDocumentKey) {
      const { title } = await loadObject(currentDocumentKey);
      document.title = title;
      currentDocument.title = title;
    }
  });
  window.addEventListener('beforeunload', (evt) => {
    // perform autosave now
    if (autosaveTimeout) {
      autosave(0);
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
  autosave(0);
}

export function updateLayout() {
  adjustLayout();
}

function adjustLayout(options) {
  const { breakAfterPage } = options || {};
  // get the height of each footnote now, since we might detach some of them temporarily from the DOM
  const footnoteHeightMap = new WeakMap;
  for (const footnote of footnotes) {
    footnoteHeightMap.set(footnote, footnote.itemElement.offsetHeight);
  }
  // remember cursor position when editing footnotes
  const preserveCursor = () => {
    const range = getSelection().getRangeAt(0);
    let { startContainer, endContainer, startOffset, endOffset } = range;
    if (startContainer.tagName === 'OL') {
      startOffset = 0;
      startContainer = startContainer.childNodes[startOffset];
    }
    if (endContainer.tagName === 'OL') {
      endOffset = endContainer.childNodes.length;
      endContainer = endContainer.childNodes[endOffset];
    }
    if (startContainer && endContainer) {
      const { bottom } = range.getBoundingClientRect();
      return { startContainer, endContainer, startOffset, endOffset, bottom };
    }
  };
  const restoreCursor = () => {
    if (!cursor) {
      return;
    }
    let { startContainer, endContainer, startOffset, endOffset, bottom } = cursor;
    // find the list element where the cursor is suppose to be
    let listElement;
    for (let n = endContainer; n; n = n.parentNode) {
      if (n.tagName === 'OL') {
        listElement = n;
        break;
      }
    }
    if (!listElement) {
      return;
    }
    // give the list focus if it isn't focused
    if (document.activeElement !== listElement) {
      listElement.focus();
    }
    // restore the cursor
    const selection = getSelection();
    const range = document.createRange();
    if (listElement.contains(startContainer)) {
      range.setStart(startContainer, startOffset);
      range.setEnd(endContainer, endOffset);
    } else {
      // not sure if this can actually happen
      range.setStart(endContainer, 0);
      range.setEnd(endContainer, endOffset);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    // keep the cursor at the same viewport position
    const rect = range.getBoundingClientRect();
    const diff = rect.bottom - bottom;
    if (diff !== 0) {
      scrollElement.scrollTop += diff;
    }
  };
  const editingFootnote = document.activeElement.classList.contains('footer-content');
  const cursor = (editingFootnote) ? preserveCursor() : null;
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
    // add footer
    const footer = addFooter();
    const page = { paperElement, footer, availableArea: null, contentArea: null };
    adjustFooterPosition(page);
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
    availableArea = page.availableArea;
    contentArea = page.contentArea;
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
        footnote.page = page;
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
    adjustFooterPosition(page);
  };
  const isSpilling = (rect) => {
    return rect.bottom > contentArea.bottom || rect.top < contentArea.top;
  };
  const analyseContent = (element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none') {
      return;
    }
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
      skippedContent: false,
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
      content.height = content.lines.reduce((total, l) => total + l.height, 0);
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
        const lineIndex = content.lines.findIndex(l => l.elements.includes(lastFootnote.supElement));
        if (lineIndex === -1 || lineIndex === lastLineIndex) {
          // the footnote is referenced by the last line, we don't want to push that
          // to the next page ahead of the note itself, so we move the note
          content.footnotes.pop();
          const footnoteHeight = footnoteHeightMap.get(lastFootnote);
          content.footnoteHeight -= footnoteHeight;
          content.skippedFootnotes.unshift(lastFootnote);
          content.skippedFootnoteHeight += footnoteHeight;
          content.skippedContent = true;
          removedFootnote = true;
        }
      }
      if (!removedFootnote) {
        // remove a line from the paragraph if we can't shrink by shifting footnotes to the next page
        const line = content.lines.pop();
        content.height -= line.height;
        content.skippedHeight += line.height;
        content.skippedLines.unshift(line);
        content.skippedContent = true;
      }
      spaceRequired = getSpaceRequired(content, footerEmpty);
    }
    return spaceRequired;
  };
  const useSkippedContent = (content) => {
    content.lines = content.skippedLines;
    content.skippedLines = [];
    content.height = content.skippedHeight;
    content.skippedHeight = 0;
    content.footnotes = content.skippedFootnotes;
    content.skippedFootnotes = [];
    content.footnoteHeight = content.skippedFootnoteHeight;
    content.skippedFootnoteHeight = 0;
    content.skippedContent = false;
  };
  while (overlayContainerElement.firstChild) {
    overlayContainerElement.firstChild.remove();
  }
  const addContentOverlay = (top, content) => {
    if (content.lines) {
      const { left, right } = availableArea;
      for (const line of content.lines) {
        const bottom = top + line.height;
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
      const { footnotes, marginBottom, height, skippedContent, element } = leftover;
      //addContentOverlay(position, leftover);
      pageFootnotes.push(...footnotes);
      if (!skippedContent) {
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
    if (pageIndex >= breakAfterPage) {
      break;
    }
    // get info about this element
    const content = analyseContent(element);
    if (!content) {
      continue;
    }
    // calculate the top margin
    const margin = (atPageTop) ? 0 : Math.max(previousMarginBottom, content.marginTop);
    // trim the amount of content to fit space available in this page
    const spaceRequired = cropContent(content, spaceRemaining - margin, !pageFootnotes.length);
    const { footnotes, marginBottom, height, skippedContent } = content;
    if (spaceRequired) {
      //console.log(`${elementIndex}: ${spaceRequired} at ${position}`);
      position += margin;
      positionMap.set(element, position);
      //if (skippedContent) {
        //addContentOverlay(position, content);
      //}
      pageFootnotes.push(...footnotes);
    }
    if (!skippedContent) {
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
  for (const [ element, position ] of positionMap) {
    const { top, bottom } = getRect(element);
    const positionAfter = positionAfterMap.get(element);
    if (top != position) {
      //console.log(`Diff: ${top - position}, diffAfter: ${bottom - positionAfter}, text: ${element.textContent.substr(0, 20)}`);
    }
  }
  // removed any events caused by layout changes
  footnoteObserver.takeRecords();
  restoreCursor();
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
  if (observing) {
    footnoteObserver.observe(listElement, observerConfig);
  }
  return footer;
}

function adjustFootnoteNumbers() {
  let changed = false;
  const supElements = [ ...contentElement.getElementsByClassName('footnote-number') ].filter((supElement) => {
    return !supElement.classList.contains('hidden');
  });
  const elementToFootnoteMap = new Map;
  const remainingElements = [ ...supElements ];
  const availableFootnotes = [ ...footnotes ];
  const matchMethod = (footnote, supElement) => footnote.id === supElement.id;
  const matchFrom = (list, method) => {
    remove(remainingElements, (supElement) => {
      const footnote = retrieve(list, f => method(f, supElement));
      if (footnote) {
        elementToFootnoteMap.set(supElement, footnote);
        return true;
      }
    });
  };
  matchFrom(availableFootnotes, matchMethod);
  if (remainingElements.length > 0) {
    // look in recycling bin
    matchFrom(footnoteRecylclingBin, matchMethod);
  }
  for (const [ index, supElement ] of supElements.entries()) {
    const footnote = elementToFootnoteMap.get(supElement);
    footnote.supElement = supElement;
    const number = index + 1;
    if (footnote.number !== number) {
      footnote.supElement.textContent = footnote.number = number;
    }
    if (insertAt(footnotes, index, footnote)) {
      changed = true;
    }
  }
  // any extra ones must have been deleted by the user
  const extraFootnotes = footnotes.splice(supElements.length);
  for (const footnote of extraFootnotes) {
    // stick it into the recycling bin
    footnoteRecylclingBin.unshift(footnote);
    footnote.itemElement.remove();
    footnote.supElement = null;
    // take it out the page where it's attached
    remove(footnote.page.footer.footnotes, footnote);
    footnote.page = null;
    changed = true;
  }
  if (changed) {
    removeChangeRecords();
  }
  return changed;
}

export function adjustFootnotes(page) {
  let changed = false;
  const { footer } = page;
  const { listElement } = footer;
  const baseIndex = listElement.start - 1;
  const itemElements = [ ...listElement.children ];
  const newContents = new Map;
  // the content of the list items are needed for handling item deletion
  for (const itemElement of itemElements) {
    const { content } = extractContent(itemElement);
    newContents.set(itemElement, content);
  }
  // when the user delete a list item, instead of removing the actual LI element,
  // Chrome will shift contents upward and delete items from the end; we need to figure
  // out which footnote goes will with which LI element based on the content within
  const elementToFootnoteMap = new Map;
  const remainingElements = [ ...itemElements ];
  const availableFootnotes = [ ...footer.footnotes ];
  const matchMethods = [
    (footnote, itemElement) => matchContent(footnote.content, newContents.get(itemElement), '='),
    (footnote, itemElement) => matchContent(footnote.content, newContents.get(itemElement), '~'),
    (footnote, itemElement) => true,
  ];
  const matchFrom = (list, method) => {
    remove(remainingElements, (itemElement) => {
      const footnote = retrieve(list, f => method(f, itemElement));
      if (footnote) {
        elementToFootnoteMap.set(itemElement, footnote);
        return true;
      }
    });
  } ;
  for (const method of matchMethods) {
    matchFrom(availableFootnotes, method);
  }
  if (remainingElements.length > 0) {
    // look for footnotes in the recycling bin
    for (const method of matchMethods) {
      matchFrom(footnoteRecylclingBin, method);
    }
  }
  for (const [ index, itemElement ] of itemElements.entries()) {
    const footnote = elementToFootnoteMap.get(itemElement);
    footnote.supElement.classList.remove('hidden');
    const number = baseIndex + index + 1;
    if (footnote.number !== number) {
      footnote.supElement.textContent = footnote.number = number;
    }
    footnote.itemElement = itemElement;
    footnote.content = newContents.get(itemElement);
    if (insertAt(footer.footnotes, index, footnote)) {
      changed = true;
    }
    // insert into main list as well
    insertAt(footnotes, baseIndex + index, footnote);
  }
  // any extra ones must have been deleted by the user
  const extraFootnotes = footer.footnotes.splice(itemElements.length);
  for (const footnote of extraFootnotes) {
    // stick it into the recycling bin
    footnoteRecylclingBin.unshift(footnote);
    // hide the sup element instead of removing it, as it's hard to figure out
    // where to put it when we need to restore it
    footnote.supElement.classList.add('hidden');
    footnote.itemElement = null;
    footnote.page = null;
    // remove footnote from the main list as well
    remove(footnotes, footnote);
    changed = true;
  }
  if (changed) {
    removeChangeRecords();
  }
  return changed;
}

export function adjustFooterPosition(page) {
  const { footer } = page;
  const { pusherElement, listElement } = footer;
  const { height, margins, footerGap } = getPageProperties();
  // substract top and bottom margin from height of page
  const dims = [ height, margins.top, margins.bottom ];
  if (footer.footnotes.length > 0) {
    // substract height of foooter and the margin between it and the text
    dims.push(`${listElement.offsetHeight}px`, footerGap);
  }
  // use CSS to do the final calculation
  const heightCSS = `calc(${dims.join(' - ')})`;
  if (footer.heightCSS !== heightCSS) {
    footer.heightCSS = heightCSS;
    pusherElement.style.height = heightCSS;
    // set the content area of the page
    const pusherRect = getRect(footer.pusherElement);
    const listRect = getRect(footer.listElement)
    const top = pusherRect.top;
    const left = listRect.left;
    const right = pusherRect.left;
    page.contentArea = { top, left, bottom: pusherRect.bottom, right };
    page.availableArea = { top, left, bottom: listRect.bottom, right };
    return true;
  } else {
    return false;
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
    const display = styleMap.get('display').value;
    if (display !== 'inline' && display !== 'block' && display !== 'list-item') {
      let { top, bottom, left, right } = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      top += parseFixed(style.marginTop);
      bottom += parseFixed(style.marginBottom);
      left += parseFixed(style.marginLeft);
      right += parseFixed(style.marginRight);
      const wrap = !display.includes('inline');
      const fragment = {
        lineTop: top,
        lineBottom: bottom,
        top, bottom, right, left, element, wrap };
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
            const fragment = {
              lineTop: top - offsetTop,
              lineBottom: bottom + offsetBottom,
              top, bottom, right, left, element, wrap: false };
            fragments.push(fragment);
          }
        }
      }
    }
  };
  scan(blockElement);
  const lines = [];
  let highest = null, lowest = null;
  let elements = [];
  const wrap = () => {
    const height = lowest.lineBottom - highest.lineTop;
    lines.push({ height, elements });
    highest = lowest = null;
    elements = [];
  };
  for (const fragment of fragments) {
    if (lowest && (fragment.top >= lowest.bottom || fragment.wrap)) {
      wrap();
    }
    if (!highest || fragment.top < highest.top) {
      highest = fragment;
    }
    if (!lowest || fragment.bottom > lowest.bottom) {
      lowest = fragment;
    }
    if (fragment.element !== blockElement) {
      elements.push(fragment.element);
    }
  }
  if (highest && lowest) {
    wrap();
  }
  return lines;
}

function decomposeTables() {
  const tables = contentElement.getElementsByTagName('TABLE');
  for (const table of tables) {
    if (!table.classList.contains('decomposed')) {
      const cells = table.getElementsByTagName('TD');
      const cellWidths = new WeakMap;
      // get all the widths first before setting them
      for (const cell of cells) {
        cellWidths.set(cell, cell.offsetWidth);
      }
      for (const cell of cells) {
        cell.style.width = cellWidths.get(cell) + 'px';
      }
      table.classList.add('decomposed');
    }
  }
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
  return footnoteRecylclingBin.find(f => f.id === id);
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
    const page = null, height = '';
    footnotes.push({ id, number, page, supElement, itemElement, height, content, extra });
  }
  element.append(child);
}

export function annotateRange(range, content, extra) {
  const id = `footnote-${nextFootnoteId++}`;
  // figure out what number it should have
  let number = 1;
  for (const { supElement } of footnotes) {
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
  backstageElement.append(itemElement);
  const page = null, height = '';
  const footnote = { id, number, page, supElement, itemElement, height, extra };
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
  const articleElementRect = articleElement.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const top = rect.top - articleElementRect.top;
  const bottom = rect.bottom - articleElementRect.top;
  const left = rect.left - articleElementRect.left;
  const right = rect.right - articleElementRect.left;
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

function retrieve(arr, cb) {
  const index = arr.findIndex(cb);
  if (index !== -1) {
    const value = arr[index];
    arr.splice(index, 1);
    return value;
  }
}

function insertAt(arr, index, item) {
  const currentIndex = arr.indexOf(item);
  if (currentIndex === index) {
    return false;
  }
  if (currentIndex !== -1) {
    arr.splice(currentIndex, 1);
  }
  arr.splice(index, 0, item);
  return true;
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

function removeChangeRecords() {
  footnoteObserver.takeRecords();
  articleObserver.takeRecords();
}

function handleArticleChanges(mutationsList) {
  let footnoteNumbersChanged = false;
  let articleTextChanged = false;
  const hasFootnoteNumbers = (nodes) => {
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('footnote-number')) {
        return true;
      }
    }
    return false;
  };
  for (const { type, target, addedNodes, removedNodes } of mutationsList) {
    if (type === 'childList') {
      if (!target.classList.contains('footnote-number')) {
        if (hasFootnoteNumbers(addedNodes) || hasFootnoteNumbers(removedNodes)) {
          footnoteNumbersChanged = true;
        }
        articleTextChanged = true;
      }
    } else if (type === 'characterData') {
      articleTextChanged = true;
    }
  }
  if (footnoteNumbersChanged) {
    adjustFootnoteNumbers();
  }
  if (articleTextChanged) {
    adjustLayout();
  }
  if (footnoteNumbersChanged || articleTextChanged) {
    autosave();
  }
}

function handleFootnoteChanges(mutationsList) {
  const footnotesChanged = new Map;
  const footnoteTextChanged = new Map;
  const set = (map, target, value) => {
    let listElement;
    for (let n = target; n; n = n.parentNode) {
      if (n.tagName === 'OL') {
        listElement = n;
        break;
      }
    }
    map.set(listElement, value);
  };
  for (const { type, target, addedNodes, removedNodes } of mutationsList) {
    if (type === 'childList') {
      if (target.classList.contains('footer-content')) {
        set(footnotesChanged, target, true);
        set(footnoteTextChanged, target, true);
      } else if (target.classList.contains('footnote-item')) {
        set(footnoteTextChanged, target, true);
      }
    } else if (type === 'characterData') {
      set(footnoteTextChanged, target, true);
    }
  }
  for (const page of pages) {
    const { listElement } = page.footer;
    if (footnotesChanged.get(listElement) || footnoteTextChanged.get(listElement)) {
      if (adjustFootnotes(page)) {
        // footnotes were deleted or restored
        adjustLayout();
      } else {
        if (adjustFooterPosition(page)) {
          // the footer size has changed, lines (and hence footnotes) might need to be moved between pages
          adjustLayout();
        }
      }
    }
  }
  if (footnotesChanged.size > 0 || footnoteTextChanged.size > 0) {
    autosave();
  }
}
