import * as React from 'react';
import { Input, TextInput, PasswordInput, EmailInput, NumberInput, SearchInput } from './index';

export const InputExamples = () => {
  const [values, setValues] = React.useState<Record<string, string>>({
    controlled: 'Controlled value',
    search: '',
  });

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'var(--vscode-font-family)' }}>
      <h2>Input Component Examples</h2>
      
      {/* Basic Inputs */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Basic Inputs</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <Input placeholder="Default input" />
          <Input defaultValue="Input with default value" />
          <Input 
            value={values.controlled} 
            onChange={handleChange('controlled')}
            placeholder="Controlled input"
          />
        </div>
      </section>

      {/* Input Types */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Input Types</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <TextInput placeholder="Text input" />
          <PasswordInput placeholder="Password input" />
          <EmailInput placeholder="Email input" />
          <NumberInput placeholder="Number input" min={0} max={100} step={5} />
          <SearchInput 
            placeholder="Search..." 
            value={values.search}
            onChange={handleChange('search')}
          />
        </div>
      </section>

      {/* Sizes */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Sizes</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <Input size="sm" placeholder="Small input" />
          <Input size="md" placeholder="Medium input (default)" />
          <Input size="lg" placeholder="Large input" />
        </div>
      </section>

      {/* States */}
      <section style={{ marginBottom: '32px' }}>
        <h3>States</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <Input placeholder="Normal input" />
          <Input placeholder="Disabled input" disabled />
          <Input defaultValue="Read-only input" readOnly />
          <Input placeholder="Required input" required />
          <Input 
            placeholder="Error input" 
            error 
            errorMessage="This field is required"
          />
          <Input 
            placeholder="Error with long message" 
            error 
            errorMessage="This is a longer error message that provides more context about what went wrong with the input validation."
          />
        </div>
      </section>

      {/* With Icons */}
      <section style={{ marginBottom: '32px' }}>
        <h3>With Icons</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <Input 
            icon={<span>🔍</span>}
            placeholder="Search with icon on left"
          />
          <Input 
            icon={<span>📧</span>}
            iconPosition="right"
            placeholder="Email with icon on right"
          />
          <Input 
            icon={<span>🔒</span>}
            type="password"
            placeholder="Password with icon"
          />
          <Input 
            icon={<span>⚠️</span>}
            error
            errorMessage="Invalid input"
            placeholder="Error with icon"
          />
        </div>
      </section>

      {/* Full Width */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Full Width</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input fullWidth placeholder="Full width input" />
          <Input fullWidth icon={<span>📝</span>} placeholder="Full width with icon" />
        </div>
      </section>

      {/* Form Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Form Example</h3>
        <form onSubmit={(e) => { e.preventDefault(); console.log('Form submitted'); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
            <Input 
              name="username"
              placeholder="Username"
              required
              autoComplete="username"
              icon={<span>👤</span>}
            />
            <Input 
              name="email"
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              icon={<span>📧</span>}
            />
            <Input 
              name="password"
              type="password"
              placeholder="Password"
              required
              autoComplete="new-password"
              minLength={8}
              icon={<span>🔒</span>}
            />
            <Input 
              name="age"
              type="number"
              placeholder="Age"
              min={18}
              max={120}
              icon={<span>🎂</span>}
            />
            <button type="submit">Submit</button>
          </div>
        </form>
      </section>

      {/* Interactive Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Interactive Example</h3>
        <div style={{ maxWidth: '400px' }}>
          <Input 
            placeholder="Type to see events..."
            onChange={(e) => console.log('onChange:', e.target.value)}
            onFocus={(e) => console.log('onFocus:', e.target.value)}
            onBlur={(e) => console.log('onBlur:', e.target.value)}
            onKeyDown={(e) => console.log('onKeyDown:', e.key)}
          />
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
            Check the console for input events
          </div>
        </div>
      </section>

      {/* Validation Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Validation Example</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}>
          <Input 
            type="email"
            placeholder="Email with pattern"
            pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
            errorMessage="Please enter a valid email address"
          />
          <Input 
            placeholder="Required field"
            required
            minLength={3}
            maxLength={20}
            errorMessage="Field must be between 3 and 20 characters"
          />
          <Input 
            type="number"
            placeholder="Number between 0-100"
            min={0}
            max={100}
            step={10}
            errorMessage="Please enter a number between 0 and 100"
          />
        </div>
      </section>
    </div>
  );
};