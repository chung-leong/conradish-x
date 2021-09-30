export async function queryDefinition(term) {
  try {
    return `[DEFINITION of "${term}"]`;
    const url = new URL('https://clients5.google.com/translate_a/t');
    url.searchParams.set('client', 'dict-chrome-ex');
    url.searchParams.set('q', term);
    url.searchParams.set('sl', 'en');
    url.searchParams.set('tl', 'pl');
    const response = await fetch(url);
    const json = await response.json();
    if (json.sentences instanceof Array) {
      const sentence = json.sentences.find(s => !!s.trans);
      if (sentence) {
        return sentence.trans;
      }
    }
    return '';
  } catch (e) {
    return '';
  }
}

export async function generateFootnoteContents(contents) {
  // find the reference objects
  const refObjects = [];
  findRefObjects(refObjects, contents);
  const footnotes = [];
  for (const { ref, content, def } of refObjects) {
    const term = content.trim();
    const definition = def || await queryDefinition(term);
    footnotes.push({ ref, term, definition });
  }
  return footnotes;
}

function findRefObjects(list, content) {
  for (const item of content) {
    if (item instanceof Object) {
      if (item.ref) {
        list.push(item);
      } else if (item.content instanceof Array) {
        findRefObjects(list, item.content);
      }
    }
  }
}
