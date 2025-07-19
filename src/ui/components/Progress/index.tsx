import * as React from 'react';
import styled, { css, keyframes } from 'styled-components';
import classNames from 'classnames';
import { ComponentProps } from '../../types';

type BaseProgressProps = Omit<ComponentProps, 'onClick' | 'children'>;

export interface ProgressProps extends BaseProgressProps {
  value?: number;
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  indeterminate?: boolean;
}

const ProgressWrapper = styled.div`
  width: 100%;
`;

const ProgressContainer = styled.div<{
  size?: 'sm' | 'md' | 'lg';
}>`
  position: relative;
  width: 100%;
  background-color: var(--vscode-progressBar-background);
  border-radius: 4px;
  overflow: hidden;
  
  ${props => {
    switch (props.size) {
      case 'sm':
        return css`height: 4px;`;
      case 'lg':
        return css`height: 12px;`;
      default:
        return css`height: 8px;`;
    }
  }}
`;

const indeterminateAnimation = keyframes`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
  }
`;

const ProgressBar = styled.div<{
  value: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  indeterminate?: boolean;
}>`
  height: 100%;
  transition: width 0.3s ease;
  border-radius: 4px;
  position: relative;
  
  ${props => props.indeterminate ? css`
    width: 50%;
    animation: ${indeterminateAnimation} 1.5s ease-in-out infinite;
  ` : css`
    width: ${props.value}%;
  `}
  
  ${props => {
    switch (props.variant) {
      case 'success':
        return css`
          background-color: var(--vscode-terminal-ansiGreen);
        `;
      case 'warning':
        return css`
          background-color: var(--vscode-terminal-ansiYellow);
        `;
      case 'error':
        return css`
          background-color: var(--vscode-inputValidation-errorBackground);
        `;
      default:
        return css`
          background-color: var(--vscode-progressBar-background);
          
          &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--vscode-button-background);
            opacity: 0.8;
          }
        `;
    }
  }}
`;

const ProgressLabel = styled.div`
  margin-top: 4px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const Progress: React.FC<ProgressProps> = ({
  className,
  style,
  value = 0,
  max = 100,
  variant = 'default',
  size = 'md',
  showLabel = false,
  label,
  indeterminate = false,
  ...props
}) => {
  const percentage = Math.min(Math.max(0, (value / max) * 100), 100);
  
  const progressClasses = classNames(
    'vscode-progress',
    `vscode-progress--${variant}`,
    `vscode-progress--${size}`,
    {
      'vscode-progress--indeterminate': indeterminate,
    },
    className
  );

  return (
    <ProgressWrapper className={progressClasses} style={style} {...props}>
      <ProgressContainer size={size}>
        <ProgressBar
          value={percentage}
          variant={variant}
          indeterminate={indeterminate}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </ProgressContainer>
      {(showLabel || label) && (
        <ProgressLabel>
          <span>{label || 'Progress'}</span>
          {!indeterminate && <span>{Math.round(percentage)}%</span>}
        </ProgressLabel>
      )}
    </ProgressWrapper>
  );
};

// Circular Progress variant
const CircularProgressWrapper = styled.div<{ size: number }>`
  position: relative;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const circularAnimation = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const CircularProgressSvg = styled.svg<{ indeterminate?: boolean }>`
  transform: rotate(-90deg);
  
  ${props => props.indeterminate && css`
    animation: ${circularAnimation} 1.5s linear infinite;
  `}
`;

const CircularProgressCircle = styled.circle<{
  variant?: 'default' | 'success' | 'warning' | 'error';
}>`
  fill: none;
  stroke-width: 3;
  transition: stroke-dashoffset 0.3s ease;
  
  &.background {
    stroke: var(--vscode-progressBar-background);
  }
  
  &.progress {
    ${props => {
      switch (props.variant) {
        case 'success':
          return css`stroke: var(--vscode-terminal-ansiGreen);`;
        case 'warning':
          return css`stroke: var(--vscode-terminal-ansiYellow);`;
        case 'error':
          return css`stroke: var(--vscode-inputValidation-errorBackground);`;
        default:
          return css`stroke: var(--vscode-button-background);`;
      }
    }}
  }
`;

const CircularProgressLabel = styled.div`
  position: absolute;
  font-size: 12px;
  font-weight: 600;
  color: var(--vscode-foreground);
`;

export interface CircularProgressProps extends BaseProgressProps {
  value?: number;
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
  size?: number;
  showLabel?: boolean;
  indeterminate?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  className,
  style,
  value = 0,
  max = 100,
  variant = 'default',
  size = 48,
  showLabel = false,
  indeterminate = false,
  ...props
}) => {
  const percentage = Math.min(Math.max(0, (value / max) * 100), 100);
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = indeterminate ? circumference * 0.75 : circumference * (1 - percentage / 100);
  
  const progressClasses = classNames(
    'vscode-circular-progress',
    `vscode-circular-progress--${variant}`,
    {
      'vscode-circular-progress--indeterminate': indeterminate,
    },
    className
  );

  return (
    <CircularProgressWrapper 
      className={progressClasses} 
      style={style} 
      size={size}
      {...props}
    >
      <CircularProgressSvg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        indeterminate={indeterminate}
      >
        <CircularProgressCircle
          className="background"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <CircularProgressCircle
          className="progress"
          variant={variant}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </CircularProgressSvg>
      {showLabel && !indeterminate && (
        <CircularProgressLabel>
          {Math.round(percentage)}%
        </CircularProgressLabel>
      )}
    </CircularProgressWrapper>
  );
};