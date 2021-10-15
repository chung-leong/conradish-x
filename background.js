chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.contextMenus.onClicked.addListener(handleMenuClick);
  chrome.contextMenus.create({
    contexts: [ 'selection' ],
    documentUrlPatterns: [ 'http://*/*', 'https://*/*', 'file://*' ],
    title: 'Create annotated document',
    id: 'create',
  });
});

function handleMessage(request, sender, sendResponse) {
  switch (request.type) {
    case 'create': return handleCreateDocument(request);
  }
}

function handleCreateDocument({ document }) {
  console.log('Create', document);
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
    func: captureSelection,
    args: [ codeURL, lang ],
    target: { allFrames: true, tabId: tab.id }
  });
}

async function captureSelection(codeURL, lang) {
  const selection = getSelection();
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return;
  }
  // load the code for capturing only if the frame has selection
  const { captureRange } = await import(codeURL);
  captureRange(range, lang);
}
