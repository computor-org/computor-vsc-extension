import * as React from 'react';
import styled, { css } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

type BaseSelectProps = Omit<ComponentProps, 'onClick' | 'children'>;

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends BaseSelectProps {
  value?: string;
  defaultValue?: string;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  error?: boolean;
  errorMessage?: string;
  required?: boolean;
  name?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLSelectElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLSelectElement>) => void;
}

const SelectWrapper = styled.div<{ fullWidth?: boolean }>`
  position: relative;
  display: ${props => props.fullWidth ? 'block' : 'inline-block'};
  width: ${props => props.fullWidth ? '100%' : 'auto'};
`;

const StyledSelect = styled.select<{
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  hasValue?: boolean;
}>`
  /* Base styles */
  font-family: var(--vscode-font-family);
  font-weight: 400;
  border: 1px solid var(--vscode-dropdown-border);
  background-color: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border-radius: 2px;
  outline: none;
  width: 100%;
  transition: all 0.2s ease;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='%23cccccc' d='M4.427 5.427l3.573 3.573 3.573-3.573L12 6l-4 4-4-4z'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 16px;
  padding-right: 32px;
  box-sizing: border-box;
  
  /* Placeholder style */
  ${props => !props.hasValue && css`
    color: var(--vscode-input-placeholderForeground);
  `}
  
  /* Size variants */
  ${props => {
    switch (props.size) {
      case 'sm':
        return css`
          padding: 4px 32px 4px 8px;
          font-size: 12px;
          line-height: 18px;
        `;
      case 'lg':
        return css`
          padding: 10px 32px 10px 14px;
          font-size: 14px;
          line-height: 20px;
        `;
      default: // md
        return css`
          padding: 6px 32px 6px 10px;
          font-size: 13px;
          line-height: 20px;
        `;
    }
  }}
  
  /* Focus state */
  &:focus {
    border-color: var(--vscode-focusBorder);
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  
  /* Hover state */
  &:hover:not(:disabled) {
    border-color: var(--vscode-dropdown-border);
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
  
  /* Option styles */
  option {
    background-color: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    padding: 4px 8px;
    
    &:disabled {
      color: var(--vscode-disabledForeground);
    }
  }
`;

const ErrorMessage = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: var(--vscode-inputValidation-errorForeground);
`;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  className,
  style,
  size = 'md',
  fullWidth = false,
  error = false,
  errorMessage,
  options,
  placeholder,
  value,
  defaultValue,
  disabled = false,
  onChange,
  ...props
}, ref) => {
  const hasValue = value !== undefined ? !!value : defaultValue !== undefined ? !!defaultValue : false;
  
  const selectClasses = classNames(
    'vscode-select',
    `vscode-select--${size}`,
    {
      'vscode-select--fullWidth': fullWidth,
      'vscode-select--error': error,
      'vscode-select--disabled': disabled,
    },
    className
  );

  return (
    <SelectWrapper fullWidth={fullWidth} style={style}>
      <StyledSelect
        ref={ref}
        className={selectClasses}
        size={size}
        error={error}
        hasValue={hasValue}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        {...props}
      >
        {placeholder && (
          <option value="" disabled={!value && !defaultValue}>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </StyledSelect>
      {error && errorMessage && (
        <ErrorMessage>{errorMessage}</ErrorMessage>
      )}
    </SelectWrapper>
  );
});

Select.displayName = 'Select';