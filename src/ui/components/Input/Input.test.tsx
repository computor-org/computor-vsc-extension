import * as React from 'react';
import { expect } from 'chai';
import { Input, TextInput, PasswordInput, EmailInput, NumberInput, SearchInput, InputProps } from './index';

describe('Input Component', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      const input = React.createElement(Input, { placeholder: 'Test input' });
      expect(input).to.not.be.null;
      expect(input.props.placeholder).to.equal('Test input');
    });

    it('should render with custom className', () => {
      const input = React.createElement(Input, { 
        className: 'custom-class',
        placeholder: 'Test' 
      });
      expect(input.props.className).to.equal('custom-class');
    });

    it('should forward ref', () => {
      const ref = React.createRef<HTMLInputElement>();
      const input = React.createElement(Input, { ref });
      expect(input).to.not.be.null;
    });
  });

  describe('types', () => {
    it('should default to text type', () => {
      const input = React.createElement(Input, {});
      expect(input.props.type).to.equal('text');
    });

    it('should accept different input types', () => {
      const types: InputProps['type'][] = ['text', 'password', 'email', 'number', 'search', 'tel', 'url'];
      types.forEach(type => {
        const input = React.createElement(Input, { type });
        expect(input.props.type).to.equal(type);
      });
    });

    it('should use type helpers correctly', () => {
      const text = React.createElement(TextInput, {});
      const password = React.createElement(PasswordInput, {});
      const email = React.createElement(EmailInput, {});
      const number = React.createElement(NumberInput, {});
      const search = React.createElement(SearchInput, {});
      
      expect(text).to.not.be.null;
      expect(password).to.not.be.null;
      expect(email).to.not.be.null;
      expect(number).to.not.be.null;
      expect(search).to.not.be.null;
    });
  });

  describe('sizes', () => {
    it('should apply medium size by default', () => {
      const input = React.createElement(Input, {});
      expect(input.props.size).to.equal('md');
    });

    it('should apply different sizes', () => {
      const small = React.createElement(Input, { size: 'sm' });
      const large = React.createElement(Input, { size: 'lg' });
      
      expect(small.props.size).to.equal('sm');
      expect(large.props.size).to.equal('lg');
    });
  });

  describe('states', () => {
    it('should handle disabled state', () => {
      const input = React.createElement(Input, { disabled: true });
      expect(input.props.disabled).to.be.true;
    });

    it('should handle readOnly state', () => {
      const input = React.createElement(Input, { readOnly: true });
      expect(input.props.readOnly).to.be.true;
    });

    it('should handle error state', () => {
      const input = React.createElement(Input, { 
        error: true,
        errorMessage: 'Error message' 
      });
      expect(input.props.error).to.be.true;
      expect(input.props.errorMessage).to.equal('Error message');
    });

    it('should handle required state', () => {
      const input = React.createElement(Input, { required: true });
      expect(input.props.required).to.be.true;
    });
  });

  describe('icons', () => {
    it('should render with icon on the left by default', () => {
      const icon = React.createElement('span', {}, '🔍');
      const input = React.createElement(Input, { icon });
      
      expect(input.props.icon).to.equal(icon);
      expect(input.props.iconPosition).to.equal('left');
    });

    it('should render with icon on the right', () => {
      const icon = React.createElement('span', {}, '→');
      const input = React.createElement(Input, { 
        icon,
        iconPosition: 'right'
      });
      
      expect(input.props.iconPosition).to.equal('right');
    });
  });

  describe('fullWidth', () => {
    it('should apply fullWidth prop', () => {
      const input = React.createElement(Input, { fullWidth: true });
      expect(input.props.fullWidth).to.be.true;
    });
  });

  describe('value handling', () => {
    it('should accept controlled value', () => {
      const input = React.createElement(Input, { value: 'controlled' });
      expect(input.props.value).to.equal('controlled');
    });

    it('should accept defaultValue', () => {
      const input = React.createElement(Input, { defaultValue: 'default' });
      expect(input.props.defaultValue).to.equal('default');
    });
  });

  describe('event handlers', () => {
    it('should accept onChange handler', () => {
      const onChange = () => { console.log('changed'); };
      const input = React.createElement(Input, { onChange });
      expect(input.props.onChange).to.equal(onChange);
    });

    it('should accept onFocus handler', () => {
      const onFocus = () => { console.log('focused'); };
      const input = React.createElement(Input, { onFocus });
      expect(input.props.onFocus).to.equal(onFocus);
    });

    it('should accept onBlur handler', () => {
      const onBlur = () => { console.log('blurred'); };
      const input = React.createElement(Input, { onBlur });
      expect(input.props.onBlur).to.equal(onBlur);
    });

    it('should accept keyboard event handlers', () => {
      const onKeyDown = () => { console.log('keydown'); };
      const onKeyUp = () => { console.log('keyup'); };
      const onKeyPress = () => { console.log('keypress'); };
      
      const input = React.createElement(Input, { onKeyDown, onKeyUp, onKeyPress });
      expect(input.props.onKeyDown).to.equal(onKeyDown);
      expect(input.props.onKeyUp).to.equal(onKeyUp);
      expect(input.props.onKeyPress).to.equal(onKeyPress);
    });
  });

  describe('HTML attributes', () => {
    it('should accept standard HTML input attributes', () => {
      const input = React.createElement(Input, {
        name: 'username',
        placeholder: 'Enter username',
        autoComplete: 'username',
        autoFocus: true,
        minLength: 3,
        maxLength: 20,
        pattern: '[A-Za-z0-9]+',
      });
      
      expect(input.props.name).to.equal('username');
      expect(input.props.placeholder).to.equal('Enter username');
      expect(input.props.autoComplete).to.equal('username');
      expect(input.props.autoFocus).to.be.true;
      expect(input.props.minLength).to.equal(3);
      expect(input.props.maxLength).to.equal(20);
      expect(input.props.pattern).to.equal('[A-Za-z0-9]+');
    });

    it('should accept number-specific attributes', () => {
      const input = React.createElement(NumberInput, {
        min: 0,
        max: 100,
        step: 5,
      });
      
      expect(input.props.min).to.equal(0);
      expect(input.props.max).to.equal(100);
      expect(input.props.step).to.equal(5);
    });
  });
});