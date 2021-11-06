import { getDefaultSettings } from './settings.js';

const directory = [];
let settings;

export function getSettings() {
  return settings;
}

export async function saveSettings() {
  return set('settings', settings);
}

export async function initializeStorage() {
  const keys = await get('directory');
  if (keys) {
    for (const key of keys) {
      directory.push(key);
    }
  }
  settings = await get('settings');
  if (!settings) {
    settings = getDefaultSettings();
  }
  chrome.storage.onChanged.addListener(handleChanged);
}

export function findObjects(suffix) {
  const matches = [];
  for (const key of directory) {
    if (!suffix || key.endsWith(`:${suffix}`)) {
      const date = new Date(key.substr(0, 24));
      const type = key.substr(25);
      matches.push({ key, date, type });
    }
  }
  return matches;
}

export async function storeObject(suffix, object) {
  const now = new Date;
  const key = `${now.toISOString()}:${suffix}`;
  await saveObject(key, object);
  return key;
}

export async function saveObject(key, object) {
  for (;;) {
    try {
      await set(key, object);
      break;
    } catch (e) {
      const deleted = await removeOldestObject();
      if (!deleted) {
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
    directory.splice(index, 1);
    await set('directory', directory);
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
  const key = directory[0];
  if (key) {
    deleteObject(key);
    return true;
  } else {
    return false;
  }
}

async function handleChanged(changes, areaName) {
  let changed = false;
  for (const [ key, change ] of Object.entries(changes)) {
    if (key === 'directory') {
      continue;
    }
    if (change.newValue === undefined) {
      const index = directory.indexOf(key);
      directory.splice(index, 1);
      changed = true;
    } else if (!directory.includes(key)) {
      directory.push(key);
      changed = true;
    }
  }
  if (changed) {
    directory.sort();
    await set('directory', directory);
  }
}

async function set(key, value) {
  return new Promise((resolve, reject) => {
    const obj = {};
    obj[key] = value;
    chrome.storage.local.set(obj, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
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
        reject(chrome.runtime.lastError);
      } else {
        resolve(items[key]);
      }
    });
  });
}

async function remove(keys) {
  console.log(keys);
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}
