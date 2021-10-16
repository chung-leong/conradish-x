import { initializeStorage, storeObject, findObjectKeys } from './lib/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.contextMenus.create({
    contexts: [ 'selection' ],
    documentUrlPatterns: [ 'http://*/*', 'https://*/*', 'file://*' ],
    title: 'Create annotated document',
    id: 'create',
  });
  const keys = findObjectKeys('DOC');
  console.log(keys);
});

function handleMessage(request, sender, sendResponse) {
  switch (request.type) {
    case 'create': return handleCreateDocument(request);
  }
}

async function handleCreateDocument({ document }) {
  const key = await storeObject('DOC', document);
  console.log('Create', key);
}

function handleMenuClick(info, tab) {
  switch (info.menuItemId) {
    case 'create': return handleCreateClick(tab);
  }
}

async function handleCreateClick(tab) {
  const codeURL = chrome.runtime.getURL('lib/capture.js');
  const lang = await chrome.tabs.detectLanguage(tab.id);
  chrome.scripting.executeScript({
    target: { allFrames: true, tabId: tab.id },
    args: [ codeURL, lang ],
    func: async (codeURL, lang) => {
      const selection = getSelection();
      if (selection.rangeCount > 0) {
        // load the code for capturing only if the frame has selection
        const { captureSelection } = await import(codeURL);
        captureSelection(selection, lang);
      }
    }
  });
}
