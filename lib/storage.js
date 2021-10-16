const directory = [];

export async function initializeStorage() {
  try {
    const keys = await get('directory');
    for (const key of keys) {
      directory.push(key);
    }
  } catch (e) {
  }
  chrome.storage.onChanged.addListener(handleChanged);
}

export function findObjectKeys(suffix) {
  const matches = [];
  for (const key of directory) {
    if (key.endsWith(`:${suffix}`)) {
      const date = new Date(key.substr(0, 24));
      matches.push({ key, date });
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
    } catch (e) {
      const deleted = await removeOldestObject();
      if (!deleted) {
        throw e;
      }
    }
  }
}

export async function loadObject(key) {
  return get(key);
}

export async function deleteObject(key) {
  try {
    await remove(key);
  } catch (e) {
    const index = directory.indexOf(key);
    directory.splice(index, 1);
  }
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
      const index = directory;
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

async function remove(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}
