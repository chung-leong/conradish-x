import { e } from './lib/ui.js';
import { l } from './lib/i18n.js';
import { setWindowName } from './lib/navigation.js';

const listContainer = document.getElementById('list-container');
const toolbarContainer = document.getElementById('toolbar-container');
const tocContainer = document.getElementById('left-side-bar');

async function start() {
  setWindowName('help');
  createToolbar();
  await loadUserGuide();
  listContainer.parentNode.addEventListener('scroll', handleScroll);
}

function createToolbar() {
  const leftElement = e('DIV', { className: 'toolbar-left' }, l('user_guide'));
  const centerElement = e('DIV', { className: 'toolbar-center' });
  const rightElement = e('DIV', { className: 'toolbar-right' });
  const container = document.getElementById('toolbar-title');
  container.append(leftElement, centerElement, rightElement);
}

async function loadUserGuide() {
  const path = l('user_guide_path');
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  const html = await res.text();
  const div = e('DIV', { className: 'user-guide'});
  div.innerHTML = html;
  // fix paths of images
  const basePath = path.substr(0, path.lastIndexOf('/') + 1);
  for (const imgElement of div.getElementsByTagName('IMG')) {
    imgElement.src = `${basePath}/${imgElement.getAttribute('src')}`;
  }
  // add anchors to headings
  const headingElements = div.querySelectorAll('H1, H2, H3, H4, H5, H6');
  for (const headingElement of headingElements) {
    const name = headingElement.innerText.toLowerCase().replace(/\P{Letter}+/gu, '-');
    const range = document.createRange();
    range.selectNodeContents(headingElement);
    const fragment = range.extractContents();
    const anchorElement = e('A', { name }, fragment);
    headingElement.append(anchorElement);
  }
  listContainer.append(div);
  // create table of contents
  const stack = [];
  const linkURL = new URL(location.href);
  const containerElement = e('UL', { className: 'toc' });
  let parentElement = containerElement;
  let currentLevel;
  for (const headingElement of headingElements) {
    const name = headingElement.getElementsByTagName('A')[0].name;
    const level = parseInt(headingElement.tagName.substr(1));
    if (currentLevel === undefined) {
      currentLevel = level;
    } else if (level > currentLevel) {
      // start a new level
      const listElement = e('UL');
      parentElement.append(listElement)
      stack.push([ parentElement, currentLevel ]);
      parentElement = listElement;
      currentLevel = level;
    } else if (level < currentLevel) {
      // return to previous level
      [ parentElement, currentLevel ] = stack.pop();
    }
    linkURL.hash = `#${name}`;
    const linkElement = e('A', { href: linkURL.hash }, headingElement.innerText);
    const itemElement = e('LI', {}, linkElement);
    parentElement.append(itemElement);
  }
  tocContainer.append(containerElement);
}

function handleScroll(evt) {
  const { target } = evt;
  const { classList } = toolbarContainer;
  classList.toggle('shadow', target.scrollTop > 0);
}

start();
