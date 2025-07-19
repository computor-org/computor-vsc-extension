import { DesignTokens } from '../types';

export const designTokens: DesignTokens = {
  colors: {
    // Primary colors
    primary: 'var(--vscode-button-background)',
    primaryHover: 'var(--vscode-button-hoverBackground)',
    secondary: 'var(--vscode-button-secondaryBackground)',
    secondaryHover: 'var(--vscode-button-secondaryHoverBackground)',
    
    // Background colors
    background: 'var(--vscode-editor-background)',
    backgroundSecondary: 'var(--vscode-sideBar-background)',
    surface: 'var(--vscode-panel-background)',
    surfaceHover: 'var(--vscode-list-hoverBackground)',
    
    // Text colors
    text: 'var(--vscode-foreground)',
    textSecondary: 'var(--vscode-descriptionForeground)',
    textMuted: 'var(--vscode-disabledForeground)',
    
    // Border colors
    border: 'var(--vscode-panel-border)',
    borderSecondary: 'var(--vscode-widget-border)',
    
    // Status colors
    error: 'var(--vscode-errorForeground)',
    errorHover: 'var(--vscode-inputValidation-errorBackground)',
    warning: 'var(--vscode-warningForeground)',
    warningHover: 'var(--vscode-inputValidation-warningBackground)',
    success: 'var(--vscode-terminal-ansiGreen)',
    successHover: 'var(--vscode-inputValidation-infoBackground)',
    info: 'var(--vscode-infoForeground)',
    infoHover: 'var(--vscode-inputValidation-infoBackground)',
    
    // Focus color
    focus: 'var(--vscode-focusBorder)',
  },
  
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
  },
  
  typography: {
    fontFamily: 'var(--vscode-font-family)',
    fontSize: {
      xs: '12px',
      sm: '13px',
      md: '14px',
      lg: '16px',
      xl: '18px',
      xxl: '24px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
  },
  
  borderRadius: {
    none: '0',
    sm: '2px',
    md: '4px',
    lg: '6px',
    full: '50%',
  },
  
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  },
  
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
};

export const lightThemeOverrides: Partial<DesignTokens['colors']> = {
  // Light theme specific overrides
  background: '#ffffff',
  surface: '#f8f9fa',
  text: '#1a1a1a',
  border: '#e0e0e0',
};

export const darkThemeOverrides: Partial<DesignTokens['colors']> = {
  // Dark theme specific overrides
  background: '#1e1e1e',
  surface: '#252526',
  text: '#cccccc',
  border: '#3e3e42',
};

export const highContrastThemeOverrides: Partial<DesignTokens['colors']> = {
  // High contrast theme overrides
  primary: '#ffffff',
  background: '#000000',
  text: '#ffffff',
  border: '#ffffff',
};