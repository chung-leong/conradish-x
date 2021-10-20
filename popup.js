import { initializeStorage, findObjects, loadObject } from './lib/storage.js';

async function start() {
  const list = document.createElement('UL');
  const create = document.createElement('LI');
  create.textContent = 'Create annotated document';
  create.className = 'create';
  list.appendChild(create);
  document.body.appendChild(list);
  const sep1 = document.createElement('LI');
  sep1.className = 'separator';
  list.appendChild(sep1);
  await initializeStorage();
  const docs = findObjects();
  if (docs.length > 0) {
    for (const { key, date, type } of docs.slice(-5)) {
      const doc = await loadObject(key);
      const open = document.createElement('LI');
      open.textContent = doc.title;
      open.className = 'document';
      open.title = `Created on ${date.toLocaleString()}`;
      list.appendChild(open);
    }
    const sep2 = document.createElement('LI');
    sep2.className = 'separator';
    list.appendChild(sep2);
    const show = document.createElement('LI');
    show.textContent = 'Show all documents';
    show.className = 'folder';
    list.appendChild(show);
  }
}

addEventListener('load', start);
