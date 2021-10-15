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
