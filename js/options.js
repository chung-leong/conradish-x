import { e, attachCustomCheckboxHandlers } from './lib/ui.js';
import { l, getUILanguage, getTargetLanguage, getLanguageScript, getScriptDirection } from './lib/i18n.js';
import { initializeStorage, getSettings, saveSettings, storageChange } from './lib/storage.js';
import { setWindowName } from './lib/navigation.js';
import { createTopBar, attachShadowHandlers } from './lib/top-bar.js';
import { getScriptSpecificSettings } from './lib/settings.js';
import { getScripts, getFontCoverage, updateFontAvailability, updateFontSelection, applyDefaultFontSettings } from './lib/fonts.js';

const listContainer = document.getElementById('list-container');
let searchInput;

const cards = [];
let activeCardType = 'basic';
let activeScript = '';

async function start() {
  await initializeStorage();
  await applyDefaultFontSettings();
  setWindowName('options');
  document.title = l('extension_options');
  createSearchToolbar();
  createSectionNavigation();
  createBasicOptionCard();
  createFontSelectionCards();
  showActiveCards();
  attachCustomCheckboxHandlers();
  attachShadowHandlers();
}

function createSearchToolbar() {
  const inputElement = e('INPUT', { type: 'text' });
  inputElement.addEventListener('input', (evt) => {
    const query = evt.target.value.trim();
    searchElement.classList.toggle('active', !!query);
    search(query);
  });
  inputElement.addEventListener('focus', (evt) => searchElement.classList.add('focus'));
  inputElement.addEventListener('blur', (evt) => searchElement.classList.remove('focus'));
  const iconElement = e('SPAN', { className: 'magnifying-glass' });
  const buttonElement = e('SPAN', { className: 'x-button', title: l('clear_search') });
  const searchElement = e('DIV', { id: 'search-input', className: 'hidden' }, [ inputElement, iconElement, buttonElement ]);
  buttonElement.addEventListener('click', (evt) => {
    searchElement.classList.remove('active');
    inputElement.value = '';
    inputElement.focus();
  });
  searchInput = { searchElement, iconElement, inputElement }
  createTopBar('toolbar-search', { left: l('extension_options'), center: searchElement });
}

function createSectionNavigation() {
  const basicElement = e('LI', { className: 'basic selected' }, l('basic_options'));
  const scripts = getScripts();
  const scriptElements = scripts.map((script) => {
    return e('LI', { dataset: { script } }, l(`script_${script.toLowerCase()}`));
  });
  const scriptListElement = e('UL', { className: 'script-list hidden' }, scriptElements);
  const fontElement = e('LI', { className: 'fonts' }, [ l('fonts'), scriptListElement ]);
  const listElement = e('UL', { className: 'section-nav' }, [ basicElement, fontElement ]);
  const sideBarElement = document.getElementById('left-side-bar');
  sideBarElement.append(listElement);
  basicElement.addEventListener('click', (evt) => {
    activeCardType = 'basic';
    showActiveCards();
    basicElement.classList.add('selected');
    fontElement.classList.remove('selected');
    scriptListElement.classList.add('hidden');
  });
  fontElement.addEventListener('click', (evt) => {
    activeCardType = 'font';
    if (!activeScript) {
      const lang = getTargetLanguage();
      activeScript = getLanguageScript(lang);
      const selectedElement = scriptElements.find(e => e.dataset.script === activeScript);
      selectedElement.classList.add('selected');
    }
    showActiveCards();
    basicElement.classList.remove('selected');
    fontElement.classList.add('selected');
    scriptListElement.classList.remove('hidden');
  });
  scriptListElement.addEventListener('click', (evt) => {
    const { script } = evt.target.dataset;
    if (script) {
      for (const scriptElement of scriptElements) {
        scriptElement.classList.toggle('selected', scriptElement === evt.target);
      }
      activeScript = script;
      showActiveCards();
      evt.stopPropagation();
    }
  });
}

function createBasicOptionCard() {
  const container = e('DIV', { className: 'input-container' });
  const { contextMenu, filter } = getSettings();
  // add checkbox for controlling the presence of Conradish item in context menu
  const contextMenuCheckbox = addCheckbox(container, l('add_context_menu_item'), contextMenu);
  contextMenuCheckbox.addEventListener('change', (evt) => {
    const checked = evt.target.classList.contains('checked');
    changeSettings((settings) => {
      settings.contextMenu = checked;
    });
  });
  // add checkbox and drop-down for controlling content filtering
  const filterTypes = [ 'automatic', 'manual' ];
  const filtering = filterTypes.includes(filter);
  const filterSelect = e('SELECT', {}, filterTypes.map((value) => {
    const selected = (value === filter);
    return e('OPTION', { value, selected }, l(`filter_${value}`));
  }));
  filterSelect.style.visibility = (filtering) ? 'visible' : 'hidden';
  filterSelect.addEventListener('change', (evt) => {
    changeSettings((settings) => {
      settings.filter = filterSelect.value;
    });
  });
  const filterCheckbox = addCheckbox(container, [ l('filter_page_content'), ' ', filterSelect ], filtering);
  filterCheckbox.addEventListener('change', (evt) => {
    const checked = evt.target.classList.contains('checked');
    changeSettings((settings) => {
      settings.filter = (checked) ? filterSelect.value : 'none';
      filterSelect.style.visibility = (checked) ? 'visible' : 'hidden';
    });
  });
  storageChange.addEventListener('settings', (evt) => {
    if (!evt.detail.self) {
      const { contextMenu, filter } = getSettings();
      const filtering = filterTypes.includes(filter);
      contextMenuCheckbox.classList.toggle('checked', contextMenu);
      filterCheckbox.classList.toggle('checked', filtering);
      filterSelect.style.visibility = (filtering) ? 'visible' : 'hidden';
    }
  });
  return addCard(l('basic_options'), container, [], () => activeCardType === 'basic');
}

async function createFontSelectionCards() {
  const fonts = [];
  for await (const font of getFontCoverage()) {
    const { fontId, displayName, coverage } = font;
    for (const script of coverage) {
      createFontSelectionCard(fontId, displayName, script);
    }
    fonts.push(font);
  }
  const changed = updateFontAvailability(fonts);
  if (changed) {
    updateFontSelection();
    await saveSettings();
  }
}

function createFontSelectionCard(fontId, displayName, script) {
  const sampleSentence = getSampleSentence(script);
  const sentenceElement = e('DIV', {
    className: 'preview-sentence',
    style: {
      fontFamily: `${fontId}, Adobe NotDef`,
    }
  }, sampleSentence);
  if (getScriptDirection(script) === 'rtl') {
    sentenceElement.classList.add('rtl');
  }
  const titleElement = e('SPAN', { className: 'font-display-name' });
  const isSelected = () => {
    const list = getScriptSpecificSettings('fonts', script);
    return list.includes(fontId);
  };
  const checkboxElement = addCheckbox(titleElement, displayName, isSelected());
  checkboxElement.addEventListener('change', async (evt) => {
    const checked = checkboxElement.classList.contains('checked');
    const list = getScriptSpecificSettings('fonts', script);
    if (checked) {
      list.push(fontId);
    } else {
      const index = list.indexOf(fontId);
      if (index !== -1) {
        list.splice(index, 1);
      }
    }
    await saveSettings();
  });
  storageChange.addEventListener('settings', (evt) => {
    checkboxElement.classList.toggle('checked', isSelected());
  });
  const previewElement = e('DIV', { className: 'preview-container' }, sentenceElement);
  const searchStrings = [ fontId.toLocaleLowerCase(), displayName.toLocaleLowerCase() ];
  return addCard(titleElement, previewElement, searchStrings, () => activeCardType === 'font' && activeScript === script);
}

function addCheckbox(container, label, checked) {
  const rippleElement = e('SPAN', { className: 'ripple' });
  const checkboxElement = e('SPAN', {
     className: 'checkbox',
     tabIndex: 0
   }, rippleElement);
  const labelElement = e('LABEL', {}, label);
  const sectionElement = e('SECTION', {}, [ checkboxElement, labelElement ]);
  if (checked) {
    checkboxElement.classList.add('checked');
  }
  container.append(sectionElement);
  return checkboxElement;
}

function addCard(title, children, searchStrings, isActive) {
  if (!(children instanceof Array)) {
    children = (children) ? [ children ] : [];
  }
  const headerElement = e('DIV', { className: 'card-title' }, title);
  const cardElement = e('DIV', { className: 'card' }, [ headerElement, ...children ]);
  const card = { headerElement, cardElement, searchStrings, isActive };
  cards.push(card);
  if (isActive()) {
    const [ spacerElement ] = listContainer.getElementsByClassName('list-end-spacer');
    listContainer.insertBefore(cardElement, spacerElement);
  }
  return card;
}

function showActiveCards() {
  while(listContainer.firstChild) {
    listContainer.firstChild.remove();
  }
  const activeCards = cards.filter(c => c.isActive());
  const elements = activeCards.map(c => c.cardElement);
  listContainer.append(...elements);
  const spacerElement = e('DIV', { className: 'list-end-spacer' }, '\u00a0');
  listContainer.append(spacerElement);
  listContainer.scrollIntoView({ block: 'start', behavior: 'auto' });
  const { searchElement, iconElement, inputElement } = searchInput;
  const label = l(`search_${activeCardType}`);
  if (label) {
    searchElement.classList.remove('hidden');
    iconElement.title = label;
    inputElement.placeholder = label;
    inputElement.value = '';
  } else {
    searchElement.classList.add('hidden');
  }
}

function search(query) {
  const queryLC = query.toLocaleLowerCase();
  const card = cards.find((card) => {
    if (card.isActive()) {
      for (const searchString of card.searchStrings) {
        if (searchString.includes(queryLC)) {
          return true;
        }
      }
    }
  });
  if (card) {
    card.cardElement.scrollIntoView();
  }
}

async function changeSettings(cb) {
  const settings = getSettings();
  cb(settings);
  await saveSettings();
}

function getSampleSentence(script) {
  const entry = sampleSentences[script];
  const keys = Object.keys(entry);
  let key = keys[0];
  if (keys.length > 1) {
    const languages = [ getUILanguage(), ...navigator.languages ];
    for (const language of languages) {
      const code = language.replace(/\-.*/, '').toLowerCase();
      if (keys.includes(code)) {
        key = code;
        break;
      }
    }
  }
  return entry[key];
}

const sampleSentences = {
  Arab: {
    ur: 'میرا معلق جہاز بام مچھلیوں سے بھرا ہوا ہے',
    ar: 'حَوّامتي مُمْتِلئة بِأَنْقَلَيْسون',
    fa: 'هاورکرافت من پر مارماهى است',
    ug: 'مېنىڭ ھاۋا-نېگىز كېمەمدە يىلان بېلىق تۇشۇپ كەتتى',
  },
  Armn: {
    hy: 'Իմ օդաթիռը լի է օձաձկերով',
  },
  Beng: {
    bn: 'আমার হভারক্রাফ্ট কুঁচে মাছ-এ ভরা হয়ে গেছে',
  },
  Cyrl: {
    ru: 'Моё судно на воздушной подушке полно угрей',
    br: 'Маё судна на паветранай падушцы поўна вуграмі',
    bg: 'Моят ховъркрафт е пълен със змиорки',
    kk: 'Менің әуе негіз кемесi жыланбалықпен толтырылған',
    ky: 'Менин аба кемем курт балыктар менен толуп турат',
    mk: 'Моето летачко возило е полно со јагули',
    ms: 'Hoverkraf saya penuh dengan belut',
    mn: 'Миний хөвөгч онгоц могой загасаар дүүрсэн байна',
    sr: 'Мој ховеркрафт је пун јегуља',
    uk: 'Моє судно на повітряній подушці повне вугрів',
    uz: 'Mening havo yostiqli kemam ilonbalig\'i bilan to\'lgan',
  },
  Deva: {
    hi: 'मेरी मँडराने वाली नाव सर्पमीनों से भरी हैं',
    mr: 'माझी हॉवरक्राफ्ट ईल माशांनी भरली आहे',
    ne: 'मेरो पानीजहाज वाम माछाले भरिपूर्ण छ',
  },
  Ethi: {
    am: 'የኔ ማንዣበቢያ መኪና በዓሣዎች ተሞልቷል',
  },
  Geor: {
    ka: 'ჩემი ხომალდი საჰაერო ბალიშზე სავსეა გველთევზებით',
  },
  Grek: {
    el: 'Το αερόστρωμνό μου είναι γεμάτο χέλια',
  },
  Gujr: {
    gu: 'મારી ભમતિ હોડી ઈલ માછલીઓ થી ભરેલી છે',
  },
  Guru: {
    pa: 'ਮੇਰਾ ਹਵਰਕ੍ਰਾਫ਼ਤ ਨਾਂਗਾਂ ਨਾਲ਼ ਭਰਿਆ ਪਿਆ।',
  },
  Hang: {
    ko: '제 호버크래프트가 장어로 가득해요',
  },
  Hans: {
    zh: '我的气垫船装满了鳝鱼',
  },
  Hant: {
    zh: '我的氣墊船裝滿了鱔魚 ',
  },
  Hebr: {
    iw: 'הרחפת שלי מלאה בצלופחים',
    yi: 'מײַן שוועבשיף איז פֿול מיט ווענגערס',
  },
  Jpan: {
    jp: '私のホバークラフトは鰻でいっぱいです',
  },
  Khmr: {
    km: 'សុទ្ធ​តែ​អន្ទង់​ពេញ​ទូក​ហោះ​យើង',
  },
  Knda: {
    kn: 'ನನ್ನ ಯಾಂತ್ರಿಕದೋಣಿ ಹಾವುಮೀನುಗಳಿಂದ ತುಂಬಿದೆ',
  },
  Laoo: {
    lo: 'ມີປາໄຫຼເຕັມຢູ່ໃນເຮືອພັດລົມຂອງຂ້ອຍ',
  },
  Latn: {
    en: 'My hovercraft is full of eels',
    af: 'My skeertuig is vol palings',
    sq: 'Automjeti im është plot me ngjala',
    az: 'Hoverkraftimin içi ilan balıǧı ilə doludur',
    eu: 'Nire aerolabaingailua aingirez beteta dago',
    bs: 'Moja lebdjelica je puna jegulja',
    ca: 'El meu aerolliscador està ple d\'anguiles',
    ceb: 'Puno ug palos akong huberkrap',
    co: 'U me battellu hè carcu d\'anguili',
    hr: 'Moja je lebdjelica puna jegulja',
    cs: 'Moje vznášedlo je plné úhořů',
    da: 'Mit luftpudefartøj er fyldt med ål',
    nl: 'Mijn luchtkussenboot zit vol paling',
    et: 'Mu hõljuk on angerjaid täis',
    tl: 'Puno ng palos ang aking hoberkrap',
    fi: 'Ilmatyynyalukseni on täynnä ankeriaita',
    fr: 'Mon aéroglisseur est plein d\'anguilles',
    fy: 'Min luftdümpetbüüdj as ful ma äil',
    gl: 'O meu aerodeslizador esta cheo de anguías',
    de: 'Mein Luftkissenfahrzeug ist voller Aale',
    ht: 'Se bato mwen ki flote sou dlo a ki te ranpli avèk èèl',
    ha: 'Jirgina a cike yake da bano',
    haw: 'Pihaʻū oʻu mokukauaheahe i nā puhi',
    hu: 'A légpárnás hajóm tele van angolnákkal',
    is: 'Svifnökkvinn minn er fullur af álum',
    ig: 'Azụ juputara na hovercraft m',
    id: 'Hovercraft saya penuh dengan belut',
    ga: 'Tá m\'árthach foluaineach lán d\'eascanna',
    it: 'Il mio aeroscafo è pieno di anguille',
    rw: 'Gutwara ibintu nabantu kumaz',
    ku: 'Hoverkrafta mi tijé marmasî e',
    la: 'Mea navis volitans anguillis plena est',
    lv: 'Mans gliseris ir pilns ar zušiem',
    lt: 'Mano laivas su oro pagalve pilnas ungurių',
    lb: 'Mäi Loftkësseboot ass voller Éilen',
    mt: 'Il-hovercraft tiegħi hu mimli sallur',
    mi: 'Kī tōnu taku waka topaki i te tuna',
    no: 'Luftputebåten min er full av ål',
    pl: 'Mój poduszkowiec jest pełen węgorzy',
    pt: 'O meu hovercraft está cheio de enguias',
    ro: 'Aeroglisorul meu e plin de țipari',
    sm: 'Ua tumu la\'u ato fagota i pusi',
    gd: 'Tha an hovercraft agam loma-làn easgannan',
    sn: 'Hovercraft yangu yakazara nemikunga',
    sk: 'Moje vznášadlo je plné úhorov',
    sl: 'Moje vozilo na zračni blazini je polno jegulj',
    so: 'Huufarkarafkayga waxaa ka buuxa eels',
    es: 'Mi aerodeslizador está lleno de anguilas',
    su: 'Kapal ngalayang abdi pinuh ku belut',
    sw: 'Gari langu linaloangama limejaa na mikunga',
    sv: 'Min svävare är full med ål',
    tr: 'Hoverkraftım yılan balığı dolu',
    vi: 'Tàu cánh ngầm của tôi đầy lươn',
    cy: 'Mae fy hofrenfad yn llawn llyswennod',
    xh: 'Inqwelo etshitshiliza phezu kwamanzi izele ziipalanga',
    yo: 'Ọkọ afategun-sare mi kun fun ẹja arọ',
    zu: 'Umkhumbi wami ugcwele ngenyoka zemanzini',
  },
  Mlym: {
    ml: 'എന്‍റെ പറക്കും-പേടകം നിറയെ വ്ളാങ്കുകളാണ്',
  },
  Mymr: {
    my: 'ကျွန်တော်ရဲ့ လေစီးယာဉ်မှာ ငါးရှင့်တွေအပြည့်ရှိနေပါတယ်။',
  },
  Orya: {
    or: 'ମୋ ହୋବର୍କ୍ରାଫ୍ଟ ରେ ଇଲ୍ ଭର୍ତି ହେଇ ଜାଇଛି।',
  },
  Sinh: {
    si: 'මාගේ වායු පා යානයේ ආඳන් පිරී ඇත',
  },
  Taml: {
    ta: 'என் மிதவை நிறைய விலாங்கு மீன்கள்',
  },
  Telu: {
    te: 'నా విమానము అంతా మలుగు చేపలతో నిండిపోయింది',
  },
  Thai: {
    th: 'โฮเวอร์คราฟท์ของผมเต็มไปด้วยปลาไหล',
  },
};

start();
