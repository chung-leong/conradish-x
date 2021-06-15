class Page {

}

class Footer {
  constructor() {
    this.node = add('FOOTER', 'fn-root');
    this.pusher = add('DIV', this.node, { innerText: '\u00a0' }, {
      float: 'right',
      visibility: 'hidden',
      height: '0'
    });
    this.frame = add('DIV', this.node, {}, {
      float: 'right',
      overflow: 'hidden',
      height: '0',
      width: '100%',
    });
    this.content = add('DIV', this.frame, { contentEditable: true }, {

    });
    this.height = 0;
  }

  async resize() {
    await updateCompletion;
    const height = this.content.contentHeight;
    if (height !== this.height) {
      const heightMM = toMillimeters(height);
      this.frame.style.height = `${heightMM}mm`;
      this.pusher.style.height = `${pageHeightMM - heightMM}mm`;
      this.height = height;
    }
  }
}

function add(tag, parent, style) {
  const node = document.createElement(tag);
  if (typeof(parent) === 'string') {
    parent = document.getElementById(parent);
  }
  Object.assign(node.style, style);
  parent.appendChild(node);
  return node;
}
