import { attachRippleEffectHandlers } from './ui.js';
import { getSourceLanguages, getTargetLanguages } from './translation.js';
import { getPossibleSettings, getPaperProperties, applyStyles } from './settings.js';
import { getSettings, saveSettings } from './storage.js';

export function createArticleNavigation() {
  const settings = getSettings();
  const possible = getPossibleSettings();
  const top = document.getElementById('side-nav-top');
  const setLang = (option, lang) => {
    option.textContent = lang.label;
    option.value = lang.value;
  };
  const sourceLangs = getSourceLanguages();
  const sourceLangSelect = addSelect(top, 'From', sourceLangs, setLang);
  const targetLangs = getTargetLanguages();
  const targetLangSelect = addSelect(top, 'To', targetLangs, setLang);
  targetLangSelect.value = settings.target;
  targetLangSelect.parentNode.className = 'last';
  // add font family and size dropdowns for main text
  const setFont = (option, font) => {
    option.textContent = font.label;
    option.value = font.value;
    option.style.fontFamily = font.value;
    option.style.fontSize = '14pt';
  };
  const setSize = (option, size) => {
    option.textContent = size.label;
    option.value = size.value;
    option.style.fontSize = size.value;
  };
  const articleFontSelect = addSelect(top, 'Font', possible.fontFamily, setFont);
  articleFontSelect.value = settings.article.fontFamily;
  articleFontSelect.dataset.section = 'article';
  articleFontSelect.addEventListener('change', handleFontChange);
  const articleSizeSelect = addSelect(top, 'Font size', possible.fontSize, setSize);
  articleSizeSelect.value = settings.article.fontSize;
  articleSizeSelect.dataset.section = 'article';
  articleSizeSelect.addEventListener('change', handleFontSizeChange);
  // add font family and size dropdowns for footnotes
  const footnoteFontSelect = addSelect(top, 'Footnote font', possible.fontFamily, setFont);
  footnoteFontSelect.value = settings.footnote.fontFamily;
  footnoteFontSelect.dataset.section = 'footnote';
  footnoteFontSelect.addEventListener('change', handleFontChange);
  const footnoteSizeSelect = addSelect(top, 'Footnote font size', possible.fontSize, setSize);
  footnoteSizeSelect.value = settings.footnote.fontSize;
  footnoteSizeSelect.dataset.section = 'footnote';
  footnoteSizeSelect.addEventListener('change', handleFontSizeChange);
  footnoteSizeSelect.parentNode.className = 'last';
  // add paper size dropdown
  const paperSelect = addSelect(top, 'Paper size', possible.paper, (option, paper) => {
    option.textContent = paper.label;
    option.value = paper.value;
  });
  paperSelect.addEventListener('change', handlePaperChange);
  paperSelect.value = settings.paper;
  // add margins dropdown
  const marginSelect = addSelect(top, 'Margins', possible.margins, (option, margin) => {
    option.textContent = margin.label;
    option.value = margin.value;
  });
  marginSelect.value = settings.margins;
  marginSelect.addEventListener('change', handleMarginChange);
  // add custom margins input pane
  const customMargins = addCustomMarginInputs(top);
  const inputs = customMargins.getElementsByTagName('INPUT');
  for (const input of inputs) {
    input.value = settings.customMargins[input.name];
    input.addEventListener('input', handleCustomMarginInput);
    input.addEventListener('blur', handleCustomMarginBlur);
  }
  if (settings.margins === 'default') {
    customMargins.classList.add('hidden');
  }
  const bottom = document.getElementById('side-nav-bottom');
  const printButton = document.createElement('BUTTON');
  printButton.textContent = 'Print';
  printButton.className = 'default';
  printButton.addEventListener('click', handlePrintClick)
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
  const div = document.createElement('DIV');
  div.className = 'custom-margins';
  const left = document.createElement('DIV');
  left.className = 'column left';
  addMarginInput(left, 'left');
  div.appendChild(left);
  const center = document.createElement('DIV');
  center.className = 'column center';
  const top = document.createElement('DIV');
  top.className = 'row top';
  addMarginInput(top, 'top');
  center.appendChild(top);
  const bottom = document.createElement('DIV');
  bottom.className = 'row bottom';
  addMarginInput(bottom, 'bottom');
  center.appendChild(bottom);
  div.appendChild(center);
  const right = document.createElement('DIV');
  right.className = 'column right';
  addMarginInput(right, 'right');
  div.appendChild(right);
  container.appendChild(div);
  return div;
}

function addMarginInput(container, name) {
  const input = document.createElement('INPUT')
  input.type = 'text';
  input.name = name;
  container.appendChild(input);
  return input;
}

function handleFontChange(evt) {
  const { target } = evt;
  const { section } = target.dataset;
  changeSettings(settings => settings[section].fontFamily = target.value);
}

function handleFontSizeChange(evt) {
  const { target } = evt;
  const { section } = target.dataset;
  changeSettings(settings => settings[section].fontSize = target.value);
}

function handlePaperChange(evt) {
  const { target } = evt;
  changeSettings((settings) => {
    const props = getPaperProperties(target.value);
    settings.paper = target.value;
    settings.customMargins = Object.assign({}, props.defaultMargins);
    const [ customMargins ] = document.getElementsByClassName('custom-margins');
    const inputs = customMargins.getElementsByTagName('INPUT');
    for (const input of inputs) {
      input.value = settings.customMargins[input.name];
    }
  });
}

function handleMarginChange(evt) {
  const { target } = evt;
  changeSettings((settings) => {
    const [ customMargins ] = document.getElementsByClassName('custom-margins');
    settings.margins = target.value;
    if (settings.margins === 'default') {
      customMargins.classList.add('hidden');
    } else {
      customMargins.classList.remove('hidden');
    }
  });
}

function handleCustomMarginInput(evt) {
  const { target } = evt;
  const dim = target.value.trim().replace(/\s/g, '');
  const value = parseFloat(dim);
  const unit = dim.substr(-2).toLowerCase();
  let valid = false;
  if (!isNaN(value) || [ 'in', 'mm' ].includes(unit)) {
    if (unit === 'in' && value >= 0 && value <= 3) {
      valid = true;
    } else if (unit === 'mm' && value >= 0 && value <= 80) {
      valid = true;
    }
  }
  if (valid) {
    changeSettings(settings => settings.customMargins[target.name] = `${value}${unit}`);
    target.classList.remove('invalid');
  } else {
    target.classList.add('invalid');
  }
}

function handleCustomMarginBlur(evt) {
  // set the text to match what's stored in settings
  const { target } = evt;
  const settings = getSettings();
  target.value = settings.customMargins[target.name];
  target.classList.remove('invalid');
}

function handlePrintClick(evt) {
  print();
}

function changeSettings(callback) {
  const settings = getSettings();
  callback(settings);
  applyStyles();
  saveSettings();
}
