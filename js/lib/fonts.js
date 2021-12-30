import { waitForRedraw } from './ui.js';
import { getSettings, saveSettings } from './settings.js';

let fontList;

export function getScripts() {
  return Object.keys(essentialCharacters);
}

export async function getFontList() {
  if (!fontList) {
    fontList = await new Promise(r => chrome.fontSettings.getFontList(r));
    fontList.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return fontList;
}

export async function getDefaultFonts(script) {
  const getFont = async (genericFamily, script) => {
    if (script === 'Latn') {
      // use the default; not sure why 'Latn' yields nothing
      script = 'Zyyy';
    }
    return new Promise(r => chrome.fontSettings.getFont({ genericFamily, script }, r));
  };
  const promises = [
    'sansserif',
    'serif',
    'fixed',
    'cursive',
  ].map(f => getFont(f, script));
  const fonts = await Promise.all(promises);
  // remove duplicates
  return fonts.filter((font, index, arr) => {
    return font.fontId && index === arr.findIndex(f => f.fontId === font.fontId);
  });
}

export function getScriptSpecificSettings(name, script) {
  const settings = getSettings();
  const key = name + (script === 'Latn' ? '' : script);
  return settings[key];
}

export async function getAvailableFonts(requestedScript) {
  const fonts = await getFontList();
  const available = {};
  for (const script of getScripts()) {
    if (!requestedScript || script === requestedScript) {
      const list = getScriptSpecificSettings('fonts', script);
      for (const fontId of list) {
        available[fontId] = true;
      }
    }
  }
  return fonts.filter(f => available[f.fontId]);
}

export async function applyDefaultFontSettings(options = {}) {
  const { scan } = options;
  let changed = false;
  if (scan === 'fonts') {
    const uncoveredScripts = [];
    for (const script of getScripts()) {
      // make sure the font list for the script isn't empty
      const list = getScriptSpecificSettings('fonts', script);
      if (list.length === 0) {
        uncoveredScripts.push(script);
      }
    }
    if (uncoveredScripts.length > 0) {
      for await (const { fontId, coverage } of getFontCoverage()) {
        for (const script of coverage) {
          if (updateFontAvailability(fontId, script)) {
            const index = uncoveredScripts.indexOf(script);
            uncoveredScripts.splice(index, 1);
            changed = true;
          }
        }
        if (uncoveredScripts.length === 0) {
          break;
        }
      }
    }
  } else {
    for (const script of getScripts()) {
      // make sure the font list for the script isn't empty
      const list = getScriptSpecificSettings('fonts', script);
      if (list.length === 0) {
        const defaultFonts = await getDefaultFonts(script);
        if (defaultFonts.length > 0) {
          list.push(...defaultFonts.map(f => f.fontId));
          changed = true;
        }
      }
    }
  }
  if (changed) {
    updateFontSelection();
    await saveSettings();
  }
  return changed;
}

export function updateFontSelection() {
  let changed = false;
  for (const script of getScripts()) {
    const list = getScriptSpecificSettings('fonts', script);
    // set font for article text if it's isn't set
    const article = getScriptSpecificSettings('article', script);
    if (!list.includes(article.fontFamily)) {
      article.fontFamily = list[0] || '';
      changed = true;
    }
    // set font for footnote text
    const footnote = getScriptSpecificSettings('footnote', script);
    if (!list.includes(footnote.fontFamily)) {
      footnote.fontFamily = list[0] || '';
      changed = true;
    }
  }
  return changed;
}

export function updateFontAvailability(fontId, script) {
  let changed = false;
  const list = getScriptSpecificSettings('fonts', script);
  if (list.length === 0) {
    list.push(fontId);
    changed = true;
  }
  return changed;
}

export async function *getFontCoverage() {
  const fonts = await getFontList();
  const iframe = document.getElementById('scratch-pad');
  const doc = iframe.contentWindow.document;
  const bin = doc.getElementById('bin');
  const spans = Array.from('ABCD').map(() => doc.createElement('SPAN'));
  bin.append(...spans);
  try {
    for (const { fontId, displayName } of fonts) {
      if (symbolicFontIds.includes(fontId)) {
        continue;
      }
      // set the font, with blank font (zero width for all characters) as fallback
      for (const span of spans) {
        span.style.fontFamily = `${fontId}, Adobe Blank`;
      }
      const coverage = [];
      let initial = true;
      for (const [ script, characters ] of Object.entries(essentialCharacters)) {
        for (const [ index, span ] of spans.entries()) {
          span.innerText = characters.charAt(index);
        }
        if (initial) {
          // give browser time to load the font
          await waitForRedraw();
          initial = false;
        }
        // see if every one of the essential characters are present in the font
        if (spans.every(span => span.offsetWidth > 0)) {
          coverage.push(script);
        }
      }
      yield { fontId, displayName, coverage };
    }
  } finally {
    for (const span of spans) {
      span.remove();
    }
  }
}

export function getSimiliarScriptsBySize(script) {
  for (const grouping of fontSizeGroupings) {
    if (grouping.includes(script)) {
      return group;
    }
  }
  return [ script ];
}

// hardcoded  for all script to 4 right now
const essentialCharacters = {
    Arab: '\u0627\u0628\u0629\u0630',
    Armn: '\u0521\u0522\u0523\u0524',
    Beng: '\u0985\u0986\u0987\u0988',
    Cyrl: '\u0410\u0411\u0412\u0413',
    Deva: '\u0915\u0916\u0917\u0918',
    Ethi: '\u1208\u1209\u1210\u1211',
    Geor: '\u10d0\u10d1\u10d2\u10d3',
    Grek: '\u0391\u0392\u0393\u0394',
    Gujr: '\u0a95\u0a96\u0a97\u0a98',
    Guru: '\u0a15\u0a16\u0a17\u0a18',
    Hang: '\u1100\u1101\u1102\u1103',
    Hans: '\u5170\u5174\u5181\u5188',
    Hant: '\u5159\u5161\u5163\u5246',
    Hebr: '\u05d0\u05d1\u05d2\u05d3',
    Jpan: '\u3041\u3042\u3043\u3044',
    Khmr: '\u1780\u1781\u1782\u1783',
    Knda: '\u0c95\u0c96\u0c97\u0c98',
    Laoo: '\u0e81\u0e82\u0e84\u0e87',
    Latn: 'ABCD',
    Mlym: '\u0d15\u0d16\u0d17\u0d18',
    Mymr: '\u1000\u1001\u1002\u1003',
    Orya: '\u0b15\u0b16\u0b17\u0b18',
    Sinh: '\u0d9a\u0d9b\u0d9c\u0d9d',
    Taml: '\u0b95\u0b99\u0b9a\u0b9c',
    Telu: '\u0c15\u0c16\u0c17\u0c18',
    Thai: '\u0e01\u0e02\u0e03\u0e04'
};

// scripts that're kinda similiar in appearance should have their sizes set all at once
// if the user thinks 12pt is the proper size for Latin, then it's probably right for
// Cyrillic and Greek too
const fontSizeGroupings = [
  [ 'Latn', 'Cyrl', 'Grek' ],
  [ 'Hans', 'Hant', 'Hang', 'Jpan' ],
  [ 'Deva', 'Beng', 'Gujr', 'Guru', 'Knda', 'Mlym', 'Orya', 'Sinh', 'Taml', 'Telu' ],
  [ 'Thai', 'Khmr', 'Laoo' ]
];

const symbolicFontIds = [ 'Webdings', 'Wingdings', 'Wingdings 2', 'Wingdings 3' ];
