/**
 * Base Component class for all UI components
 */
class Component {
  constructor(className = '') {
    this.element = null;
    this.id = 'component-' + Math.random().toString(36).substr(2, 9);
    this.className = className;
    this.events = new Map();
  }

  createElement(tag, attributes = {}, children = []) {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key.startsWith('data-')) {
        element.setAttribute(key, value);
      } else if (value !== undefined && value !== null && value !== '') {
        element[key] = value;
      }
    });

    children.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof HTMLElement) {
        element.appendChild(child);
      }
    });

    return element;
  }

  on(event, handler) {
    this.events.set(event, handler);
    if (this.element) {
      this.element.addEventListener(event, handler);
    }
  }

  off(event) {
    const handler = this.events.get(event);
    if (handler && this.element) {
      this.element.removeEventListener(event, handler);
    }
    this.events.delete(event);
  }

  update(options) {
    if (options) {
      Object.assign(this.options || {}, options);
    }
    if (this.element && this.element.parentElement) {
      const parent = this.element.parentElement;
      const newElement = this.render();
      parent.replaceChild(newElement, this.element);
      this.element = newElement;
    }
  }

  render() {
    throw new Error('render() must be implemented by subclass');
  }

  mount(parent) {
    if (typeof parent === 'string') {
      parent = document.querySelector(parent);
    }
    if (!this.element) {
      this.element = this.render();
    }
    if (parent) {
      parent.appendChild(this.element);
    }
  }

  destroy() {
    this.events.forEach((handler, event) => {
      if (this.element) {
        this.element.removeEventListener(event, handler);
      }
    });
    this.events.clear();
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
    this.element = null;
  }
}