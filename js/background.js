import { initializeStorage, storeObject, getSettings, storageChange } from './lib/storage.js';

async function start() {
  await initializeStorage();
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  storageChange.addEventListener('settings', handleSettings);
  const settings = getSettings();
  if (settings.contextMenu) {
    addContextMenu();
  }
  console.log(settings);
}

const createMenuId = 'create';

function addContextMenu() {
  chrome.contextMenus.create({
    contexts: [ 'selection' ],
    documentUrlPatterns: [ 'http://*/*', 'https://*/*', 'file://*' ],
    title: 'Create annotated document',
    id: createMenuId,
  });
}

function removeContextMenu() {
  console.log('remove');
  chrome.contextMenus.remove(createMenuId);
}

function handleSettings(evt) {
  console.log(evt);
  if (!evt.detail.self) {
    const settings = getSettings();
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

async function createDocument(tab) {
  const codeURL = chrome.runtime.getURL('js/lib/capture.js');
  const lang = await chrome.tabs.detectLanguage(tab.id);
  chrome.scripting.executeScript({
    target: { allFrames: true, tabId: tab.id },
    args: [ codeURL, lang ],
    func: async (codeURL, lang) => {
      const selection = getSelection();
      if (!selection.isCollapsed) {
        // load the code for capturing only if the frame has selection
        const { captureSelection } = await import(codeURL);
        captureSelection(selection, lang);
      }
    }
  });
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

start();
