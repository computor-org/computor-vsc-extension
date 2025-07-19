/**
 * Select component
 */
class Select extends Component {
  constructor(options = {}) {
    super();
    this.options = {
      options: [],
      value: '',
      placeholder: '',
      disabled: false,
      error: false,
      ...options
    };
    this.selectElement = null;
  }

  render() {
    const wrapper = this.createElement('div', { className: 'vscode-select-wrapper' });

    const selectClasses = ['vscode-select'];
    if (this.options.error) selectClasses.push('vscode-select--error');

    this.selectElement = this.createElement('select', {
      className: selectClasses.join(' '),
      disabled: this.options.disabled,
      value: this.options.value || ''
    });

    if (this.options.placeholder) {
      const placeholderOption = this.createElement('option', {
        value: '',
        disabled: true,
        selected: !this.options.value
      }, [this.options.placeholder]);
      this.selectElement.appendChild(placeholderOption);
    }

    this.options.options.forEach(opt => {
      const option = this.createElement('option', {
        value: opt.value,
        disabled: opt.disabled
      }, [opt.label]);
      this.selectElement.appendChild(option);
    });

    this.selectElement.addEventListener('change', (e) => {
      this.options.value = e.target.value;
      if (this.options.onChange) {
        this.options.onChange(e.target.value);
      }
    });

    wrapper.appendChild(this.selectElement);
    this.element = wrapper;
    return wrapper;
  }

  getValue() {
    return this.selectElement?.value || '';
  }

  setValue(value) {
    this.options.value = value;
    if (this.selectElement) {
      this.selectElement.value = value;
    }
  }

  setDisabled(disabled) {
    this.options.disabled = disabled;
    if (this.selectElement) {
      this.selectElement.disabled = disabled;
    }
  }
}

function createSelect(options) {
  return new Select(options);
}