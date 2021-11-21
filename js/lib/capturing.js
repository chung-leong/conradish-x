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
  const root = { tag: 'DIV', content: undefined };
  const nodeObjects = new Map([ [ rootNode, root ] ]);
  const nodeStyles = new Map;
  const objectParents = new Map;
  const objectStyles = new Map([ [ root, getComputedStyle(rootNode) ] ]);
  const objectRects = new Map;
  const rootClientRect = rootNode.getBoundingClientRect();
  const getRect = (node) => {
    const clientRect = node.getBoundingClientRect();
    const top = clientRect.top - rootClientRect.top;
    const left = clientRect.left - rootClientRect.left;
    const bottom = clientRect.bottom - rootClientRect.top;
    const right = clientRect.right - rootClientRect.left;
    return { top, left, bottom, right };
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
  let inlineOnly = true;
  const isLink = (node) => {
    const links = node.getElementsByTagName('A');
    if (links.length > 0) {
      return true;
    }
    for (let n = node; n && n !== rootNode; n = n.parentNode) {
      if (n.tagName === 'A') {
        const parentText = n.textContent.trim();
        const nodeText = node.textContent;
        if (parentText.length - nodeText.length <= 2) {
          // the link is mostly just the node in question
          return true;
        }
      }
    }
    return false;
  };
  const createObject = (node) => {
    const { parentNode } = node;
    const style = getNodeStyle(node);
    const { display, visibility } = style;
    if (display === 'none' || visibility === 'hidden') {
      return;
    }
    const { tagName } = node;
    switch (tagName) {
      case 'A':
        // don't include any hyperlinks (or anchors)
        return getObject(parentNode);
      case 'BUTTON':
      case 'FIGCAPTION':
      case 'NOSCRIPT':
        // skip these
        return;
    }
    let tag, parentObject;
    switch (display) {
      case 'inline':
        // remove sup tags that are links
        if (style.verticalAlign === 'super' && isLink(node)) {
          return;
        }
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
        // block elements all go into the root
        parentObject = root;
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
        parentObject = root;
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
    if (parentObject && tag) {
      const rect = getRect(node);
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
  const getObject = (node) => {
    // see if there's an object for this node already
    let object = nodeObjects.get(node);
    if (object !== undefined) {
      return object;
    }
    // create it
    object = createObject(node) || null;
    nodeObjects.set(node, object);
    return object;
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
  // apply white-space rules
  collapseWhitespaces(root, objectStyles);
  // replace spans that don't have any styling information with just its
  // content; couldn't do it earlier since the inline element could in theory
  // employ a different white-space rule
  replaceUselessElements(root);
  // remove empty nodes
  removeEmptyNodes(root);
  // filter out content that's probably garbage
  if (filter === 'automatic' || filter === 'manual') {
    if (root.content instanceof Array && !inlineOnly) {
      const objects = root.content.filter(i => i instanceof Object);
      // figure out the dominant color and position of the content
      // most of the text we want should have the same color and similar
      // left and right boundaries
      const objectCounts = new Map;
      const leftCounts = new Map;
      const rightCounts = new Map;
      const colorCounts = new Map;
      for (const object of objects) {
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
      // remove paragraphs that are way off
      alter(root.content, (object) => {
        if (object instanceof Object) {
          const rect = objectRects.get(object);
          const style = objectStyles.get(object);
          const charCount = objectCounts.get(object);
          const color = style.color;
          // calculate the "junk" scores
          const scoreColor = calculateColorScore(color, maxColor);
          const scorePos = calculatePositionScore(rect, maxRect);
          let junkFactor = 0;
          if (scoreColor / charCount > 5 || scorePos / charCount > 10) {
            // probably junk
            junkFactor = 1;
          } else if (scoreColor > 50 || scorePos > 100) {
            // might be junk
            junkFactor = 0.5;
          }
          if (junkFactor > 0) {
            if (junkFactor === 1 && filter === 'automatic') {
              // throw it out now
              return;
            }
            // mark it as junk and wait for the user to decide what to do
            object.junk = junkFactor;
          }
          //object.score = { color: scoreColor / charCount, position: scorePos / charCount};
        }
        return object;
      });
    }
  }
  // change the root tag to P if all we have are inline elements
  if (inlineOnly) {
    root.tag = 'P';
  }
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

function getCharacterCount(content) {
  if (typeof(content) === 'string') {
    return content.length;
  } else if (content instanceof Array) {
    let length = 0;
    for (const item of content) {
      length += getCharacterCount(item);
    }
    return length;
  } else if (content instanceof Object) {
    return getCharacterCount(content.content);
  } else {
    return 0;
  }
}

function calculatePositionScore(rect1, rect2) {
  const leftDiff = rect1.left - rect2.left;
  const rightDiff = rect2.right - rect1.right;
  return Math.abs(leftDiff + rightDiff);
}

function calculateColorScore(color1, color2, charCount) {
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
}

const AT_BEGINNING = 0x0001;
const AT_END = 0x0002;

function applyWhitespaceRule(s, ws, pos) {
  if (ws === 'normal' || ws === 'nowrap') {
    s = s.replace(/\r?\n/g, ' ');
  } else {
    s = s.replace(/\r\n/g, '\n');
  }
  if (ws === 'normal' || ws === 'nowrap' || ws === 'pre-line') {
    s = s.replace(/\s+/g, ' ');
  }
  if (ws === 'normal'  || ws === 'nowrap' || ws === 'pre-line') {
    if (pos & AT_BEGINNING) {
      s = s.trimLeft();
    }
    if (pos & AT_END) {
      s = s.trimRight();
    }
  }
  return s;
}

function collapseWhitespaces(object, styleMap, pos = AT_BEGINNING | AT_END) {
  const style = styleMap.get(object);
  const ws = style.whiteSpace;
  const inline = style.display.includes('inline');
  if (!inline) {
    pos = AT_BEGINNING | AT_END;
  }
  if (typeof(object.content) === 'string') {
    object.content = applyWhitespaceRule(object.content, ws, pos);
  } else if (object.content instanceof Array) {
    let mask = AT_BEGINNING;
    alter(object.content, (item, i, arr) => {
      if (i === arr.length - 1) {
        // we've reached the end
        mask |= AT_END;
      }
      let result, newLine = false;
      if (typeof(item) === 'string') {
        result = applyWhitespaceRule(item, ws, pos & mask);
      } else if (item instanceof Object) {
        newLine = collapseWhitespaces(item, styleMap, pos & mask);
        result = item;
      }
      if (newLine) {
        // restart the line after a block element or <BR>
        mask |= AT_BEGINNING;
      } else {
        mask &= ~AT_BEGINNING;
      }
      return result;
    });
  }
  return !inline || object.tag === 'BR';
}

export function replaceUselessElements(object) {
  if (object.content instanceof Array) {
    alter(object.content, (item) => {
      if (item instanceof Object) {
        if (item.tag === 'SPAN' && !item.style) {
          return item.content;
        }
        if (item.tag === 'BR') {
          return '\n';
        }
        replaceUselessElements(item);
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

export function removeEmptyNodes(object) {
  if (object.content instanceof Array) {
    alter(object.content, (item, i, arr) => {
      if (typeof(item) === 'string') {
        if (item.length === 0) {
          // remove empty string
          return;
        } else if (typeof(arr[i - 1]) === 'string') {
          // merge to previous string
          arr[i - 1] += item;
          return;
        }
      } else if (item instanceof Object) {
        removeEmptyNodes(item);
        if (!item.content || item.content.length === 0) {
          // it's empty--remove it if it's not one of the special ones like <hr>
          if (!canBeEmpty(item.tag)) {
            return;
          }
        }
      }
      return item;
    });
    // don't need an array when there's just one item
    if (object.content.length === 1) {
      object.content = object.content[0];
    }
  }
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
