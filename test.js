let article;
let dictionary;

class Article {
  constructor(container, contents) {
    this.pageWidth = 210;
    this.pageHeight = 297;
    this.marginLeft = 20;
    this.marginRight = 20;
    this.marginTop = 20;
    this.marginBottom = 20;
    this.contentWidth = this.pageWidth - this.marginLeft - this.marginRight;
    this.contentHeight = this.pageHeight - this.marginTop - this.marginBottom;
    this.node = add('DIV', container, {}, {
      paddingLeft: this.marginLeft,
      paddingRight: this.marginRight,
      paddingTop: this.marginTop,
      paddingBottom: this.marginBottom,
      width: this.contentWidth,
      visibility: 'hidden',
      boxSizing: 'content-box',
    });
    this.footerRoot = add('DIV', this.node);
    this.textRoot = add('DIV', this.node);
    this.contents = contents;
    this.pages = [];
  }

  async render() {
    for (let element of this.contents) {
      this.textRoot.appendChild(element);
    }
    await this.update();
    let pageCount = 1;
    while (this.pages.length < pageCount) {
      const page = new Page()
    }
  }
}

class Page {
  constructor() {
    this.footer = new Footer;
  }
}

class Footer {
  constructor() {
    this.node = add('FOOTER', article.footerRoot);
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
    await article.updateCompletion;
    const height = toMillimeters(this.content.contentHeight);
    if (height !== this.height) {
      this.frame.style.height = `${height}mm`;
      this.pusher.style.height = `${article.contentHeight - height}mm`;
      this.height = height;
    }
  }
}

function add(tag, parent, props, style) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  Object.assign(node.style, style);
  parent.appendChild(node);
  return node;
}

function toMillimeters(pixels) {
  return pixels * (25.4 / 96);
}
