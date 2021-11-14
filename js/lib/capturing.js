export function tranverseRange(range, cb) {
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

export function captureSelection(selection, lang) {
  const range = selection.getRangeAt(0);
  const object = captureRangeContent(range);
  // where multiple paragraphs are present, captureRangeContent() will
  // return a <div>; otherwise we'd get a <p>
  const content = (object.tag === 'DIV') ? object.content : object;
  const title = document.title;
  const doc = { title, lang, content };
  chrome.runtime.sendMessage(undefined, { type: 'create', document: doc });
}

export function captureRangeContent(range) {
  let { commonAncestorContainer: rootNode } = range;
  if (rootNode.nodeType === Node.TEXT_NODE) {
    rootNode = rootNode.parentNode;
  }
  const root = { tag: 'DIV', content: null };
  const nodeObjects = new Map([ [ rootNode, root ] ]);
  const nodeStyles = new Map;
  const objectParents = new Map;
  const insertContent = (object, content) => {
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
  };
  const getNodeStyle = (node) => {
    let style = nodeStyles.get(node);
    if (style === undefined) {
      style = getComputedStyle(node);
      nodeStyles.set(node, style);
    }
    return style;
  };
  const paragraphStyle = {
    fontWeight: '400',
    fontStyle: 'normal',
    textDecorationLine: 'none',
    textDecorationStyle: 'solid',
  };
  const headingStyle = Object.assign({}, paragraphStyle, {
    fontWeight: '700',
  });
  const getDefaultTextStyle = (tag) => {
    if (/^H\d$/.test(tag)) {
      return headingStyle;
    } else {
      return paragraphStyle;
    }
  };
  const createParentObject = (child) => {
    const node = child.parentNode;
    const style = getNodeStyle(node);
    const { display, visibility } = style;
    if (display === 'none' || visibility === 'hidden') {
      return;
    }
    const { tagName } = node;
    if (tagName === 'A') {
      // don't include any hyperlinks (or anchors)
      return getParentObject(node);
    }
    let object = { tag: '?', content: null };
    let parentObject;
    if (/block|flex/.test(display)) {
      // block and flex elements (including inline ones) are placed at
      // the root level as either <P> or <H#> tag
      parentObject = root;
      // TODO: use font size to determine whether it's a heading
      // TODO: see if it's a blockquote
      if (/^H\d$/.test(tagName)) {
        object.tag = tagName;
      } else {
        object.tag = 'P';
      }
    } else if (/list|table|grid|ruby/.test(display)) {
      // list, table, and grid retain the original structure
      parentObject = getParentObject(node);
      object.tag = tagName;
    } else if (display === 'inline') {
      // all inline elements become span
      parentObject = getParentObject(node);
      if (parentObject.tag === 'SPAN') {
        // don't nest spans
        parentObject = objectParents.get(parentObject);
      }
      object.tag = 'SPAN';
      const newStyle = {};
      const parentStyle = getDefaultTextStyle(parentObject.tag);
      for (const [ name, value ] of Object.entries(parentStyle)) {
        if (style[name] != value) {
          newStyle[name] = style[name];
        }
      }
      if (Object.entries(newStyle).length > 0) {
        object.style = newStyle;
      }
    }
    if (parentObject) {
      insertContent(parentObject, object);
      objectParents.set(object, parentObject);
      return object;
    }
  };
  const getParentObject = (child) => {
    // see if there's an object for this node already
    const node = child.parentNode;
    let object = nodeObjects.get(node);
    if (object !== undefined) {
      return object;
    }
    object = createParentObject(child) || null;
    nodeObjects.set(node, object);
    return object;
  };
  // walk through the range and build the object tree
  tranverseRange(range, (node, startOffset, endOffset) => {
    const { nodeType, nodeValue } = node;
    if (nodeType === Node.TEXT_NODE) {
      const parentObject = getParentObject(node);
      if (parentObject) {
        const text = nodeValue.substring(startOffset, endOffset);
        insertContent(parentObject, text);
      }
    }
  });
  // apply white-space rules
  const applyWhitespaceRule = (s, ws, inline, pos) => {
    if (typeof(s) === 'string') {
      if (ws === 'normal' || ws === 'nowrap') {
        s = s.replace(/\r?\n/g, ' ');
      }
      if (ws === 'normal' || ws === 'nowrap' || ws === 'pre-line') {
        s = s.replace(/\s+/g, ' ');
      }
      if (!inline) {
        if (ws === 'normal'  || ws === 'nowrap' || ws === 'pre-line') {
          if (pos === 'beginning' || pos === 'both') {
            s = s.trimLeft();
          }
          if (pos === 'end' || pos === 'both') {
            s = s.trimRight();
          }
        }
      }
    }
    return s;
  };
  const collapseWhitespaces = (object, style) => {
    const ws = style.whiteSpace;
    const inline = (style.display === 'inline');
    if (typeof(object.content) === 'string') {
      object.content = applyWhitespaceRule(object.content, ws, inline, 'both');
    } else if (object.content instanceof Array) {
      alter(object.content, (s, i, arr) => {
        let pos = (i);
        if (i === 0) {
          pos = (i === arr.length - 1) ? 'both' : 'beginning';
        } else if (i === arr.length - 1) {
          pos = 'end';
        } else {
          pos = 'middle';
        }
        return applyWhitespaceRule(s, ws, inline, pos);
      });
    }
  };
  for (const [ node, object ] of nodeObjects.entries()) {
    const style = getNodeStyle(node);
    collapseWhitespaces(object, style);
  }
  // replace spans that don't have any styling information with just its
  // content; couldn't do it earlier since the inline element could in theory
  // employ a different white-space rule
  //
  // check for presence of block elements at the same time
  let hasBlockElement = false;
  const replaceUselessSpan = (object) => {
    if (object.content instanceof Array) {
      alter(object.content, (item) => {
        if (item instanceof Object) {
          if (item.tag === 'SPAN' && !item.style) {
            return item.content;
          } else {
            if (item.tag !== 'SPAN') {
              hasBlockElement = true;
            }
            replaceUselessSpan(item);
            return item;
          }
        }
      });
    }
  };
  replaceUselessSpan(root);
  // remove empty nodes
  const removeEmptyNodes = (object) => {
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
          } else if (!item.trim()) {
            // remove whitespace between block elements
            const prev = arr[i - 1];
            const next = arr[i + 1];
            if (prev && next) {
              if (prev.tag !== 'SPAN' && next.tag !== 'SPAN') {
                return;
              }
            }
          }
        } else if (item instanceof Object) {
          removeEmptyNodes(item);
          if (item.content.length === 0) {
            // it's empty--remove it
            return;
          }
        }
        return item;
      });
      // don't need an array when there's just one item
      if (object.content.length === 1) {
        object.content = object.content[0];
      }
    }
  };
  removeEmptyNodes(root);
  // change the root tag to P if all we have are inline elements
  if (!hasBlockElement) {
    root.tag = 'P';
  }
  return root;
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
