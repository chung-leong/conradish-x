export async function translate(original, sourceLang, targetLang, singleWord) {
  const result = { term: original, lang: sourceLang };
  try {
    const url = new URL('https://clients5.google.com/translate_a/t');
    let lowerCaseAlt;
    // unless the language is German, query the word in lowercase
    if (!capitalizingLangs.includes(sourceLang)) {
      if (singleWord && isCapitalized(original, sourceLang)) {
        lowerCaseAlt = original.toLocaleLowerCase(sourceLang);
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
      const { trans, orig } = json.sentences.find(s => !!s.trans);
      if (trans !== orig) {
        result.translation = trans;
        // return the lowercase version if the translation isn't in uppercase
        if (lowerCaseAlt && !isCapitalized(trans)) {
          result.term = lowerCaseAlt;
        }
      } else {
        // it didn't actually get translated
        result.translation = original;
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

function isCapitalized(word, lang) {
  const c = word.charAt(0);
  return (c.toLocaleLowerCase(lang) !== c);
}

export function getSourceLanguages() {
  const list = [];
  for (const { code, name } of languages) {
    list.push({ value: code, label: name });
  }
  return list;
}

export function getTargetLanguages() {
  const none = { value: '', label: 'None' };
  const list = [ none ];
  for (const { code, name, variants } of languages) {
    if (variants) {
      for (const { code, name } of variants) {
        list.push({ value: code, label: name });
      }
    } else {
      list.push({ value: code, label: name });
    }
  }
  return list;
}

const languages = [
  {
    code: 'af',
    name: 'Afrikaans',
  },
  {
    code: 'sq',
    name: 'Albanian',
  },
  {
    code: 'am',
    name: 'Amharic',
  },
  {
    code: 'ar',
    name: 'Arabic',
  },
  {
    code: 'hy',
    name: 'Armenian',
  },
  {
    code: 'az',
    name: 'Azerbaijani',
  },
  {
    code: 'eu',
    name: 'Basque',
  },
  {
    code: 'be',
    name: 'Belarusian',
  },
  {
    code: 'bn',
    name: 'Bengali',
  },
  {
    code: 'bs',
    name: 'Bosnian',
  },
  {
    code: 'bg',
    name: 'Bulgarian',
  },
  {
    code: 'ca',
    name: 'Catalan',
  },
  {
    code: 'ceb',
    name: 'Cebuano',
  },
  {
    code: 'ny',
    name: 'Chichewa',
  },
  {
    code: 'zh',
    name: 'Chinese',
    variants: [
      {
        code: 'zh-CN',
        name: 'Chinese (Simplified)',
      },
      {
        code: 'zh-TW',
        name: 'Chinese (Traditional)',
      },
    ]
  },
  {
    code: 'co',
    name: 'Corsican',
  },
  {
    code: 'hr',
    name: 'Croatian',
  },
  {
    code: 'cs',
    name: 'Czech',
  },
  {
    code: 'da',
    name: 'Danish',
  },
  {
    code: 'nl',
    name: 'Dutch',
  },
  {
    code: 'en',
    name: 'English',
  },
  {
    code: 'eo',
    name: 'Esperanto',
  },
  {
    code: 'et',
    name: 'Estonian',
  },
  {
    code: 'tl',
    name: 'Filipino',
  },
  {
    code: 'fi',
    name: 'Finnish',
  },
  {
    code: 'fr',
    name: 'French',
  },
  {
    code: 'fy',
    name: 'Frisian',
  },
  {
    code: 'gl',
    name: 'Galician',
  },
  {
    code: 'ka',
    name: 'Georgian',
  },
  {
    code: 'de',
    name: 'German',
  },
  {
    code: 'el',
    name: 'Greek',
  },
  {
    code: 'gu',
    name: 'Gujarati',
  },
  {
    code: 'ht',
    name: 'Haitian Creole',
  },
  {
    code: 'ha',
    name: 'Hausa',
  },
  {
    code: 'haw',
    name: 'Hawaiian',
  },
  {
    code: 'iw',
    name: 'Hebrew',
  },
  {
    code: 'hi',
    name: 'Hindi',
  },
  {
    code: 'hmn',
    name: 'Hmong',
  },
  {
    code: 'hu',
    name: 'Hungarian',
  },
  {
    code: 'is',
    name: 'Icelandic',
  },
  {
    code: 'ig',
    name: 'Igbo',
  },
  {
    code: 'id',
    name: 'Indonesian',
  },
  {
    code: 'ga',
    name: 'Irish',
  },
  {
    code: 'it',
    name: 'Italian',
  },
  {
    code: 'ja',
    name: 'Japanese',
  },
  {
    code: 'jw',
    name: 'Javanese',
  },
  {
    code: 'kn',
    name: 'Kannada',
  },
  {
    code: 'kk',
    name: 'Kazakh',
  },
  {
    code: 'km',
    name: 'Khmer',
  },
  {
    code: 'rw',
    name: 'Kinyarwanda',
  },
  {
    code: 'ko',
    name: 'Korean',
  },
  {
    code: 'ku',
    name: 'Kurdish (Kurmanji)',
  },
  {
    code: 'ky',
    name: 'Kyrgyz',
  },
  {
    code: 'lo',
    name: 'Lao',
  },
  {
    code: 'la',
    name: 'Latin',
  },
  {
    code: 'lv',
    name: 'Latvian',
  },
  {
    code: 'lt',
    name: 'Lithuanian',
  },
  {
    code: 'lb',
    name: 'Luxembourgish',
  },
  {
    code: 'mk',
    name: 'Macedonian',
  },
  {
    code: 'mg',
    name: 'Malagasy',
  },
  {
    code: 'ms',
    name: 'Malay',
  },
  {
    code: 'ml',
    name: 'Malayalam',
  },
  {
    code: 'mt',
    name: 'Maltese',
  },
  {
    code: 'mi',
    name: 'Maori',
  },
  {
    code: 'mr',
    name: 'Marathi',
  },
  {
    code: 'mn',
    name: 'Mongolian',
  },
  {
    code: 'my',
    name: 'Myanmar (Burmese)',
  },
  {
    code: 'ne',
    name: 'Nepali',
  },
  {
    code: 'no',
    name: 'Norwegian',
  },
  {
    code: 'or',
    name: 'Odia (Oriya)',
  },
  {
    code: 'ps',
    name: 'Pashto',
  },
  {
    code: 'fa',
    name: 'Persian',
  },
  {
    code: 'pl',
    name: 'Polish',
  },
  {
    code: 'pt',
    name: 'Portuguese',
  },
  {
    code: 'pa',
    name: 'Punjabi',
  },
  {
    code: 'ro',
    name: 'Romanian',
  },
  {
    code: 'ru',
    name: 'Russian',
  },
  {
    code: 'sm',
    name: 'Samoan',
  },
  {
    code: 'gd',
    name: 'Scots Gaelic',
  },
  {
    code: 'sr',
    name: 'Serbian',
  },
  {
    code: 'st',
    name: 'Sesotho',
  },
  {
    code: 'sn',
    name: 'Shona',
  },
  {
    code: 'sd',
    name: 'Sindhi',
  },
  {
    code: 'si',
    name: 'Sinhala',
  },
  {
    code: 'sk',
    name: 'Slovak',
  },
  {
    code: 'sl',
    name: 'Slovenian',
  },
  {
    code: 'so',
    name: 'Somali',
  },
  {
    code: 'es',
    name: 'Spanish',
  },
  {
    code: 'su',
    name: 'Sundanese',
  },
  {
    code: 'sw',
    name: 'Swahili',
  },
  {
    code: 'sv',
    name: 'Swedish',
  },
  {
    code: 'tg',
    name: 'Tajik',
  },
  {
    code: 'ta',
    name: 'Tamil',
  },
  {
    code: 'tt',
    name: 'Tatar',
  },
  {
    code: 'te',
    name: 'Telugu',
  },
  {
    code: 'th',
    name: 'Thai',
  },
  {
    code: 'tr',
    name: 'Turkish',
  },
  {
    code: 'tk',
    name: 'Turkmen',
  },
  {
    code: 'uk',
    name: 'Ukrainian',
  },
  {
    code: 'ur',
    name: 'Urdu',
  },
  {
    code: 'ug',
    name: 'Uyghur',
  },
  {
    code: 'uz',
    name: 'Uzbek',
  },
  {
    code: 'vi',
    name: 'Vietnamese',
  },
  {
    code: 'cy',
    name: 'Welsh',
  },
  {
    code: 'xh',
    name: 'Xhosa',
  },
  {
    code: 'yi',
    name: 'Yiddish',
  },
  {
    code: 'yo',
    name: 'Yoruba',
  },
  {
    code: 'zu',
    name: 'Zulu',
  },
];

const capitalizingLangs = [ 'de', 'lb' ];
