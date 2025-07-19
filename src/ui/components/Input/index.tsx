import * as React from 'react';
import styled, { css } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

type BaseInputProps = Omit<ComponentProps, 'onClick' | 'children'>;

export interface InputProps extends BaseInputProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'search' | 'tel' | 'url';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  error?: boolean;
  errorMessage?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  readOnly?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyUp?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyPress?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const InputWrapper = styled.div<{ fullWidth?: boolean }>`
  position: relative;
  display: ${props => props.fullWidth ? 'block' : 'inline-block'};
  width: ${props => props.fullWidth ? '100%' : 'auto'};
`;

const StyledInput = styled.input<{
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  hasIcon?: boolean;
  iconPosition?: 'left' | 'right';
}>`
  /* Base styles */
  font-family: var(--vscode-font-family);
  font-weight: 400;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 2px;
  outline: none;
  width: 100%;
  transition: all 0.2s ease;
  
  /* Placeholder */
  &::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
  
  /* Size variants */
  ${props => {
    switch (props.size) {
      case 'sm':
        return css`
          padding: 4px 8px;
          font-size: 12px;
          line-height: 18px;
        `;
      case 'lg':
        return css`
          padding: 10px 14px;
          font-size: 14px;
          line-height: 20px;
        `;
      default: // md
        return css`
          padding: 6px 10px;
          font-size: 13px;
          line-height: 20px;
        `;
    }
  }}
  
  /* Icon padding */
  ${props => props.hasIcon && props.iconPosition === 'left' && css`
    padding-left: 32px;
  `}
  
  ${props => props.hasIcon && props.iconPosition === 'right' && css`
    padding-right: 32px;
  `}
  
  /* Focus state */
  &:focus {
    border-color: var(--vscode-focusBorder);
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  
  /* Error state */
  ${props => props.error && css`
    border-color: var(--vscode-inputValidation-errorBorder);
    background-color: var(--vscode-inputValidation-errorBackground);
    
    &:focus {
      border-color: var(--vscode-inputValidation-errorBorder);
      outline-color: var(--vscode-inputValidation-errorBorder);
    }
  `}
  
  /* Disabled state */
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Read-only state */
  &:read-only {
    cursor: default;
    background-color: var(--vscode-input-background);
    opacity: 0.8;
  }
`;

const InputIcon = styled.span<{ position?: 'left' | 'right' }>`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
  
  ${props => props.position === 'left' ? 'left: 0;' : 'right: 0;'}
`;

const ErrorMessage = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: var(--vscode-inputValidation-errorForeground);
`;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  className,
  style,
  size = 'md',
  fullWidth = false,
  error = false,
  errorMessage,
  icon,
  iconPosition = 'left',
  type = 'text',
  disabled = false,
  ...props
}, ref) => {
  const inputClasses = classNames(
    'vscode-input',
    `vscode-input--${size}`,
    {
      'vscode-input--fullWidth': fullWidth,
      'vscode-input--error': error,
      'vscode-input--disabled': disabled,
      'vscode-input--with-icon': !!icon,
    },
    className
  );

  return (
    <InputWrapper fullWidth={fullWidth} style={style}>
      {icon && (
        <InputIcon position={iconPosition}>
          {icon}
        </InputIcon>
      )}
      <StyledInput
        ref={ref}
        className={inputClasses}
        size={size}
        error={error}
        hasIcon={!!icon}
        iconPosition={iconPosition}
        type={type}
        disabled={disabled}
        {...props}
      />
      {error && errorMessage && (
        <ErrorMessage>{errorMessage}</ErrorMessage>
      )}
    </InputWrapper>
  );
});

Input.displayName = 'Input';

// Export specific input types for convenience
export const TextInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="text" {...props} />
));
TextInput.displayName = 'TextInput';

export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="password" {...props} />
));
PasswordInput.displayName = 'PasswordInput';

export const EmailInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="email" {...props} />
));
EmailInput.displayName = 'EmailInput';

export const NumberInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="number" {...props} />
));
NumberInput.displayName = 'NumberInput';

export const SearchInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>((props, ref) => (
  <Input ref={ref} type="search" {...props} />
));
SearchInput.displayName = 'SearchInput';