import { getSettings } from './settings.js';
let sourceLanguage;
let sourceVariant;

export { getMessage as l, getMessageWithCardinal as lc };

let fallbackMessages;
let fallBackLanguageCode;

export async function initializeLocalization() {
  const { getMessage } = chrome.i18n;
  if (getMessage) {
    return;
  }
  // load the [locale]/message.json and deal with ourselves
  const lang = getUILanguage();
  fallbackMessages = await loadLocale(lang);
}

const localeMessageLists = {};

export async function initializeSpecificLocale(lang) {
  if (!localeMessageLists[lang]) {
    localeMessageLists[lang] = await loadLocale(lang);
  }
}

async function loadLocale(lang) {
  const manifest = await loadJSON('manifest.json');
  const messages = await loadJSON(`_locales/${manifest.default_locale}/messages.json`);
  try {
    if (lang !== manifest.default_locale) {
      const localeMessages = await loadJSON(`_locales/${lang}/messages.json`);
      Object.assign(messages, localeMessages);
    }
  } catch (e) {
  }
  return messages;
}

async function loadJSON(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  const json = await res.json();
  return json;
}

export function getMessage(name, substitutions) {
  const { getMessage } = chrome.i18n;
  if (getMessage) {
    return getMessage(name, substitutions);
  } else {
    const entry = fallbackMessages[name];
    if (entry) {
      return replacePlaceholders(entry.message, substitutions);
    }
    return '';
  }
}

export function getLocaleMessage(name, lang, substitutions) {
  const messages = localeMessageLists[lang];
  const entry = messages[name];
  if (entry) {
    return replacePlaceholders(entry.message, substitutions);
  }
  return '';
}

function replacePlaceholders(message, substitutions) {
  if (!(substitutions instanceof Array)) {
    substitutions = (substitutions) ? [ substitutions ] : [];
  }
  return message.replace(/\$(\w+)\$/g, (m0, m1) => {
    const key = m1.toLowerCase();
    const placeholder = entry.placeholders[key];
    const index = parseInt(placeholder.content.substr(1)) - 1;
    const value = substitutions[index];
    return (value !== undefined) ? value : '';
  });
}

export function getMessageWithCardinal(name, number) {
  const f = getDeclensionFunction();
  const declension = f(number);
  if (declension) {
    name = `${name}_${declension}`;
  }
  return getMessage(name, [ number ]);
}

export function getUILanguage() {
  const { getUILanguage } = chrome.i18n;
  if (getUILanguage) {
    return getUILanguage();
  } else {
    if (!fallBackLanguageCode) {
      // absolutely ridiculous way of detecting the current locale
      const lang = fallBackLanguageCode = navigator.language.replace(/\-.*/g, '').toLowerCase();
      // March is different in Norwegian and Danish
      const date = new Date('2000-03-05T00:00:00.000Z');
      const dateOpts = { weekday: 'long', month: 'long' };
      const dateString = date.toLocaleDateString(undefined, dateOpts);
      if (dateString !== date.toLocaleDateString(lang, dateOpts)) {
        for (const { code } of languages) {
          try {
            // if the locale is unsupported, it falls back to "lang", which we know will produce a no-match
            if (code !== lang && dateString === date.toLocaleDateString([ code, lang ], dateOpts)) {
              fallBackLanguageCode = code;
              break;
            }
          } catch (e) {
          }
        }
      }
    }
    if (fallBackLanguageCode === 'no') {
      // use Bokmål when Norwegian is detected
      fallBackLanguageCode = 'nb';
    }
    return fallBackLanguageCode;
  }
}

export function getLanguageScript(lang) {
  if (lang === sourceLanguage) {
    // take variant into consideration
    lang = getSourceLanguage(true);
  }
  for (const { code, script, variants } of languages) {
    if (code === lang) {
      return script;
    }
    if (variants) {
      for (const { code, script } of variants) {
        if (code === lang) {
          return script;
        }
      }
    }
  }
  return 'Latn';
}

export function getScriptDirection(script) {
  return rightToLeftScripts.includes(script) ? 'rtl' : 'ltr';
}

export function getLanguageDirection(lang) {
  const script = getLanguageScript(lang);
  return getScriptDirection(script);
}

export async function detectLanguage(text) {
  return new Promise((resolve) => {
    chrome.i18n.detectLanguage(text, (result) => {
      let lang;
      for (const { language, percentage } of result.languages) {
        if (percentage >= 50) {
          lang = language;
        }
      }
      resolve(lang);
    });
  });
}

export async function detectDirection(text) {
  const lang = await detectLanguage(text);
  return getLanguageDirection(lang);
}

export function getSourceLanguage(variant = false) {
  if (variant && sourceVariant) {
    return `${sourceLanguage}-${sourceVariant}`;
  } else {
    return sourceLanguage;
  }
}

export function setSourceLanguage(lang) {
  sourceLanguage = lang;
}

export function setSourceVariant(country) {
  sourceVariant = country;
}

export function getTargetLanguage() {
  const settings = getSettings();
  return settings.target;
}

export function getSourceLanguages() {
  const unknown = { value: '', label: getMessage('language_unknown') };
  const list = [];
  for (const { code, name } of languages) {
    const label = getLanguageName(code, 'from');
    list.push({ value: code, label });
  }
  list.sort((a, b) => a.label.localeCompare(b.label))
  list.unshift(unknown);
  return list;
}

export function getTargetLanguages() {
  const none = { value: '', label: getMessage('language_none') };
  const list = [];
  for (const { code, name, variants } of languages) {
    if (variants) {
      for (const { code, name } of variants) {
        const label = getLanguageName(code, 'to');
        list.push({ value: code, label });
      }
    } else {
      const label = getLanguageName(code, 'to');
      list.push({ value: code, label });
    }
  }
  list.sort((a, b) => a.label.localeCompare(b.label))
  list.unshift(none);
  return list;
}

function getLanguageName(code, context) {
  const f = getTransformFunction(context);
  const key = 'language_' + code.replace('-', '_').toLowerCase();
  const dictionaryForm = getMessage(key);
  return f(dictionaryForm);
}

let transformFunctions = {};

function getTransformFunction(context) {
  let f = transformFunctions[context];
  if (!f) {
    const transformText = getMessage(`language_transform_${context}`);
    if (transformText) {
      const transformStrings = transformText.split(/\s*,\s*/);
      const transforms = transformStrings.map((transformString) => {
        const [ pattern, replacement ] = transformString.split(/\s*=>\s*/);
        const regExp = new RegExp(pattern, 'ug');
        return { regExp, replacement };
      });
      f = (s) => {
        for (const { regExp, replacement } of transforms) {
          s = s.replace(regExp, replacement);
        }
        return s;
      };
    } else {
      f = s => s;
    }
    transformFunctions[context] = f;
  }
  return f;
}

let declensionFunction;

function getDeclensionFunction() {
  if (!declensionFunction) {
    const cardinalDeclensions = getMessage('cardinal_declensions');
    if (cardinalDeclensions) {
      const declensionRanges = [];
      let defaultDeclension;
      for (const entry of cardinalDeclensions.split(/\s*,\s*/)) {
        const [ rangeString, declension ] = entry.split(/\s*=>\s*/);
        for (const range of rangeString.split(/\s+/)) {
          if (range === '*') {
            defaultDeclension = declension;
          } else {
            const numbers = range.split(/\s*\-\s*/).map(n => parseInt(n));
            const start = numbers[0];
            const end = (numbers.length === 1) ? numbers[0] : numbers[1];
            declensionRanges.push({ declension, start, end });
          }
        }
      }
      declensionFunction = (n) => {
        for (const { declension, start, end } of declensionRanges) {
          if (n >= start && n <= end) {
            return declension;
          }
        }
        return defaultDeclension;
      };
    } else {
      declensionFunction = n => (n === 1) ? 'sg' : 'pl';
    }
  }
  return declensionFunction;
}

export async function translate(original, sourceLang, targetLang, singleWord) {
  const result = {
    term: { text: original, lang: sourceLang },
    translation: { text: '', lang: targetLang },
  };
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  let lowerCaseAlt;
  // unless the language is German, query the word in lowercase
  if (!capitalizingLangs.includes(sourceLang)) {
    if (singleWord && isCapitalized(original, sourceLang)) {
      try {
        lowerCaseAlt = original.toLocaleLowerCase(sourceLang);
      } catch (e) {
      }
    }
  }
  const query = lowerCaseAlt || original;
  const sp = url.searchParams;
  sp.append('client', 'gtx');
  sp.append('source', 'input');
  sp.append('dt', 't'); // translation
  sp.append('dt', 'at'); // alternative translations
  sp.append('dt', 'in'); // query inflections
  sp.append('dj', '1');
  sp.append('q', query);
  sp.append('sl', sourceLang);
  sp.append('tl', targetLang);
  const retrieve = async () => {
    let retrievalCount = 0;
    let delay = 250;
    do {
      retrievalCount++;
      try {
        const response = await fetch(url);
        if (response.status !== 200) {
          throw new Error(response.statusText);
        }
        const json = await response.json();
        if (!(json.sentences instanceof Array)) {
          throw new Error('Unexpected response');
        }
        return json;
      } catch (e) {
        console.error(e.message);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    } while (retrievalCount <= 10);
    return { sentences: [] };
  };
  const json = await retrieve();
  const sentences = json.sentences.filter(s => !!s.trans);
  const trans = sentences.map(s => s.trans).join('');
  result.translation.text = trans;
  if (json.alternative_translations) {
    const phrases = json.alternative_translations;
    const alternatives = [];
    if (phrases.length === 1) {
      // only one phrase was translated
      for (const item of phrases[0].alternative.slice(1)) {
        const phrase = item.word_postproc;
        if (phrase !== trans) {
          alternatives.push(phrase);
        }
      }
    } else {
      // multiple phrases--need to replace the top choice with alternative
      for (const phrase of phrases) {
        const topChoice = phrase.alternative[0].word_postproc;
        for (const item of phrase.alternative.slice(1)) {
          const altChoice = item.word_postproc;
          const phrase = trans.replace(topChoice, altChoice);
          if (phrase !== trans) {
            alternatives.push(phrase);
          }
        }
      }
    }
    if (alternatives.length > 0) {
      result.alternatives = alternatives;
    }
  }
  let useLowerCase = false;
  if (json.query_inflections) {
    const inflections = [];
    for (const qi of filterInflections(json.query_inflections, sourceLang)) {
      inflections.push({ written_form: qi.written_form, ...qi.features });
      if (!useLowerCase && isLowerCase(qi.written_form, sourceLang)) {
        useLowerCase = true;
      }
    }
    if (Object.entries(inflections).length > 0) {
      result.inflections = inflections;
    }
  } else {
    // use the lowercase version if the translation isn't in uppercase
    const targetScript = getLanguageScript(targetLang);
    if (mixedCaseScript.includes(targetScript)) {
      if (isLowerCase(trans, sourceLang)) {
        useLowerCase = true;
      }
    }
  }
  if (useLowerCase) {
    result.term.text = original.toLocaleLowerCase(sourceLang);
    result.translation.text = trans.toLocaleLowerCase(targetLang);
  }
  return result;
}

function filterInflections(qis, sourceLang) {
  qis = qis.filter(q => q.written_form && q.features);
  if (sourceLang === 'sk') {
    if (qis.find(q => q.features.hasOwnProperty('tense'))) {
      for (let i = 0; i < qis.length; i++) {
        const w = qis[i].written_form;
        if (w.startsWith('ne')) {
          // might be negative--look for positive form
          const p = w.substr(2);
          if (qis.find(q => q.written_form === p)) {
            // remove it
            qis.splice(i, 1);
            i--;
          }
        }
      }
    }
  }
  return qis;
}

export function capitalize(word, lang) {
  return word.charAt(0).toLocaleUpperCase(lang) + word.substr(1);
}

export function isCapitalized(word, lang) {
  const c = word.charAt(0);
  if (c.toLocaleLowerCase(lang) !== c) {
    // see if it's all-cap
    if (word.toLocaleUpperCase(lang) !== word) {
      return true;
    }
  }
  return false;
}

function isLowerCase(word, lang) {
  return (word.toLocaleLowerCase(lang) === word);
}

const languages = [
  { // Afrikaans
    code: 'af',
    script: 'Latn',
    inflections: 'available',
  },
  { // Albanian
    code: 'sq',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Amharic
    code: 'am',
    script: 'Ethi',
    inflections: 'unavailable',
  },
  { // Arabic
    code: 'ar',
    script: 'Arab',
    inflections: 'available',
  },
  { // Armenian
    code: 'hy',
    script: 'Armn',
    inflections: 'unavailable',
  },
  { // Azerbaijani
    code: 'az',
    script: 'Latn',
    inflections: 'available',
  },
  { // Basque
    code: 'eu',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Belarusian
    code: 'be',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Bengali
    code: 'bn',
    script: 'Beng',
    inflections: 'unavailable',
  },
  { // Bosnian
    code: 'bs',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Bulgarian
    code: 'bg',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Catalan
    code: 'ca',
    script: 'Latn',
    inflections: 'available',
  },
  { // Cebuano
    code: 'ceb',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Chichewa
    code: 'ny',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Chinese
    code: 'zh',
    script: 'Hani',
    variants: [
      { // Chinese (Simplified)
        code: 'zh-CN',
        script: 'Hans'
      },
      { // Chinese (Traditional)
        code: 'zh-TW',
        script: 'Hant',
      },
    ],
    inflections: 'unavailable',
  },
  { // Corsican
    code: 'co',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Croatian
    code: 'hr',
    script: 'Latn',
    inflections: 'available',
  },
  { // Czech
    code: 'cs',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Danish
    code: 'da',
    script: 'Latn',
    inflections: 'available',
  },
  { // Dutch
    code: 'nl',
    script: 'Latn',
    inflections: 'available',
  },
  { // English
    code: 'en',
    script: 'Latn',
    inflections: 'available',
  },
  { // Esperanto
    code: 'eo',
    script: 'Latn',
    inflections: 'available',
  },
  { // Estonian
    code: 'et',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Filipino
    code: 'tl',
    script: 'Latn',
    inflections: 'available',
  },
  { // Finnish
    code: 'fi',
    script: 'Latn',
    inflections: 'available',
  },
  { // French
    code: 'fr',
    script: 'Latn',
    inflections: 'available',
  },
  { // Frisian
    code: 'fy',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Galician
    code: 'gl',
    script: 'Latn',
    inflections: 'available',
  },
  { // Georgian
    code: 'ka',
    script: 'Geor',
    inflections: 'unavailable',
  },
  { // German
    code: 'de',
    script: 'Latn',
    inflections: 'available',
  },
  { // Greek
    code: 'el',
    script: 'Grek',
    inflections: 'unavailable',
  },
  { // Gujarati
    code: 'gu',
    script: 'Gujr',
    inflections: 'available',
  },
  { // Haitian Creole
    code: 'ht',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Hausa
    code: 'ha',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Hawaiian
    code: 'haw',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Hebrew
    code: 'iw',
    script: 'Hebr',
    inflections: 'available',
  },
  { // Hindi
    code: 'hi',
    script: 'Deva',
    inflections: 'available',
  },
  { // Hmong
    code: 'hmn',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Hungarian
    code: 'hu',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Icelandic
    code: 'is',
    script: 'Latn',
    inflections: 'available',
  },
  { // Igbo
    code: 'ig',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Indonesian
    code: 'id',
    script: 'Latn',
    inflections: 'available',
  },
  { // Irish
    code: 'ga',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Italian
    code: 'it',
    script: 'Latn',
    inflections: 'available',
  },
  { // Japanese
    code: 'ja',
    script: 'Jpan',
    inflections: 'unavailable',
  },
  { // Javanese
    code: 'jw',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Kannada
    code: 'kn',
    script: 'Knda',
    inflections: 'available',
  },
  { // Kazakh
    code: 'kk',
    script: 'Cyrl',
    inflections: 'unavailable',
  },
  { // Khmer
    code: 'km',
    script: 'Khmr',
    inflections: 'unavailable',
  },
  { // Kinyarwanda
    code: 'rw',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Korean
    code: 'ko',
    script: 'Hang',
    inflections: 'unavailable',
  },
  { // Kurdish (Kurmanji)
    code: 'ku',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Kyrgyz
    code: 'ky',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Lao
    code: 'lo',
    script: 'Laoo',
    inflections: 'unavailable',
  },
  { // Latin
    code: 'la',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Latvian
    code: 'lv',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Lithuanian
    code: 'lt',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Luxembourgish
    code: 'lb',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Macedonian
    code: 'mk',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Malagasy
    code: 'mg',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Malay
    code: 'ms',
    script: 'Latn',
    inflections: 'available',
  },
  { // Malayalam
    code: 'ml',
    script: 'Mlym',
    inflections: 'available',
  },
  { // Maltese
    code: 'mt',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Maori
    code: 'mi',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Marathi
    code: 'mr',
    script: 'Deva',
    inflections: 'unavailable',
  },
  { // Mongolian
    code: 'mn',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Myanmar (Burmese)
    code: 'my',
    script: 'Mymr',
    inflections: 'unavailable',
  },
  { // Nepali
    code: 'ne',
    script: 'Deva',
    inflections: 'unavailable',
  },
  { // Norwegian
    code: 'no',
    script: 'Latn',
    inflections: 'available',
  },
  { // Odia (Oriya)
    code: 'or',
    script: 'Orya',
    inflections: 'unavailable',
  },
  { // Pashto
    code: 'ps',
    script: 'Arab',
    inflections: 'unavailable',
  },
  { // Persian
    code: 'fa',
    script: 'Arab',
    inflections: 'available',
  },
  { // Polish
    code: 'pl',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Portuguese
    code: 'pt',
    script: 'Latn',
    inflections: 'available',
  },
  { // Punjabi
    code: 'pa',
    script: 'Guru',
    inflections: 'available',
  },
  { // Romanian
    code: 'ro',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Russian
    code: 'ru',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Samoan
    code: 'sm',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Scots Gaelic
    code: 'gd',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Serbian
    code: 'sr',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Sesotho
    code: 'st',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Shona
    code: 'sn',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Sindhi
    code: 'sd',
    script: 'Arab',
    inflections: 'unavailable',
  },
  { // Sinhala
    code: 'si',
    script: 'Sinh',
    inflections: 'unavailable',
  },
  { // Slovak
    code: 'sk',
    script: 'Latn',
    inflections: 'available',
  },
  { // Slovenian
    code: 'sl',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Somali
    code: 'so',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Spanish
    code: 'es',
    script: 'Latn',
    inflections: 'available',
  },
  { // Sundanese
    code: 'su',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Swahili
    code: 'sw',
    script: 'Latn',
    inflections: 'available',
  },
  { // Swedish
    code: 'sv',
    script: 'Latn',
    inflections: 'available',
  },
  { // Tajik
    code: 'tg',
    script: 'Cyrl',
    inflections: 'unavailable',
  },
  { // Tamil
    code: 'ta',
    script: 'Taml',
    inflections: 'unavailable',
  },
  { // Tatar
    code: 'tt',
    script: 'Cyrl',
    inflections: 'unavailable',
  },
  { // Telugu
    code: 'te',
    script: 'Telu',
    inflections: 'unavailable',
  },
  { // Thai
    code: 'th',
    script: 'Thai',
    inflections: 'unavailable',
  },
  { // Turkish
    code: 'tr',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Turkmen
    code: 'tk',
    script: 'Cyrl',
    inflections: 'unavailable',
  },
  { // Ukrainian
    code: 'uk',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Urdu
    code: 'ur',
    script: 'Arab',
    inflections: 'available',
  },
  { // Uyghur
    code: 'ug',
    script: 'Arab',
    inflections: 'unavailable',
  },
  { // Uzbek
    code: 'uz',
    script: 'Cyrl',
    inflections: 'available',
  },
  { // Vietnamese
    code: 'vi',
    script: 'Latn',
    inflections: 'available',
  },
  { // Welsh
    code: 'cy',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Xhosa
    code: 'xh',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Yiddish
    code: 'yi',
    script: 'Hebr',
    inflections: 'unavailable',
  },
  { // Yoruba
    code: 'yo',
    script: 'Latn',
    inflections: 'unavailable',
  },
  { // Zulu
    code: 'zu',
    script: 'Latn',
    inflections: 'available',
  },
];

const capitalizingLangs = [ 'de', 'lb' ];
const rightToLeftScripts = [ 'Arab', 'Hebr' ];
const mixedCaseScript = [ 'Latn', 'Cyrl' ];
