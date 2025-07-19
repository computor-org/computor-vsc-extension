import * as React from 'react';
import styled, { css } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

type BaseCheckboxProps = Omit<ComponentProps, 'onClick'>;

export interface CheckboxProps extends BaseCheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  indeterminate?: boolean;
  label?: React.ReactNode;
  name?: string;
  value?: string;
  required?: boolean;
  error?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}

const CheckboxWrapper = styled.label<{ disabled?: boolean }>`
  display: inline-flex;
  align-items: center;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  user-select: none;
  font-family: var(--vscode-font-family);
  font-size: 13px;
  color: var(--vscode-foreground);
  
  &:hover:not([disabled]) {
    color: var(--vscode-foreground);
  }
`;

const HiddenCheckbox = styled.input.attrs({ type: 'checkbox' })`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
`;

const StyledCheckbox = styled.div<{
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  error?: boolean;
}>`
  width: 18px;
  height: 18px;
  border: 1px solid var(--vscode-checkbox-border);
  background-color: var(--vscode-checkbox-background);
  border-radius: 3px;
  transition: all 0.2s ease;
  position: relative;
  flex-shrink: 0;
  
  /* Hover state */
  ${CheckboxWrapper}:hover &:not([disabled]) {
    border-color: var(--vscode-focusBorder);
  }
  
  /* Focus state */
  ${HiddenCheckbox}:focus + & {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 1px;
  }
  
  /* Checked state */
  ${props => props.checked && css`
    background-color: var(--vscode-checkbox-selectBackground);
    border-color: var(--vscode-checkbox-selectBorder);
    
    &::after {
      content: '';
      position: absolute;
      left: 5px;
      top: 2px;
      width: 5px;
      height: 9px;
      border: solid var(--vscode-checkbox-foreground);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }
  `}
  
  /* Indeterminate state */
  ${props => props.indeterminate && css`
    background-color: var(--vscode-checkbox-selectBackground);
    border-color: var(--vscode-checkbox-selectBorder);
    
    &::after {
      content: '';
      position: absolute;
      left: 4px;
      top: 7px;
      width: 8px;
      height: 2px;
      background-color: var(--vscode-checkbox-foreground);
    }
  `}
  
  /* Error state */
  ${props => props.error && css`
    border-color: var(--vscode-inputValidation-errorBorder);
  `}
  
  /* Disabled state */
  ${props => props.disabled && css`
    opacity: 0.5;
    cursor: not-allowed;
  `}
`;

const CheckboxLabel = styled.span<{ hasLabel?: boolean }>`
  ${props => props.hasLabel && css`
    margin-left: 8px;
  `}
`;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({
  className,
  style,
  checked,
  defaultChecked,
  indeterminate = false,
  label,
  disabled = false,
  error = false,
  onChange,
  id,
  ...props
}, ref) => {
  const checkboxRef = React.useRef<HTMLInputElement>(null);
  const combinedRef = ref || checkboxRef;

  React.useEffect(() => {
    if (combinedRef && 'current' in combinedRef && combinedRef.current) {
      combinedRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate, combinedRef]);

  const checkboxClasses = classNames(
    'vscode-checkbox',
    {
      'vscode-checkbox--checked': checked,
      'vscode-checkbox--indeterminate': indeterminate,
      'vscode-checkbox--disabled': disabled,
      'vscode-checkbox--error': error,
    },
    className
  );

  const checkboxId = id || `checkbox-${React.useId()}`;

  return (
    <CheckboxWrapper 
      htmlFor={checkboxId}
      className={`${checkboxClasses}-wrapper`}
      style={style}
      disabled={disabled}
    >
      <HiddenCheckbox
        ref={combinedRef}
        id={checkboxId}
        className={checkboxClasses}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange}
        {...props}
      />
      <StyledCheckbox
        checked={checked ?? defaultChecked}
        indeterminate={indeterminate}
        disabled={disabled}
        error={error}
      />
      {label && (
        <CheckboxLabel hasLabel={!!label}>
          {label}
        </CheckboxLabel>
      )}
    </CheckboxWrapper>
  );
});

Checkbox.displayName = 'Checkbox';