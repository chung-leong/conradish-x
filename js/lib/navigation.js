export function openPage(name, params = {}) {
  const url = getPageURL(name, params);
  const target = getWindowName(name, Object.values(params));
  window.open(url, target);
}

export function getPageURL(name, params = {}) {
  const url = new URL(chrome.runtime.getURL(`${name}.html`));
  for (const [ name, value ] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

export function getWindowName(name, args = []) {
  return [ 'conradish', name, ...args ].join('-');
}

export function setWindowName(name, args = []) {
  window.name = getWindowName(name, args);
}
