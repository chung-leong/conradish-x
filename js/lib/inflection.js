import { l } from './i18n.js';
import { storeObject } from './storage.js';

export function getInflectionTables(doc) {
  const { lang, content } = doc;
  const tables = {};
  const generator = generators[lang];
  if (generator) {
    const scan = (item) => {
      if (item instanceof Array) {
        item.forEach(scan);
      } else if (item instanceof Object) {
        const { footnote, content } = item;
        let inflections, term;
        if (footnote && footnote.inflections instanceof Array) {
          inflections = footnote.inflections;
          term = footnote.term;
        } else if (item.inflections instanceof Array) {
          inflections = item.inflections;
          term = item.term;
        }
        if (inflections) {
          const [ type, table ] = generator.process(inflections, term);
          if (type && table) {
            let list = tables[type];
            if (!list) {
              list = tables[type] = [];
            }
            list.push(table);
          }
        }
        scan(content);
      }
    };
    scan(content);
  }
  return (Object.keys(tables).length > 0) ? tables : null;
}

export function mergeInflectionTables(tableLists, lang) {
  const result = {};
  for (const tables of tableLists) {
    for (const [ type, list ] of Object.entries(tables)) {
      if (!result[type]) {
        result[type] = [];
      }
      result[type].push(...list);
    }
  }
  for (const [ type, list ] of Object.entries(result)) {
    list.sort((a, b) => {
      const captionA = getCaption(a);
      const captionB = getCaption(b);
      return captionA.localeCompare(captionB, lang);
    });
  }
  return result;
}

export async function saveInflectionTables(tables, selection, lang) {
  const content = [];
  for (const [ type, list ] of Object.entries(tables)) {
    if (selection.includes(type)) {
      content.push(...list);
    }
  }
  const captions = content.map(t => getCaption(t));
  const title = `${l('inflection_tables')}: ${captions.join(', ')}`;
  const type = 'inflection';
  const doc = { lang, type, title, content };
  console.log(doc);
  return storeObject('DOC', doc);
}

function getCaption(table) {
  return table.content[0].content;
}

class TableHeader {
  constructor(label) {
    this.label = label;
  }
}

class TableGenerator {
  process(inflections, term) {
    try {
      let type, table;
      if (this.has(inflections, [ 'tense' ])) {
        table = this.processVerb(inflections, term);
        type = 'verb';
      } else if (this.has(inflections, [ 'degree' ])) {
        table = this.processAdjective(inflections, term);
        type = 'adjective';
      } else if (this.has(inflections, [ 'number' ])) {
        table = this.processNoun(inflections, term);
        type = 'noun';
      }
      if (table) {
        table.inflections = inflections;
        table.term = term;
        return [ type, table ];
      } else {
        return [];
      }
    } catch (err) {
      console.error(err);
    }
  }

  processNoun(inf, term) {}
  processAdjective(inf, term) {}
  processVerb(inf, term) {}

  find(inflections, criteria) {
    for (const inflection of inflections) {
      const names = Object.keys(criteria);
      if (names.every(n => inflection[n] === criteria[n])) {
        return inflection.written_form;
      }
    }
    return '';
  }

  header(label) {
    return new TableHeader(label);
  }

  headers(labels) {
    return labels.map(l => new TableHeader(l));
  }

  has(inflections, names) {
    for (const inflection of inflections) {
      if (names.every(n => inflection.hasOwnProperty(n))) {
        return true;
      }
    }
    return false;
  }

  build(title, cells) {
    const trs = [];
    for (const row of cells) {
      const tds = [];
      for (const cell of row) {
        if (cell instanceof TableHeader) {
          tds.push({ tag: 'TH', content: cell.label });
        } else {
          tds.push({ tag: 'TD', content: cell });
        }
      }
      trs.push({ tag: 'TR', content: tds })
    }
    const caption = { tag: 'CAPTION', content: title };
    const tbody = { tag: 'TBODY', content: trs };
    return {
      tag: 'TABLE',
      class: 'inflection',
      content: [ caption, tbody ]
    };
  }

  clean(cells) {
    for (let i = cells.length - 1; i >= 0; i--) {
      const row = cells[i];
      if (row.every(c => c instanceof TableHeader)) {
        const nextRow = cells[i + 1];
        if (!nextRow || nextRow.every(c => c instanceof TableHeader)) {
          cells.splice(i, 1);
        }
      } else {
        if (row.every(c => c instanceof TableHeader || !c )) {
          cells.splice(i, 1);
        }
      }
    }
  }
}

// tense
const PRESENT1 = 1;
const PRESENT2 = 5;

// mood
const INDICATIVE = 3;

// person
const FIRST = 1;
const SECOND = 2;
const THIRD = 3;

// number
const PLURAL = 1;
const SINGULAR = 2;

// gender
const MASCULINE = 1;
const FEMININE = 2;
const NEUTER = 3;

// case
const NOMINATIVE = 16;
const GENITIVE = 10;
const DATIVE = 7;
const ACCUSATIVE = 3;
const INSTRUMENTAL = 14;
const LOCATIVE = 15;
const PREPOSITIONAL = 18;
const VOCATIVE = 20;

class Slovak extends TableGenerator {
  processVerb(inf) {
    const mt = { tense: PRESENT1 };
    const cells = [
      this.headers([ 'ja', 'ty', 'on/ona/ono', 'my', 'vy', 'oni/ony' ]),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, tense: undefined });
    this.clean(cells);
    if (infinitive && cells.length > 1) {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf) {
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ]),
      [
        this.header(l('singular')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf) {
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ]),
      [
        this.header(l('masculine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        this.header(l('feminine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        this.header(l('neuter')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }
}

class SerboCroatian extends TableGenerator {
  processVerb(inf, term) {
    const cyr = this.isCyrillic(term);
    const mt = { tense: PRESENT1 };
    const cells = [
      this.headers([ 'ja', 'ti', 'on/ona/ono', 'mi', 'vi', 'oni/one/ona' ], cyr),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }, cyr),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }, cyr),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }, cyr),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }, cyr),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }, cyr),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }, cyr),
      ]
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, tense: undefined }, cyr);
    this.clean(cells);
    if (infinitive && cells.length > 1) {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf, term) {
    const cyr = this.isCyrillic(term);
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative'), l('vocative') ]),
      [
        this.header(l('singular')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }, cyr),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: VOCATIVE,  number: PLURAL }, cyr),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf, term) {
    const cyr = this.isCyrillic(term);
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ], cyr),
      [
        this.header(l('masculine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
      ],
      [
        this.header(l('feminine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
      ],
      [
        this.header(l('neuter')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }, cyr),
      ],
    ];
    this.clean(cells);
    if (cells.length > 0) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }

  find(inflections, criteria, cyr) {
    const s = super.find(inflections, criteria);
    return (cyr) ? this.toCyrillic(s) : s;
  }

  headers(labels, cyr = false) {
    if (cyr) {
      labels = labels.map(l => this.toCyrillic(l));
    }
    return super.headers(labels);
  }

  isCyrillic(s) {
    return /[\u0400-\u04ff]/.test(s);
  }

  toCyrillic(s) {
    const map = {
      'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'Đ': 'Ђ', 'E': 'Е', 'Ž': 'Ж', 'Z': 'З', 'I': 'И',
      'J': 'Ј', 'K': 'К', 'L': 'Л', 'Lj': 'Љ', 'LJ': 'Љ', 'M': 'М', 'N': 'Н', 'Nj': 'Њ', 'NJ': 'Њ', 'O': 'О', 'P': 'П',
      'R': 'Р', 'S': 'С', 'T': 'Т', 'Ć': 'Ћ', 'U': 'У', 'F': 'Ф', 'H': 'Х', 'C': 'Ц', 'Č': 'Ч', 'Dž': 'Џ', 'DŽ': 'Џ',
      'Š': 'Ш', 'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'đ': 'ђ', 'e': 'е', 'ž': 'ж', 'z': 'з',
      'i': 'и', 'j': 'ј', 'k': 'к', 'l': 'л', 'lj': 'љ', 'm': 'м', 'n': 'н', 'nj': 'њ', 'o': 'о', 'p': 'п',
      'r': 'р', 's': 'с', 't': 'т', 'ć': 'ћ', 'u': 'у', 'f': 'ф', 'h': 'х', 'c': 'ц', 'č': 'ч', 'dž': 'џ', 'š': 'ш',
    };
    let r = '';
    for (let i = 0; i < s.length; i++) {
      const l1 = s[i];
      const c1 = map[l1];
      if (c1) {
        const l2 = s[i + 1];
        const c2 = map[l1 + l2];
        if (c2) {
          r += c2;
          i++;
        } else {
          r += c1;
        }
      } else {
        r += l1;
      }
    }
    return r;
  }
}

class Bulgarian extends TableGenerator {
  processVerb(inf) {
    const mt = { tense: PRESENT2 };
    const cells = [
      this.headers([ 'аз', 'ти', 'той/тя/то', 'ние', 'вие', 'те' ]),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const firstPerSg = cells[1][0];
    this.clean(cells);
    if (firstPerSg && cells.length > 1) {
      return this.build(firstPerSg, cells);
    }
  }
}

class Macedonian extends TableGenerator {
  processVerb(inf) {
    const mt = { tense: PRESENT2 };
    const cells = [
      this.headers([ 'јас', 'ти', 'той/таа/тоа', 'ние', 'вие', 'тие' ]),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const thirdPerSg = cells[1][2];
    this.clean(cells);
    if (thirdPerSg && cells.length > 1) {
      return this.build(thirdPerSg, cells);
    }
  }
}

class Russian extends TableGenerator {
  processVerb(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const cells = [
      this.headers([ 'я', 'ты', 'он/она/оно', 'мы', 'вы', 'они' ]),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    this.clean(cells);
    if (infinitive && cells.length > 1) {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf) {
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('prepositional') ]),
      [
        this.header(l('singular')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR }),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: PLURAL }),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf) {
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('prepositional') ]),
      [
        this.header(l('masculine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        this.header(l('feminine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        this.header(l('neuter')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: PLURAL }),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }
}

class Belarusian extends Russian {
  processVerb(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const cells = [
      this.headers([ 'я', 'ты', 'ён/яна/яно', 'мы', 'вы', 'яны' ]),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    this.clean(cells);
    if (infinitive && cells.length > 1) {
      return this.build(infinitive, cells);
    }
  }
}

class Ukrainian extends TableGenerator {
  processVerb(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const cells = [
      this.headers([ 'я', 'ти', 'він/вона/воно', 'ми', 'ви', 'вони' ]),
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    this.clean(cells);
    if (infinitive && cells.length > 1) {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf) {
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative'), l('vocative') ]),
      [
        this.header(l('singular')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf) {
    const cells = [
      this.headers([ '', l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ]),
      [
        this.header(l('masculine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        this.header(l('feminine')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        this.header(l('neuter')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        this.header(l('plural')),
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells);
    if (cells.length > 1) {
      const nomSg = cells[1][1];
      return this.build(nomSg, cells);
    }
  }
}

const generators = {
  sk: new Slovak,
  sr: new SerboCroatian,
  hr: new SerboCroatian,
  bg: new Bulgarian,
  mk: new Macedonian,
  ru: new Russian,
  be: new Belarusian,
  uk: new Ukrainian,
};
