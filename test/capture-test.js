import { captureSelection } from '../js/lib/capturing.js';
import { e } from '../js/lib/ui.js';

async function start() {
  const selectedSection = document.getElementById('selected');
  if (selectedSection) {
    try {
      await processSection(selectedSection);
    } catch (err) {
      console.error(err);
    }
  }
  const sectionElements = document.getElementsByTagName('SECTION');
  for (const sectionElement of [ ...sectionElements ]) {
    try {
      if (!selectedSection) {
        await processSection(sectionElement);
      } else {
        sectionElement.remove();
      }
    } catch (err) {
      console.error(err);
    }
  }
}

async function processSection(sectionElement) {
  const [ titleElement ] = sectionElement.getElementsByTagName('TITLE');
  const [ contentElment ] = sectionElement.getElementsByTagName('CONTENT');
  const [ expectedElement ] = sectionElement.getElementsByTagName('EXPECTED');
  const [ selectedElement ] = contentElment.getElementsByClassName('selected');
  const range = document.createRange();
  range.selectNodeContents(selectedElement || contentElment);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const expectedContent = JSON.parse(expectedElement.textContent);
  const { content } = await captureSelection(selection);
  const json = JSON.stringify(content, undefined, 2);
  const expectedJSON = JSON.stringify(expectedContent, undefined, 2);
  const headingElement = e('H1', {}, [ ...titleElement.childNodes ]);
  const resultElement = e('DIV', { className: 'results' }, [
    e('DIV', { className: 'content' }, [ ...contentElment.childNodes ]),
    e('DIV', { className: 'expected' }, expectedJSON),
    e('DIV', { className: 'output' }, json),
  ]);
  const containerElement = e('DIV', { className: 'test' }, [ headingElement, resultElement ]);
  if (json !== expectedJSON) {
    containerElement.classList.add('failed');
  }
  const { parentNode } = sectionElement;
  parentNode.replaceChild(containerElement, sectionElement);
  selection.removeAllRanges();
}

start();
