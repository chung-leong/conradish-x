import { attachRippleEffectHandlers } from './ui.js';
import { getSourceLanguages, getTargetLanguages } from './translation.js';
import { getPossibleSettings, applyStyles } from './settings.js';
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
  paperSelect.value = settings.paper;
  const marginSelect = addSelect(top, 'Margins', possible.margins, (option, margin) => {
    option.textContent = margin.label;
    option.value = margin.value;
  });
  const customMargin = (settings.margins instanceof Object);
  marginSelect.value = (customMargin) ? 'custom' : 'default';
  const marginInputs = addCustomMarginInputs(top);
  marginInputs.container.style.display = (customMargin) ? 'block' : 'none';
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

function changeSettings(callback) {
  const settings = getSettings();
  callback(settings);
  applyStyles();
  saveSettings();
}
