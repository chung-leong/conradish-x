export function transverseRange(range, cb) {
  const { startContainer, endContainer, commonAncestorContainer } = range;
  const { startOffset, endOffset } = range;
  let inside = false, finished = false;
  const scan = (node) => {
    const content = node.nodeValue || node.childNodes;
    const s = (node === startContainer) ? startOffset : 0;
    const e = (node === endContainer) ? endOffset : content.length;
    if (node === startContainer) {
      inside = true;
    }
    if (inside) {
      if (cb(node, s, e) === false) {
        finished = true;
      }
    }
    if (content instanceof NodeList && !finished) {
      for (let i = s; i < e; i++) {
        scan(content[i]);
        if (finished) {
          break;
        }
      }
    }
    if (node === endContainer) {
      inside = false;
      finished = true;
    }
  };
  scan(commonAncestorContainer);
}

export async function captureSelection(selection, filter) {
  const range = selection.getRangeAt(0);
  const url = document.location.href;
  const title = getTitle();
  const image = getImage();
  const lang = await getLanguage(range);
  const object = captureRangeContent(range, { filter });
  // where multiple paragraphs are present, captureRangeContent() will
  // return a <div>; otherwise we'd get a <p>
  const content = (object.tag === 'DIV') ? object.content : object;
  const doc = { url, title, image, lang, content };
  return doc;
}

export function captureRangeContent(range, options) {
  const { filter } = options;
  let { commonAncestorContainer: rootNode } = range;
  if (rootNode.nodeType === Node.TEXT_NODE) {
    rootNode = rootNode.parentNode;
  }
  // get "@media print" selectors from the page's CSS style sheet
  // specifying elements that ought to be hidden when printing
  const hiddenSelectors = getHiddenSelectors();
  const nodeHiddenStates = new Map;
  for (const selector of hiddenSelectors) {
    try {
      // mark all the matching nodes (including their descendents) as hidden
      for (const node of rootNode.querySelectorAll(selector)) {
        nodeHiddenStates.set(node, true);
        for (const child of node.getElementsByTagName('*')) {
          nodeHiddenStates.set(child, true);
        }
      }
    } catch (e) {
    }
  }
  const root = { tag: 'DIV', content: undefined };
  const outsideRoot = { tag: '#INVALID' };
  const nodeObjects = new Map([ [ rootNode, root ] ]);
  const nodeStyles = new Map;
  const objectParents = new Map;
  const objectStyles = new Map([ [ root, getComputedStyle(rootNode) ] ]);
  const objectRects = new Map;
  const objectLinks = new Map;
  const rootClientRect = rootNode.getBoundingClientRect();
  const getRect = (node) => {
    const clientRect = node.getBoundingClientRect();
    const top = clientRect.top - rootClientRect.top;
    const left = clientRect.left - rootClientRect.left;
    const bottom = clientRect.bottom - rootClientRect.top;
    const right = clientRect.right - rootClientRect.left;
    const width = right - left;
    const height = bottom - top;
    return { top, left, bottom, right, width, height };
  };
  const getNodeStyle = (node) => {
    let style = nodeStyles.get(node);
    if (style === undefined) {
      style = getComputedStyle(node);
      nodeStyles.set(node, style);
    }
    return style;
  };
  const normalText = {
    fontWeight: '400',
    fontStyle: 'normal',
    textDecorationLine: 'none',
    textDecorationStyle: 'solid',
    verticalAlign: 'baseline',
  };
  const heavyText = { ...normalText, fontWeight: '700' };
  const styleNames = Object.keys(normalText);
  const getDefaultStyle = (object) => {
    switch (object.tag) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
      case 'TH':
        return heavyText;
      default:
        return normalText;
    }
  };
  const getTextStyle = (object) => {
    const defaultStyle = getDefaultStyle(object);
    return (object.style) ? { ...defaultStyle, ...object.style } : defaultStyle;
  };
  const isHidden = (node) => {
    if (nodeHiddenStates.get(node)) {
      return true;
    }
    // make sure the node isn't hidden
    const style = getNodeStyle(node);
    const { display, visibility } = style;
    if (!display || display === 'none' || visibility === 'hidden') {
      return true;
    }
    return false;
  };
  const isDisallowedTag = (node) => {
    for (let n = node; n && n !== rootNode; n = n.parentNode) {
      switch (n.tagName) {
        // skip these
        case 'BUTTON':
        case 'FIGCAPTION':
        case 'NOSCRIPT':
          return true;
      }
    }
    return false;
  }
  const isInsideCell = (node) => {
    for (let n = node.parentNode; n && n !== rootNode; n = n.parentNode) {
      const { display } = getNodeStyle(n.parentNode);
      if (display === 'table-cell' || display === 'list-item') {
        return true;
      }
    }
    return false;
  };
  const isSuperscriptLink = (node) => {
    const { verticalAlign } = getNodeStyle(node);
    if (verticalAlign === 'super') {
      const links = node.getElementsByTagName('A');
      if (links.length > 0) {
        return true;
      }
      // see if a parent node is a link
      for (let n = node; n && n !== rootNode; n = n.parentNode) {
        if (n.tagName === 'A' && n.href) {
          const parentText = n.innerText.trim();
          const nodeText = node.innerText;
          if (parentText.length - nodeText.length <= 2) {
            // the link is mostly just the node in question
            return true;
          }
        }
      }
    }
    return false;
  };
  const getLinkParentObject = (node) => {
    let parentNode, linkNode;
    if (node.tagName === 'A' && node.href) {
      // while styling tags are used to style a link like this:
      // <i><b><a href="..."> ... </a></b></i>
      // return the parent of <i>
      const { innerText } = node;
      for (let n = node.parentNode; n && n !== rootNode; n = n.parentNode) {
        const { display, verticalAlign } = getNodeStyle(n);
        if (display !== 'inline' || n.innerText !== innerText) {
          if (verticalAlign === 'super') {
            // the link along with the text should be removed
            // later when isSuperscriptLink() returns true
            return;
          }
          parentNode = n;
          linkNode = node;
          break;
        }
      }
    } else if (node.tagName !== 'A') {
      // while a hyperlink wraps styling tags like this:
      // <a href="..."><i><b> ... </b></i></a>
      // return the parent of <a> when node is <b>
      for (let n = node; n && n !== rootNode; n = n.parentNode) {
        if (n.tagName === 'A' && n.href) {
          const { innerText } = node;
          if (n.innerText === innerText) {
            linkNode = n;
            parentNode = n.parentNode;
            break;
          }
        }
      }
    }
    if (parentNode && linkNode) {
      const parentObject = getObject(parentNode);
      // remember that the parent has this link
      objectLinks.set(parentObject, linkNode);
      return parentObject;
    }
  };
  const getObject = (node) => {
    // see if there's an object for this node already
    let object = nodeObjects.get(node);
    if (object !== undefined) {
      return object;
    }
    // create it
    object = createObject(node);
    if (object && object !== outsideRoot) {
      nodeObjects.set(node, object);
      return object;
    } else {
      nodeObjects.set(node, null);
      return null;
    }
  };
  const getRootObject = (node) => {
    // if we're going to put stuff into the root instead, we need to make
    // sure that things don't get placed into the parentNode's object
    // (if there's one created earlier)
    if (node !== rootNode) {
      nodeObjects.delete(node);
    }
    for (let n = node; n; n = n.parentNode) {
      if (n === rootNode) {
        return root;
      }
      // make sure the node isn't hidden
      if (isHidden(node)) {
        return;
      }
      if (!canBeEmpty(node.tagName)) {
        const rect = getRect(node);
        if (rect.width === 0 || rect.height === 0) {
          return;
        }
      }
    }
  };
  let inlineOnly = true;
  const createObject = (node) => {
    if (!rootNode.contains(node)) {
      return outsideRoot;
    }
    if (isHidden(node)) {
      return;
    }
    const { parentNode, tagName } = node;
    const rect = getRect(node);
    if (!canBeEmpty(tagName)) {
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
    }
    // remove <button>, <figcaption>, and such
    if (isDisallowedTag(node)) {
      return;
    }
    // remove sup tags that are links
    if (isSuperscriptLink(node)) {
      return;
    }
    const style = getNodeStyle(node);
    // don't include any hyperlinks
    let parentObject = getLinkParentObject(node);
    if (parentObject) {
      return parentObject;
    }
    let tag;
    switch (style.display) {
      case 'inline':
        parentObject = getObject(parentNode);
        if (tagName === 'BR') {
          tag = tagName;
        } else {
          // all other inline elements become span
          tag = 'SPAN';
        }
        break;
      case 'block': case 'inline-block':
      case 'flex': case 'inline-flex':
      case 'grid': case 'inline-grid':
        // block elements all go into the root, unless they're inside
        // a table cell or list item
        if (isInsideCell(node)) {
          parentObject = getObject(parentNode);
        } else {
          parentObject = getRootObject(parentNode);
        }
        switch (tagName) {
          case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
          case 'UL': case 'OL':
          case 'BLOCKQUOTE':
          case 'HR':
            tag = tagName;
            break;
          default:
            tag = 'P';
        }
        break;
      case 'list-item':
        parentObject = getObject(parentNode);
        tag = 'LI';
        // make sure is a list
        if (parentObject.tag !== 'OL' && parentObject.tag !== 'UL') {
          parentObject.tag = (style.listStyleType === 'decimal') ? 'OL' : 'UL';
        }
        break;
      case 'table':
        parentObject = getRootObject(parentNode);
        tag = 'TABLE';
        break;
      case 'table-row-group':
        parentObject = getObject(parentNode);
        tag = 'TBODY';
        break;
      case 'table-header-group':
        parentObject = getObject(parentNode);
        tag = 'THEAD';
        break;
      case 'table-footer-group':
        parentObject = getObject(parentNode);
        tag = 'TFOOT';
        break;
      case 'table-row':
        parentObject = getObject(parentNode);
        tag = 'TR';
        break;
      case 'table-cell':
        parentObject = getObject(parentNode);
        tag = (style.fontWeight > 400) ? 'TH' : 'TD';
        break;
      case 'table-column-group':
        parentObject = getObject(parentNode);
        tag = 'COLGROUP';
        break;
      case 'table-column':
        parentObject = getObject(parentNode);
        tag = 'COL';
        break;
      case 'table-caption':
        parentObject = getObject(parentNode);
        tag = 'CAPTION';
        break;
    }
    if (parentObject === outsideRoot) {
      // deal with situation where a table or a list is used for layout purpose
      if (tag === 'TD' || tag === 'LI') {
        parentObject = rootNode;
        tag = 'P';
      }
      return outsideRoot;
    }
    if (parentObject && tag) {
      const object = { tag, content: undefined };
      const newStyle = {};
      const parentStyle = getTextStyle(parentObject);
      const defaultStyle = getDefaultStyle(object);
      for (const name of styleNames) {
        const parentValue = parentStyle[name];
        const defaultValue = defaultStyle[name];
        let value = style[name];
        if (name === 'fontWeight') {
          // stick with standard values
          value = (value >= 600) ? '700' : '400';
        }
        if (value !== parentValue && value !== defaultValue) {
          if (name === 'verticalAlign') {
            if (value === 'super' || value === 'sub') {
              // set the font size as well
              newStyle.fontSize = 'smaller';
            } else {
              // skip it
              continue;
            }
          }
          newStyle[name] = value;
        }
      }
      if (Object.entries(newStyle).length > 0) {
        object.style = newStyle;
      }
      if (object.tag !== 'SPAN') {
        inlineOnly = false;
      }
      insertContent(parentObject, object);
      objectParents.set(object, parentObject);
      // remember the object's position and style, which will be used for the
      // purpose of filtering out junk content
      objectRects.set(object, rect);
      objectStyles.set(object, style);
      return object;
    }
  };
  // walk through the range and build the object tree
  transverseRange(range, (node, startOffset, endOffset) => {
    const { nodeType, nodeValue, parentNode } = node;
    if (nodeType === Node.TEXT_NODE) {
      const parentObject = getObject(parentNode);
      if (parentObject) {
        const text = nodeValue.substring(startOffset, endOffset);
        insertContent(parentObject, text);
      }
    } else if (nodeType === Node.ELEMENT_NODE) {
      // create these tags even when they don't contain any text
      if (canBeEmpty(node.tagName)) {
        getObject(node);
      }
    }
  });
  // change the root tag to P if all we have are inline elements
  if (inlineOnly) {
    root.tag = 'P';
  }
  // apply white-space rules
  collapseWhitespaces(root, objectStyles);
  // replace spans that don't have any styling information with just its
  // content; couldn't do it earlier since the inline element could in theory
  // employ a different white-space rule
  replaceUselessElements(root);
  // remove empty nodes
  removeEmptyNodes(root);
  // filter out links
  filterLinks(root, filter, objectLinks);
  // filter out content that's probably garbage
  filterContent(root, filter, objectStyles, objectRects);
  return root;
}

export function insertContent(object, content) {
  if (!content) {
    return;
  }
  if (!object.content) {
    if (typeof(content) === 'string') {
      object.content = content;
    } else {
      object.content = [ content ];
    }
  } else if (object.content instanceof Array) {
    const arr = object.content, last = arr[arr.length - 1];
    // merge with last item if possible
    if (typeof(last) === 'string' && typeof(content) === 'string') {
      arr[arr.length - 1] = last + content;
    } else {
      arr.push(content);
    }
  } else if (typeof(object.content) === 'string' && typeof(content) === 'string') {
    object.content += content;
  } else {
    object.content = [ object.content, content ];
  }
}

function filterLinks(root, filter, objectLinks) {
  if (!(root.content instanceof Array) || root.tag === 'P') {
    return;
  }
  const calculateLinkScore = (object) => {
    const link = objectLinks.get(object);
    if (link) {
      const objectText = getPlainText(object).trim();
      const linkText = link.innerText.trim();
      if (objectText === linkText) {
        return 1;
      } else if (linkText.length / objectText.length >= 0.6) {
        return 0.5;
      }
    }
    return 0;
  };
  const calculateCollectiveScore = (object, tag, tough) => {
    const items = getChildrenByTag(object, tag);
    // see if the items are nothing but links
    const scores = items.map(calculateLinkScore);
    // if every item is mostly link, then it's probably junk
    if (scores.every(s => s === 1)) {
      return 1;
    } else if (scores.every(s => s >= 0.5)) {
      return (tough) ? 1 : 0.5;
    } else {
      return 0;
    }
  };
  alterObjects(root.content, (object) => {
    let junkFactor = 0;
    if (object.tag === 'UL' || object.tag === 'OL') {
      junkFactor = calculateCollectiveScore(object, 'LI', false);
    } else if (object.tag === 'TABLE') {
      junkFactor = calculateCollectiveScore(object, 'TD', true);
    } else {
      junkFactor = calculateLinkScore(object);
    }
    return rejectJunk(object, filter, junkFactor);
  });
}

function filterContent(root, filter, objectStyles, objectRects) {
  if (!(root.content instanceof Array) || root.tag === 'P') {
    return;
  }
  // figure out the dominant color and position of the content
  // most of the text we want should have the same color and similar
  // left and right boundaries
  const objectCounts = new Map;
  const leftCounts = new Map;
  const rightCounts = new Map;
  const colorCounts = new Map;
  for (const object of root.content) {
    if (object instanceof Object) {
      const rect = objectRects.get(object);
      const style = objectStyles.get(object);
      const charCount = getCharacterCount(object);
      const { color } = style;
      const { left, right } = rect;
      objectCounts.set(object, charCount);
      colorCounts.set(color, charCount + (colorCounts.get(color) || 0)) ;
      leftCounts.set(left, charCount + (leftCounts.get(left) || 0)) ;
      rightCounts.set(right, charCount + (rightCounts.get(right) || 0)) ;
    }
  }
  const getMaxKey = (map) => {
    let maxKey, maxValue;
    for (const [ key, value ] of map.entries()) {
      if (!(maxValue > value)) {
        maxValue = value;
        maxKey = key;
      }
    }
    return maxKey;
  };
  const maxColor = getMaxKey(colorCounts);
  const maxLeft = getMaxKey(leftCounts);
  const maxRight = getMaxKey(rightCounts);
  const maxRect = { left: maxLeft, right: maxRight };
  const calculatePositionScore = (rect1, rect2) => {
    const leftDiff = rect1.left - rect2.left;
    const rightDiff = rect2.right - rect1.right;
    return Math.abs(leftDiff + rightDiff);
  };
  const calculateColorScore = (color1, color2, charCount) => {
    const parseRGB = (color) => {
      const m = color.replace(/[rgba\(\)]/, '').split(',');
      const r = parseInt(m[0]) || 255;
      const g = parseInt(m[1]) || 255;
      const b = parseInt(m[2]) || 255;
      const a = parseFloat(m[3]) || 1;
      return [ r, g, b, a ];
    };
    const [ r1, g1, b1, a1 ] = parseRGB(color1);
    const [ r2, g2, b2, a2 ] = parseRGB(color2);
    const diffR = Math.abs(r1 - r2);
    const diffG = Math.abs(g1 - g2);
    const diffB = Math.abs(b1 - b2);
    const diffA = Math.abs(a1 - a2) * 255;
    return diffR + diffG + diffB + diffA;
  };
  // remove paragraphs that are way off
  alterObjects(root.content, (object) => {
    const rect = objectRects.get(object);
    const style = objectStyles.get(object);
    const charCount = objectCounts.get(object);
    const color = style.color;
    // calculate the "junk" scores
    const scoreColor = calculateColorScore(color, maxColor);
    const scorePos = calculatePositionScore(rect, maxRect);
    const isHeading = /^H[123]$/.test(object.tag);
    // greater tolerance for heading
    const limitPos = (isHeading) ? 20 : 10;
    const limitColor = (isHeading) ? 10 : 5;
    let junkFactor = 0;
    if (scoreColor / charCount > limitColor || scorePos / charCount > limitPos) {
      // probably junk
      junkFactor = 1;
    } else if (scoreColor > (limitColor * 10) || scorePos > (limitPos * 10)) {
      // might be junk
      junkFactor = 0.5;
    }
    //object.score = { color: scoreColor / charCount, position: scorePos / charCount};
    return rejectJunk(object, filter, junkFactor)
  });
}

function rejectJunk(object, filter, junkFactor) {
  if (junkFactor > 0) {
    if (junkFactor === 1 && filter === 'automatic') {
      // throw it out now
      return;
    }
    if (!object.junk || junkFactor < object.junk) {
      // mark it as junk and wait for the user to decide what to do
      object.junk = junkFactor;
    }
  }
  return object;
}

function getCharacterCount(content) {
  if (typeof(content) === 'string') {
    return content.length;
  } else if (content instanceof Array) {
    return content.reduce((t, i) => t + getCharacterCount(i), 0);
  } else if (content instanceof Object) {
    return getCharacterCount(content.content);
  } else {
    return 0;
  }
}

function getPlainText(content) {
  if (typeof(content) === 'string') {
    return content;
  } else if (content instanceof Array) {
    return content.map(getPlainText).join('');
  } else if (content instanceof Object) {
    return getPlainText(content.content);
  } else {
    return '';
  }
}

function getChildrenByTag(object, tag) {
  const list = [];
  const check = (object) => {
    if (object instanceof Array) {
      for (const child of object) {
        check(child);
      }
    } else if (object instanceof Object) {
      if (object.tag === tag) {
        list.push(object);
      }
      check(object.content);
    }
  };
  check(object);
  return list;
}

function collapseWhitespaces(root, styleMap) {
  const trim = (text, whiteSpace, atStart, atEnd) => {
    if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
      text = text.replace(/\r?\n/g, ' ');
    } else {
      text = text.replace(/\r\n/g, '\n');
    }
    if (whiteSpace === 'normal' || whiteSpace === 'nowrap' || whiteSpace === 'pre-line') {
      text = text.replace(/\s+/g, ' ');
    }
    if (whiteSpace === 'normal'  || whiteSpace === 'nowrap' || whiteSpace === 'pre-line') {
      if (atStart) {
        text = text.trimLeft();
      }
      if (atEnd) {
        text = text.trimRight();
      }
    }
    return text;
  };
  const collapse = (object, atStart, atEnd) => {
    const style = styleMap.get(object);
    const { whiteSpace } = style;
    const inline = (object.tag === 'SPAN');
    let childAtStart = (inline) ? atStart : true;
    let childAtEnd = false;
    const children = (object.content instanceof Array) ? object.content : [ object.content ];
    alter(children, (item, i, arr) => {
      if (i === arr.length - 1) {
        // if the element is inline, then it's only at an end when
        // the element itself is at an end
        childAtEnd = (inline) ? atEnd : true;
      }
      let result = item, newLine = false;
      if (typeof(item) === 'string') {
        result = trim(item, whiteSpace, childAtStart, childAtEnd);
      } else if (item instanceof Object) {
        newLine = collapse(item, childAtStart, childAtEnd);
      }
      // restart the line after a block element or <br>
      childAtStart = newLine;
      return result;
    });
    if (object.content !== children) {
      object.content = children[0];
    }
    return (inline) ? childAtStart : true;
  };
  collapse(root);
}

export function replaceUselessElements(object) {
  if (object.content instanceof Array) {
    alterObjects(object.content, (item) => {
      replaceUselessElements(item);
      if (item.tag === 'SPAN' && !item.style) {
        return item.content;
      }
      if (item.tag === 'BR') {
        return '\n';
      }
      return item;
    });
  }
}

function canBeEmpty(tag) {
  switch (tag) {
    case 'TH':
    case 'TD':
    case 'HR':
    case 'BR':
      return true;
    default:
      return false;
  }
}

export function removeEmptyNodes(root) {
  const merge = (item, i, arr) => {
    // merge to previous string
    if (i > 0 && arr && typeof(arr[i - 1]) === 'string') {
      arr[i - 1] += item;
      return true;
    }
    return false;
  };
  const clean = (item, i, arr) => {
    if (typeof(item) === 'string') {
      if (item.length === 0) {
        // remove empty string
        return;
      } else if (merge(item, i, arr)) {
        return;
      }
    } else if (item instanceof Array) {
      alter(item, clean);
      if (item.length === 0) {
        return;
      } else if (item.length === 1) {
        if (typeof(item[0]) === 'string' && merge(item[0], i, arr)) {
          return;
        }
        return item[0];
      }
    } else if (item instanceof Object) {
      item.content = clean(item.content);
      if (!item.content) {
        // it's empty--remove it if it's not one of the special ones like <hr>
        if (!canBeEmpty(item.tag)) {
          return;
        }
      }
    }
    return item;
  };
  clean(root);
}

function getTitle() {
  let title = getMeta('og:title');
  if (!title) {
    title = document.title;
  }
  return title;
}

function getImage() {
  return getMeta('og:image');
}

async function getLanguage(range) {
  let lang = await detectLanguage(range.toString());
  if (!lang) {
    lang = getMeta('og:locale')
  }
  if (!lang) {
    const { commonAncestorContainer } = range;
    for (let n = commonAncestorContainer; n; n = n.parentNode) {
      if (n.lang) {
        lang = n.lang;
        break;
      }
    }
  }
  lang = lang.substr(0, 2).toLowerCase();
  return lang;
}

function getMeta(propName) {
  const metaElements = document.head.getElementsByTagName('META');
  for (const metaElement of metaElements) {
    const name = metaElement.getAttribute('property');
    if (name && name === propName) {
      return metaElement.getAttribute('content');
    }
  }
}

async function detectLanguage(text) {
  return new Promise((resolve) => {
    chrome.i18n.detectLanguage(text, (result) => {
      let lang;
      for (const { language, percentage } of result.languages) {
        if (percentage >= 80) {
          lang = language;
        }
      }
      resolve(lang);
    });
  });
}

function getHiddenSelectors() {
  const list = [];
  for (const styleSheet of document.styleSheets) {
    try {
      for (const rule of styleSheet.cssRules) {
        if (rule.media && [ ...rule.media ].includes('print')) {
          for (const printRule of rule.cssRules) {
            const { display, visibility } = printRule.style;
            if (display === 'none' || visibility === 'hidden') {
              list.push(printRule.selectorText);
            }
          }
        }
      }
    } catch (e) {
      // probably 'cause the CSS file is cross-domain
    }
  }
  return list;
}

function alterObjects(arr, cb) {
  alter(arr, (o, i, arr) => (o instanceof Object) ? cb(o, i, arr) : o);
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
