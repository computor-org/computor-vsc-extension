import * as React from 'react';
import styled, { css } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

export interface ButtonProps extends ComponentProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  type?: 'button' | 'submit' | 'reset';
}

const StyledButton = styled.button<ButtonProps>`
  /* Base styles */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vscode-font-family);
  font-weight: 400;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  user-select: none;
  position: relative;
  outline: none;
  text-decoration: none;
  
  /* Full width */
  ${props => props.fullWidth && css`
    width: 100%;
  `}
  
  /* Size variants */
  ${props => {
    switch (props.size) {
      case 'sm':
        return css`
          padding: 4px 12px;
          font-size: 12px;
          line-height: 18px;
        `;
      case 'lg':
        return css`
          padding: 10px 20px;
          font-size: 14px;
          line-height: 20px;
        `;
      default: // md
        return css`
          padding: 6px 14px;
          font-size: 13px;
          line-height: 20px;
        `;
    }
  }}
  
  /* Variant styles */
  ${props => {
    switch (props.variant) {
      case 'secondary':
        return css`
          background-color: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          
          &:hover:not(:disabled) {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
        `;
      case 'tertiary':
        return css`
          background-color: transparent;
          color: var(--vscode-textLink-foreground);
          border-color: transparent;
          
          &:hover:not(:disabled) {
            background-color: var(--vscode-toolbar-hoverBackground);
          }
        `;
      case 'danger':
        return css`
          background-color: var(--vscode-inputValidation-errorBackground);
          color: var(--vscode-inputValidation-errorForeground);
          border-color: var(--vscode-inputValidation-errorBorder);
          
          &:hover:not(:disabled) {
            opacity: 0.9;
          }
        `;
      default: // primary
        return css`
          background-color: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          
          &:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
          }
        `;
    }
  }}
  
  /* Focus styles */
  &:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 1px;
  }
  
  /* Disabled state */
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Loading state */
  ${props => props.isLoading && css`
    pointer-events: none;
    opacity: 0.7;
    
    &::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      margin: auto;
      border: 2px solid transparent;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: button-loading-spinner 0.8s linear infinite;
    }
  `}
  
  @keyframes button-loading-spinner {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const ButtonIcon = styled.span<{ position?: 'left' | 'right' }>`
  display: inline-flex;
  align-items: center;
  ${props => props.position === 'left' ? 'margin-right: 6px;' : 'margin-left: 6px;'}
`;

const ButtonContent = styled.span<{ isLoading?: boolean }>`
  ${props => props.isLoading && css`
    visibility: hidden;
  `}
`;

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  type = 'button',
  onClick,
  ...props
}) => {
  const buttonClasses = classNames(
    'vscode-button',
    `vscode-button--${variant}`,
    `vscode-button--${size}`,
    {
      'vscode-button--fullWidth': fullWidth,
      'vscode-button--loading': isLoading,
      'vscode-button--disabled': disabled,
      'vscode-button--with-icon': !!icon,
    },
    className
  );

  const handleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !isLoading && onClick) {
      onClick(event);
    }
  }, [disabled, isLoading, onClick]);

  return (
    <StyledButton
      className={buttonClasses}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      isLoading={isLoading}
      disabled={disabled || isLoading}
      type={type}
      onClick={handleClick}
      {...props}
    >
      <ButtonContent isLoading={isLoading}>
        {icon && iconPosition === 'left' && (
          <ButtonIcon position="left">{icon}</ButtonIcon>
        )}
        {children}
        {icon && iconPosition === 'right' && (
          <ButtonIcon position="right">{icon}</ButtonIcon>
        )}
      </ButtonContent>
    </StyledButton>
  );
};

// Export button variants for convenience
export const PrimaryButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="primary" {...props} />
);

export const SecondaryButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="secondary" {...props} />
);

export const TertiaryButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="tertiary" {...props} />
);

export const DangerButton: React.FC<Omit<ButtonProps, 'variant'>> = (props) => (
  <Button variant="danger" {...props} />
);