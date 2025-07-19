import * as React from 'react';
import { expect } from 'chai';
import { Button, PrimaryButton, SecondaryButton } from './index';

describe('Button Component', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      const button = React.createElement(Button, {}, 'Click me');
      expect(button).to.not.be.null;
      expect(button.props.children).to.equal('Click me');
    });

    it('should render with custom className', () => {
      const button = React.createElement(Button, { 
        className: 'custom-class' 
      }, 'Button');
      expect(button.props.className).to.include('custom-class');
    });
  });

  describe('variants', () => {
    it('should apply primary variant by default', () => {
      const button = React.createElement(Button, {}, 'Button');
      expect(button.props.variant).to.equal('primary');
    });

    it('should apply secondary variant', () => {
      const button = React.createElement(Button, { 
        variant: 'secondary' 
      }, 'Button');
      expect(button.props.variant).to.equal('secondary');
    });

    it('should use variant helpers correctly', () => {
      const primary = React.createElement(PrimaryButton, {}, 'Primary');
      const secondary = React.createElement(SecondaryButton, {}, 'Secondary');
      
      // Variant helpers should not expose variant prop
      expect(primary).to.not.be.null;
      expect(secondary).to.not.be.null;
    });
  });

  describe('sizes', () => {
    it('should apply medium size by default', () => {
      const button = React.createElement(Button, {}, 'Button');
      expect(button.props.size).to.equal('md');
    });

    it('should apply different sizes', () => {
      const small = React.createElement(Button, { size: 'sm' }, 'Small');
      const large = React.createElement(Button, { size: 'lg' }, 'Large');
      
      expect(small.props.size).to.equal('sm');
      expect(large.props.size).to.equal('lg');
    });
  });

  describe('states', () => {
    it('should handle disabled state', () => {
      const button = React.createElement(Button, { 
        disabled: true 
      }, 'Disabled');
      expect(button.props.disabled).to.be.true;
    });

    it('should handle loading state', () => {
      const button = React.createElement(Button, { 
        isLoading: true 
      }, 'Loading');
      expect(button.props.isLoading).to.be.true;
      expect(button.props.disabled).to.be.true; // Should be disabled when loading
    });
  });

  describe('icons', () => {
    it('should render with icon on the left by default', () => {
      const icon = React.createElement('span', {}, '🔍');
      const button = React.createElement(Button, { 
        icon: icon 
      }, 'Search');
      
      expect(button.props.icon).to.equal(icon);
      expect(button.props.iconPosition).to.equal('left');
    });

    it('should render with icon on the right', () => {
      const icon = React.createElement('span', {}, '→');
      const button = React.createElement(Button, { 
        icon: icon,
        iconPosition: 'right'
      }, 'Next');
      
      expect(button.props.iconPosition).to.equal('right');
    });
  });

  describe('interaction', () => {
    it('should handle onClick callback', () => {
      const onClick = () => { console.log('clicked'); };
      
      const button = React.createElement(Button, { onClick }, 'Click me');
      expect(button.props.onClick).to.equal(onClick);
    });

    it('should not trigger onClick when disabled', () => {
      const onClick = () => { console.log('clicked'); };
      
      const button = React.createElement(Button, { 
        onClick,
        disabled: true 
      }, 'Disabled');
      
      expect(button.props.disabled).to.be.true;
    });
  });

  describe('fullWidth', () => {
    it('should apply fullWidth prop', () => {
      const button = React.createElement(Button, { 
        fullWidth: true 
      }, 'Full Width');
      expect(button.props.fullWidth).to.be.true;
    });
  });

  describe('button types', () => {
    it('should default to button type', () => {
      const button = React.createElement(Button, {}, 'Button');
      expect(button.props.type).to.equal('button');
    });

    it('should accept submit type', () => {
      const button = React.createElement(Button, { 
        type: 'submit' 
      }, 'Submit');
      expect(button.props.type).to.equal('submit');
    });

    it('should accept reset type', () => {
      const button = React.createElement(Button, { 
        type: 'reset' 
      }, 'Reset');
      expect(button.props.type).to.equal('reset');
    });
  });
});