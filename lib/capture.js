export function captureSelection(selection, lang) {
  const range = selection.getRangeAt(0);
  const title = document.title;
  const doc = { title, lang };
  chrome.runtime.sendMessage(undefined, { type: 'create', document: doc });
}
