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
      if (cb(node, s, e, false) === false) {
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
      if (inside) {
        if (cb(node, s, e, true) === false) {
          finished = true;
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

export async function captureSelection(selection) {
  const range = selection.getRangeAt(0);
  const url = document.location.href;
  const title = getTitle();
  const image = getImage();
  const content = captureRangeContent(range);
  const lang = await getLanguage(content, range);
  const doc = { url, title, image, lang, content, raw: true };
  return doc;
}

export function captureRangeContent(range) {
  const nodeStyles = new WeakMap;
  const getNodeStyle = (node) => {
    let style = nodeStyles.get(node);
    if (style === undefined) {
      style = getComputedStyle(node);
      nodeStyles.set(node, style);
    }
    return style;
  };
  // figure out where the root node ought to be
  let rootNode;
  for (let n = range.commonAncestorContainer; n; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const { display } = getNodeStyle(n);
      rootNode = n;
      if (display !== 'inline') {
        break;
      }
    }
  }
  // go up one more level if it contains inline content
  for (let child of rootNode.childNodes) {
    let inline = false;
    if (range.intersectsNode(child)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue.trim()) {
          inline = true;
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const { display } = getNodeStyle(child);
        if (display === 'inline') {
          inline = true;
        }
      }
    }
    if (inline) {
      rootNode = rootNode.parentNode;
      break;
    }
  }
  // get "@media print" selectors from the page's CSS style sheet
  // specifying elements that ought to be hidden when printing
  const hiddenSelectors = getHiddenSelectors();
  const nodeHiddenStates = new WeakMap;
  for (const selector of hiddenSelectors) {
    // mark all the matching nodes (including their descendents) as hidden
    for (const node of rootNode.querySelectorAll(selector)) {
      nodeHiddenStates.set(node, true);
      for (const child of node.getElementsByTagName('*')) {
        nodeHiddenStates.set(child, true);
      }
    }
  }
  const root = { tag: 'DIV', content: undefined };
  const nodeObjects = new WeakMap([ [ rootNode, root ] ]);
  const objectDossiers = new WeakMap([ [ root, { node: rootNode, style: getNodeStyle(rootNode) } ] ]);
  const docClientRect = document.documentElement.getBoundingClientRect();
  const getRect = (node) => {
    const clientRect = node.getBoundingClientRect();
    const top = clientRect.top - docClientRect.top;
    const left = clientRect.left - docClientRect.left;
    const bottom = clientRect.bottom - docClientRect.top;
    const right = clientRect.right - docClientRect.left;
    const width = right - left;
    const height = bottom - top;
    return { top, left, bottom, right, width, height };
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
  const extractStyle = (style, object, parentObject) => {
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
      return newStyle;
    }
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
  const disallowedTags = [ 'BUTTON', 'TEXTAREA', 'INPUT', 'SELECT', 'FIGURE', 'FIGCAPTION', 'NOSCRIPT' ];
  const isDisallowed = (node) => {
    return disallowedTags.includes(node.tagName);
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
  const isInputLabel = (node) => {
    if (node.tagName === 'LABEL') {
      const { htmlFor } = node;
      if (htmlFor) {
        return true;
      }
      const inputs = node.querySelectorAll('INPUT,SELECT,TEXTAREA');
      if (inputs.length > 0) {
        return true;
      }
    }
    return false;
  };
  const isStylingLink = (node) => {
    if (node.tagName === 'A') {
      return true;
    }
    let linkNode = node.getElementsByTagName('A')[0];
    if (!linkNode) {
      // see if a parent node is a link
      for (let n = node; n && n !== rootNode; n = n.parentNode) {
        if (n.tagName === 'A' && n.href) {
          linkNode = n;
          break;
        }
      }
    }
    if (linkNode && linkNode.innerText === node.innerText) {
      return true;
    }
    return false;
  };
  const isConsecutativeBreaks = (node) => {
    if (node.tagName === 'BR') {
      const getPreviousNode = (node) => {
        const { previousSibling, parentNode } = node;
        for (let n = previousSibling; n; n = n.previousSibling) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            return n;
          } else if (n.nodeType === Node.TEXT_NODE) {
            if (n.nodeValue.trim()) {
              break;
            }
          }
        }
        return;
      };
      const getNextNode = (node) => {
        const { nextSibling, parentNode } = node;
        for (let n = nextSibling; n; n = n.nextSibling) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            return n;
          } else if (n.nodeType === Node.TEXT_NODE) {
            if (n.nodeValue.trim()) {
              break;
            }
          }
        }
        return;
      };
      const hasSpacing = (node) => {
        if (node && !isHidden(node)) {
          if (node.tagName === 'BR') {
            return true;
          }
          const { display } = getNodeStyle(node);
          if (!display.includes('inline')) {
            return true;
          }
        }
        return false;
      };
      const previousNode = getPreviousNode(node);
      const nextNode = getNextNode(node);
      if (hasSpacing(previousNode) || hasSpacing(nextNode)) {
        return true;
      }
    }
    return false;
  };
  const isRealTable = (node) => {
    const modes = [ 'table-row-group', 'table-header-group', 'table-footer-group' ];
    for (const child of node.children) {
      const { display } = getNodeStyle(child);
      if (modes.includes(display)) {
        return true;
      }
    }
    return false;
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
  const getBlockObject = (object) => {
    if (object.tag !== 'SPAN' && object.tag !== 'BR') {
      return object;
    } else {
      const { parent } = objectDossiers.get(object);
      return getBlockObject(parent);
    }
  };
  const getTopLevelObject = (object) => {
    const { parent } = objectDossiers.get(object);
    if (parent === root) {
      return object;
    } else {
      return getTopLevelObject(parent);
    }
  };
  const closeObject = (object) => {
    // remove the mapping to the source node
    const { node, parent } = objectDossiers.get(object);
    if (node !== rootNode) {
      nodeObjects.delete(node);
    }
    if (object.tag === 'SPAN') {
      // deal with oddball situations where we have block elements inside an inline parent
      closeObject(parent);
    }
  };
  const getContainerObject = (node) => {
    for (let n = node; n; n = n.parentNode) {
      const object = nodeObjects.get(n);
      if (object === root) {
        // if we're going to put stuff into the root instead of this node, we need to make
        // sure that things no longer get placed into the node's object if there's one created earlier
        const parentObject = nodeObjects.get(node);
        if (parentObject) {
          closeObject(parentObject);
        }
        return root;
      } else if (object) {
        if (object.tag === 'TD' || object.tag === 'LI') {
          return object;
        }
      } else {
        // create it if it's going to be a TD or LI
        const tag = getNewTagName(n);
        if (tag === 'TD' || tag === 'LI') {
          // make sure it really did turn out to be one
          const object = getObject(n);
          if (object && (object.tag === 'TD' || object.tag === 'LI')) {
            return object;
          }
        }
      }
      // make sure the node isn't hidden
      if (isHidden(n) || isDisallowed(n)) {
        return;
      }
      if (!canBeEmpty(n.tagName)) {
        const rect = getRect(n);
        if (rect.width === 0 || rect.height === 0) {
          return;
        }
      }
    }
  };
  const topLevelTags = [ 'P', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'TABLE' ];
  const tableComponentsTags = [ 'THEAD', 'TBODY', 'TFOOTER' ];
  const recognizedTags = [ ...topLevelTags, 'LI', 'TABLE', ...tableComponentsTags, 'TR', 'TD', 'TH' ];
  const getNewTagName = (node) => {
    if (node === rootNode) {
      return '';
    }
    const { tagName, parentNode } = node;
    if (recognizedTags.includes(tagName)) {
      return tagName;
    }
    // derive tag name from style
    const { display, fontSize, fontWeight } = getNodeStyle(node);
    if (display === 'inline') {
      if (tagName === 'BR') {
        return 'BR';
      } else {
        return 'SPAN';
      }
    } else {
      if (display === 'list-item') {
        return 'LI';
      } else if (display === 'table' && isRealTable(node)) {
        // make sure display: table isn't being used for layout reason
        return 'TABLE';
      } if (display === 'table-row-group' && getNewTagName(parentNode) === 'TABLE') {
        return 'TBODY';
      } else if (display === 'table-header-group' && getNewTagName(parentNode) === 'TABLE') {
        return 'THEAD';
      } else if (display === 'table-footer-group' && getNewTagName(parentNode) === 'TABLE') {
        return 'TFOOT';
      } else if (display === 'table-row' && tableComponentsTags.includes(getNewTagName(parentNode) )) {
        return 'TR';
      } else if (display === 'table-cell' && getNewTagName(parentNode)  === 'TR') {
        return (fontWeight > 400) ? 'TH' : 'TD';
      } else if (display === 'table-caption') {
        return 'CAPTION';
      } else if (fontWeight > 500 && parseInt(fontSize) >= 32) {
        return 'H1';
      } else if (fontWeight > 500 && parseInt(fontSize) >= 24) {
        return 'H2';
      } else if (fontWeight > 500 && parseInt(fontSize) >= 18) {
        return 'H3';
      } else {
        return 'P';
      }
    }
  };
  const createObject = (node) => {
    if (isHidden(node)) {
      return;
    }
    const rect = getRect(node);
    if (rect.width === 0 || rect.height === 0) {
      if (!canBeEmpty(node.tagName)) {
        return;
      }
    }
    // remove <button>, <figcaption>, and such
    if (isDisallowed(node)) {
      return;
    }
    // remove sup tags that are links
    if (isSuperscriptLink(node)) {
      return;
    }
    // remove input labels
    if (isInputLabel(node)) {
      return;
    }
    const { parentNode } = node;
    const style = getNodeStyle(node);
    let tag = getNewTagName(node);
    let parentObject;
    if (tag === 'SPAN') {
      parentObject = getObject(parentNode);
    } else if (tag === 'BR') {
      parentObject = getObject(parentNode);
      if (parentObject && isConsecutativeBreaks(node)) {
        // when there're two <br>'s in a row, start a new paragraph instead
        const blockObject = getBlockObject(parentObject);
        if (blockObject.tag === 'P') {
          closeObject(blockObject);
          parentObject = null;
        }
      }
    } else if (tag === 'LI') {
      parentObject = getObject(parentNode);
      if (parentObject && parentObject.tag === 'SPAN') {
        // insert at root level
        parentObject = getContainerObject(parentNode);
        tag = 'P';
      } else if (parentObject === root) {
        tag = 'P';
      } else if (parentObject && parentObject.tag !== 'OL' && parentObject.tag !== 'UL') {
        // make sure parent is a list
        parentObject.tag = (style.listStyleType === 'decimal') ? 'OL' : 'UL';
      }
    } else if (tag === 'TD') {
      parentObject = getObject(parentNode);
      if (parentObject === root) {
        tag = 'P';
      }
    } else if (topLevelTags.includes(tag)) {
      // insert either at the root level or into a <LI> or <TD>
      parentObject = getContainerObject(parentNode);
      if (tag === 'P' && parentObject && parentObject !== root) {
        // <P> can't go into a <LI> or a <TD>--make it a <DIV> (which will get changed to a SPAN later)
        tag = 'DIV';
      }
    } else {
      parentObject = getObject(parentNode);
    }
    if (!tag || !parentObject) {
      return;
    }
    const object = { tag, content: undefined };
    // don't copy styling info meant for hyperlinks
    if (!isStylingLink(node)) {
      const newStyle = extractStyle(style, object, parentObject);
      if (newStyle) {
        object.style = newStyle;
      }
    }
    insertContent(parentObject, object);
    const dossier = { node, style, rect, parent: parentObject, links: [] };
    objectDossiers.set(object, dossier);
    if (node.tagName === 'A') {
      // associate the top-level parent with the link
      const topLevelObject = getTopLevelObject(object);
      const { links } = objectDossiers.get(topLevelObject);
      links.push(object);
    }
    return object;
  };
  const privateCharacters = /\p{Private_Use}/ug;
  const addText = (node, startOffset, endOffset) => {
    const parentObject = getObject(node.parentNode);
    if (parentObject) {
      const text = node.nodeValue.substring(startOffset, endOffset).replace(privateCharacters, '');
      insertContent(parentObject, text);
    }
  };
  const parseCSSContent = (content) => {
    if (content.charAt(0) === '"') {
      const s = content.substr(1, content.length - 2);
      return s.replace(/\\(["\\])/g, '$1').replace(privateCharacters, '');
    }
  };
  const addPseudoElement = (node, id)  => {
    if (!isHidden(node, id)) {
      const style = getComputedStyle(node, id);
      const { display, position, content } = style;
      if (content !== 'none' && display !== 'none' && position === 'static') {
        const text = parseCSSContent(content);
        if (text) {
          const parentObject = getObject(node);
          // don't add ::before pseudo elements to li items
          if (!parentObject || (parentObject.tag === 'LI' && id === '::before')) {
            return;
          }
          const object = { tag: 'SPAN', content: text };
          objectDossiers.set(object, { style });
          insertContent(parentObject, object);
        }
      }
    }
  };
  // scan through the range and add the text encountered
  transverseRange(range, (node, startOffset, endOffset, endTag) => {
    const { nodeType } = node;
    if (nodeType === Node.TEXT_NODE) {
      addText(node, startOffset, endOffset);
    } else if (nodeType === Node.ELEMENT_NODE) {
      if (!endTag) {
        addPseudoElement(node, '::before');
        if (canBeEmpty(node.tagName)) {
          // create these tags even when they don't contain any text
          getObject(node);
        }
      } else {
        addPseudoElement(node, '::after');
      }
    }
  });
  // apply white-space rules
  collapseWhitespaces(root, objectDossiers);
  // add spaces when spans are separated by margin
  addSpacers(root, objectDossiers);
  // replace DIVs with SPANs
  replaceDivsWithSpans(root);
  // replace spans that don't have any styling information with just its
  // content; couldn't do it earlier since the inline element could in theory
  // employ a different white-space rule
  replaceUselessElements(root);
  // remove empty nodes
  removeEmptyNodes(root);
  // remove top-level elements that contain only whitespaces
  // (not part of removeEmptyNodes() since that's used when we save editted article);
  removeBlankParagraphs(root);
  // add junk rating based on presence of links, positions, and colors
  rateContent(root, objectDossiers);
  // H1 is generally too large for printing--shrink them down
  shrinkHeadings(root);
  return root.content;
}

export function insertContent(object, content, atBeginning = false) {
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
    const arr = object.content;
    if (!atBeginning) {
      const last = arr[arr.length - 1];
      // merge with last item if possible
      if (typeof(last) === 'string' && typeof(content) === 'string') {
        arr[arr.length - 1] = last + content;
      } else {
        arr.push(content);
      }
    } else {
      const first = arr[0];
      // merge with last item if possible
      if (typeof(first) === 'string' && typeof(content) === 'string') {
        arr[0] = content + first;
      } else {
        arr.unshift(content);
      }
    }
  } else if (typeof(object.content) === 'string' && typeof(content) === 'string') {
    if (!atBeginning) {
      object.content += content;
    } else {
      object.content = content + object.content;
    }
  } else {
    if (!atBeginning) {
      object.content = [ object.content, content ];
    } else {
      object.content = [ content, object.content ];
    }
  }
}

function rateContent(root, objectDossiers) {
  if (!(root.content instanceof Array)) {
    return;
  }
  const applyRating = (object, junkFactor) => {
    if (junkFactor) {
      object.junk = Math.min(1, (object.junk || 0) + junkFactor);
    }
  };
  const calculateLinkScore = (object) => {
    const { links } = objectDossiers.get(object);
    if (links) {
      const objectText = getPlainText(object).trim();
      const linkText = getPlainText(links).trim();
      if (objectText === linkText) {
        return 1;
      } else if (linkText.length / objectText.length >= 0.6) {
        return 0.5;
      }
    }
    return 0;
  };
  for (const object of root.content) {
    if (object instanceof Object) {
      const junkFactor = calculateLinkScore(object);
      applyRating(object, junkFactor);
    }
  }

  // determine the dominant DOM path of source nodes of top-level objects
  const rootNode = objectDossiers.get(root).node;
  const nodePaths = new Map([ [ rootNode, { name: '#ROOT', parent: null } ] ]);
  const getNodePath = (node) => {
    let path = nodePaths.get(node);
    if (!path) {
      const { tagName, className, parentNode } = node;
      const name = (className) ? `${tagName}.${className}` : tagName;
      const parent = getNodePath(parentNode);
      // see if there's an existing path object
      for (const [ prevNode, existingPath ] of nodePaths) {
        if (existingPath.parent === parent && existingPath.name === name) {
          path = existingPath;
          break;
        }
      }
      if (!path) {
        path = { name, parent };
      }
      nodePaths.set(node, path);
    }
    return path;
  };
  const parentPathCounts = new Map
  const objectCharCounts = new WeakMap;
  for (const object of root.content) {
    if (object instanceof Object) {
      const { node } = objectDossiers.get(object);
      const parentPath = getNodePath(node.parentNode);
      const charCount = getCharacterCount(object);
      objectCharCounts.set(object, charCount);
      parentPathCounts.set(parentPath, charCount + (parentPathCounts.get(parentPath) || 0)) ;
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
  const maxParentPath = getMaxKey(parentPathCounts);
  for (const object of root.content) {
    if (object instanceof Object) {
      if (object.tag === 'H1' || object.tag === 'H2') {
        // the main heading (i.e. article title) can often be outside of the flow of the article text
        continue;
      }
      const { node } = objectDossiers.get(object);
      const parentPath = getNodePath(node.parentNode);
      if (parentPath !== maxParentPath) {
        // parent is different--it's dodgy
        applyRating(object, 0.5);
      }
    }
  }

  // figure out the dominant color and position of the content
  // most of the text we want should have the same color and similar
  // left and right boundaries
  const leftCounts = new Map;
  const rightCounts = new Map;
  const colorCounts = new Map;
  for (const object of root.content) {
    if (object instanceof Object) {
      const { rect, style } = objectDossiers.get(object);
      const { color } = style;
      const { left, right } = rect;
      const charCount = objectCharCounts.get(object);
      colorCounts.set(color, charCount + (colorCounts.get(color) || 0)) ;
      leftCounts.set(left, charCount + (leftCounts.get(left) || 0)) ;
      rightCounts.set(right, charCount + (rightCounts.get(right) || 0)) ;
    }
  }
  const maxColor = getMaxKey(colorCounts);
  const maxLeft = getMaxKey(leftCounts);
  const maxRight = getMaxKey(rightCounts);
  const maxRect = { left: maxLeft, right: maxRight };
  const calculatePositionScore = (rect1, rect2, direction, display) => {
    const leftDiff = Math.abs(rect1.left - rect2.left);
    const rightDiff = Math.abs(rect1.right - rect2.right);
    const startDiff = (direction === 'rtl') ? rightDiff : leftDiff;
    const endDiff = (direction === 'rtl') ? leftDiff : rightDiff;
    // take end difference into consideration unless display mode is inline
    return display.includes('inline') ? startDiff : startDiff + (endDiff / 5);
  };
  const parseRGB = (color) => {
    const m = color.replace(/[rgba\(\)\s]/g, '').split(',');
    const r = m[0] ? parseInt(m[0]) : 255;
    const g = m[1] ? parseInt(m[1]) : 255;
    const b = m[2] ? parseInt(m[2]) : 255;
    const a = m[3] ? parseFloat(m[3]) : 1;
    return [ r, g, b, a ];
  };
  const calculateColorScore = (color1, color2, charCount) => {
    const [ r1, g1, b1, a1 ] = parseRGB(color1);
    const [ r2, g2, b2, a2 ] = parseRGB(color2);
    const diffR = Math.abs(r1 - r2);
    const diffG = Math.abs(g1 - g2);
    const diffB = Math.abs(b1 - b2);
    const diffA = Math.abs(a1 - a2) * 255;
    return diffR + diffG + diffB + diffA;
  };
  const calculateNormalizer = (object) => {
    const charCount = objectCharCounts.get(object);
    switch(object.tag) {
      case 'TABLE':
        return charCount * 0.5;
      case 'H1':
        return charCount * 4;
      case 'H2':
        return charCount * 2;
      case 'H3':
        return charCount * 1.5;
      default:
        return charCount;
    }
  };
  for (const object of root.content) {
    if (object instanceof Object) {
      const { style, rect } = objectDossiers.get(object);
      const { color, display, direction } = style;
      // calculate the "junk" scores
      const scoreColor = calculateColorScore(color, maxColor);
      const scorePos = calculatePositionScore(rect, maxRect, direction, display);
      const normalizer = calculateNormalizer(object);
      // normalize the score against a factor that sort of represents the amount of content
      const scoreColorNorm = scoreColor / normalizer;
      const scorePosNorm = scorePos / normalizer;
      // greater tolerance for heading
      const limitPos = 10, limitColor = 20;
      let junkFactor = 0;
      if (scoreColorNorm > limitColor || scorePosNorm > limitPos) {
        // probably junk
        junkFactor = 1;
      } else if (scoreColorNorm > limitColor * 0.25 || scorePosNorm > limitPos * 0.25) {
        // might be junk
        junkFactor = 0.5;
      }
      //object.score = { normalizer, color: scoreColor, position: scorePos };
      applyRating(object, junkFactor);
    }
  }
}

function getCharacterCount(item) {
  if (typeof(item) === 'string') {
    return item.length;
  } else if (item instanceof Array) {
    return item.reduce((t, i) => t + getCharacterCount(i), 0);
  } else if (item instanceof Object) {
    return getCharacterCount(item.content);
  } else {
    return 0;
  }
}

function getPlainText(item) {
  if (typeof(item) === 'string') {
    return item;
  } else if (item instanceof Array) {
    return item.map(getPlainText).join('');
  } else if (item instanceof Object) {
    return getPlainText(item.content);
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

function collapseWhitespaces(root, objectDossiers) {
  const trim = (text, whiteSpace, trimLeft, trimRight) => {
    if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
      text = text.replace(/\r?\n/g, ' ');
    } else {
      text = text.replace(/\r\n/g, '\n');
    }
    if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
      text = text.replace(/\s+/g, ' ');
      if (trimLeft) {
        text = text.trimLeft();
      }
      if (trimRight) {
        text = text.trimRight();
      }
    } else if (whiteSpace === 'pre-line') {
      text = text.replace(/\s+/g, (m0) => m0.replace(/[^\n]/g, '') || ' ');
      if (trimLeft) {
        text = text.replace(/^ +/g, '');
      }
      if (trimRight) {
        text = text.replace(/ +$/g, '');
      }
    }
    return text;
  };
  const collapse = (object, trimLeft, trimRight) => {
    const { style } = objectDossiers.get(object);
    const { whiteSpace } = style;
    const inline = (object.tag === 'SPAN');
    let trimItemLeft = (inline) ? trimLeft : true;
    let trimItemRight = false;
    const children = (object.content instanceof Array) ? object.content : [ object.content ];
    alter(children, (item, i, arr) => {
      if (i === arr.length - 1) {
        // if the element is inline, then it's only at an end when
        // the element itself is at an end
        trimItemRight = (inline) ? trimRight : true;
      }
      let result;
      if (typeof(item) === 'string') {
        result = trim(item, whiteSpace, trimItemLeft, trimItemRight);
        // see if it ends in whitespaces
        trimItemLeft = (result) ? result !== result.trimRight() : trimItemLeft;
      } else if (item instanceof Object) {
        result = item;
        trimItemLeft = collapse(item, trimItemLeft, trimItemRight);
      }
      return result;
    });
    if (object.content !== children) {
      object.content = children[0];
    }
    return (inline) ? trimItemLeft : true;
  };
  collapse(root);
}

function addSpacers(root, objectDossiers) {
  const getSeparation = (object) => {
    let text = '', marginStart = -Infinity, marginEnd = -Infinity;
    if (object instanceof Object) {
      if (object.tag === 'SPAN') {
        const { style } = objectDossiers.get(object);
        const height = parseInt(style.fontSize);
        const left = parseInt(style.marginLeft) + parseInt(style.paddingLeft);
        const right = parseInt(style.marginRight) + parseInt(style.paddingRight);
        text = getPlainText(object);
        marginStart = left / height;
        marginEnd = right / height;
      }
    } else if (typeof(object) === 'string') {
      text = object;
      marginStart = 0;
      marginEnd = 0;
    }
    const whiteStartStart = !!text && /^\s/.test(text);
    const whiteSpaceEnd = !!text && /\s$/.test(text);
    return { marginStart, marginEnd, whiteStartStart, whiteSpaceEnd };
    return { marginStart, marginEnd, whiteStartStart, whiteSpaceEnd };
  };
  const getPreviousObject = (object) => {
    let prevObject;
    const { parent } = objectDossiers.get(object);
    if (parent) {
      if (parent.content instanceof Array) {
        const index = parent.content.indexOf(object);
        prevObject = parent.content[index - 1];
      }
      if (!prevObject) {
        prevObject = getPreviousObject(parent);
      }
    }
    return prevObject;
  };
  const getNextObject = (object) => {
    let nextObject;
    const { parent } = objectDossiers.get(object);
    if (parent) {
      if (parent.content instanceof Array) {
        const index = parent.content.indexOf(object);
        nextObject = parent.content[index + 1];
      }
      if (!nextObject) {
        nextObject = getNextObject(parent);
      }
    }
    return nextObject;
  };
  const scan = (item) => {
    if (item instanceof Array) {
      const arr = item;
      for (const object of arr) {
        scan(object);
        if (object.tag === 'SPAN') {
          const sep = getSeparation(object);
          if (sep.marginStart && !sep.whiteSpaceStart) {
            // has margin before but no whitespace, see if the previous item has spacing
            const prevObject = getPreviousObject(object);
            const sepBefore = getSeparation(prevObject);
            if (!sepBefore.whiteSpaceEnd && (sep.marginStart + sepBefore.marginEnd >= 0.25)) {
              // add a space at the beginning if this margin is bigger than the other,
              // otherwise add it to the other one
              if (sep.marginStart > sepBefore.marginEnd) {
                insertContent(object, ' ', true);
              }
            }
          }
          if (sep.marginEnd && !sep.whiteSpaceEnd) {
            // has margin after but no whitespace, see if the next item has spacing
            const nextObject = getNextObject(object);
            const sepAfter = getSeparation(nextObject);
            if (!sepAfter.whiteSpaceStart && (sep.marginEnd + sepAfter.marginStart >= 0.25)) {
              // add a space at the end
              if (sep.marginEnd >= sepAfter.marginStart) {
                insertContent(object, ' ');
              }
            }
          }
        }
      }
    } else if (item instanceof Object) {
      scan(item.content);
    }
  };
  scan(root);
}

function replaceDivsWithSpans(object) {
  if (object.content instanceof Array) {
    for (const [ index, item ] of object.content.entries()) {
      replaceDivsWithSpans(item);
      if (item.tag === 'DIV') {
        item.tag = 'SPAN';
        const after = object.content.slice(index + 1);
        if (getCharacterCount(after) > 0) {
          insertContent(item, '\n');
        }
      }
    }
  }
}

export function replaceUselessElements(object) {
  if (object.content instanceof Array) {
    alterObjects(object.content, (item, index, arr) => {
      replaceUselessElements(item);
      const { tag, style, content } = item;
      if (tag === 'SPAN' && !style) {
        return content;
      }
      if (tag === 'BR') {
        return '\n';
      }
      if (tag === 'TABLE') {
        const text = getPlainText(content);
        if (!text.trim()) {
          return;
        }
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

function removeBlankParagraphs(root) {
  // toss out paragraphs that are just blank
  if (root.content instanceof Array) {
    alter(root.content, (item) => {
      const plainText = getPlainText(item.content);
      return !plainText.trim() ? undefined : item;
    });
  }
}

function shrinkHeadings(root) {
  if (!(root.content instanceof Array)) {
    return;
  }

  const h1 = root.content.find(o => o.tag === 'H1');
  if (h1) {
    for (const object of root.content) {
      const m = /^H([12345])$/.exec(object.tag);
      if (m) {
        object.tag = `H${parseInt(m[1]) + 1}`;
      }
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

async function getLanguage(content, range) {
  const text = getPlainText(content);
  let lang = await detectLanguage(text);
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
