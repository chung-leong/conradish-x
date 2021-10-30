export function captureSelection(selection, lang) {
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const content = extractContent(fragment);
  const title = document.title;
  const doc = { title, lang, content };
  chrome.runtime.sendMessage(undefined, { type: 'create', document: doc });
}

export function extractContent(node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName;
    if (!isCapturing(tag)) {
      return;
    }
    const content = extractContents(node.childNodes);
    if (tag === 'A' || tag === 'SPAN' || tag === 'FONT') {
      // omit hyperlinks and anchors
      return content;
    } else if (!content) {
      // only accept BR and HR when there's no content
      if (tag === 'BR' || tag === 'HR') {
        return { tag };
      }
    } else if (tag === 'DIV' || tag === 'MAIN') {
      if (isInline(content)) {
        // put inline content in a P tag
        return { tag: 'P', content };
      } else if (content instanceof Array) {
        // wrap each item as necessary
        const list = [];
        for (const item of content) {
          if (isInline(item)) {
            // put inline content in a P tag
            list.push({ tag: 'P', content: item });
          } else if (isBlock(item)) {
            // if it's an acceptable block element, put it in the list
            list.push(item);
          }
        }
        if (list.length > 1) {
          return list;
        } else if (list.length === 1) {
          return list[0];
        }
      } else if (isBlock(content)) {
        return content;
      }
    } else if (tag === 'TEXTAREA') {
      return { tag: 'P', content };
    } else if (tag === 'TABLE' && !hasText(content)) {
      // omit empty table
      return;
    } else {
      return { tag, content };
    }
  } else if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue;
  } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return extractContents(node.children);
  }
}

export function extractContents(nodes) {
  const list = [];
  for (const node of nodes) {
    const content = extractContent(node);
    if (content) {
      if (content instanceof Array) {
        for (const item of content) {
          list.push(item);
        }
      } else {
        list.push(content);
      }
    }
  }
  if (list.length > 1) {
    return list;
  } else if (list.length === 1) {
    return list[0];
  }
}

function isInline(content) {
  if (content instanceof Array) {
    for (const item of content) {
      if (!isInline(item)) {
        return false;
      }
    }
    return true;
  } else if (content instanceof Object) {
    return inlineTags.includes(content.tag);
  } else if (typeof(content) === 'string') {
    return true;
  }
  return false;
}

function isCapturing(tag) {
  return blockTags.includes(tag) || inlineTags.includes(tag);
}

function isBlock(content) {
  if (content instanceof Array) {
    for (const item of content) {
      if (isBlock(item)) {
        return true;
      }
    }
  } else if (content instanceof Object) {
    return blockTags.includes(content.tag);
  }
  return false;
}

function hasText(content) {
  if (content instanceof Array) {
    for (const item of content) {
      if (hasText(item)) {
        return true;
      }
    }
    return false;
  } else if (content instanceof Object) {
    return hasText(content.content);
  } else if (typeof(content) === 'string') {
    return true;
  }
  return false;
}

const inlineTags = [
  'A',
  'ABBR',
  'ACRONYM',
  'B',
  'BDI',
  'BDO',
  'BIG',
  'BR',
  'CITE',
  'CODE',
  'DEL',
  'EM',
  'I',
  'INS',
  'KDB',
  'LABEL',
  'Q',
  'RUBY',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
  'TT',
  'VAR',
  'WBR',
];

const blockTags = [
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DETAILS',
  'DD',
  'DL',
  'DT',
  'DIV',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL'
];
