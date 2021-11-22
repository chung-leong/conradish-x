import { e, attachRippleEffectHandlers } from './ui.js';
import { setSourceLanguage, getSourceLanguage, getSourceLanguages, getTargetLanguages } from './i18n.js';
import { getPossibleSettings, getPaperProperties, applyStyles, getSettings, saveSettings } from './settings.js';
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
  articleFontSelect.dataset.setting = 'article.fontFamily';
  articleFontSelect.addEventListener('change', handleSettingChange);
  addSection(top, 'Font', articleFontSelect);
  const articleSizeSelect = createFontSizeSelect(possible.fontSize, settings.article.fontSize);
  articleSizeSelect.dataset.setting = 'article.fontSize';
  articleSizeSelect.addEventListener('change', handleSettingChange);
  addSection(top, 'Font size', articleSizeSelect);
  const articleJustificationSelect = createSelect(possible.justification, settings.article.justification);
  articleJustificationSelect.dataset.setting = 'article.justification';
  articleJustificationSelect.addEventListener('change', handleSettingChange);
  addSection(top, 'Justification', articleJustificationSelect);
  const articleSpacingSelect = createSelect(possible.spacing, settings.article.spacing);
  articleSpacingSelect.dataset.setting = 'article.spacing';
  articleSpacingSelect.addEventListener('change', handleSettingChange);
  addSection(top, 'Spacing', articleSpacingSelect);
  // add font family and size dropdowns for footnotes
  const footnoteFontSelect = createFontFamilySelect(possible.fontFamily, settings.footnote.fontFamily);
  footnoteFontSelect.dataset.setting = 'footnote.fontFamily';
  footnoteFontSelect.addEventListener('change', handleSettingChange);
  addSection(top, 'Footnote font', footnoteFontSelect);
  const footnoteSizeSelect = createFontSizeSelect(possible.fontSize, settings.footnote.fontSize);
  footnoteSizeSelect.dataset.setting = 'footnote.fontSize';
  footnoteSizeSelect.addEventListener('change', handleSettingChange);
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
  const customMargins = createCustomMarginInputs(settings.customMargins, settings.margins === 'default');
  const inputs = customMargins.getElementsByTagName('INPUT');
  for (const input of inputs) {
    input.addEventListener('input', handleCustomMarginInput);
    input.addEventListener('blur', handleCustomMarginBlur);
  }
  addSection(top, '', customMargins);

  // add button to bottom pane
  const bottom = document.getElementById('side-bar-bottom');
  const printButton = e('BUTTON', { className: 'default' }, 'Print');
  printButton.addEventListener('click', handlePrintClick)
  bottom.append(printButton);

  // add message about paper size and margin
  const sidebar = bottom.parentNode;
  const speechBubble = createSpeechBubble();
  sidebar.append(speechBubble);
  // show it when user mouses over the print button
  const showBubble = () => speechBubble.classList.remove('hidden');
  const hideBubble = () => speechBubble.classList.add('hidden');
  printButton.addEventListener('mouseover', showBubble);
  printButton.addEventListener('mouseout', hideBubble);
  printButton.addEventListener('focus', showBubble);
  printButton.addEventListener('blur', hideBubble);

  // add ripple effect to buttons
  attachRippleEffectHandlers();
}

function addSection(container, label, control, last = false) {
  const section = e('SECTION', {}, [
    e('LABEL', { className: 'label' }, label),
    e('DIV', { className: 'control' }, control)
  ]);
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
    const style = { fontFamily: value, fontSize: '13pt' };
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

function createCustomMarginInputs(margins, hidden) {
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

function createSpeechBubble() {
  const icon = e('DIV', { className: 'icon' }, '\u26a0\ufe0f');
  const paperSize = e('B', {}, 'Paper size');
  const margins = e('B', {}, 'Margins');
  const message = e('DIV', { className: 'message' }, [
    'In the print window, make sure ', paperSize,
    ' matches what’s specified above and that ', margins,
    ' are set to “Default”'
  ]);
  return e('DIV', { className: 'speech-bubble hidden' }, [ icon, message ]);
}

function handleSettingChange(evt) {
  const { target } = evt;
  const { setting } = target.dataset;
  const path = setting.split('.');
  changeSettings((settings) => {
    let section = settings;
    while (path.length > 1) {
      const name = path.shift();
      section = section[name];
    }
    const name = path.shift();
    section[name] = target.value
  });
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
      customMargins.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
