import { getSettings } from './settings.js';
let sourceLanguage;

export { getMessage as l, getMessageWithCardinal as lc };

export function getMessage(name, substitutions) {
  const { getMessage } = chrome.i18n;
  if (getMessage) {
    return getMessage(name, substitutions);
  }
}

export function getMessageWithCardinal(name, number) {
  const f = getDeclensionFunction();
  const declension = f(number);
  if (declension) {
    name = `${name}_${declension}`;
  }
  console.log({ name, number });
  return getMessage(name, [ number ]);
}

export function getUILanguage() {
  const { getUILanguage } = chrome.i18n;
  if (getUILanguage) {
    return getUILanguage();
  }
}

export function getSourceLanguage() {
  return sourceLanguage;
}

export function setSourceLanguage(lang) {
  sourceLanguage = lang;
}

export function getTargetLanguage() {
  const settings = getSettings();
  return settings.target;
}

export function getSourceLanguages() {
  const unknown = { value: '', label: 'Unknown' };
  const list = [ unknown ];
  for (const { code, name } of languages) {
    const label = getLanguageName(code, 'from');
    list.push({ value: code, label });
  }
  return list;
}

export function getTargetLanguages() {
  const none = { value: '', label: 'None' };
  const list = [ none ];
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
        const regExp = new RegExp(pattern);
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
  const result = { term: original, lang: `${sourceLang},${targetLang}` };
  try {
    const url = new URL('https://clients5.google.com/translate_a/t');
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
    url.searchParams.set('client', 'dict-chrome-ex');
    url.searchParams.set('q', query);
    url.searchParams.set('sl', sourceLang);
    url.searchParams.set('tl', targetLang);
    const response = await fetch(url);
    const json = await response.json();
    if (json.sentences instanceof Array) {
      const sentences = json.sentences.filter(s => !!s.trans);
      const trans = sentences.map(s => s.trans).join('');
      result.translation = trans;
      // return the lowercase version if the translation isn't in uppercase
      if (lowerCaseAlt && !isCapitalized(trans)) {
        result.term = lowerCaseAlt;
      }
      if (json.alternative_translations) {
        const alternatives = [];
        for (const at of json.alternative_translations) {
          for (const item of at.alternative.slice(1)) {
            alternatives.push(item.word_postproc);
          }
        }
        if (alternatives.length > 0) {
          result.alternatives = alternatives;
        }
      }
      if (json.query_inflections) {
        const inflections = {};
        for (const qi of json.query_inflections) {
          const word = qi.written_form;
          const features = qi.features;
          if (word && features) {
            inflections[word] = features;
          }
        }
        if (Object.entries(inflections).length > 0) {
          result.inflections = inflections;
        }
        if (result.term !== original && lowerCaseAlt) {
          // use inflection info to determine whether word should be capitalized
          if (inflections[original]) {
            result.term = original;
          }
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  return result;
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

const languages = [
  { // Afrikaans
    code: 'af',
    script: 'Latn',
  },
  { // Albanian
    code: 'sq',
    script: 'Latn',
  },
  { // Amharic
    code: 'am',
    script: 'Ethi',
  },
  { // Arabic
    code: 'ar',
    script: 'Arab',
  },
  { // Armenian
    code: 'hy',
    script: 'Armn',
  },
  { // Azerbaijani
    code: 'az',
    script: 'Latn',
  },
  { // Basque
    code: 'eu',
    script: 'Latn',
  },
  { // Belarusian
    code: 'be',
    script: 'Cyrl',
  },
  { // Bengali
    code: 'bn',
    script: 'Beng',
  },
  { // Bosnian
    code: 'bs',
    script: 'Latn',
  },
  { // Bulgarian
    code: 'bg',
    script: 'Cyrl',
  },
  { // Catalan
    code: 'ca',
    script: 'Latn',
  },
  { // Cebuano
    code: 'ceb',
    script: 'Latn',
  },
  { // Chichewa
    code: 'ny',
    script: 'Latn',
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
    ]
  },
  { // Corsican
    code: 'co',
    script: 'Latn',
  },
  { // Croatian
    code: 'hr',
    script: 'Latn',
  },
  { // Czech
    code: 'cs',
    script: 'Latn',
  },
  { // Danish
    code: 'da',
    script: 'Latn',
  },
  { // Dutch
    code: 'nl',
    script: 'Latn',
  },
  { // English
    code: 'en',
    script: 'Latn',
  },
  { // Esperanto
    code: 'eo',
    script: 'Latn',
  },
  { // Estonian
    code: 'et',
    script: 'Latn',
  },
  { // Filipino
    code: 'tl',
    script: 'Latn',
  },
  { // Finnish
    code: 'fi',
    script: 'Latn',
  },
  { // French
    code: 'fr',
    script: 'Latn',
  },
  { // Frisian
    code: 'fy',
    script: 'Latn',
  },
  { // Galician
    code: 'gl',
    script: 'Latn',
  },
  { // Georgian
    code: 'ka',
    script: 'Geor',
  },
  { // German
    code: 'de',
    script: 'Latn',
  },
  { // Greek
    code: 'el',
    script: 'Grek',
  },
  { // Gujarati
    code: 'gu',
    script: 'Gujr'
  },
  { // Haitian Creole
    code: 'ht',
    script: 'Latn',
  },
  { // Hausa
    code: 'ha',
    script: 'Latn',
  },
  { // Hawaiian
    code: 'haw',
    script: 'Latn',
  },
  { // Hebrew
    code: 'iw',
    script: 'Hebr',
  },
  { // Hindi
    code: 'hi',
    script: 'Deva',
  },
  { // Hmong
    code: 'hmn',
    script: 'Latn',
  },
  { // Hungarian
    code: 'hu',
    script: 'Latn',
  },
  { // Icelandic
    code: 'is',
    script: 'Latn',
  },
  { // Igbo
    code: 'ig',
    script: 'Latn',
  },
  { // Indonesian
    code: 'id',
    script: 'Latn',
  },
  { // Irish
    code: 'ga',
    script: 'Latn',
  },
  { // Italian
    code: 'it',
    script: 'Latn',
  },
  { // Japanese
    code: 'ja',
    script: 'Jpan',
  },
  { // Javanese
    code: 'jw',
    script: 'Latn',
  },
  { // Kannada
    code: 'kn',
    script: 'Knda',
  },
  { // Kazakh
    code: 'kk',
    script: 'Cyrl',
  },
  { // Khmer
    code: 'km',
    script: 'Khmr',
  },
  { // Kinyarwanda
    code: 'rw',
    script: 'Latn',
  },
  { // Korean
    code: 'ko',
    script: 'Hang',
  },
  { // Kurdish (Kurmanji)
    code: 'ku',
    script: 'Latn',
  },
  { // Kyrgyz
    code: 'ky',
    script: 'Cyrl',
  },
  { // Lao
    code: 'lo',
    script: 'Laoo',
  },
  { // Latin
    code: 'la',
    script: 'Latn',
  },
  { // Latvian
    code: 'lv',
    script: 'Latn',
  },
  { // Lithuanian
    code: 'lt',
    script: 'Latn',
  },
  { // Luxembourgish
    code: 'lb',
    script: 'Latn',
  },
  { // Macedonian
    code: 'mk',
    script: 'Cyrl',
  },
  { // Malagasy
    code: 'mg',
    script: 'Latn',
  },
  { // Malay
    code: 'ms',
    script: 'Latn',
  },
  { // Malayalam
    code: 'ml',
    script: 'Mlym',
  },
  { // Maltese
    code: 'mt',
    script: 'Latn',
  },
  { // Maori
    code: 'mi',
    script: 'Latn',
  },
  { // Marathi
    code: 'mr',
    script: 'Deva',
  },
  { // Mongolian
    code: 'mn',
    script: 'Cyrl',
  },
  { // Myanmar (Burmese)
    code: 'my',
    script: 'Mymr',
  },
  { // Nepali
    code: 'ne',
    script: 'Deva',
  },
  { // Norwegian
    code: 'no',
    script: 'Latn',
  },
  { // Odia (Oriya)
    code: 'or',
    script: 'Orya',
  },
  { // Pashto
    code: 'ps',
    script: 'Arab',
  },
  { // Persian
    code: 'fa',
    script: 'Arab',
  },
  { // Polish
    code: 'pl',
    script: 'Latn',
  },
  { // Portuguese
    code: 'pt',
    script: 'Latn',
  },
  { // Punjabi
    code: 'pa',
    script: 'Guru',
  },
  { // Romanian
    code: 'ro',
    script: 'Latn',
  },
  { // Russian
    code: 'ru',
    script: 'Cyrl',
  },
  { // Samoan
    code: 'sm',
    script: 'Latn',
  },
  { // Scots Gaelic
    code: 'gd',
    script: 'Latn',
  },
  { // Serbian
    code: 'sr',
    script: 'Cyrl',
  },
  { // Sesotho
    code: 'st',
    script: 'Latn',
  },
  { // Shona
    code: 'sn',
    script: 'Latn',
  },
  { // Sindhi
    code: 'sd',
    script: 'Arab',
  },
  { // Sinhala
    code: 'si',
    script: 'Sinh',
  },
  { // Slovak
    code: 'sk',
    script: 'Latn',
  },
  { // Slovenian
    code: 'sl',
    script: 'Latn',
  },
  { // Somali
    code: 'so',
    script: 'Latn',
  },
  { // Spanish
    code: 'es',
    script: 'Latn',
  },
  { // Sundanese
    code: 'su',
    script: 'Sund',
  },
  { // Swahili
    code: 'sw',
    script: 'Latn',
  },
  { // Swedish
    code: 'sv',
    script: 'Latn',
  },
  { // Tajik
    code: 'tg',
    script: 'Cyrl',
  },
  { // Tamil
    code: 'ta',
    script: 'Taml'
  },
  { // Tatar
    code: 'tt',
    script: 'Cyrl',
  },
  { // Telugu
    code: 'te',
    script: 'Telu',
  },
  { // Thai
    code: 'th',
    script: 'Thai',
  },
  { // Turkish
    code: 'tr',
    script: 'Latn',
  },
  { // Turkmen
    code: 'tk',
    script: 'cyrl',
  },
  { // Ukrainian
    code: 'uk',
    script: 'cyrl',
  },
  { // Urdu
    code: 'ur',
    script: 'Arab',
  },
  { // Uyghur
    code: 'ug',
    script: 'Arab',
  },
  { // Uzbek
    code: 'uz',
    script: 'cyrl',
  },
  { // Vietnamese
    code: 'vi',
    script: 'Latn',
  },
  { // Welsh
    code: 'cy',
    script: 'Latn',
  },
  { // Xhosa
    code: 'xh',
    script: 'Latn',
  },
  { // Yiddish
    code: 'yi',
    script: 'Latn',
  },
  { // Yoruba
    code: 'yo',
    script: 'Latn',
  },
  { // Zulu
    code: 'zu',
    script: 'Latn',
  },
];

const capitalizingLangs = [ 'de', 'lb' ];
