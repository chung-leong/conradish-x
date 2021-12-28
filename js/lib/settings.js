import { getSettings, saveSettings } from './storage.js';
import { l } from './i18n.js';

export { getSettings, saveSettings };

let footerMarginTop;

export function applyStyles() {
  const settings = getSettings();
  const page = getPageProperties();
  for (const styleSheet of document.styleSheets) {
    if (styleSheet.href.endsWith('article.css')) {
      for (const rule of styleSheet.cssRules) {
        const { selectorText, cssText } = rule;
        if (selectorText === '#article-text') {
          const justify = [ 'text', 'both' ].includes(settings.article.justification);
          rule.style.fontFamily = settings.article.fontFamily;
          rule.style.fontSize = settings.article.fontSize;
          rule.style.lineHeight = settings.article.spacing;
          rule.style.textAlign = (justify) ? 'justify' : 'start';
        } else if (/#article\-text h\d/.test(selectorText)) {
          const justify = [ 'both' ].includes(settings.article.justification);
          rule.style.textAlign = (justify) ? 'justify' : 'start';
        } else if (selectorText === '#article-content') {
          rule.style.paddingLeft = page.margins.left;
          // account for the 1px used by the footer-pusher
          rule.style.paddingRight = `calc(${page.margins.right} - 1px)`;
          rule.style.paddingTop = page.margins.top;
          rule.style.paddingBottom = page.margins.bottom;
        } else if (selectorText === '#article-text sup') {
          rule.style.fontSize = `calc(${settings.article.fontSize} * 5 / 6)`;
        } else if (selectorText === '#article-text table') {
          const { top, bottom, left, right } = page.margins;
          const { width, height } = page;
          rule.style.width = `calc(${width} - ${left} - ${right} - 2mm)`;
          rule.style.maxheight = `calc(${height} - ${top} - ${bottom} - 5mm - 10mm)`;
        } else if (selectorText === '.footer-content') {
          rule.style.fontFamily = settings.footnote.fontFamily;
          rule.style.fontSize = settings.footnote.fontSize;
          // set the bottom margin, which provides the spacing between
          // contents in consecutive pages
          const { top, bottom } = page.margins;
          rule.style.marginBottom = `calc(${top} + ${bottom})`;
          // we need to know the footer's top margin for the
          // purpose of calculating the pusher height
          footerMarginTop = rule.style.marginTop;
        } else if (selectorText === '.paper') {
          rule.style.width = page.width;
          rule.style.height = page.height;
        } else if (!selectorText && cssText.startsWith('@page')) {
          rule.style.size = page.size;
        }
      }
    }
  }
}

export function getDefaultSettings() {
  const article = {
    fontFamily: 'Arial',
    fontSize: '12pt',
    justification: 'text',
    spacing: 'normal',
  };
  const footnote = {
    fontFamily: 'Arial',
    fontSize: '10pt'
  };
  const codes = (navigator.languages[0] || 'en-US').toLowerCase().split('-');
  const target = codes[0];
  const country = codes[1] || codes[0];
  const paper = letterCountries.includes(country) ? 'letter' : 'A4';
  const margins = 'default';
  const customMargins = Object.assign({}, paperProperties[paper].defaultMargins);
  const filter = 'automatic';
  const contextMenu = true;
  const heading = 'H2';
  return {
    target, article, footnote, paper, margins, customMargins,
    contextMenu, filter, heading,
  };
}

export function getPaperProperties(paper) {
  return paperProperties[paper];
}

export function getPageProperties() {
  const settings = getSettings();
  const paper = getPaperProperties(settings.paper);
  const { width, height, size, defaultMargins } = paper;
  const margins = (settings.margins === 'custom') ? settings.customMargins : defaultMargins;
  return { width, height, size, margins, footerGap: footerMarginTop };
}

const paperProperties = {
  A4: {
    size: 'A4 portrait',
    width: '210mm',
    height: '297mm',
    defaultMargins: {
      top: '25mm',
      left: '25mm',
      bottom: '25mm',
      right: '25mm',
    },
  },
  letter: {
    size: 'letter portrait',
    width: '8.5in',
    height: '11in',
    defaultMargins: {
      top: '1in',
      left: '1in',
      bottom: '1in',
      right: '1in',
    },
  },
};

const letterCountries = [
  'us',
  'ca',
  'mx',
  've',
  'gt',
  'cl',
  'sv',
  'cr',
  'ni',
  'pa',
  'co',
  'ph',
];
