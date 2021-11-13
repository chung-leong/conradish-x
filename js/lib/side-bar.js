import { e, attachRippleEffectHandlers } from './ui.js';
import { getSourceLanguages, getTargetLanguages } from './translation.js';
import { getPossibleSettings, getPaperProperties, setSourceLanguage, getSourceLanguage, applyStyles } from './settings.js';
import { getSettings, saveSettings } from './storage.js';
import { adjustLayout } from './layout.js';

export function createArticleNavigation() {
  const settings = getSettings();
  const possible = getPossibleSettings();
  const top = document.getElementById('side-bar-top');
  // add source language select
  const sourceLangs = getSourceLanguages();
  const sourceLang = getSourceLanguage();
  const sourceLangSelect = createSelect(sourceLangs, sourceLang);
  sourceLangSelect.addEventListener('change', handleSourceLanguageChange);
  addSection(top, 'From', sourceLangSelect);
  // add target language select
  const targetLangs = getTargetLanguages();
  const targetLangSelect = createSelect(targetLangs, settings.target);
  targetLangSelect.addEventListener('change', handleTargetLanguageChange);
  addSection(top, 'To', targetLangSelect, true);
  // add font family and size dropdowns for main text
  const articleFontSelect = createFontFamilySelect(possible.fontFamily, settings.article.fontFamily);
  articleFontSelect.dataset.section = 'article';
  articleFontSelect.addEventListener('change', handleFontChange);
  addSection(top, 'Font', articleFontSelect);
  const articleSizeSelect = createFontSizeSelect(possible.fontSize, settings.article.fontSize);
  articleSizeSelect.dataset.section = 'article';
  articleSizeSelect.addEventListener('change', handleFontSizeChange);
  addSection(top, 'Font size', articleSizeSelect);
  // add font family and size dropdowns for footnotes
  const articleJustificationSelect = createSelect(possible.justification, settings.article.justification);
  articleJustificationSelect.dataset.section = 'article';
  articleJustificationSelect.addEventListener('change', handleJustificationChange);
  addSection(top, 'Justification', articleJustificationSelect);
  const footnoteFontSelect = createFontFamilySelect(possible.fontFamily, settings.footnote.fontFamily);
  footnoteFontSelect.dataset.section = 'footnote';
  footnoteFontSelect.addEventListener('change', handleFontChange);
  addSection(top, 'Footnote font', footnoteFontSelect);
  const footnoteSizeSelect = createFontSizeSelect(possible.fontSize, settings.footnote.fontSize);
  footnoteSizeSelect.dataset.section = 'footnote';
  footnoteSizeSelect.addEventListener('change', handleFontSizeChange);
  addSection(top, 'Footnote font size', footnoteSizeSelect, true);
  // add paper size dropdown
  const paperSelect = createSelect(possible.paper, settings.paper);
  paperSelect.addEventListener('change', handlePaperChange);
  addSection(top, 'Paper size', paperSelect);
  // add margins dropdown
  const marginSelect = createSelect(possible.margins, settings.margins);
  marginSelect.addEventListener('change', handleMarginChange);
  addSection(top, 'Margins', marginSelect);
  // add custom margins input pane
  const customMargins = createCustomMarginInputs(top, settings.customMargins, settings.margins === 'default');
  const inputs = customMargins.getElementsByTagName('INPUT');
  for (const input of inputs) {
    input.addEventListener('input', handleCustomMarginInput);
    input.addEventListener('blur', handleCustomMarginBlur);
  }
  top.append(customMargins);

  const bottom = document.getElementById('side-bar-bottom');
  const printButton = e('BUTTON', { className: 'default' }, 'Print');
  printButton.addEventListener('click', handlePrintClick)
  bottom.append(printButton);
  // add ripple effect to button
  attachRippleEffectHandlers();
}

function addSection(container, label, control, last = false) {
  const section = e('SECTION', {}, [ e('LABEL', {}, label), control ]);
  if (last) {
    section.classList.add('last');
  }
  container.append(section);
}

function createSelect(items, currentValue) {
  return e('SELECT', {}, items.map(({ label, value }) => {
    const selected = (value === currentValue);
    return e('OPTION', { value, selected }, label);
  }));
}

function createFontFamilySelect(fontFamilies, currentValue) {
  return e('SELECT', {}, fontFamilies.map(({ label, value }) => {
    const selected = (value === currentValue);
    const style = { fontFamily: value, fontSize: '14pt' };
    return e('OPTION', { value, selected, style }, label);
  }));
}

function createFontSizeSelect(fontSizes, currentValue) {
  return e('SELECT', {}, fontSizes.map(({ label, value }) => {
    const selected = (value === currentValue);
    const style = { fontSize: value };
    return e('OPTION', { value, selected, style }, label);
  }));
}

function createCustomMarginInputs(container, margins, hidden) {
  const createInput = (name) => {
    const value = margins[name];
    return e('INPUT', { type: 'text', name, value });
  };
  const left = e('DIV', { className: 'column left' }, createInput('left'));
  const right = e('DIV', { className: 'column right' }, createInput('right'));
  const top = e('DIV', { className: 'row top' }, createInput('top'));
  const bottom = e('DIV', { className: 'row bottom' }, createInput('bottom'));
  const center = e('DIV', { className: 'column center' }, [ top, bottom ]);
  let className = 'custom-margins';
  if (hidden) {
    className += ' hidden';
  }
  return e('DIV', { className }, [ left, center, right ]);
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

function handleJustificationChange(evt) {
  const { target } = evt;
  const { section } = target.dataset;
  changeSettings(settings => settings[section].justification = target.value);
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
    if (unit === 'in' && value >= 1 && value <= 3) {
      valid = true;
    } else if (unit === 'mm' && value >= 25 && value <= 80) {
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

function handleSourceLanguageChange(evt) {
  const { target } = evt;
  setSourceLanguage(target.value);
}

function handleTargetLanguageChange(evt) {
  const { target } = evt;
  const settings = getSettings();
  settings.target = target.value;
  saveSettings();
}

function handlePrintClick(evt) {
  print();
}

function changeSettings(callback) {
  const settings = getSettings();
  callback(settings);
  applyStyles();
  adjustLayout({ updatePaper: true });
  saveSettings();
}
