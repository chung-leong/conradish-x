import { initializeSpecificLocale, getLocaleMessage, getUILanguage } from './i18n.js';
import { storeObject } from './storage.js';

export function getPossibleTypes(lang) {
  const generator = generators[lang];
  return (generator) ? generator.getPossibleTypes() : [];
}

export async function getInflectionTables(doc) {
  const { lang, content } = doc;
  const generator = generators[lang];
  if (!generator) {
    return null;
  }
  const entries = [];
  const defaultLang = getUILanguage().split('-')[0];
  const scan = (item) => {
    if (item instanceof Array) {
      item.forEach(scan);
    } else if (item instanceof Object) {
      const { footnote, content } = item;
      if (footnote && footnote.inflections instanceof Array) {
        entries.push({
          inflections: footnote.inflections,
          term: footnote.term,
          target: (footnote.lang || '').split(',')[1] || defaultLang
        });
      } else if (item.inflections instanceof Array) {
        entries.push({
          inflections: item.inflections,
          term: item.term,
          target: item.lang || defaultLang
        });
      }
      scan(content);
    }
  };
  scan(content);
  const tables = {};
  for (const { inflections, term, target } of entries) {
    await initializeSpecificLocale(target);
    const table = generator.process(inflections, target, term);
    if (table) {
      const { type } = table;
      let list = tables[type];
      if (!list) {
        list = tables[type] = [];
      }
      list.push(table);
    }
  }
  return (Object.keys(tables).length > 0) ? tables : null;
}

export function mergeInflectionTables(tableLists, lang) {
  const result = {};
  for (const type of [ 'noun', 'adjective', 'noun_adj', 'verb' ]) {
    const included = {};
    const dstList = result[type] = [];
    for (const tables of tableLists) {
      const srcList = tables[type];
      if (srcList) {
        for (const table of srcList) {
          const caption = getCaption(table);
          if (!included[caption]) {
            dstList.push(table);
            included[caption] = true;
          }
        }
      }
    }
    dstList.sort((a, b) => {
      const captionA = getCaption(a);
      const captionB = getCaption(b);
      return captionA.localeCompare(captionB, lang);
    });
  }
  return result;
}

export async function saveInflectionTables(tables, selection, lang) {
  const content = [];
  const div = { type: 'DIV', content: '\u200c' };
  const targets = [];
  for (const [ type, list ] of Object.entries(tables)) {
    if (selection.includes(type)) {
      for (const table of list) {
        content.push(table);
        content.push(div);
        const { lang } = table;
        const target = targets.find(t => t.lang === lang);
        if (target) {
          target.count++;
        } else {
          targets.push({ lang, count: 1 });
        }
      }
    }
  }
  // use the language with the largest number of footnotes
  // (in normal usage there'd only be one)
  const [ target ] = targets.sort((a, b) => b.count - a.count);
  const name = getLocaleMessage('inflection_tables', target.lang);
  const captions = content.filter(t => t.tag === 'TABLE').map(t => getCaption(t));
  const title = `${name}: ${captions.join(', ')}`;
  const type = 'inflection';
  const doc = { lang, type, title, content };
  return storeObject('DOC', doc);
}

function getCaption(table) {
  return table.content[0].content;
}

class TableHeader {
  constructor(label, cols) {
    this.label = label;
    this.cols = cols;
  }
}

class TableGenerator {
  process(inflections, target, term) {
    try {
      let type, table;
      if (this.isVerb(inflections)) {
        table = this.processVerb(inflections, target, term);
        type = 'verb';
      } else {
        if (this.isAdjectiveDistinct()) {
          if (this.isAdjective(inflections)) {
            table = this.processAdjective(inflections, target, term);
            type = 'adjective';
          } else if (this.isNoun(inflections)) {
            table = this.processNoun(inflections, target, term);
            type = 'noun';
          }
        } else {
          if (this.isNounAdjective(inflections)) {
            table = this.processNounAdjective(inflections, target, term);
            type = 'noun_adj';
          }
        }
      }
      if (table) {
        table.inflections = inflections;
        table.term = term;
        table.type = type;
        table.lang = target;
        return table;
      }
    } catch (err) {
      console.error(err);
    }
  }

  getPossibleTypes() {
    return [ 'noun', 'adjective', 'verb' ];
  }

  isAdjectiveDistinct() {
    return true;
  }

  isVerb(inf) {
    return this.has(inf, [ 'tense' ]);
  }

  isAdjective(inf) {
    return this.has(inf, [ 'degree' ]);
  }

  isNoun(inf) {
    return this.has(inf, [ 'number' ]);
  }

  isNounAdjective(inf) {
    return this.isNoun(inf);
  }

  processNoun(inf, target, term) {}
  processAdjective(inf, target, term) {}
  processNounAdjective(inf, target, term) {}
  processVerb(inf, target, term) {}

  find(inflections, criteria) {
    const matches = this.findAll(inflections, criteria);
    return matches[0] || '-';
  }

  findAll(inflections, criteria) {
    const matches = [];
    const scores = [];
    for (const inflection of inflections) {
      const names = Object.keys(criteria);
      const score = (n) => {
        const value1 = inflection[n];
        const value2 = criteria[n];
        if (value2 instanceof Array) {
          const index = value2.indexOf(value1);
          if (index !== -1) {
            return 1 / (index + 1);
          }
        } else if (value2 instanceof Function) {
          if (value2(value1)) {
            return 1;
          }
        } else {
          if (value2 === value1) {
            return 1;
          }
        }
      };
      let total = 0;
      for (const name of names) {
        const s = score(name);
        if (s) {
          total += s;
        } else {
          total = 0;
          break;
        }
      }
      if (total > 0) {
        const form = inflection.written_form;
        matches.push(form);
        scores[form] = total;
      }
    }
    return matches.sort((a, b) => scores[b] - scores[a]);
  }

  header(label, cols) {
    return new TableHeader(label, cols);
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
        const td = (cell instanceof TableHeader) ? { tag: 'TH', content: cell.label } : { tag: 'TD', content: cell };
        if (cell.cols) {
          td.colSpan = cell.cols;
        }
        tds.push(td);
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
}

// tense
const FUTURE = 1;
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
const ABESSIVE = 1;
const ABLATIVE = 2;
const ACCUSATIVE = 3;
const ADESSIVE = 4;
const ALLATIVE = 5;
const COMITATIVE = 6;
const DATIVE = 7;
const ELATIVE = 8;
const ESSIVE = 9;
const GENITIVE = 10;
const ILLATIVE = 11;
const INESSIVE = 12;
const INSTRUCTIVE = 13;
const INSTRUMENTAL = 14;
const LOCATIVE = 15;
const NOMINATIVE = 16;
const PARTITIVE = 17;
const PREPOSITIONAL = 18;
const TRANSLATIVE = 19;
const VOCATIVE = 20;

// degree
const GENERAL = 1;
const TEMPORARY = 2;
const COMPARATIVE = 3;

// non-finite form
const GERUND = 1;
const INFINITIVE = 2;

class Slavic extends TableGenerator {
  isAdjective(inf) {
    if (super.isAdjective(inf)) {
      return true;
    }
    // only adjectives have multiple genders
    return[ MASCULINE, FEMININE ].every(gender => this.findAll(inf, { gender }).length > 0);
  }
}

class Slovak extends Slavic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('ja'), sg(FIRST), p('my'), pl(FIRST) ],
      [ p('ty'), sg(SECOND), p('vy'), pl(SECOND) ],
      [ p('on/ona/ono'), sg(THIRD), p('oni/ony'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, tense: undefined });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf, target) {
    const sg = (decl) => this.find(inf, { grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('singular'), h('plural') ],
      [ h('nominative'), sg(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), sg(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), sg(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), sg(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), sg(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), sg(LOCATIVE), pl(LOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf, target) {
    const m = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('masculine'), h('feminine'), h('neuter'), h('plural') ],
      [ h('nominative'), m(NOMINATIVE), f(NOMINATIVE), n(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), m(ACCUSATIVE), f(ACCUSATIVE), n(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), m(GENITIVE), f(GENITIVE), n(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), m(DATIVE), f(DATIVE), n(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), m(INSTRUMENTAL), f(INSTRUMENTAL), n(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), m(LOCATIVE), f(LOCATIVE), n(LOCATIVE), pl(LOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }
}

class SerboCroatian extends Slavic {
  processVerb(inf, target, term) {
    const cyr = this.isCyrillic(term);
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person }, cyr);
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person }, cyr);
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('ja'), sg(FIRST), p('mi'), pl(FIRST) ],
      [ p('ti'), sg(SECOND), p('vi'), pl(SECOND) ],
      [ p('on/ona/ono'), sg(THIRD), p('oni/one/ona'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, tense: undefined }, cyr);
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf, target, term) {
    const cyr = this.isCyrillic(term);
    const sg = (decl) => this.find(inf, { grammatical_case: decl, number: SINGULAR }, cyr);
    const pl = (decl) => this.find(inf, { grammatical_case: decl, number: PLURAL }, cyr);
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('singular'), h('plural') ],
      [ h('nominative'), sg(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), sg(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), sg(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), sg(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), sg(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), sg(LOCATIVE), pl(LOCATIVE) ],
      [ h('vocative'), sg(VOCATIVE), pl(VOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf, target, term) {
    const cyr = this.isCyrillic(term);
    const m = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: [ MASCULINE, undefined ] }, cyr);
    const f = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: FEMININE }, cyr);
    const n = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: NEUTER }, cyr);
    const pl = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: PLURAL }, cyr);
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('masculine'), h('feminine'), h('neuter'), h('plural') ],
      [ h('nominative'), m(NOMINATIVE), f(NOMINATIVE), n(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), m(ACCUSATIVE), f(ACCUSATIVE), n(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), m(GENITIVE), f(GENITIVE), n(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), m(DATIVE), f(DATIVE), n(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), m(INSTRUMENTAL), f(INSTRUMENTAL), n(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), m(LOCATIVE), f(LOCATIVE), n(LOCATIVE), pl(LOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
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

class Bulgarian extends Slavic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('аз'), sg(FIRST), p('ние'), pl(FIRST) ],
      [ p('ти'), sg(SECOND), p('вие'), pl(SECOND) ],
      [ p('той/тя/то'), sg(THIRD), p('те'), pl(THIRD) ],
    ];
    const firstPerSg = cells[1][1];
    if (firstPerSg !== '-') {
      return this.build(firstPerSg, cells);
    }
  }
}

class Macedonian extends Slavic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('јас'), sg(FIRST), p('ние'), pl(FIRST) ],
      [ p('ти'), sg(SECOND), p('вие'), pl(SECOND) ],
      [ p('той/таа/тоа'), sg(THIRD), p('тие'), pl(THIRD) ],
    ];
    const thirdPerSg = cells[3][1];
    if (thirdPerSg !== '-') {
      return this.build(thirdPerSg, cells);
    }
  }
}

class Russian extends Slavic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('я'), sg(FIRST), p('мы'), pl(FIRST) ],
      [ p('ты'), sg(SECOND), p('вы'), pl(SECOND) ],
      [ p('он/она/оно'), sg(THIRD), p('они'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf, target) {
    const sg = (decl) => this.find(inf, { grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('singular'), h('plural') ],
      [ h('nominative'), sg(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), sg(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), sg(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), sg(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), sg(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('prepositional'), sg(PREPOSITIONAL), pl(PREPOSITIONAL) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf, target) {
    const m = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('masculine'), h('feminine'), h('neuter'), h('plural') ],
      [ h('nominative'), m(NOMINATIVE), f(NOMINATIVE), n(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), m(ACCUSATIVE), f(ACCUSATIVE), n(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), m(GENITIVE), f(GENITIVE), n(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), m(DATIVE), f(DATIVE), n(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), m(INSTRUMENTAL), f(INSTRUMENTAL), n(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('prepositional'), m(PREPOSITIONAL), f(PREPOSITIONAL), n(PREPOSITIONAL), pl(PREPOSITIONAL) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }
}

class Belarusian extends Slavic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('я'), sg(FIRST), p('мы'), pl(FIRST) ],
      [ p('ты'), sg(SECOND), p('вы'), pl(SECOND) ],
      [ p('ён/яна/яно'), sg(THIRD), p('яны'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf, target) {
    const sg = (decl) => this.find(inf, { grammatical_case: decl,  number: SINGULAR });
    const pl = (decl) => this.find(inf, { grammatical_case: decl,  number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('singular'), h('plural') ],
      [ h('nominative'), sg(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), sg(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), sg(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), sg(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), sg(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), sg(LOCATIVE), pl(LOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf, target) {
    const m = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('masculine'), h('feminine'), h('neuter'), h('plural') ],
      [ h('nominative'), m(NOMINATIVE), f(NOMINATIVE), n(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), m(ACCUSATIVE), f(ACCUSATIVE), n(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), m(GENITIVE), f(GENITIVE), n(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), m(DATIVE), f(DATIVE), n(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), m(INSTRUMENTAL), f(INSTRUMENTAL), n(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), m(LOCATIVE), f(LOCATIVE), n(LOCATIVE), pl(LOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }
}

class Ukrainian extends Slavic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('я'), sg(FIRST), p('ми'), pl(FIRST) ],
      [ p('ти'), sg(SECOND), p('ви'), pl(SECOND) ],
      [ p('він/вона/воно'), sg(THIRD), p('вони'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }

  processNoun(inf, target) {
    const sg = (decl) => this.find(inf, { grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('singular'), h('plural') ],
      [ h('nominative'), sg(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), sg(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), sg(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), sg(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), sg(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), sg(LOCATIVE), pl(LOCATIVE) ],
      [ h('vocative'), sg(VOCATIVE), pl(VOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }

  processAdjective(inf, target) {
    const m = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ GENERAL, TEMPORARY ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('masculine'), h('feminine'), h('neuter'), h('plural') ],
      [ h('nominative'), m(NOMINATIVE), f(NOMINATIVE), n(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('accusative'), m(ACCUSATIVE), f(ACCUSATIVE), n(ACCUSATIVE), pl(ACCUSATIVE) ],
      [ h('genitive'), m(GENITIVE), f(GENITIVE), n(GENITIVE), pl(GENITIVE) ],
      [ h('dative'), m(DATIVE), f(DATIVE), n(DATIVE), pl(DATIVE) ],
      [ h('instrumental'), m(INSTRUMENTAL), f(INSTRUMENTAL), n(INSTRUMENTAL), pl(INSTRUMENTAL) ],
      [ h('locative'), m(LOCATIVE), f(LOCATIVE), n(LOCATIVE), pl(LOCATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }
}

class Finnish extends TableGenerator {
  isAdjectiveDistinct() {
    return false;
  }

  getPossibleTypes() {
    return [ 'noun_adj', 'verb' ];
  }

  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('minä'), sg(FIRST), p('me'), pl(FIRST) ],
      [ p('sinä'), sg(SECOND), p('te'), pl(SECOND) ],
      [ p('hän'), sg(THIRD), p('he'), pl(THIRD) ],
    ];
    let infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined });
    if (infinitive.endsWith('kseen')) {
      infinitive = infinitive.slice(0, -5);
    }
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }

  processNounAdjective(inf, target) {
    const sg = (decl) => this.find(inf, { grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(getLocaleMessage(name, target));
    const cells = [
      [ h(''), h('singular'), h('plural') ],
      [ h('nominative'), sg(NOMINATIVE), pl(NOMINATIVE) ],
      [ h('genitive'), sg(GENITIVE), pl(GENITIVE) ],
      [ h('partitive'), sg(PARTITIVE), pl(PARTITIVE) ],
      [ h('inessive'), sg(INESSIVE), pl(INESSIVE) ],
      [ h('elative'), sg(ELATIVE), pl(ELATIVE) ],
      [ h('illative'), sg(ILLATIVE), pl(ILLATIVE) ],
      [ h('adessive'), sg(ADESSIVE), pl(ADESSIVE) ],
      [ h('ablative'), sg(ABLATIVE), pl(ABLATIVE) ],
      [ h('allative'), sg(ALLATIVE), pl(ALLATIVE) ],
      [ h('essive'), sg(ADESSIVE), pl(ADESSIVE) ],
      [ h('translative'), sg(TRANSLATIVE), pl(TRANSLATIVE) ],
      [ h('instructive'), sg(INSTRUCTIVE), pl(INSTRUCTIVE) ],
      [ h('abessive'), sg(ABESSIVE), pl(ABESSIVE) ],
      [ h('comitative'), sg(COMITATIVE), pl(COMITATIVE) ],
    ];
    const nomSg = cells[1][1];
    if (nomSg !== '-') {
      return this.build(nomSg, cells);
    }
  }
}

class Romance extends TableGenerator {
}

class French extends Romance {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('je'), sg(FIRST), p('nous'), pl(FIRST) ],
      [ p('tu'), sg(SECOND), p('vous'), pl(SECOND) ],
      [ p('il/elle/on'), sg(THIRD), p('ils/elles'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { nonfinite_form: INFINITIVE });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Italian extends Romance {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('io'), sg(FIRST), p('noi'), pl(FIRST) ],
      [ p('tu'), sg(SECOND), p('voi'), pl(SECOND) ],
      [ p('lui/lei'), sg(THIRD), p('loro'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { nonfinite_form: INFINITIVE });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Spanish extends Romance {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('yo'), sg(FIRST), p('nosotros/nosotras'), pl(FIRST) ],
      [ p('tú'), sg(SECOND), p('vosotros/vosotras'), pl(SECOND) ],
      [ p('él/ella/usted'), sg(THIRD), p('ellos/ellas/ustedes'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { nonfinite_form: INFINITIVE });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Catalan extends Romance {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('jo'), sg(FIRST), p('nosaltres'), pl(FIRST) ],
      [ p('tu'), sg(SECOND), p('vosaltres'), pl(SECOND) ],
      [ p('ell/ella/vostè'), sg(THIRD), p('ells/elles/vostès'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined, written_form: (f) => /r$/.test(f) });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Galician extends Romance {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('eu'), sg(FIRST), p('nós'), pl(FIRST) ],
      [ p('ti'), sg(SECOND), p('vós'), pl(SECOND) ],
      [ p('el/ela/vostede'), sg(THIRD), p('eles/elas/vostedes'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined, written_form: (f) => /r$/.test(f) });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Portuguese extends Romance {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('eu'), sg(FIRST), p('nós'), pl(FIRST) ],
      [ p('tú'), sg(SECOND), p('vós'), pl(SECOND) ],
      [ p('ele/ela/você'), sg(THIRD), p('eles/elas/vocês'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { nonfinite_form: INFINITIVE, number: SINGULAR, person: 1 });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Germanic extends TableGenerator {
}

class German extends Germanic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('ich'), sg(FIRST), p('wir'), pl(FIRST) ],
      [ p('du'), sg(SECOND), p('ihr'), pl(SECOND) ],
      [ p('er/sie/es'), sg(THIRD), p('sie'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { nonfinite_form: INFINITIVE });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
    }
  }
}

class Dutch extends Germanic {
  processVerb(inf, target) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: PRESENT, number: PLURAL, person });
    const h = (name, col) => this.header(getLocaleMessage(name, target), col);
    const p = (text) => this.header(text);
    const cells = [
      [ h('singular', 2), h('plural', 2) ],
      [ p('ik'), sg(FIRST), p('wij'), pl(FIRST) ],
      [ p('jij'), sg(SECOND), p('u'), pl(SECOND) ],
      [ p('hij/zij/het'), sg(THIRD), p('zij'), pl(THIRD) ],
    ];
    const infinitive = this.find(inf, { person: undefined,  number: undefined, mood: undefined, tense: undefined, written_form: (f) => !/^ge/.test(f) });
    if (infinitive !== '-') {
      return this.build(infinitive, cells);
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
  fi: new Finnish,
  fr: new French,
  it: new Italian,
  es: new Spanish,
  ca: new Catalan,
  gl: new Galician,
  pt: new Portuguese,
  de: new German,
  nl: new Dutch,
};
