import * as React from 'react';
import { Button, Input, Card, Select, Checkbox, Progress } from '../components';

/**
 * Example view showing how to use the UI components
 * 
 * This demonstrates how you would use these components in a real VS Code extension view.
 * To make this work in a webview, you would need to:
 * 1. Set up webpack or another bundler
 * 2. Compile this TSX file along with the components
 * 3. Load the resulting bundle in your webview
 */
export const ExampleView: React.FC = () => {
  const [inputValue, setInputValue] = React.useState('');
  const [selectValue, setSelectValue] = React.useState('');
  const [isChecked, setIsChecked] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      console.log('Form submitted:', {
        input: inputValue,
        select: selectValue,
        checked: isChecked
      });
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <Card variant="bordered">
        <Card.Header>
          <Card.Title>Extension Settings</Card.Title>
          <Card.Subtitle>Configure your extension preferences</Card.Subtitle>
        </Card.Header>
        
        <Card.Body>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>API Endpoint</label>
                <Input
                  placeholder="https://api.example.com"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  required
                  icon={<span>🌐</span>}
                />
              </div>
              
              <Select
                placeholder="Select environment..."
                value={selectValue}
                onChange={(e) => setSelectValue(e.target.value)}
                options={[
                  { value: 'dev', label: 'Development' },
                  { value: 'staging', label: 'Staging' },
                  { value: 'prod', label: 'Production' }
                ]}
                required
              />
              
              <Checkbox
                label="Enable automatic updates"
                checked={isChecked}
                onChange={(e) => setIsChecked(e.target.checked)}
              />
              
              {isLoading && (
                <Progress indeterminate showLabel label="Saving settings..." />
              )}
            </div>
          </form>
        </Card.Body>
        
        <Card.Footer>
          <Card.Actions className="right">
            <Button 
              variant="secondary" 
              disabled={isLoading}
              onClick={() => {
                setInputValue('');
                setSelectValue('');
                setIsChecked(false);
              }}
            >
              Reset
            </Button>
            <Button 
              variant="primary" 
              type="submit"
              isLoading={isLoading}
              onClick={handleSubmit}
            >
              Save Settings
            </Button>
          </Card.Actions>
        </Card.Footer>
      </Card>
    </div>
  );
};