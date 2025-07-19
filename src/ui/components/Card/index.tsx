import * as React from 'react';
import styled, { css } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

export interface CardProps extends ComponentProps {
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  hoverable?: boolean;
  clickable?: boolean;
  selected?: boolean;
}

const StyledCard = styled.div<CardProps>`
  /* Base styles */
  font-family: var(--vscode-font-family);
  background-color: var(--vscode-editor-background);
  color: var(--vscode-foreground);
  border-radius: 4px;
  position: relative;
  transition: all 0.2s ease;
  
  /* Width */
  ${props => props.fullWidth && css`
    width: 100%;
  `}
  
  /* Padding variants */
  ${props => {
    switch (props.padding) {
      case 'none':
        return css`padding: 0;`;
      case 'sm':
        return css`padding: 8px;`;
      case 'lg':
        return css`padding: 24px;`;
      default: // md
        return css`padding: 16px;`;
    }
  }}
  
  /* Variant styles */
  ${props => {
    switch (props.variant) {
      case 'bordered':
        return css`
          border: 1px solid var(--vscode-panel-border);
        `;
      case 'elevated':
        return css`
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          
          &:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          }
        `;
      default: // default
        return css`
          background-color: var(--vscode-sideBar-background);
          border: 1px solid transparent;
        `;
    }
  }}
  
  /* Hoverable state */
  ${props => props.hoverable && css`
    &:hover {
      background-color: var(--vscode-list-hoverBackground);
      ${props.variant === 'bordered' && css`
        border-color: var(--vscode-focusBorder);
      `}
    }
  `}
  
  /* Clickable state */
  ${props => props.clickable && css`
    cursor: pointer;
    user-select: none;
    
    &:active {
      transform: translateY(1px);
    }
  `}
  
  /* Selected state */
  ${props => props.selected && css`
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
    
    ${props.variant === 'bordered' && css`
      border-color: var(--vscode-focusBorder);
    `}
  `}
  
  /* Focus state for clickable cards */
  ${props => props.clickable && css`
    &:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
  `}
`;

const CardBase: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  padding = 'md',
  fullWidth = false,
  hoverable = false,
  clickable = false,
  selected = false,
  onClick,
  ...props
}) => {
  const cardClasses = classNames(
    'vscode-card',
    `vscode-card--${variant}`,
    `vscode-card--padding-${padding}`,
    {
      'vscode-card--fullWidth': fullWidth,
      'vscode-card--hoverable': hoverable,
      'vscode-card--clickable': clickable,
      'vscode-card--selected': selected,
    },
    className
  );

  return (
    <StyledCard
      className={cardClasses}
      variant={variant}
      padding={padding}
      fullWidth={fullWidth}
      hoverable={hoverable || clickable}
      clickable={clickable}
      selected={selected}
      onClick={onClick}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? 'button' : undefined}
      {...props}
    >
      {children}
    </StyledCard>
  );
};

// Card sub-components
const CardHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
  
  &:last-child {
    border-bottom: none;
  }
`;

const CardTitle = styled.h3`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vscode-foreground);
`;

const CardSubtitle = styled.div`
  margin-top: 4px;
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
`;

const CardBody = styled.div`
  padding: 16px;
`;

const CardFooter = styled.div`
  padding: 16px;
  border-top: 1px solid var(--vscode-panel-border);
  
  &:first-child {
    border-top: none;
  }
`;

const CardActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  
  &.right {
    justify-content: flex-end;
  }
  
  &.center {
    justify-content: center;
  }
  
  &.space-between {
    justify-content: space-between;
  }
`;

// Type exports for sub-components
export interface CardComponent extends React.FC<CardProps> {
  Header: typeof CardHeader;
  Title: typeof CardTitle;
  Subtitle: typeof CardSubtitle;
  Body: typeof CardBody;
  Footer: typeof CardFooter;
  Actions: typeof CardActions;
}

// Create the Card component with sub-components
export const Card = Object.assign(CardBase, {
  Header: CardHeader,
  Title: CardTitle,
  Subtitle: CardSubtitle,
  Body: CardBody,
  Footer: CardFooter,
  Actions: CardActions,
}) as CardComponent;

// Also export as TypedCard for backwards compatibility
export const TypedCard = Card;