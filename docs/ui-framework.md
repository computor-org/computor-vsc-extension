# UI Framework - Pure JavaScript Components for VS Code Extensions

## Overview

This is a lightweight UI framework for VS Code extensions built with pure JavaScript - no React, build process, or heavy dependencies required! The framework provides seamless communication between webview components and the VS Code extension through the `vscode.postMessage()` API.

## Features

- ✅ **No build process required** - Components work directly in webviews
- ✅ **Zero dependencies** - Pure JavaScript implementation
- ✅ **VS Code theme integration** - Automatically matches the editor theme
- ✅ **Lightweight** - Minimal overhead, fast loading
- ✅ **Easy to extend** - Simple class-based component system
- ✅ **TypeScript support** - Full type safety in extension code
- ✅ **Seamless communication** - Built-in `vscode.postMessage()` integration
- ✅ **Event-driven architecture** - Components emit events that trigger extension actions

## Architecture

```
webview-ui/
├── components.js       # Bundled components (all components in one file)
├── components/
│   └── components.css  # Component styles
├── showcase.js         # Demo implementation
└── showcase.css        # Demo styles
```

The main difference from other frameworks is that all JavaScript components are bundled into a single `components.js` file, making it easy to load in any webview with just one script tag.

## Available Components

### Button
```javascript
const button = createButton({
  text: 'Click me',
  variant: 'primary', // primary | secondary | tertiary | danger
  size: 'md',         // sm | md | lg
  disabled: false,
  loading: false,
  icon: '🚀',
  iconPosition: 'left',
  onClick: () => console.log('Clicked!')
});

document.body.appendChild(button.render());

// Methods
button.setLoading(true);
button.setDisabled(true);
button.setText('New text');
```

### Input
```javascript
const input = createInput({
  type: 'text',      // text | password | email | number | search
  placeholder: 'Enter value...',
  value: '',
  disabled: false,
  error: false,
  errorMessage: 'Invalid input',
  icon: '🔍',
  iconPosition: 'left',
  onChange: (value) => console.log('Changed:', value),
  onEnter: (value) => console.log('Enter pressed:', value)
});

// Methods
input.getValue();
input.setValue('new value');
input.setError(true, 'Error message');
input.clear();
input.focus();
```

### Select
```javascript
const select = createSelect({
  placeholder: 'Choose option...',
  value: '',
  options: [
    { value: 'opt1', label: 'Option 1' },
    { value: 'opt2', label: 'Option 2', disabled: true }
  ],
  onChange: (value) => console.log('Selected:', value)
});

// Methods
select.getValue();
select.setValue('opt1');
select.setDisabled(true);
```

### Checkbox
```javascript
const checkbox = createCheckbox({
  label: 'Enable feature',
  checked: false,
  disabled: false,
  onChange: (checked) => console.log('Checked:', checked)
});

// Methods
checkbox.isChecked();
checkbox.setChecked(true);
checkbox.toggle();
```

### Progress
```javascript
const progress = createProgress({
  value: 75,
  max: 100,
  label: 'Processing...',
  variant: 'default', // default | success | warning | error
  indeterminate: false
});

// Methods
progress.setValue(80);
progress.setIndeterminate(true);
progress.setLabel('Almost done...');
```

### Card
```javascript
const actions = createCardActions('right'); // left | center | right
actions.addButton(createButton({ text: 'Save' }).render());

const card = createCard({
  title: 'Card Title',
  subtitle: 'Card subtitle',
  content: 'Card content or HTML element',
  variant: 'bordered',  // default | bordered | elevated
  hoverable: true,
  clickable: true,
  selected: false,
  footer: actions.render(),
  onClick: () => console.log('Card clicked')
});

// Methods
card.setSelected(true);
card.setContent('New content');
card.setTitle('New title');
```

## Communication System

The framework provides built-in communication between webview components and the VS Code extension using the `vscode.postMessage()` API.

### Sending Messages from Components

Components can send messages to the extension by calling `vscode.postMessage()`:

```javascript
const button = createButton({
  text: 'Save File',
  onClick: () => {
    vscode.postMessage({
      type: 'saveAction',
      data: { 
        filename: 'example.txt',
        timestamp: new Date().toISOString() 
      }
    });
  }
});
```

### Handling Messages in Extension

The extension handles messages in the webview panel's `handleMessage` method:

```typescript
handleMessage(message: any): void {
  switch (message.type) {
    case 'saveAction':
      vscode.window.showInformationMessage(`Saving ${message.data.filename}`);
      // Perform save operation
      break;
    case 'formSubmit':
      this.processForm(message.data);
      break;
    default:
      console.log('Received message:', message);
  }
}
```

### Message Types

The framework supports various message types for different interactions:

- `buttonClicked` - Button press events
- `formSubmit` - Form submission with validation data
- `formFieldChanged` - Individual field changes
- `checkboxChanged` - Checkbox state changes
- `progressChanged` - Progress bar updates
- `languageSelected` - Select dropdown changes
- `loadingStarted/loadingCompleted` - Loading state changes
- Custom types for application-specific events

## Using in VS Code Extensions

### 1. Create a Webview Panel

```typescript
import { BaseWebviewPanel } from './ui/base/BaseWebviewPanel';

export class MyView extends BaseWebviewPanel {
  constructor(context: vscode.ExtensionContext) {
    super(context, 'myView', 'My View Title');
  }

  getHtml(): string {
    const nonce = this.generateNonce();
    const cspSource = this.getCspSource();
    
    // Get URIs for webview resources
    const componentsUri = this.getWebviewUri('webview-ui/components.js');
    const scriptUri = this.getWebviewUri('webview-ui/myview.js');
    const styleUri = this.getWebviewUri('webview-ui/components/components.css');

    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';">
        <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
        <div id="app"></div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
        </script>
        <script nonce="${nonce}" src="${componentsUri}"></script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  handleMessage(message: any): void {
    // Handle messages from webview
    switch (message.type) {
      case 'alert':
        vscode.window.showInformationMessage(message.text);
        break;
    }
  }
}
```

### 2. Make Sure Resources Are Accessible

Ensure your `BaseWebviewPanel` includes the webview-ui directory in `localResourceRoots`:

```typescript
localResourceRoots: [
  vscode.Uri.file(path.join(context.extensionPath, 'webview-ui')),
]
```

### 3. Create Your Webview Script

```javascript
// webview-ui/myview.js
// Get components from the global UIComponents object
const { createButton, createInput } = window.UIComponents;

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  
  // Create a form
  const form = document.createElement('div');
  
  const nameInput = createInput({ 
    placeholder: 'Enter your name...', 
    icon: '👤' 
  });
  
  const submitBtn = createButton({ 
    text: 'Submit',
    variant: 'primary',
    onClick: () => {
      const name = nameInput.getValue();
      if (name) {
        vscode.postMessage({ 
          type: 'alert', 
          text: `Hello, ${name}!` 
        });
      }
    }
  });
  
  form.appendChild(nameInput.render());
  form.appendChild(submitBtn.render());
  app.appendChild(form);
});
```

## Component Base Class

All components extend the base `Component` class:

```javascript
class Component {
  constructor(className = '') 
  createElement(tag, attributes = {}, children = [])
  render() // Must be implemented by subclass
  update(options) 
  on(event, handler)
  off(event)
  mount(parent)
  destroy()
}
```

## Creating Custom Components

```javascript
class MyComponent extends Component {
  constructor(options = {}) {
    super('my-component');
    this.options = options;
  }

  render() {
    this.element = this.createElement('div', {
      className: 'my-component'
    }, [
      this.createElement('h3', {}, [this.options.title || 'My Component']),
      this.createElement('p', {}, [this.options.content || 'Content goes here'])
    ]);
    
    return this.element;
  }
}

// Factory function
function createMyComponent(options) {
  return new MyComponent(options);
}
```

## Benefits of This Approach

1. **No Build Process** - JavaScript files are loaded directly by the webview
2. **Zero Dependencies** - No framework overhead or version conflicts
3. **Fast Loading** - Minimal code to parse and execute
4. **Easy Debugging** - Standard JavaScript in browser DevTools
5. **VS Code Native** - Designed specifically for VS Code extensions
6. **Full Control** - Direct DOM manipulation when needed

## Example: Complete Form

```javascript
// Create a registration form
const formCard = createCard({
  title: 'User Registration',
  subtitle: 'Please fill out all fields',
  variant: 'bordered'
});

const form = document.createElement('form');
form.style.display = 'flex';
form.style.flexDirection = 'column';
form.style.gap = '16px';

// Create form inputs
const nameInput = createInput({ 
  placeholder: 'Full name', 
  icon: '👤',
  required: true 
});

const emailInput = createInput({ 
  type: 'email', 
  placeholder: 'Email address', 
  icon: '📧',
  required: true 
});

const roleSelect = createSelect({
  placeholder: 'Select role...',
  options: [
    { value: 'developer', label: 'Developer' },
    { value: 'designer', label: 'Designer' },
    { value: 'manager', label: 'Manager' }
  ]
});

const agreeCheck = createCheckbox({ 
  label: 'I agree to the terms and conditions' 
});

// Add inputs to form
form.appendChild(nameInput.render());
form.appendChild(emailInput.render());
form.appendChild(roleSelect.render());
form.appendChild(agreeCheck.render());

// Create form actions
const actions = createCardActions('right');

const cancelBtn = createButton({ 
  text: 'Cancel', 
  variant: 'secondary' 
});

const submitBtn = createButton({ 
  text: 'Submit', 
  variant: 'primary',
  onClick: () => {
    // Validate form
    let valid = true;
    
    if (!nameInput.getValue()) {
      nameInput.setError(true, 'Name is required');
      valid = false;
    }
    
    if (!emailInput.getValue()) {
      emailInput.setError(true, 'Email is required');
      valid = false;
    }
    
    if (!agreeCheck.isChecked()) {
      vscode.postMessage({ 
        type: 'error', 
        message: 'You must agree to the terms' 
      });
      valid = false;
    }
    
    if (valid) {
      const formData = {
        name: nameInput.getValue(),
        email: emailInput.getValue(),
        role: roleSelect.getValue(),
        agreed: agreeCheck.isChecked()
      };
      
      vscode.postMessage({ 
        type: 'formSubmit', 
        data: formData 
      });
    }
  }
});

actions.addButton(cancelBtn.render());
actions.addButton(submitBtn.render());

// Assemble and render
formCard.setContent(form);
formCard.setFooter(actions.render());
document.body.appendChild(formCard.render());
```

## Testing the Components

To see all components in action:

1. Press F5 in VS Code to launch the extension
2. Run command: "Computor: Show UI Components"
3. Explore the interactive component showcase

## VS Code Theme Integration

All components automatically adapt to the current VS Code theme using CSS variables:

- `--vscode-button-background`
- `--vscode-button-foreground`
- `--vscode-input-background`
- `--vscode-input-border`
- `--vscode-foreground`
- `--vscode-focusBorder`
- And many more...

This ensures your extension UI always matches the user's VS Code theme preferences.