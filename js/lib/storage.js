import { getDefaultSettings } from './settings.js';

const directory = [];
let initialized = false;
let settings;
const saving = [];

export const storageChange = new EventTarget;

export function getSettings() {
  return settings;
}

export async function saveSettings() {
  return saveObject('.settings', settings);
}

chrome.storage.onChanged.addListener(handleChanged);

export async function initializeStorage() {
  if (initialized) {
    return;
  }
  const keys = await get('.directory');
  if (keys) {
    for (const key of keys) {
      directory.push(key);
    }
    directory.sort();
  }
  settings = await get('.settings');
  const defaultSettings = getDefaultSettings();
  if (settings) {
    applyMissingDefault(settings, defaultSettings);
  } else {
    settings = defaultSettings;
  }
  initialized = true;
}

function applyMissingDefault(dest, src) {
  for (const [ name, value ] of Object.entries(src)) {
    if (dest[name] === undefined) {
      dest[name] = value;
    } else if (value instanceof Object) {
      if (!(dest[name] instanceof Object)) {
        dest[name] = {};
      }
      applyMissingDefault(dest[name], value);
    }
  }
}

export function findObjects(suffix) {
  const matches = [];
  for (const key of directory) {
    if (!suffix || key.endsWith(`:${suffix}`)) {
      matches.push(parseKey(key));
    }
  }
  return matches;
}

function parseKey(key) {
  const date = new Date(key.substr(0, 24));
  const type = key.substr(25);
  return { key, date, type };
}

export async function storeObject(suffix, object) {
  const now = new Date;
  const key = `${now.toISOString()}:${suffix}`;
  await saveObject(key, object);
  return key;
}

export async function saveObject(key, object) {
  saving.push(key);
  for (;;) {
    try {
      await set(key, object);
      break;
    } catch (e) {
      const deleted = await removeOldestObject();
      if (!deleted) {
        const index = saving.indexOf(key);
        if (index !== -1) {
          saving.splice(index, 1);
        }
        throw e;
      }
    }
  }
}

export async function loadObject(key) {
  const object = await get(key);
  if (object === undefined) {
    // remove key from the directory if object is missing
    const index = directory.indexOf(key);
    if (index !== -1) {
      directory.splice(index, 1);
      await saveDirectory();
    }
    throw new Error(`There is no document with the key "${key}"`);
  }
  return object;
}

export async function deleteObject(key) {
  await remove(key);
}

export async function deleteObjects(keys) {
  await remove(keys);
}

async function removeOldestObject() {
  const key = directory.shift();
  if (key) {
    deleteObject(key);
    return true;
  } else {
    return false;
  }
}

async function set(key, value) {
  return new Promise((resolve, reject) => {
    const obj = {};
    obj[key] = value;
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

async function get(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(items[key]);
      }
    });
  });
}

async function remove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

async function handleChanged(changes, areaName) {
  if (!initialized) {
    return;
  }
  let dirChanged = false;
  for (const [ key, change ] of Object.entries(changes)) {
    const index = saving.indexOf(key);
    const self = (index !== -1);
    if (index !== -1) {
      saving.splice(index, 1);
    }
    if (key.charAt(0) === '.') {
      if (key === '.settings') {
        if (!self) {
          // modified by another process--reload it
          const newSettings = await get('.settings');
          if (newSettings) {
            settings = newSettings;
          }
        }
        const detail = { self };
        const evt = new CustomEvent('settings', { detail });
        storageChange.dispatchEvent(evt);
      }
      continue;
    }
    let type;
    if (change.newValue === undefined) {
      const index = directory.indexOf(key);
      if (index !== -1) {
        directory.splice(index, 1);
        dirChanged = true;
      }
      type = 'delete';
    } else if (!directory.includes(key)) {
      directory.push(key);
      dirChanged = true;
      type = 'create';
    } else {
      type = 'update';
    }
    const detail = { self, ...parseKey(key) };
    const evt = new CustomEvent(type, { detail });
    storageChange.dispatchEvent(evt);
  }
  if (dirChanged) {
    await saveDirectory();
  }
}

async function saveDirectory() {
  directory.sort();
  await saveObject('.directory', directory);
}
