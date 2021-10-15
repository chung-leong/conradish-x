export function captureRange(range, lang) {
  const title = document.title;
  const doc = { title, lang };
  chrome.runtime.sendMessage(undefined, { type: 'create', document: doc });
}
