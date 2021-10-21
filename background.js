import { initializeStorage, storeObject } from './lib/storage.js';

async function start() {
  await initializeStorage();
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.contextMenus.create({
    contexts: [ 'selection' ],
    documentUrlPatterns: [ 'http://*/*', 'https://*/*', 'file://*' ],
    title: 'Create annotated document',
    id: 'create',
  });
}

function handleMessage(request, sender, sendResponse) {
  switch (request.type) {
    case 'create':
      return handleCreateDocument(request);
    case 'command':
      console.log(request)
      return handleCommand(request);
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

async function handleMenuClick(info, tab) {
  switch (info.menuItemId) {
    case 'create':
      return createDocument(tab);
  }
}

async function createDocument(tab) {
  const codeURL = chrome.runtime.getURL('lib/capture.js');
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
  console.log(url);
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
