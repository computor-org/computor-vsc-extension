import * as React from 'react';
import { Button, PrimaryButton, SecondaryButton, DangerButton } from './index';

export const ButtonExamples = () => {
  const [loadingButton, setLoadingButton] = React.useState<string | null>(null);

  const handleClick = (buttonName: string) => {
    console.log(`${buttonName} clicked`);
    setLoadingButton(buttonName);
    setTimeout(() => setLoadingButton(null), 2000);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'var(--vscode-font-family)' }}>
      <h2>Button Component Examples</h2>
      
      {/* Variants */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Variants</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <Button variant="primary" onClick={() => handleClick('Primary')}>
            Primary Button
          </Button>
          <Button variant="secondary" onClick={() => handleClick('Secondary')}>
            Secondary Button
          </Button>
          <Button variant="tertiary" onClick={() => handleClick('Tertiary')}>
            Tertiary Button
          </Button>
          <Button variant="danger" onClick={() => handleClick('Danger')}>
            Danger Button
          </Button>
        </div>
      </section>

      {/* Sizes */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Sizes</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium (Default)</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      {/* States */}
      <section style={{ marginBottom: '32px' }}>
        <h3>States</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button>Normal</Button>
          <Button disabled>Disabled</Button>
          <Button isLoading>Loading</Button>
        </div>
      </section>

      {/* With Icons */}
      <section style={{ marginBottom: '32px' }}>
        <h3>With Icons</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button icon={<span>📁</span>}>
            Open File
          </Button>
          <Button icon={<span>💾</span>} iconPosition="right">
            Save
          </Button>
          <Button icon={<span>🔄</span>} variant="secondary">
            Refresh
          </Button>
          <Button icon={<span>➕</span>} size="sm" variant="tertiary">
            Add Item
          </Button>
        </div>
      </section>

      {/* Full Width */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Full Width</h3>
        <div style={{ maxWidth: '400px' }}>
          <Button fullWidth style={{ marginBottom: '8px' }}>
            Full Width Primary
          </Button>
          <SecondaryButton fullWidth>
            Full Width Secondary
          </SecondaryButton>
        </div>
      </section>

      {/* Interactive Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Interactive Example</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <PrimaryButton 
            isLoading={loadingButton === 'save'}
            onClick={() => handleClick('save')}
            icon={<span>💾</span>}
          >
            Save Changes
          </PrimaryButton>
          <SecondaryButton 
            isLoading={loadingButton === 'cancel'}
            onClick={() => handleClick('cancel')}
          >
            Cancel
          </SecondaryButton>
          <DangerButton 
            isLoading={loadingButton === 'delete'}
            onClick={() => handleClick('delete')}
            icon={<span>🗑️</span>}
          >
            Delete
          </DangerButton>
        </div>
      </section>

      {/* Form Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Form Buttons</h3>
        <form onSubmit={(e) => { e.preventDefault(); console.log('Form submitted'); }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button type="submit" variant="primary">
              Submit Form
            </Button>
            <Button type="reset" variant="secondary">
              Reset
            </Button>
            <Button type="button" variant="tertiary">
              Cancel
            </Button>
          </div>
        </form>
      </section>

      {/* Composition Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Custom Styling</h3>
        <Button 
          style={{ 
            backgroundColor: 'var(--vscode-terminal-ansiGreen)',
            color: 'var(--vscode-editor-background)'
          }}
          onClick={() => console.log('Custom styled button clicked')}
        >
          Custom Styled Button
        </Button>
      </section>
    </div>
  );
};