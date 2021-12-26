import { e } from './ui.js';

const toolbarContainer = document.getElementById('toolbar-container');

export function createTopBar(containerId, { left, center, right }) {
  const leftElement = e('DIV', { className: 'toolbar-left' }, left);
  const centerElement = e('DIV', { className: 'toolbar-center' }, center);
  const rightElement = e('DIV', { className: 'toolbar-right' }, right);
  const container = document.getElementById(containerId);
  container.append(leftElement, centerElement, rightElement);
}

export function attachShadowHandlers() {
  const mainContainer = document.getElementById('main-container');
  mainContainer.addEventListener('scroll', handleScroll);
}

function handleScroll(evt) {
  const { target } = evt;
  const { classList } = toolbarContainer;
  classList.toggle('shadow', target.scrollTop > 0);
}
