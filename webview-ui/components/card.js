/**
 * Card component
 */
class Card extends Component {
  constructor(options = {}) {
    super();
    this.options = {
      title: '',
      subtitle: '',
      content: null,
      footer: null,
      variant: 'default',
      hoverable: false,
      clickable: false,
      selected: false,
      ...options
    };
    if (options.onClick && options.clickable) {
      this.on('click', () => {
        options.onClick();
      });
    }
  }

  render() {
    const classes = ['vscode-card'];
    if (this.options.variant !== 'default') {
      classes.push(`vscode-card--${this.options.variant}`);
    }
    if (this.options.hoverable) classes.push('vscode-card--hoverable');
    if (this.options.clickable) classes.push('vscode-card--clickable');
    if (this.options.selected) classes.push('vscode-card--selected');

    const children = [];

    if (this.options.title || this.options.subtitle) {
      const header = this.createElement('div', { className: 'vscode-card__header' });
      
      if (this.options.title) {
        header.appendChild(this.createElement('h3', {
          className: 'vscode-card__title'
        }, [this.options.title]));
      }
      
      if (this.options.subtitle) {
        header.appendChild(this.createElement('div', {
          className: 'vscode-card__subtitle'
        }, [this.options.subtitle]));
      }
      
      children.push(header);
    }

    if (this.options.content) {
      const body = this.createElement('div', { className: 'vscode-card__body' });
      if (typeof this.options.content === 'string') {
        body.innerHTML = this.options.content;
      } else {
        body.appendChild(this.options.content);
      }
      children.push(body);
    }

    if (this.options.footer) {
      const footer = this.createElement('div', { className: 'vscode-card__footer' });
      if (typeof this.options.footer === 'string') {
        footer.innerHTML = this.options.footer;
      } else {
        footer.appendChild(this.options.footer);
      }
      children.push(footer);
    }

    this.element = this.createElement('div', {
      className: classes.join(' ')
    }, children);

    return this.element;
  }

  setTitle(title) {
    this.options.title = title;
    this.update();
  }

  setContent(content) {
    this.options.content = content;
    this.update();
  }

  setFooter(footer) {
    this.options.footer = footer;
    this.update();
  }

  setSelected(selected) {
    this.options.selected = selected;
    this.update();
  }
}

class CardActions extends Component {
  constructor(alignment = 'right') {
    super();
    this.alignment = alignment;
    this.buttons = [];
  }

  addButton(button) {
    this.buttons.push(button);
    if (this.element) {
      this.element.appendChild(button);
    }
  }

  render() {
    const classes = ['vscode-card__actions'];
    if (this.alignment !== 'left') {
      classes.push(`vscode-card__actions--${this.alignment}`);
    }

    this.element = this.createElement('div', {
      className: classes.join(' ')
    }, this.buttons);

    return this.element;
  }
}

function createCard(options) {
  return new Card(options);
}

function createCardActions(alignment) {
  return new CardActions(alignment);
}