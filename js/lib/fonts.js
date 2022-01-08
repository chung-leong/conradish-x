import { waitForRedraw } from './ui.js';
import { getSettings, saveSettings, getScriptSpecificSettings } from './settings.js';
import { storageChange } from './storage.js';

export const fontAvailability = new EventTarget;

storageChange.addEventListener('settings', (evt) => {
  if (!evt.detail.self) {
    fontAvailability.dispatchEvent(new CustomEvent('change'));
  }
});

let fontList;

export async function getFontList() {
  if (!fontList) {
    fontList = await new Promise(r => chrome.fontSettings.getFontList(r));
    fontList.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return fontList;
}

export function getScripts() {
  return Object.keys(essentialCharacters);
}

export async function getDefaultFonts(script) {
  const fonts = await getFontList();
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
  const defaultfonts = await Promise.all(promises);
  return defaultfonts.filter((font, index, arr) => {
    // remove duplicates
    if (font.fontId && index === arr.findIndex(f => f.fontId === font.fontId)) {
      // ensure that font is actually availble on the computer
      if (fonts.find(f => f.fontId === font.fontId)) {
        return true;
      }
    }
    return false;
  });
}

export async function getAvailableFonts(script) {
  const fonts = await getFontList();
  const available = {};
  const list = getScriptSpecificSettings('fonts', script);
  for (const fontId of list) {
    available[fontId] = true;
  }
  return fonts.filter(f => available[f.fontId]);
}

export async function applyDefaultFontSettings(options = {}) {
  const { scan } = options;
  let changed = false;
  const uncovered = {};
  for (const script of getScripts()) {
    // make sure the font list for the script isn't empty
    const list = getScriptSpecificSettings('fonts', script);
    if (list.length === 0) {
      uncovered[script] = list;
    }
  }
  if (Object.keys(uncovered).length > 0) {
    if (scan === 'fonts') {
      const fonts = [];
      for await (const font of getFontCoverage()) {
        fonts.push(font);
      }
      changed = updateFontAvailability(fonts);
    } else {
      for (const [ script, list ] of Object.entries(uncovered)) {
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
    fontAvailability.dispatchEvent(new CustomEvent('change'));
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

export function updateFontAvailability(fonts) {
  const popularFontNames = [
    'Arial',
    'Noto',
    'Times',
  ];
  const isPopular = (fontId) => {
    for (const name of popularFontNames) {
      if (fontId.includes(name)) {
        return true;
      }
    }
    return false;
  };
  let changed = false;
  for (const script of getScripts()) {
    const list = getScriptSpecificSettings('fonts', script);
    if (list.length === 0) {
      for (let pass = 1; pass <= 2; pass++) {
        for (const { fontId, coverage } of fonts) {
          if (coverage.includes(script)) {
            let include;
            if (pass === 1) {
              include = isPopular(fontId) && list.length < 8;
            } else if (pass === 2) {
              include = list.length < 4;
            }
            if(include) {
              list.push(fontId);
              changed = true;
            }
          }
        }
      }
    }
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

// hardcoded to four for all script right now
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

const symbolicFontIds = [ 'Webdings', 'Wingdings', 'Wingdings 2', 'Wingdings 3' ];
