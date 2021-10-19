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
  const paperSelect = addSelect(top, 'Paper size', paperTypes, (option, paper) => {
    option.textContent = paper.name;
    option.value = paper.code;
  });
  const marginSelect = addSelect(top, 'Margins', marginTypes, (option, margin) => {
    option.textContent = margin.name;
    option.value = margin.code;
  });
  const marginInputs = addCustomMarginInputs(top);
  //marginInputs.container.style.display = 'none';
  const bottom = document.getElementById('side-nav-bottom');
  const printButton = document.createElement('BUTTON');
  printButton.textContent = 'Print';
  printButton.className = 'default';
  bottom.appendChild(printButton);
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

function addCustomMarginInputs(container) {
  const inputs = {};
  const div = document.createElement('DIV');
  div.className = 'custom-margins';
  const left = document.createElement('DIV');
  left.className = 'column left';
  inputs.left = addMarginInput(left);
  div.appendChild(left);
  const center = document.createElement('DIV');
  center.className = 'column center';
  const top = document.createElement('DIV');
  top.className = 'row top';
  inputs.top = addMarginInput(top);
  center.appendChild(top);
  const bottom = document.createElement('DIV');
  bottom.className = 'row bottom';
  inputs.bottom = addMarginInput(bottom);
  center.appendChild(bottom);
  div.appendChild(center);
  const right = document.createElement('DIV');
  right.className = 'column right';
  inputs.right = addMarginInput(right);
  div.appendChild(right);
  container.appendChild(div);
  inputs.container = div;
  return inputs;
}

function addMarginInput(container) {
  const input = document.createElement('INPUT')
  input.type = 'text';
  container.appendChild(input);
  return input;
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

const paperTypes = [
  {
    name: 'A4 210 x 297 mm',
    code: 'A4',
    width: '210mm',
    height: '297mm',
  },
  {
    name: 'Letter 8.5 x 11 in',
    code: 'letter',
    width: '8.5in',
    height: '11in',
  }
];

const marginTypes = [
  {
    name: 'Default',
    code: 'default',
  },
  {
    name: 'Custom',
    code: 'custom',
  }
];

const defaultMargins = {
  A4: {
    top: '25mm',
    left: '25mm',
    bottom: '25mm',
    right: '25mm',
  },
  letter: {
    top: '1in',
    left: '1in',
    bottom: '1in',
    right: '1in',
  }
};
