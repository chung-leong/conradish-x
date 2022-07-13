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
        if (selectorText && selectorText.startsWith('#article-text')) {
          let m;
          if (selectorText === '#article-text table') {
            const { top, bottom, left, right } = page.margins;
            const { width, height } = page;
            rule.style.width = `calc(${width} - ${left} - ${right} - 2mm)`;
            rule.style.maxheight = `calc(${height} - ${top} - ${bottom} - 5mm - 10mm)`;
          } else if (m = /#article\-text\.([A-Z][a-z]{3})\s*(.*)/.exec(selectorText)) {
            const script = m[1], children = m[2];
            const article = getScriptSpecificSettings('article', script);
            if (!children) {
              const justify = [ 'text', 'both' ].includes(article.justification);
              rule.style.fontFamily = `${article.fontFamily}, sans-serif`;
              rule.style.fontSize = article.fontSize;
              rule.style.lineHeight = article.spacing;
              rule.style.textAlign = (justify) ? 'justify' : 'start';
            } else if (children.startsWith(':is(h1')) {
              const justify = [ 'both' ].includes(article.justification);
              rule.style.textAlign = (justify) ? 'justify' : 'start';
            }
          }
        } else if (selectorText === '.footnote-number') {
          rule.style.fontSize = `calc(${settings.article.fontSize} * 5 / 6)`;
        } else if (selectorText === 'table .footnote-number') {
          rule.style.fontSize = `calc(${settings.article.fontSize} * 5 / 6 * 0.8)`;
        } else if (selectorText && selectorText.startsWith('.footnote-item')) {
          let m;
          if (m = /\.footnote\-item\.([A-Z][a-z]{3})/.exec(selectorText)) {
            const script = m[1];
            const footnote = getScriptSpecificSettings('footnote', script);
            rule.style.fontFamily = `${footnote.fontFamily}, sans-serif`;
            rule.style.fontSize = footnote.fontSize;
          } else if (m = /\.footnote\-item \.term\.([A-Z][a-z]{3})/.exec(selectorText)) {
            const script = m[1];
            const article = getScriptSpecificSettings('article', script);
            rule.style.fontFamily = `${article.fontFamily}, sans-serif`;
          }
        } else if (selectorText === '#article-content') {
          rule.style.paddingLeft = page.margins.left;
          // account for the 1px used by the footer-pusher
          rule.style.paddingRight = `calc(${page.margins.right} - 1px)`;
          rule.style.paddingTop = page.margins.top;
          rule.style.paddingBottom = page.margins.bottom;
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
  const codes = (navigator.languages[0] || 'en-US').toLowerCase().split('-');
  const target = codes[0];
  const country = codes[1] || codes[0];
  const paper = letterCountries.includes(country) ? 'letter' : 'A4';
  const getTextSize = (scriptGroup) => {
    switch (scriptGroup) {
      case 'european':
        return 12;
      default:
        return 14;
    }
  };
  const articleText = (scriptGroup) => {
    return {
      // insert default font later
      fontFamily: '',
      fontSize: `${getTextSize(scriptGroup)}pt`,
      justification: 'text',
      spacing: 'normal',
    };
  };
  const footnoteText = (scriptGroup) => {
    return {
      fontFamily: '',
      fontSize: `${getTextSize(scriptGroup) - 2}pt`,
    };
  };
  const settings = {
    target: codes[0],
    paper: paper,
    margins: 'default',
    customMargins: { ...paperProperties[paper].defaultMargins },
    contextMenu: true,
    filter: 'automatic',
    heading: 'H2',
    article: articleText('european'),
    articleArab: articleText('middle-eastern'),
    articleArmn: articleText('european'),
    articleBeng: articleText('south-asian'),
    articleCyrl: articleText('european'),
    articleDeva: articleText('south-asian'),
    articleEthi: articleText('african'),
    articleGeor: articleText('european'),
    articleGrek: articleText('european'),
    articleGujr: articleText('south-asian'),
    articleGuru: articleText('south-asian'),
    articleHang: articleText('east-asian'),
    articleHans: articleText('east-asian'),
    articleHant: articleText('east-asian'),
    articleHebr: articleText('middle-eastern'),
    articleJpan: articleText('east-asian'),
    articleKhmr: articleText('southeast-asian'),
    articleKnda: articleText('south-asian'),
    articleLaoo: articleText('southeast-asian'),
    articleMlym: articleText('south-asian'),
    articleMymr: articleText('southeast-asian'),
    articleOrya: articleText('south-asian'),
    articleSinh: articleText('south-asian'),
    articleTaml: articleText('south-asian'),
    articleTelu: articleText('south-asian'),
    articleThaa: articleText('south-asian'),
    articleThai: articleText('southeast-asian'),
    footnote: footnoteText('european'),
    footnoteArab: footnoteText('middle-eastern'),
    footnoteArmn: footnoteText('european'),
    footnoteBeng: footnoteText('south-asian'),
    footnoteCyrl: footnoteText('european'),
    footnoteDeva: footnoteText('south-asian'),
    footnoteEthi: footnoteText('african'),
    footnoteGeor: footnoteText('european'),
    footnoteGrek: footnoteText('european'),
    footnoteGujr: footnoteText('south-asian'),
    footnoteGuru: footnoteText('south-asian'),
    footnoteHang: footnoteText('east-asian'),
    footnoteHans: footnoteText('east-asian'),
    footnoteHant: footnoteText('east-asian'),
    footnoteHebr: footnoteText('middle-eastern'),
    footnoteJpan: footnoteText('east-asian'),
    footnoteKhmr: footnoteText('southeast-asian'),
    footnoteKnda: footnoteText('south-asian'),
    footnoteLaoo: footnoteText('southeast-asian'),
    footnoteMlym: footnoteText('south-asian'),
    footnoteMymr: footnoteText('southeast-asian'),
    footnoteOrya: footnoteText('south-asian'),
    footnoteSinh: footnoteText('south-asian'),
    footnoteTaml: footnoteText('south-asian'),
    footnoteTelu: footnoteText('south-asian'),
    footnoteThaa: footnoteText('south-asian'),
    footnoteThai: footnoteText('southeast-asian'),
    fonts: [],
    fontsArab: [],
    fontsArmn: [],
    fontsBeng: [],
    fontsCyrl: [],
    fontsDeva: [],
    fontsEthi: [],
    fontsGeor: [],
    fontsGrek: [],
    fontsGujr: [],
    fontsGuru: [],
    fontsHang: [],
    fontsHans: [],
    fontsHant: [],
    fontsHebr: [],
    fontsJpan: [],
    fontsKhmr: [],
    fontsKnda: [],
    fontsLaoo: [],
    fontsMlym: [],
    fontsMymr: [],
    fontsOrya: [],
    fontsSinh: [],
    fontsTaml: [],
    fontsTelu: [],
    fontsThaa: [],
    fontsThai: [],
  };
  return settings;
}

export function getScriptSpecificSettings(name, script) {
  const settings = getSettings();
  const key = name + (script === 'Latn' ? '' : script);
  return settings[key];
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
