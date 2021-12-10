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
  articleObserver.observe(contentElement, observerConfig);
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
  const config = { attributes: true, childList: true, subtree: true, characterData: true };
  observer.observe(container, config);

}

/*
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
*/

export function adjustLayout() {
  const contentAreas = pages.map(p => getContentArea(p));
  const isCrossingMultiple = (rect) => {
    for (const { top, bottom } of contentAreas) {
      if (rect.top >= top && rect.top <= bottom) {
        if (rect.bottom > bottom) {
          return true;
        }
      }
    }
  };
  const getFootnoteHeight = (footnotes) => {
    let height = 0;
    for (const { itemElement } of footnotes) {
      height += itemElement.offsetHeight;
    }
    return height;
  };
  const sum = (arr) => {
    let total = 0;
    for (const n of arr) {
      total += n;
    }
    return total;
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
        map[footnote] = lineIndex;
      }
      return map;
    }
  };
  const analyseContent = (element) => {
    const style = getComputedStyle(element);
    const rect = getRect(element);
    const height = isCrossingMultiple(rect) ? Infinity : rect.bottom - rect.top;
    const footnotesInElement = footnotes.filter(f => element.contains(f.supElement));
    const footnoteHeight = getFootnoteHeight(footnotesInElement);
    return {
      element,
      height,
      footnoteHeight,
      marginTop: parseFloat(style.marginTop),
      marginBottom: parseFloat(style.marginBottom),
      lines: null,
      footnotes: footnotesInElement,
      footnoteLineMap: null,
      skippedHeight: 0,
      skippedLines: null,
      skippedFootnotes: null,
      skippedFootnoteHeight: 0,
    };
  };
  const footerMargin = parseFloat(getComputedStyle(backstageElement).marginTop);
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
      content.lines = getElementLines(content.element);
      content.footnoteLineMap = mapFootnotesToLines(content.element, content.footnotes, content.lines);
      content.height = sum(content.lines);
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
      let removedFootnote = false;
      if (lastFootnote) {
        const lineIndex = content.footnoteLineMap[lastFootnote];
        if (lineIndex === content.lines.length - 1) {
          // the footnote is referenced by the last line--leave it to the next page
          content.footnotes.pop();
          const footnoteHeight = lastFootnote.itemElement.offsetHeight;
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
    return true;
  };
  const useSkippedContent = (content) => {
    // adjust the indices in the footnote-to-line map
    const used = content.lines.length;
    for (const footnote of content.footnotes) {
      content.footnoteLineMap[footnote] -= used;
    }
    content.lines = content.skippedLines;
    content.skippedLines = [];
    content.height = content.skippedHeight;
    content.skippedHeight = 0;
    content.footnotes = content.skippedFootnotes;
    content.skippedFootnotes = [];
  };
  const addContentOverlay = (top, content) => {
    if (content.lines) {
      const { left, right } = pageArea;
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
  const pageToFootnoteMap = new Map;
  const attachFootnotes = (page, footnotes) => {
    let list = pageToFootnoteMap.get(page);
    if (!list) {
      list = [];
      pageToFootnoteMap.set(page, list);
    }
    for (const footnote of footnotes) {
      list.push(footnote);
    }
  };
  let pageIndex = -1;
  let page = null;
  let pageArea = null;
  let footnoteCount = 0;
  let spaceRemaining = 0;
  let position = 0;
  let previousMarginBottom = 0;
  let leftover = null;
  const nextPage = () => {
    pageIndex++;
    if (pageIndex < pages.length) {
      page = pages[pageIndex];
    } else {
      page = addPage();
      contentAreas.push(getContentArea(page));
    }
    pageArea = getContentArea(page, true);
    footnoteCount = 0;
    spaceRemaining = pageArea.bottom - pageArea.top;
    position = pageArea.top;
    previousMarginBottom = 0;
    if (leftover) {
      useSkippedContent(leftover);
      const spaceRequired = cropContent(leftover, spaceRemaining, !footnoteCount);
      if (spaceRequired > 0) {
        const { footnotes, marginBottom, height } = leftover;
        addContentOverlay(position, leftover);
        attachFootnotes(page, footnotes);
        footnoteCount += footnotes.length;
        spaceRemaining -= spaceRequired;
        previousMarginBottom = marginBottom;
        position += height;
      }
      if (leftover.skippedHeight > 0) {
        nextPage();
      } else {
        leftover = null;
      }
    }
  };
  nextPage();
  const positionMap = new WeakMap;
  for (const child of contentElement.children) {
    const content = analyseContent(child, contentAreas);
    const margin = Math.max(previousMarginBottom, content.marginTop);
    const spaceRequired = cropContent(content, spaceRemaining - margin, !footnoteCount);
    if (spaceRequired) {
      const { footnotes, marginBottom, height } = content;
      position += margin;
      positionMap.set(child, position);
      addContentOverlay(position, content);
      attachFootnotes(page, footnotes);
      footnoteCount += footnotes.length;
      spaceRemaining -= margin + spaceRequired;
      previousMarginBottom = marginBottom;
      position += height;
    }
    if (content.skippedHeight > 0 || spaceRemaining < previousMarginBottom) {
      leftover = (content.skippedHeight > 0) ? content : null;
      nextPage();
    }
  }
  for (const page of pages) {
    const footnotes = pageToFootnoteMap.get(page);
    if (footnotes) {
      const { footer } = page;
      const { listElement } = footer;
      for (const footnote of footnotes) {
        listElement.append(footnote.itemElement);
      }
      footer.footnotes = footnotes;
      adjustFooterPosition(footer);
    }
  }
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
  footnoteObserver.observe(listElement, observerConfig);
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

function getElementLines(blockElement) {
  const rootRect = blockElement.getBoundingClientRect();
  const range = document.createRange();
  const get = (textNode, offset) => {
    // get the cursor of the bottom
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset);
    return range.getBoundingClientRect();
  };
  const add = (bottoms, bottom) => {
    if (!bottoms.includes(bottom)) {
      bottoms.push(bottom);
    }
  };
  const check = (textNode, startOffset, endOffset, startBottom, endBottom, bottoms) => {
    if (startBottom !== endBottom) {
      const length = endOffset - startOffset;
      if (length > 1) {
        // check the middle
        const midOffset = startOffset + (length >> 1);
        const { bottom: midBottom } = get(textNode, midOffset);
        check(textNode, startOffset, midOffset, startBottom, midBottom, bottoms);
        check(textNode, midOffset, endOffset, midBottom, endBottom, bottoms);
      } else {
        add(bottoms, startBottom);
        add(bottoms, endBottom);
      }
    } else {
      add(bottoms, startBottom);
    }
  };
  const test = (textNode, startOffset, endOffset) => {
    const bottoms = [];
    const start = get(textNode, startOffset);
    const end = get(textNode, endOffset);
    check(textNode, startOffset, endOffset, start.bottom, end.bottom, bottoms);
    const wrap = (start.height !== 0 && end.height === 0);
    if (end.height === 0) {
      bottoms.pop();
    }
    return { start, end, lineCount: bottoms.length, wrap };
  };
  let currentLineHeight = 0;
  let currentLineTop = 0;
  const lines = [];
  const scan = (element) => {
    const style = getComputedStyle(element);
    switch (style.display) {
      case 'inline':
      case 'block':
      case 'list-item':
        break;
      case 'flex':
        lines.push(element.offsetHeight + parseInt(style.marginTop) + parseInt(style.marginBottom));
        return;
      case 'inline-flex':
      case 'inline-block':
        currentLineHeight = element.offsetHeight + parseInt(style.marginTop) + parseInt(style.marginBottom);
        return;
      default:
        return;
    }
    const lineHeight = parseFloat(style.lineHeight) || Math.round(parseFloat(style.fontSize) * (1 + 1 / 6));
    for (let node = element.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'BR') {
          lines.push(currentLineHeight);
        } else {
          scan(node);
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        const { lineCount, wrap } = test(node, 0, node.nodeValue.length);
        if (lineCount) {
          if (lineHeight > currentLineHeight) {
            currentLineHeight = lineHeight;
          }
          for (let i = 1; i < lineCount; i++) {
            lines.push(currentLineHeight);
            currentLineHeight = lineHeight;
          }
          if (wrap) {
            lines.push(currentLineHeight);
            currentLineHeight = 0;
          }
        }
      }
    }
    if (style.display === 'block' || style.display === 'list-item') {
      // add the last line if there's one
      if (currentLineHeight) {
        lines.push(currentLineHeight);
        currentLineHeight = 0;
      }
    }
  };
  scan(blockElement);
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
  console.log(mutationsList);
}

function handleFootnoteChanges(mutationsList) {
  console.log(mutationsList);
}
