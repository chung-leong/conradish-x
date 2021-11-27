import { initializeStorage, getSettings, storeObject, storageChange } from './lib/storage.js';
import { getPageURL } from './lib/navigation.js';

let currentSettings;

async function start() {
  const storageInitialization = initializeStorage();
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.onInstalled.addListener(async () => {
    // create menu here, since the extension could have been
    // loaded before and got unloaded
    await storageInitialization;
    const settings = getSettings();
    if (settings.contextMenu) {
      addContextMenu();
    }
  });
  // wait for storage initiation then listen for changes
  await storageInitialization;
  currentSettings = getSettings();
  storageChange.addEventListener('settings', handleSettings);
}

const createMenuId = 'create';

function addContextMenu() {
  chrome.contextMenus.create({
    contexts: [ 'selection' ],
    documentUrlPatterns: [ 'http://*/*', 'https://*/*' ],
    title: 'Create print version',
    id: createMenuId,
  }, () => chrome.runtime.lastError);
}

function removeContextMenu() {
  chrome.contextMenus.remove(createMenuId, () => chrome.runtime.lastError);
}

async function createDocument(tab) {
  const codeURL = chrome.runtime.getURL('js/lib/capturing.js');
  await chrome.scripting.executeScript({
    target: { allFrames: true, tabId: tab.id },
    args: [ codeURL ],
    func: async (codeURL) => {
      const selection = getSelection();
      if (!selection.isCollapsed) {
        // load the code for capturing only if the frame has selection
        const { captureSelection } = await import(codeURL);
        const doc = await captureSelection(selection);
        try {
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
}

async function handleSettings(evt) {
  if (!evt.detail.self) {
    const before = currentSettings.contextMenu;
    currentSettings = getSettings();
    const after = currentSettings.contextMenu;
    if (before !== after) {
      if (after) {
        addContextMenu();
      } else {
        removeContextMenu();
      }
    }
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
      handleSelectionQuery(sendResponse);
      // keep sendResponse alive by returning true
      return true;
    case 'response':
      handleSelectionResponse(true);
      break;
    case 'error':
      console.error(request.message);
      break;
  }
  return false;
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

let responseFunc = null;

async function handleSelectionQuery(sendResponse) {
  let [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tab.url);
  if ([ 'http:', 'https:', 'file:' ].includes(url.protocol)) {
    responseFunc = sendResponse;
    // ask all frames if they have selection
    chrome.scripting.executeScript({
      target: { allFrames: true, tabId: tab.id },
      func: () => {
        const selection = getSelection();
        if (!selection.isCollapsed) {
          chrome.runtime.sendMessage({ type: 'response' });
        }
      }
    });
    // call the response function after a while if not frame responded
    setTimeout(handleSelectionResponse, 500, false);
  } else {
    sendResponse(null);
  }
}

function handleSelectionResponse(state) {
  if (responseFunc) {
    responseFunc(state);
    responseFunc = null;
  }
}

async function handleMenuClick(info, tab) {
  switch (info.menuItemId) {
    case 'create':
      return createDocument(tab);
  }
}

start();
