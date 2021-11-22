import { storeObject, getSettingsAsync, storageChange } from './lib/storage.js';

async function start() {
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.onInstalled.addListener(async () => {
    // create message here, since the extension could have been
    // loaded before and got unloaded
    const settings = await getSettingsAsync();
    if (settings.contextMenu) {
      addContextMenu();
    }
  });
  storageChange.addEventListener('settings', handleSettings);
}

const createMenuId = 'create';
let hasContextMenu = false;

function addContextMenu() {
  if (!hasContextMenu) {
    chrome.contextMenus.create({
      contexts: [ 'selection' ],
      documentUrlPatterns: [ 'http://*/*', 'https://*/*' ],
      title: 'Create annotated document',
      id: createMenuId,
    });
    hasContextMenu = true;
  }
}

function removeContextMenu() {
  if (hasContextMenu) {
    chrome.contextMenus.remove(createMenuId);
    hasContextMenu = false;
  }
}

async function createDocument(tab) {
  const codeURL = chrome.runtime.getURL('js/lib/capturing.js');
  const settings = await getSettingsAsync();
  await chrome.scripting.executeScript({
    target: { allFrames: true, tabId: tab.id },
    args: [ codeURL, settings.filter ],
    func: async (codeURL, filter) => {
      const selection = getSelection();
      if (!selection.isCollapsed) {
        // load the code for capturing only if the frame has selection
        const { captureSelection } = await import(codeURL);
        const doc = await captureSelection(selection, filter);
        try {
          chrome.runtime.sendMessage(undefined, { type: 'create', document: doc });
        } catch (err) {
          chrome.runtime.sendMessage(undefined, { type: 'error', message: err.message });
          throw err;
        }
      }
    }
  });
  if (chrome.runtime.lastError) {
    console.error(chrome.runtime.lastError.message);
  }
}

async function openDocument(key) {
  const url = new URL(chrome.runtime.getURL('article.html'));
  url.searchParams.set('t', key);
  return openTab(url);
}

async function openDocumentList() {
  const url = new URL(chrome.runtime.getURL('list.html'));
  return openTab(url);
}

async function openTab(url) {
  url = url.toString();
  const [ tab ] = await chrome.tabs.query({ url });
  if (tab) {
    // highlight the tab and bring window into focus
    const win = await chrome.tabs.highlight({
      tabs: [ tab.index ],
      windowId: tab.windowId
    });
    if (!win.focused) {
      chrome.windows.update(win.id, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url });
  }
}

async function handleSettings(evt) {
  if (!evt.detail.self) {
    const settings = await getSettingsAsync();
    if (settings.contextMenu) {
      addContextMenu();
    } else {
      removeContextMenu();
    }
  }
}

function handleMessage(request, sender, sendResponse) {
  switch (request.type) {
    case 'create':
      return handleCreateDocument(request);
    case 'command':
      return handleCommand(request);
    case 'query':
      handleSelectionQuery(sendResponse);
      // keep sendResponse alive by returning true
      return true;
    case 'response':
      return handleSelectionResponse(true);
    case 'error':
      console.error(request.message);
  }
}

async function handleCreateDocument({ document }) {
  const key = await storeObject('DOC', document);
  await openDocument(key);
}

async function handleCommand({ command, arg }) {
  switch (command) {
    case 'create':
      let [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
      return createDocument(tab);
    case 'openDOC':
      return openDocument(arg);
    case 'list':
      return openDocumentList();
  }
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
          chrome.runtime.sendMessage(undefined, { type: 'response' });
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
