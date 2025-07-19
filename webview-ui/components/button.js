/**
 * Button component
 */
class Button extends Component {
  constructor(options = {}) {
    super();
    this.options = {
      text: '',
      variant: 'primary',
      size: 'md',
      disabled: false,
      loading: false,
      icon: null,
      iconPosition: 'left',
      ...options
    };
    if (options.onClick) {
      this.on('click', () => {
        if (!this.options.disabled && !this.options.loading) {
          options.onClick();
        }
      });
    }
  }

  render() {
    const classes = [
      'vscode-button',
      `vscode-button--${this.options.variant}`,
      `vscode-button--${this.options.size}`
    ];

    if (this.options.disabled) classes.push('vscode-button--disabled');
    if (this.options.loading) classes.push('vscode-button--loading');

    const children = [];
    
    if (this.options.icon && this.options.iconPosition !== 'right') {
      children.push(this.createElement('span', {
        className: 'vscode-button__icon vscode-button__icon--left'
      }, [this.options.icon]));
    }
    
    children.push(this.createElement('span', {
      className: 'vscode-button__text',
      style: { visibility: this.options.loading ? 'hidden' : 'visible' }
    }, [this.options.text]));
    
    if (this.options.icon && this.options.iconPosition === 'right') {
      children.push(this.createElement('span', {
        className: 'vscode-button__icon vscode-button__icon--right'
      }, [this.options.icon]));
    }

    if (this.options.loading) {
      children.push(this.createElement('span', {
        className: 'vscode-button__spinner'
      }));
    }

    this.element = this.createElement('button', {
      className: classes.join(' '),
      disabled: this.options.disabled || this.options.loading,
      type: 'button'
    }, children);

    return this.element;
  }

  setLoading(loading) {
    this.options.loading = loading;
    this.update();
  }

  setText(text) {
    this.options.text = text;
    this.update();
  }

  setDisabled(disabled) {
    this.options.disabled = disabled;
    this.update();
  }
}

function createButton(options) {
  return new Button(options);
}