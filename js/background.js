import { initializeStorage, getSettings, storeObject, storageChange } from './lib/storage.js';
import { getPageURL } from './lib/navigation.js';
import { l, initializeLocalization } from './lib/i18n.js';

async function start() {
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.onInstalled.addListener(handleInstalled);
  await initializeStorage();
  await initializeLocalization();
  updateContextMenu();
  storageChange.addEventListener('settings', updateContextMenu);
}

function getContextMenuItems() {
  const settings = getSettings();
  return {
    create: {
      contexts: [ 'selection' ],
      documentUrlPatterns: [ 'http://*/*', 'https://*/*' ],
      title: l('create_print_version'),
      condition: () => settings.contextMenu,
    },
    rename: {
      contexts: [ 'page' ],
      documentUrlPatterns: [ chrome.runtime.getURL('article.html') + '*' ],
      title: l('change_title'),
    },
  };
}

const contextMenuItemCreated = {};

function updateContextMenu() {
  const contextMenuItems = getContextMenuItems();
  for (const [ id, item ] of Object.entries(contextMenuItems)) {
    const { condition, ...props } = item;
    const creating = !condition || condition();
    if (contextMenuItemCreated[id] !== creating) {
      if (creating) {
        chrome.contextMenus.update(id, props, () => {
          if (chrome.runtime.lastError) {
            chrome.contextMenus.create({ id, ...props }, () => chrome.runtime.lastError);
          }
        });
      } else {
        chrome.contextMenus.remove(id, () => chrome.runtime.lastError);
      }
      contextMenuItemCreated[id] = creating;
    }
  }
}

async function createDocument(tab) {
  const codeURL = chrome.runtime.getURL('js/lib/capturing.js');
  await initializeStorage();
  await initializeLocalization();
  const settings = getSettings();
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [ codeURL, settings ],
      func: async (codeURL, settings) => {
        const selections = [ getSelection() ];
        for (const iframe of document.getElementsByTagName('IFRAME')) {
          try {
            selections.push(iframe.contentWindow.getSelection());
          } catch (e) {
          }
        }
        const list = selections.filter(s => !s.isCollapsed);
        if (list.length > 0) {
          try {
            // load the code for capturing only if the frame has selection
            const { captureSelections } = await import(codeURL);
            const doc = await captureSelections(list, settings);
            chrome.runtime.sendMessage({ type: 'create', document: doc });
          } catch (err) {
            chrome.runtime.sendMessage({ type: 'error', message: err.message });
            throw err;
          }
        }
      }
    });
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
    }
  } catch (err) {
    console.error(err);
  }
}

function handleMessage(request, sender, sendResponse) {
  switch (request.type) {
    case 'create':
      handleCreateDocument(request);
      break;
    case 'capture':
      handleCapture();
      break;
    case 'query':
      handleSelectionQuery().then(sendResponse);
      // keep sendResponse alive by returning true
      return true;
    case 'error':
      console.error(request.message);
      break;
  }
  return false;
}

async function handleInstalled({ reason }) {
  if (reason === 'install') {
    const url = getPageURL('help');
    await chrome.tabs.create({ url });
  }
}

async function handleCreateDocument({ document }) {
  const key = await storeObject('DOC', document);
  const url = getPageURL('article', { t: key });
  await chrome.tabs.create({ url });
}

async function handleCapture() {
  let [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
  return createDocument(tab);
}

async function handleSelectionQuery(sendResponse) {
  let [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  if ([ 'http:', 'https:', 'file:' ].includes(url.protocol)) {
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selections = [ getSelection() ];
        for (const iframe of document.getElementsByTagName('IFRAME')) {
          try {
            selections.push(iframe.contentWindow.getSelection());
          } catch (e) {
          }
        }
        return selections.filter(s => !s.isCollapsed).length > 0;
      }
    });
    return frames[0].result;
  } else {
    return null;
  }
}

async function handleMenuClick(info, tab) {
  switch (info.menuItemId) {
    case 'create':
      createDocument(tab);
      break;
    case 'rename':
      chrome.runtime.sendMessage({ type: 'rename' });
      break;
  }
}

start();
