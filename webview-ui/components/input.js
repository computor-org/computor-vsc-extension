/**
 * Input component
 */
class Input extends Component {
  constructor(options = {}) {
    super();
    this.options = {
      type: 'text',
      placeholder: '',
      value: '',
      disabled: false,
      readonly: false,
      required: false,
      error: false,
      errorMessage: '',
      icon: null,
      iconPosition: 'left',
      ...options
    };
    this.inputElement = null;
  }

  render() {
    const wrapper = this.createElement('div', { className: 'vscode-input-wrapper' });

    if (this.options.icon) {
      const iconElement = this.createElement('span', {
        className: `vscode-input__icon vscode-input__icon--${this.options.iconPosition}`
      }, [this.options.icon]);
      wrapper.appendChild(iconElement);
    }

    const inputClasses = ['vscode-input'];
    if (this.options.error) inputClasses.push('vscode-input--error');
    if (this.options.icon && this.options.iconPosition === 'left') {
      inputClasses.push('vscode-input--with-icon-left');
    }
    if (this.options.icon && this.options.iconPosition === 'right') {
      inputClasses.push('vscode-input--with-icon-right');
    }

    this.inputElement = this.createElement('input', {
      type: this.options.type,
      className: inputClasses.join(' '),
      placeholder: this.options.placeholder || '',
      value: this.options.value || '',
      disabled: this.options.disabled,
      readonly: this.options.readonly,
      required: this.options.required,
      min: this.options.min,
      max: this.options.max
    });

    this.inputElement.addEventListener('input', (e) => {
      this.options.value = e.target.value;
      if (this.options.onChange) {
        this.options.onChange(e.target.value);
      }
    });

    this.inputElement.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && this.options.onEnter) {
        this.options.onEnter(e.target.value);
      }
    });

    wrapper.appendChild(this.inputElement);

    if (this.options.error && this.options.errorMessage) {
      const errorElement = this.createElement('div', {
        className: 'vscode-input__error'
      }, [this.options.errorMessage]);
      wrapper.appendChild(errorElement);
    }

    this.element = wrapper;
    return wrapper;
  }

  getValue() {
    return this.inputElement?.value || '';
  }

  setValue(value) {
    this.options.value = value;
    if (this.inputElement) {
      this.inputElement.value = value;
    }
  }

  setError(error, message) {
    this.options.error = error;
    this.options.errorMessage = message || '';
    this.update();
  }

  clear() {
    this.setValue('');
  }

  focus() {
    this.inputElement?.focus();
  }
}

function createInput(options) {
  return new Input(options);
}