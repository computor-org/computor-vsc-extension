/**
 * Progress component
 */
class Progress extends Component {
  constructor(options = {}) {
    super();
    this.options = {
      value: 0,
      max: 100,
      label: '',
      variant: 'default',
      indeterminate: false,
      ...options
    };
    this.progressBar = null;
  }

  render() {
    const wrapper = this.createElement('div', { className: 'vscode-progress-wrapper' });

    if (this.options.label) {
      const label = this.createElement('div', {
        className: 'vscode-progress-label'
      }, [this.options.label]);
      wrapper.appendChild(label);
    }

    const container = this.createElement('div', {
      className: 'vscode-progress-container'
    });

    const barClasses = ['vscode-progress-bar'];
    if (this.options.variant !== 'default') {
      barClasses.push(`vscode-progress-bar--${this.options.variant}`);
    }
    if (this.options.indeterminate) {
      barClasses.push('vscode-progress-bar--indeterminate');
    }

    const percentage = Math.min(100, Math.max(0, (this.options.value / this.options.max) * 100));
    
    this.progressBar = this.createElement('div', {
      className: barClasses.join(' '),
      style: this.options.indeterminate ? {} : { width: `${percentage}%` }
    });

    container.appendChild(this.progressBar);
    wrapper.appendChild(container);

    this.element = wrapper;
    return wrapper;
  }

  setValue(value) {
    this.options.value = value;
    if (this.progressBar && !this.options.indeterminate) {
      const percentage = Math.min(100, Math.max(0, (value / this.options.max) * 100));
      this.progressBar.style.width = `${percentage}%`;
    }
  }

  setIndeterminate(indeterminate) {
    this.options.indeterminate = indeterminate;
    this.update();
  }

  setLabel(label) {
    this.options.label = label;
    this.update();
  }
}

function createProgress(options) {
  return new Progress(options);
}