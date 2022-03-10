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
        if (footnote && footnote.inflections) {
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
  for (const features of Object.values(inflections)) {
    if (names.every(n => features.hasOwnProperty(n))) {
      return true;
    }
  }
  return false;
}

function findInflected(inflections, criteria) {
  for (const [ form, features ] of Object.entries(inflections)) {
    const names = Object.keys(criteria);
    if (names.every(n => features[n] === criteria[n])) {
      return form;
    }
  }
  return '';
}

// tense
const PRESENT = 5;

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

class Ukrainian extends TableGenerator {
  getVerbTable(inf) {
    const mt = { mood: INDICATIVE, tense: PRESENT };
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
    return buildTable(infinitive, columns, rows, cells);
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
    const nomSg = cells[0][0];
    return buildTable(nomSg, columns, rows, cells);
  }
}

const generators = {
  uk: new Ukrainian,
};
