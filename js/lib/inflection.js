import { l } from './i18n.js';

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
        if (footnote && footnote.inflections instanceof Array) {
          const [ type, table ] = generator.process(footnote.inflections, footnote.term);
          if (type) {
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
  return Object.keys(tables) > 0 ? tables : null;
}

class TableGenerator {
  process(inflections, term) {
    try {
      if (this.has(inflections, [ 'tense' ])) {
        const v = this.buildVerbTable(inflections, term);
        if (v) {
          return [ 'verb', v ];
        }
      } else if (this.has(inflections, [ 'degree' ])) {
        const a = this.buildAdjectiveTable(inflections, term);
        if (a) {
          return [ 'adjective', a ];
        }
      } else if (this.has(inflections, [ 'number' ])) {
        const n = this.buildNounTable(inflections, term);
        if (n) {
          return [ 'noun', n ];
        }
      }
      return [];
    } catch (err) {
      console.error(err);
    }
  }

  buildNounTable(inf, term) {}
  buildAdjectiveTable(inf, term) {}
  buildVerbTable(inf, term) {}

  find(inflections, criteria) {
    for (const inflection of inflections) {
      const names = Object.keys(criteria);
      if (names.every(n => inflection[n] === criteria[n])) {
        return inflection.written_form;
      }
    }
    return '';
  }

  has(inflections, names) {
    for (const inflection of inflections) {
      if (names.every(n => inflection.hasOwnProperty(n))) {
        return true;
      }
    }
    return false;
  }

  build(caption, columns, rows, cells) {
    console.log({ caption, columns, rows, cells });
  }

  clean(cells, rows) {
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].every(c => !c)) {
        cells.splice(i, 1);
        if (rows) {
          rows.splice(i, 1);
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
  buildVerbTable(inf) {
    const mt = { tense: PRESENT1 };
    const columns = [ 'ja', 'ty', 'on/ona/ono', 'my', 'vy', 'oni/ony' ];
    const rows = null;
    const cells = [
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
    if (infinitive && cells.length > 0) {
      return this.build(infinitive, columns, rows, cells);
    }
  }

  buildNounTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }

  buildAdjectiveTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }
}

class SerboCroatian extends TableGenerator {
  buildVerbTable(inf, term) {
    const cyr = this.isCyrillic(term);
    const mt = { tense: PRESENT1 };
    const columns = [ 'ja', 'ti', 'on/ona/ono', 'mi', 'vi', 'oni/one/ona' ].map(s => cyr ? this.toCyrillic(s) : s);
    const rows = null;
    const cells = [
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }, cyr),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }, cyr),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }, cyr),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }, cyr),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }, cyr),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }, cyr),
      ]
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined }, cyr);
    this.clean(cells);
    if (infinitive && cells.length > 0) {
      return this.build(infinitive, columns, rows, cells);
    }
  }

  buildNounTable(inf, term) {
    const cyr = this.isCyrillic(term);
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }, cyr),
        this.find(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }, cyr),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: VOCATIVE,  number: PLURAL }, cyr),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }

  buildAdjectiveTable(inf, term) {
    const cyr = this.isCyrillic(term);
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }, cyr),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }, cyr),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }, cyr),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }, cyr),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }, cyr),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }

  find(inflections, criteria, cyr) {
    const s = super.find(inflections, criteria);
    return (cyr) ? this.toCyrillic(s) : s;
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
  buildVerbTable(inf) {
    const mt = { tense: PRESENT2 };
    const columns = [ 'аз', 'ти', 'той/тя/то', 'ние', 'вие', 'те' ];
    const rows = null;
    const cells = [
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const firstPerSg = cells[0][0];
    this.clean(cells);
    if (firstPerSg && cells.length > 0) {
      return this.build(firstPerSg, columns, rows, cells);
    }
  }
}

class Macedonian extends TableGenerator {
  buildVerbTable(inf) {
    const mt = { tense: PRESENT2 };
    const columns = [ 'јас', 'ти', 'той/таа/тоа', 'ние', 'вие', 'тие' ];
    const rows = null;
    const cells = [
      [
        this.find(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        this.find(inf, { person: SECOND, number: SINGULAR, ...mt }),
        this.find(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        this.find(inf, { person: FIRST,  number: PLURAL, ...mt }),
        this.find(inf, { person: SECOND, number: PLURAL, ...mt }),
        this.find(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const thirdPerSg = cells[0][2];
    this.clean(cells);
    if (thirdPerSg && cells.length > 0) {
      return this.build(thirdPerSg, columns, rows, cells);
    }
  }
}

class Russian extends TableGenerator {
  buildVerbTable(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const columns = [ 'я', 'ты', 'он/она/оно', 'мы', 'вы', 'они' ];
    const rows = null;
    const cells = [
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
    if (infinitive && cells.length > 0) {
      return this.build(infinitive, columns, rows, cells);
    }
  }

  buildNounTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('prepositional') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: PLURAL }),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }

  buildAdjectiveTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('prepositional') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: PREPOSITIONAL,  number: PLURAL }),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }
}

class Belarusian extends Russian {
  buildVerbTable(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const columns = [ 'я', 'ты', 'ён/яна/яно', 'мы', 'вы', 'яны' ];
    const rows = null;
    const cells = [
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
    if (infinitive && cells.length > 0) {
      return this.build(infinitive, columns, rows, cells);
    }
  }
}

class Ukrainian extends TableGenerator {
  buildVerbTable(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const columns = [ 'я', 'ти', 'він/вона/воно', 'ми', 'ви', 'вони' ];
    const rows = null;
    const cells = [
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
    if (infinitive && cells.length > 0) {
      return this.build(infinitive, columns, rows, cells);
    }
  }

  buildNounTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative'), l('vocative') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: VOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
    }
  }

  buildAdjectiveTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        this.find(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        this.find(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        this.find(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
      ],
    ];
    this.clean(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return this.build(nomSg, columns, rows, cells);
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
