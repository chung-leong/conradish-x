import { waitForRedraw } from './ui.js';

export function getScripts() {
  return Object.keys(essentialCharacters);
}

export async function getFontList() {
  const list = await new Promise(r => chrome.fontSettings.getFontList(r));
  return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function *getFontCoverage() {
  const fonts = await getFontList();
  const iframe = document.getElementById('scratch-pad');
  const win = iframe.contentWindow;
  const doc = win.document;
  const bin = doc.getElementById('bin');
  const spans = Array.from('ABCD').map(() => doc.createElement('SPAN'));
  bin.append(...spans);
  for (const { fontId, displayName } of fonts) {
    // set the font, with blank font (zero width for all characters) as fallback
    for (const span of spans) {
      span.style.fontFamily = `${fontId}, Adobe Blank`;
    }
    const coverage = {};
    let initial = 'true';
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
        coverage[script] = true;
      }
    }
    yield { fontId, displayName, coverage };
  }
  for (const span of spans) {
    span.remove();
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
    Laoo: '\u0e81\u0e82\u0e84\u0e86',
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
