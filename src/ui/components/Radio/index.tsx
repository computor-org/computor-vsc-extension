import * as React from 'react';
import styled, { css } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

type BaseRadioProps = Omit<ComponentProps, 'onClick'>;

export interface RadioProps extends BaseRadioProps {
  checked?: boolean;
  defaultChecked?: boolean;
  label?: React.ReactNode;
  name: string;
  value: string;
  required?: boolean;
  error?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}

const RadioWrapper = styled.label<{ disabled?: boolean }>`
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

const HiddenRadio = styled.input.attrs({ type: 'radio' })`
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
`;

const StyledRadio = styled.div<{
  checked?: boolean;
  disabled?: boolean;
  error?: boolean;
}>`
  width: 18px;
  height: 18px;
  border: 1px solid var(--vscode-checkbox-border);
  background-color: var(--vscode-checkbox-background);
  border-radius: 50%;
  transition: all 0.2s ease;
  position: relative;
  flex-shrink: 0;
  
  /* Hover state */
  ${RadioWrapper}:hover &:not([disabled]) {
    border-color: var(--vscode-focusBorder);
  }
  
  /* Focus state */
  ${HiddenRadio}:focus + & {
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
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 8px;
      height: 8px;
      border-radius: 50%;
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

const RadioLabel = styled.span<{ hasLabel?: boolean }>`
  ${props => props.hasLabel && css`
    margin-left: 8px;
  `}
`;

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({
  className,
  style,
  checked,
  defaultChecked,
  label,
  disabled = false,
  error = false,
  onChange,
  id,
  name,
  value,
  ...props
}, ref) => {
  const radioClasses = classNames(
    'vscode-radio',
    {
      'vscode-radio--checked': checked,
      'vscode-radio--disabled': disabled,
      'vscode-radio--error': error,
    },
    className
  );

  const radioId = id || `radio-${name}-${value}`;

  return (
    <RadioWrapper 
      htmlFor={radioId}
      className={`${radioClasses}-wrapper`}
      style={style}
      disabled={disabled}
    >
      <HiddenRadio
        ref={ref}
        id={radioId}
        className={radioClasses}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange}
        {...props}
      />
      <StyledRadio
        checked={checked ?? defaultChecked}
        disabled={disabled}
        error={error}
      />
      {label && (
        <RadioLabel hasLabel={!!label}>
          {label}
        </RadioLabel>
      )}
    </RadioWrapper>
  );
});

Radio.displayName = 'Radio';

// Radio Group component for convenience
interface RadioGroupProps {
  name: string;
  value?: string;
  defaultValue?: string;
  options: Array<{ value: string; label: React.ReactNode; disabled?: boolean }>;
  onChange?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  direction?: 'horizontal' | 'vertical';
  className?: string;
  style?: React.CSSProperties;
}

const RadioGroupWrapper = styled.div<{ direction?: 'horizontal' | 'vertical' }>`
  display: flex;
  flex-direction: ${props => props.direction === 'horizontal' ? 'row' : 'column'};
  gap: ${props => props.direction === 'horizontal' ? '16px' : '8px'};
`;

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  defaultValue,
  options,
  onChange,
  error = false,
  disabled = false,
  direction = 'vertical',
  className,
  style,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(event.target.value);
    }
  };

  return (
    <RadioGroupWrapper
      direction={direction}
      className={classNames('vscode-radio-group', className)}
      style={style}
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          checked={value !== undefined ? value === option.value : undefined}
          defaultChecked={defaultValue === option.value}
          disabled={disabled || option.disabled}
          error={error}
          onChange={handleChange}
        />
      ))}
    </RadioGroupWrapper>
  );
};