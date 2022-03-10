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
          const [ type, table ] = generator.process(footnote.inflections);
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
  process(inflections) {
    try {
      if (hasFeatures(inflections, [ 'tense' ])) {
        const v = this.getVerbTable(inflections);
        if (v) {
          return [ 'verb', v ];
        }
      } else if (hasFeatures(inflections, [ 'degree' ])) {
        const a = this.getAdjectiveTable(inflections);
        if (a) {
          return [ 'adjective', a ];
        }
      } else if (hasFeatures(inflections, [ 'number' ])) {
        const n = this.getNounTable(inflections);
        if (n) {
          return [ 'noun', n ];
        }
      }
      return [];
    } catch (err) {
      console.error(err);
    }
  }

  getNounTable(inf) {}
  getAdjectiveTable(inf) {}
  getVerbTable(inf) {}
}

function buildTable(caption, columns, rows, cells) {
  console.log({ caption, columns, rows, cells });
}

function hasFeatures(inflections, names) {
  for (const inflection of inflections) {
    if (names.every(n => inflection.hasOwnProperty(n))) {
      return true;
    }
  }
  return false;
}

function findInflected(inflections, criteria) {
  for (const inflection of inflections) {
    const names = Object.keys(criteria);
    if (names.every(n => inflection[n] === criteria[n])) {
      return inflection.written_form;
    }
  }
  return '';
}

function removeEmptyRows(cells, rows) {
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].every(c => !c)) {
      cells.splice(i, 1);
      if (rows) {
        rows.splice(i, 1);
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
  getVerbTable(inf) {
    const mt = { tense: PRESENT1 };
    const columns = [ 'ja', 'ty', 'on/ona/ono', 'my', 'vy', 'oni/ony' ];
    const rows = null;
    const cells = [
      [
        findInflected(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        findInflected(inf, { person: SECOND, number: SINGULAR, ...mt }),
        findInflected(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        findInflected(inf, { person: FIRST,  number: PLURAL, ...mt }),
        findInflected(inf, { person: SECOND, number: PLURAL, ...mt }),
        findInflected(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = findInflected(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    removeEmptyRows(cells);
    if (infinitive && cells.length > 0) {
      return buildTable(infinitive, columns, rows, cells);
    }
  }

  getNounTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: VOCATIVE,  number: PLURAL }),
      ],
    ];
    removeEmptyRows(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return buildTable(nomSg, columns, rows, cells);
    }
  }

  getAdjectiveTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
      ],
    ];
    removeEmptyRows(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return buildTable(nomSg, columns, rows, cells);
    }
  }
}

class Russian extends TableGenerator {
  getVerbTable(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const columns = [ 'я', 'ты', 'он/она/оно', 'мы', 'вы', 'они' ];
    const rows = null;
    const cells = [
      [
        findInflected(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        findInflected(inf, { person: SECOND, number: SINGULAR, ...mt }),
        findInflected(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        findInflected(inf, { person: FIRST,  number: PLURAL, ...mt }),
        findInflected(inf, { person: SECOND, number: PLURAL, ...mt }),
        findInflected(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = findInflected(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    removeEmptyRows(cells);
    if (infinitive && cells.length > 0) {
      return buildTable(infinitive, columns, rows, cells);
    }
  }

  getNounTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('prepositional') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        findInflected(inf, { grammatical_case: PREPOSITIONAL,  number: PLURAL }),
      ],
    ];
    removeEmptyRows(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return buildTable(nomSg, columns, rows, cells);
    }
  }

  getAdjectiveTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('prepositional') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: PREPOSITIONAL,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        findInflected(inf, { grammatical_case: PREPOSITIONAL,  number: PLURAL }),
      ],
    ];
    removeEmptyRows(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return buildTable(nomSg, columns, rows, cells);
    }
  }
}

class Ukrainian extends TableGenerator {
  getVerbTable(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT2 };
    const columns = [ 'я', 'ти', 'він/вона/воно', 'ми', 'ви', 'вони' ];
    const rows = null;
    const cells = [
      [
        findInflected(inf, { person: FIRST,  number: SINGULAR, ...mt }),
        findInflected(inf, { person: SECOND, number: SINGULAR, ...mt }),
        findInflected(inf, { person: THIRD,  number: SINGULAR, ...mt }),
        findInflected(inf, { person: FIRST,  number: PLURAL, ...mt }),
        findInflected(inf, { person: SECOND, number: PLURAL, ...mt }),
        findInflected(inf, { person: THIRD,  number: PLURAL, ...mt }),
      ]
    ];
    const infinitive = findInflected(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    removeEmptyRows(cells);
    if (infinitive && cells.length > 0) {
      return buildTable(infinitive, columns, rows, cells);
    }
  }

  getNounTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative'), l('vocative') ];
    const rows = [ l('singular'), l('plural') ];
    const cells = [
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR }),
        findInflected(inf, { grammatical_case: VOCATIVE,  number: SINGULAR }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: VOCATIVE,  number: PLURAL }),
      ],
    ];
    removeEmptyRows(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return buildTable(nomSg, columns, rows, cells);
    }
  }

  getAdjectiveTable(inf) {
    const columns = [ l('nominative'), l('accusative'), l('genitive'), l('dative'), l('instrumental'), l('locative') ];
    const rows = [ l('masculine'), l('feminine'), l('neuter'), l('plural') ];
    const cells = [
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: MASCULINE }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: MASCULINE }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: FEMININE }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: FEMININE }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: DATIVE,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: SINGULAR, gender: NEUTER }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: SINGULAR, gender: NEUTER }),
      ],
      [
        findInflected(inf, { grammatical_case: NOMINATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: ACCUSATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: GENITIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: DATIVE,  number: PLURAL }),
        findInflected(inf, { grammatical_case: INSTRUMENTAL,  number: PLURAL }),
        findInflected(inf, { grammatical_case: LOCATIVE,  number: PLURAL }),
      ],
    ];
    removeEmptyRows(cells, rows);
    if (cells.length > 0) {
      const nomSg = cells[0][0];
      return buildTable(nomSg, columns, rows, cells);
    }
  }
}

const generators = {
  sk: new Slovak,
  ru: new Russian,
  uk: new Ukrainian,
};
