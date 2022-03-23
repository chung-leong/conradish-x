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
          const table = generator.process(inflections, term);
          if (table) {
            const { type } = table;
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
  for (const type of [ 'noun', 'adjective', 'verb' ]) {
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
  for (const [ type, list ] of Object.entries(tables)) {
    if (selection.includes(type)) {
      for (const table of list) {
        content.push(table);
        content.push(div);
      }
    }
  }
  const captions = content.filter(t => t.tag === 'TABLE').map(t => getCaption(t));
  const title = `${l('inflection_tables')}: ${captions.join(', ')}`;
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
        table.type = type;
        return table;
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
      const match = (n) => {
        const value1 = inflection[n];
        const value2 = criteria[n];
        if (value2 instanceof Array) {
          return value2.includes(value1);
        } else {
          return value2 === value1;
        }
      };
      if (names.every(match)) {
        return inflection.written_form;
      }
    }
    return '-';
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
const NOMINATIVE = 16;
const GENITIVE = 10;
const DATIVE = 7;
const ACCUSATIVE = 3;
const INSTRUMENTAL = 14;
const LOCATIVE = 15;
const PREPOSITIONAL = 18;
const VOCATIVE = 20;

// degree (not sure about the difference between 1 and 2)
const POSITIVE1 = 1;
const POSITIVE2 = 2;
const COMPARATIVE = 3;

class Slovak extends TableGenerator {
  processVerb(inf) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(l(name), col);
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

  processNoun(inf) {
    const sg = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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

  processAdjective(inf) {
    const m = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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

class SerboCroatian extends TableGenerator {
  processVerb(inf, term) {
    const cyr = this.isCyrillic(term);
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person }, cyr);
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person }, cyr);
    const h = (name, col) => this.header(l(name), col);
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

  processNoun(inf, term) {
    const cyr = this.isCyrillic(term);
    const sg = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR }, cyr);
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL }, cyr);
    const h = (name) => this.header(l(name));
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

  processAdjective(inf, term) {
    const cyr = this.isCyrillic(term);
    const m = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: [ MASCULINE, undefined ] }, cyr);
    const f = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: FEMININE }, cyr);
    const n = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: NEUTER }, cyr);
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL }, cyr);
    const h = (name) => this.header(l(name));
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

class Bulgarian extends TableGenerator {
  processVerb(inf) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(l(name), col);
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

class Macedonian extends TableGenerator {
  processVerb(inf) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(l(name), col);
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

class Russian extends TableGenerator {
  processVerb(inf) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(l(name), col);
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

  processNoun(inf) {
    const sg = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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

  processAdjective(inf) {
    const m = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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

class Belarusian extends TableGenerator {
  processVerb(inf) {
    const sg = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(l(name), col);
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

  processNoun(inf) {
    const sg = (decl) => this.find(inf, { grammatical_case: decl,  number: SINGULAR });
    const pl = (decl) => this.find(inf, { grammatical_case: decl,  number: PLURAL });
    const h = (name) => this.header(l(name));
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

  processAdjective(inf) {
    const m = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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

class Ukrainian extends TableGenerator {
  processVerb(inf) {
    const sg = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: SINGULAR, person });
    const pl = (person) => this.find(inf, { mood: INDICATIVE, tense: [ PRESENT, FUTURE ], number: PLURAL, person });
    const h = (name, col) => this.header(l(name), col);
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

  processNoun(inf) {
    const sg = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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

  processAdjective(inf) {
    console.log(inf);
    const m = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: MASCULINE });
    const f = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: FEMININE });
    const n = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: SINGULAR, gender: NEUTER });
    const pl = (decl) => this.find(inf, { degree: [ POSITIVE1, POSITIVE2, undefined ], grammatical_case: decl, number: PLURAL });
    const h = (name) => this.header(l(name));
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
