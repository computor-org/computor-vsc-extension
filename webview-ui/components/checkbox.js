/**
 * Checkbox component
 */
class Checkbox extends Component {
  constructor(options = {}) {
    super();
    this.options = {
      label: '',
      checked: false,
      disabled: false,
      ...options
    };
    this.inputElement = null;
  }

  render() {
    const label = this.createElement('label', { className: 'vscode-checkbox' });

    this.inputElement = this.createElement('input', {
      type: 'checkbox',
      className: 'vscode-checkbox__input',
      checked: this.options.checked,
      disabled: this.options.disabled
    });

    this.inputElement.addEventListener('change', (e) => {
      this.options.checked = e.target.checked;
      if (this.options.onChange) {
        this.options.onChange(e.target.checked);
      }
    });

    label.appendChild(this.inputElement);

    const box = this.createElement('span', { className: 'vscode-checkbox__box' });
    label.appendChild(box);

    if (this.options.label) {
      const labelText = this.createElement('span', {
        className: 'vscode-checkbox__label'
      }, [this.options.label]);
      label.appendChild(labelText);
    }

    this.element = label;
    return label;
  }

  isChecked() {
    return this.inputElement?.checked || false;
  }

  setChecked(checked) {
    this.options.checked = checked;
    if (this.inputElement) {
      this.inputElement.checked = checked;
    }
  }

  toggle() {
    this.setChecked(!this.isChecked());
  }
}

function createCheckbox(options) {
  return new Checkbox(options);
}