# UI Framework Usage Guide

## Overview

We've created a comprehensive UI framework for VS Code extensions with React components that match VS Code's design language.

## Available Components

### Button
```typescript
import { Button, PrimaryButton, SecondaryButton } from '@computor/ui';

<Button variant="primary">Click me</Button>
<Button variant="secondary" isLoading>Loading...</Button>
<Button variant="danger" disabled>Disabled</Button>
```

### Input
```typescript
import { Input, TextInput, PasswordInput, EmailInput } from '@computor/ui';

<Input placeholder="Enter text..." />
<PasswordInput placeholder="Password" required />
<EmailInput placeholder="Email" error errorMessage="Invalid email" />
```

### Select
```typescript
import { Select } from '@computor/ui';

<Select
  placeholder="Choose option..."
  options={[
    { value: 'opt1', label: 'Option 1' },
    { value: 'opt2', label: 'Option 2' }
  ]}
/>
```

### Checkbox & Radio
```typescript
import { Checkbox, RadioGroup } from '@computor/ui';

<Checkbox label="Enable feature" />
<RadioGroup
  name="theme"
  options={[
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ]}
/>
```

### Progress
```typescript
import { Progress, CircularProgress } from '@computor/ui';

<Progress value={75} showLabel />
<CircularProgress indeterminate />
```

### Card
```typescript
import { Card } from '@computor/ui';

<Card variant="bordered">
  <Card.Title>Title</Card.Title>
  <Card.Body>Content</Card.Body>
  <Card.Footer>
    <Card.Actions>
      <Button>Action</Button>
    </Card.Actions>
  </Card.Footer>
</Card>
```

## Using Components in VS Code Webviews

To use these React components in a VS Code webview, you need to:

### 1. Set up a Build Process

Create a webpack configuration to bundle your React components:

```javascript
// webpack.config.js
module.exports = {
  entry: './src/ui/views/MyView.tsx',
  output: {
    path: path.resolve(__dirname, 'out/bundles'),
    filename: 'myview.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  }
};
```

### 2. Create Your View

```typescript
// src/ui/views/MyView.tsx
import * as React from 'react';
import { Button, Input, Card } from '../components';

export const MyView = () => {
  return (
    <Card>
      <Card.Title>My Extension</Card.Title>
      <Card.Body>
        <Input placeholder="Enter value..." />
        <Button variant="primary">Submit</Button>
      </Card.Body>
    </Card>
  );
};
```

### 3. Load in Webview

```typescript
// src/extension.ts
const panel = vscode.window.createWebviewPanel(
  'myView',
  'My View',
  vscode.ViewColumn.One,
  {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.file(path.join(context.extensionPath, 'out/bundles'))
    ]
  }
);

const scriptUri = panel.webview.asWebviewUri(
  vscode.Uri.file(path.join(context.extensionPath, 'out/bundles/myview.js'))
);

panel.webview.html = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        /* Include component styles */
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script src="${scriptUri}"></script>
    </body>
  </html>
`;
```

## Why Not in the Current Showcase?

The current showcase (UIShowcaseView) displays information about the components rather than rendering them directly because:

1. **No bundler configured**: React components need to be compiled and bundled before they can run in a webview
2. **TypeScript/JSX compilation**: The `.tsx` files need to be transformed to JavaScript
3. **React runtime**: React and ReactDOM need to be included in the bundle

## Next Steps

To start using these components in your VS Code extension:

1. Install a bundler (webpack, rollup, or esbuild)
2. Configure TypeScript to compile JSX
3. Create your views using the components
4. Bundle and load them in your webviews

The components are fully functional and tested - they just need the build infrastructure to run in VS Code webviews.