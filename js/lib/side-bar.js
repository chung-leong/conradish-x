import { e, parseMarkdown, attachRippleEffectHandlers } from './ui.js';
import { l, setSourceLanguage, getSourceLanguage, getSourceLanguages, getTargetLanguages } from './i18n.js';
import { getPaperProperties, applyStyles, getSettings, saveSettings } from './settings.js';
import { updateLayout } from './document.js';
import { modeChange, setEditMode, getEditMode } from './editing.js';

const containerElement = document.getElementById('side-bar');
const mainAreaElement = document.getElementById('side-bar-top');
const buttonAreaElement = document.getElementById('side-bar-bottom');

let collapsed = undefined;
let reopenedManually = false;
let sideBarWidth = undefined;

export function createArticleNavigation() {
  // add mode selector
  createActionControls();
  // add source and target language dropdowns
  createLanguageControls();
  // add dropdowns for controling text properties
  createTextControls();
  // add dropdowns for paper size and margins
  createPaperControls();
  // add buttons
  createButtons();
  // add ripple effect to buttons
  attachRippleEffectHandlers();
  // add handler for collapse button
  addCollapseButtonHandlers();
}

function createActionControls() {
  const currentMode = containerElement.className = getEditMode();
  const modes = [
    {
      label: l('editing'),
      value: 'edit'
    },
    {
      label: l('styling'),
      value: 'style'
    },
    {
      label: l('annotating'),
      value: 'annotate'
    },
    {
      label: l('scrubbing'),
      value: 'clean'
    }
  ];
  const modeSelect = createSelect(modes, currentMode);
  addSection(l('action'), modeSelect, true);
  modeChange.addEventListener('change', () => {
    containerElement.className = modeSelect.value = getEditMode();
  });
  modeSelect.addEventListener('change', handleModeChange);
}

function createLanguageControls() {
  const settings = getSettings();
  const sourceLangs = getSourceLanguages();
  const sourceLang = getSourceLanguage();
  const sourceLangSelect = createSelect(sourceLangs, sourceLang);
  sourceLangSelect.addEventListener('change', handleSourceLanguageChange);
  addSection(l('from_language'), sourceLangSelect);
  const targetLangs = getTargetLanguages();
  const targetLangSelect = createSelect(targetLangs, settings.target);
  targetLangSelect.addEventListener('change', handleTargetLanguageChange);
  addSection(l('to_language'), targetLangSelect, true);
}

function createTextControls() {
  const settings = getSettings();
  const fontFamilies = [
    {
      label: 'Arial',
      value: 'Arial',
    },
    {
      label: 'Brush Script',
      value: 'Brush Script MT',
    },
    {
      label: 'Courier',
      value: 'Courier',
    },
    {
      label: 'Garamond',
      value: 'Garamond',
    },
    {
      label: 'Georgia',
      value: 'Georgia',
    },
    {
      label: 'Tahoma',
      value: 'Tahoma',
    },
    {
      label: 'Times New Roman',
      value: 'Times New Roman',
    },
    {
      label: 'Verdana',
      value: 'Verdana',
    },
  ];
  const fontSizes = [ 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48 ].map((pt) => {
    return {
      label: `${pt}`,
      value: `${pt}pt`
    };
  });
  const justifications = [
    {
      label: l('justification_none'),
      value: 'none'
    },
    {
      label: l('justification_text'),
      value: 'text'
    },
    {
      label: l('justification_text_and_headings'),
      value: 'both'
    },
  ];
  const spacings = [
    {
      label: '1',
      value: '1',
    },
    {
      label: l('spacing_normal'),
      value: 'normal',
    },
    {
      label: '1.5',
      value: '1.5',
    },
    {
      label: '2',
      value: '2',
    },
    {
      label: '3',
      value: '3',
    },
  ];
  // for main text
  const articleFontSelect = createFontFamilySelect(fontFamilies, settings.article.fontFamily);
  articleFontSelect.dataset.setting = 'article.fontFamily';
  articleFontSelect.addEventListener('change', handleSettingChange);
  addSection(l('article_font_family'), articleFontSelect);
  const articleSizeSelect = createFontSizeSelect(fontSizes, settings.article.fontSize);
  articleSizeSelect.dataset.setting = 'article.fontSize';
  articleSizeSelect.addEventListener('change', handleSettingChange);
  addSection(l('article_font_size'), articleSizeSelect);
  const articleJustificationSelect = createSelect(justifications, settings.article.justification);
  articleJustificationSelect.dataset.setting = 'article.justification';
  articleJustificationSelect.addEventListener('change', handleSettingChange);
  addSection(l('article_justification'), articleJustificationSelect);
  const articleSpacingSelect = createSelect(spacings, settings.article.spacing);
  articleSpacingSelect.dataset.setting = 'article.spacing';
  articleSpacingSelect.addEventListener('change', handleSettingChange);
  addSection(l('article_spacing'), articleSpacingSelect);
  // for footnotes
  const footnoteFontSelect = createFontFamilySelect(fontFamilies, settings.footnote.fontFamily);
  footnoteFontSelect.dataset.setting = 'footnote.fontFamily';
  footnoteFontSelect.addEventListener('change', handleSettingChange);
  addSection(l('footnote_font_family'), footnoteFontSelect);
  const footnoteSizeSelect = createFontSizeSelect(fontSizes, settings.footnote.fontSize);
  footnoteSizeSelect.dataset.setting = 'footnote.fontSize';
  footnoteSizeSelect.addEventListener('change', handleSettingChange);
  addSection(l('footnote_font_size'), footnoteSizeSelect, true);
}

function createPaperControls() {
  const settings = getSettings();
  const papers = [
    {
      label: 'A4 210 x 297 mm',
      value: 'A4',
    },
    {
      label: 'Letter 8.5 x 11 in',
      value: 'letter',
    }
  ];
  const margins = [
    {
      label: l('margins_default'),
      value: 'default',
    },
    {
      label: l('margins_custom'),
      value: 'custom',
    }
  ];
  const paperSelect = createSelect(papers, settings.paper);
  paperSelect.addEventListener('change', handlePaperChange);
  addSection(l('paper_size'), paperSelect);
  const marginSelect = createSelect(margins, settings.margins);
  marginSelect.addEventListener('change', handleMarginChange);
  addSection(l('margins'), marginSelect);
  const customMargins = createCustomMarginInputs(settings.customMargins, settings.margins === 'default');
  const inputs = customMargins.getElementsByTagName('INPUT');
  for (const input of inputs) {
    input.addEventListener('input', handleCustomMarginInput);
    input.addEventListener('blur', handleCustomMarginBlur);
  }
  addSection('', customMargins);
}

function createButtons() {
  // add buttons to bottom pane
  const finishButton = e('BUTTON', { id: 'finish-button' }, l('finish'));
  finishButton.addEventListener('click', handleFinishClick);
  const printButton = e('BUTTON', { id: 'print-button', className: 'default' }, l('print'));
  printButton.addEventListener('click', handlePrintClick)
  buttonAreaElement.append(finishButton, printButton);
  // add message about paper size and margin
  const speechBubble = createSpeechBubble();
  containerElement.append(speechBubble);
  // show it when user mouses over the print button
  const showBubble = () => speechBubble.classList.remove('hidden');
  const hideBubble = () => speechBubble.classList.add('hidden');
  printButton.addEventListener('mouseover', showBubble);
  printButton.addEventListener('mouseout', hideBubble);
  printButton.addEventListener('focus', showBubble);
  printButton.addEventListener('blur', hideBubble);
}

function addSection(label, control, last = false) {
  const section = e('SECTION', {}, [
    e('LABEL', { className: 'label' }, label),
    e('DIV', { className: 'control' }, control)
  ]);
  if (last) {
    section.classList.add('last');
  }
  mainAreaElement.append(section);
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
  const message = e('DIV', { className: 'message' }, parseMarkdown(l('check_paper_size')));
  return e('DIV', { className: 'speech-bubble hidden' }, [ icon, message ]);
}

function changeSettings(callback, paperSizeChanged = false) {
  const settings = getSettings();
  callback(settings);
  applyStyles();
  updateLayout({ paperSizeChanged });
  saveSettings();
}

export function initializeAutoCollapse() {
  // the button won't have an offsetParent if it's not displayed
  const button = document.getElementById('side-bar-button');
  if (!collapsed && !reopenedManually && button.offsetParent) {
    collapseSideBar();
  } else if (collapsed && !button.offsetParent) {
    reopenSideBar();
    reopenedManually = false;
  }
}

function addCollapseButtonHandlers() {
  const button = document.getElementById('side-bar-button');
  button.addEventListener('click', handleCollapseButtonClick);
  window.addEventListener('resize', initializeAutoCollapse);
}

async function collapseSideBar() {
  const container = document.getElementById('side-bar-container');
  const button = document.getElementById('side-bar-button');
  if (sideBarWidth === undefined) {
    sideBarWidth = container.offsetWidth;
    container.style.width = sideBarWidth + 'px';
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  container.style.width = 0;
  if (collapsed === undefined) {
    button.classList.add('initial');
  }
  button.classList.add('reverse');
  collapsed = true;
}

function reopenSideBar() {
  const container = document.getElementById('side-bar-container');
  const button = document.getElementById('side-bar-button');
  container.style.width = sideBarWidth + 'px';
  button.classList.remove('reverse', 'initial');
  collapsed = false;
}

function handleCollapseButtonClick() {
  if (collapsed) {
    reopenSideBar();
    reopenedManually = true;
  } else {
    collapseSideBar();
  }
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
  }, true);
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

function handleFinishClick(evt) {
  setEditMode('annotate');
}

function handleModeChange(evt) {
  const { target } = evt;
  setEditMode(target.value);
}
