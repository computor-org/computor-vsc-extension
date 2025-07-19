import * as vscode from 'vscode';
import * as React from 'react';

export interface ViewConstructor {
  new (context: vscode.ExtensionContext): BaseView;
}

export interface BaseView {
  render(): void;
  dispose(): void;
}

export interface ComponentProps {
  className?: string;
  children?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  id?: string;
  'data-testid'?: string;
  style?: React.CSSProperties;
}

export interface ThemeContextType {
  isDark: boolean;
  isHighContrast: boolean;
  colors: DesignTokens['colors'];
  spacing: DesignTokens['spacing'];
  typography: DesignTokens['typography'];
  borderRadius: DesignTokens['borderRadius'];
  shadows: DesignTokens['shadows'];
}

export interface DesignTokens {
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    secondaryHover: string;
    background: string;
    backgroundSecondary: string;
    surface: string;
    surfaceHover: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    borderSecondary: string;
    error: string;
    errorHover: string;
    warning: string;
    warningHover: string;
    success: string;
    successHover: string;
    info: string;
    infoHover: string;
    focus: string;
  };
  spacing: {
    xs: string;    // 4px
    sm: string;    // 8px
    md: string;    // 16px
    lg: string;    // 24px
    xl: string;    // 32px
    xxl: string;   // 48px
  };
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;  // 12px
      sm: string;  // 14px
      md: string;  // 16px
      lg: string;  // 18px
      xl: string;  // 24px
      xxl: string; // 32px
    };
    fontWeight: {
      normal: number;   // 400
      medium: number;   // 500
      semibold: number; // 600
      bold: number;     // 700
    };
    lineHeight: {
      tight: number;   // 1.25
      normal: number;  // 1.5
      relaxed: number; // 1.75
    };
  };
  borderRadius: {
    none: string;   // 0
    sm: string;     // 4px
    md: string;     // 8px
    lg: string;     // 12px
    full: string;   // 9999px
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  breakpoints: {
    sm: string;   // 640px
    md: string;   // 768px
    lg: string;   // 1024px
    xl: string;   // 1280px
  };
}

export type ViewState = Record<string, any>;

export interface StateListener<T = ViewState> {
  (state: T): void;
}

export interface WebviewMessage {
  type: string;
  payload?: any;
}

export interface TreeItemData {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } | string;
  contextValue?: string;
  children?: TreeItemData[];
}