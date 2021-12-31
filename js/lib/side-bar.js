import { e, parseMarkdown, attachRippleEffectHandlers } from './ui.js';
import { l, setSourceLanguage, getSourceLanguage, getSourceLanguages, getTargetLanguage, getTargetLanguages, getLanguageScript } from './i18n.js';
import { getPaperProperties, applyStyles, getSettings, saveSettings } from './settings.js';
import { updateLayout } from './document.js';
import { modeChange, setEditMode, getEditMode } from './editing.js';
import { getScriptSpecificSettings } from './settings.js';
import { getAvailableFonts, fontAvailability } from './fonts.js';

const containerElement = document.getElementById('side-bar');
const mainAreaElement = document.getElementById('side-bar-top');
const buttonAreaElement = document.getElementById('side-bar-bottom');

let collapsed = undefined;
let reopenedManually = false;
let sideBarWidth = undefined;

export async function createArticleNavigation() {
  // add mode selector
  createActionControls();
  // add source and target language dropdowns
  createLanguageControls();
  // add dropdowns for controling text properties
  await createTextControls();
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
  modeSelect.addEventListener('change', (evt) => {
    setEditMode(evt.target.value);
  });
}

function createLanguageControls() {
  const settings = getSettings();
  const sourceLangs = getSourceLanguages();
  const sourceLang = getSourceLanguage();
  const sourceLangSelect = createSelect(sourceLangs, sourceLang);
  sourceLangSelect.id = 'from-lang-select';
  sourceLangSelect.addEventListener('change', (evt) => setSourceLanguage(evt.target.value));
  addSection(l('from_language'), sourceLangSelect);
  const targetLangs = getTargetLanguages();
  const targetLangSelect = createSelect(targetLangs, settings.target);
  targetLangSelect.id = 'to-lang-select';
  targetLangSelect.addEventListener('change', (evt) => {
    const settings = getSettings();
    settings.target = evt.target.value;
    saveSettings();
  });
  addSection(l('to_language'), targetLangSelect, true);
}

async function createTextControls() {
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
  const article = getArticleSettings();
  const articleFonts = await getArticleFonts();
  const articleFontSelect = createFontFamilySelect(articleFonts, article.fontFamily);
  articleFontSelect.addEventListener('change', (evt) => {
    changeArticleSettings((article) => article.fontFamily = evt.target.value);
  });
  addSection(l('article_font_family'), articleFontSelect);
  const articleSizeSelect = createFontSizeSelect(fontSizes, article.fontSize);
  articleSizeSelect.addEventListener('change', (evt) => {
    changeArticleSettings((article) => article.fontSize = evt.target.value);
  });
  addSection(l('article_font_size'), articleSizeSelect);
  const articleJustificationSelect = createSelect(justifications, article.justification);
  articleJustificationSelect.addEventListener('change', (evt) => {
    changeArticleSettings((article) => article.justification = evt.target.value);
  });
  addSection(l('article_justification'), articleJustificationSelect);
  const articleSpacingSelect = createSelect(spacings, article.spacing);
  articleSpacingSelect.addEventListener('change', (evt) => {
    changeArticleSettings((article) => article.spacing = evt.target.value);
  });
  addSection(l('article_spacing'), articleSpacingSelect);
  // for footnotes
  const footnote = getFootnoteSettings();
  const footnoteFonts = await getFootnoteFonts();
  const footnoteFontSelect = createFontFamilySelect(footnoteFonts, footnote.fontFamily);
  footnoteFontSelect.addEventListener('change', (evt) => {
    changeFootnoteSettings((footnote) => footnote.fontFamily = evt.target.value);
  });
  addSection(l('footnote_font_family'), footnoteFontSelect);
  const footnoteSizeSelect = createFontSizeSelect(fontSizes, footnote.fontSize);
  footnoteSizeSelect.addEventListener('change', (evt) => {
    changeFootnoteSettings((footnote) => footnote.fontSize = evt.target.value);
  });
  addSection(l('footnote_font_size'), footnoteSizeSelect, true);
  // update font list when user change language settings
  const targetLangSelect = document.getElementById('to-lang-select');
  targetLangSelect.addEventListener('change', async (evt) => {
    const footnote = getFootnoteSettings();
    const footnoteFonts = await getFootnoteFonts();
    updateFontFamilySelect(footnoteFontSelect, footnoteFonts, footnote.fontFamily);
    footnoteSizeSelect.value = footnote.fontSize;
  });
  // update font lists when font availability changes
  fontAvailability.addEventListener('change', async (evt) => {
    const article = getArticleSettings();
    const articleFonts = await getArticleFonts();
    updateFontFamilySelect(articleFontSelect, articleFonts, article.fontFamily);
    const footnote = getFootnoteSettings();
    const footnoteFonts = await getFootnoteFonts();
    updateFontFamilySelect(footnoteFontSelect, footnoteFonts, footnote.fontFamily);
  });
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
  paperSelect.addEventListener('change', (evt) => {
    changeSettings((settings) => {
      const props = getPaperProperties(evt.target.value);
      settings.paper = evt.target.value;
      settings.customMargins = Object.assign({}, props.defaultMargins);
      const [ customMargins ] = document.getElementsByClassName('custom-margins');
      const inputs = customMargins.getElementsByTagName('INPUT');
      for (const input of inputs) {
        input.value = settings.customMargins[input.name];
      }
    }, true);
  });
  addSection(l('paper_size'), paperSelect);
  const marginSelect = createSelect(margins, settings.margins);
  marginSelect.addEventListener('change', (evt) => {
    changeSettings((settings) => {
      const [ customMargins ] = document.getElementsByClassName('custom-margins');
      settings.margins = evt.target.value;
      if (settings.margins === 'default') {
        customMargins.classList.add('hidden');
      } else {
        customMargins.classList.remove('hidden');
        customMargins.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });
  addSection(l('margins'), marginSelect);
  const customMargins = createCustomMarginInputs(settings.customMargins, settings.margins === 'default');
  const inputs = customMargins.getElementsByTagName('INPUT');
  const handleInput = (evt) => {
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
  };
  const handleBlur = (evt) => {
    // set the text to match what's stored in settings
    const { target } = evt;
    const settings = getSettings();
    target.value = settings.customMargins[target.name];
    target.classList.remove('invalid');
  };
  for (const input of inputs) {
    input.addEventListener('input', handleInput);
    input.addEventListener('blur', handleBlur);
  }
  addSection('', customMargins);
}

function createButtons() {
  // add buttons to bottom pane
  const finishButton = e('BUTTON', { id: 'finish-button' }, l('finish'));
  finishButton.addEventListener('click', (evt) => setEditMode('annotate'));
  const printButton = e('BUTTON', { id: 'print-button', className: 'default' }, l('print'));
  printButton.addEventListener('click', (evt) => print());
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

function createFontElements(fonts, currentValue) {
  return fonts.map(({ fontId, displayName }) => {
    const selected = (fontId === currentValue);
    const style = { fontFamily: fontId, fontSize: '13pt' };
    return e('OPTION', { value: fontId, selected, style }, displayName);
  });
}

function createFontFamilySelect(fonts, currentValue) {
  return e('SELECT', {}, createFontElements(fonts, currentValue));
}

function updateFontFamilySelect(selectElement, fonts, currentValue) {
  const currentList = [ ...selectElement.children ].map(li => li.value).join();
  const newList = fonts.map(f => f.fontId).join();
  if (newList !== currentList) {
    while (selectElement.firstChild) {
      selectElement.firstChild.remove();
    }
    selectElement.append(...createFontElements(fonts, currentValue));
  } else {
    selectElement.value = currentValue;
  }
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

function changeArticleSettings(callback) {
  const section = getArticleSettings();
  callback(section);
  applyStyles();
  updateLayout();
  saveSettings();
}

function getArticleSettings() {
  const language = getSourceLanguage();
  const script = getLanguageScript(language);
  return getScriptSpecificSettings('article', script);
}

function changeFootnoteSettings(callback) {
  const section = getFootnoteSettings();
  callback(section);
  applyStyles();
  updateLayout();
  saveSettings();
}

function getFootnoteSettings() {
  const language = getTargetLanguage();
  const script = getLanguageScript(language);
  return getScriptSpecificSettings('footnote', script);
}

async function getArticleFonts() {
  const language = getSourceLanguage();
  const script = getLanguageScript(language);
  return getAvailableFonts(script);
}

async function getFootnoteFonts() {
  const language = getTargetLanguage();
  const script = getLanguageScript(language);
  return getAvailableFonts(script);
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
  button.addEventListener('click', (evt) => {
    if (collapsed) {
      reopenSideBar();
      reopenedManually = true;
    } else {
      collapseSideBar();
    }
  });
  window.addEventListener('resize', (evt) => initializeAutoCollapse());
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
