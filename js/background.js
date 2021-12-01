import { initializeStorage, getSettings, storeObject, storageChange } from './lib/storage.js';
import { getPageURL } from './lib/navigation.js';
import { l, initializeLocalization } from './lib/i18n.js';

async function start() {
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.runtime.onMessage.addListener(handleMessage);
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
      createDocument(tab);
      break;
    case 'rename':
      chrome.runtime.sendMessage({ type: 'rename' });
      break;
  }
}

start();
