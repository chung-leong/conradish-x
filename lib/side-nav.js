import { attachRippleEffectHandlers } from './ui.js';
import { getSourceLanguages, getTargetLanguages } from './translation.js';

export function createArticleNavigation() {
  const top = document.getElementById('side-nav-top');
  const setLang = (option, lang) => {
    option.textContent = lang.name;
    option.value = lang.code;
  };
  const sourceLangs = getSourceLanguages();
  const sourceLangSelect = addSelect(top, 'From', sourceLangs, setLang);
  const targetLangs = getTargetLanguages();
  const targetLangSelect = addSelect(top, 'To', targetLangs, setLang);
  targetLangSelect.parentNode.className = 'last';
  const setFont = (option, name) => {
    option.textContent = name;
    option.value = name;
    option.style.fontFamily = name;
    option.style.fontSize = '14pt';
  };
  const setSize = (option, size) => {
    option.textContent = size;
    option.value = size;
    option.style.fontSize = size + 'pt';
  };
  const articleFontSelect = addSelect(top, 'Font', fontFamilies, setFont);
  const articleSizeSelect = addSelect(top, 'Font size', fontSizes, setSize);
  const footnoteFontSelect = addSelect(top, 'Footnote font', fontFamilies, setFont);
  const footnoteSizeSelect = addSelect(top, 'Footnote font size', fontSizes, setSize);
  footnoteSizeSelect.parentNode.className = 'last';
  const bottom = document.getElementById('side-nav-bottom');

  // add ripple effect to button
  attachRippleEffectHandlers();
}

function addSelect(container, description, items, callback) {
  const select = document.createElement('SELECT');
  const label = document.createElement('LABEL');
  label.textContent = description;
  for (let item of items) {
    const option = document.createElement('OPTION');
    callback(option, item);
    select.appendChild(option);
  }
  const section = document.createElement('SECTION');
  section.appendChild(label);
  section.appendChild(select);
  container.appendChild(section);
  return select;
}

const fontFamilies = [
  'Arial',
  'Brush Script MT',
  'Courier',
  'Helvetica',
  'Tahoma',
  'Times New Roman',
  'Verdana',
  'Garamond',
  'Georgia',
];

const fontSizes = [
  8,
  9,
  10,
  11,
  12,
  14,
  16,
  18,
  20,
  22,
  24,
  26,
  28,
  36,
  48,
  72,
];
