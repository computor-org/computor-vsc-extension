import * as vscode from 'vscode';
import { ViewConstructor, BaseView } from '../types';

export class ViewRegistry {
  private static instance: ViewRegistry;
  private views = new Map<string, ViewConstructor>();
  private activeViews = new Map<string, BaseView>();

  private constructor() {}

  static getInstance(): ViewRegistry {
    if (!ViewRegistry.instance) {
      ViewRegistry.instance = new ViewRegistry();
    }
    return ViewRegistry.instance;
  }

  registerView(id: string, constructor: ViewConstructor): void {
    if (this.views.has(id)) {
      throw new Error(`View with id '${id}' is already registered`);
    }
    
    this.views.set(id, constructor);
  }

  unregisterView(id: string): void {
    this.views.delete(id);
    this.disposeView(id);
  }

  createView(id: string, context: vscode.ExtensionContext): BaseView {
    const constructor = this.views.get(id);
    if (!constructor) {
      throw new Error(`View with id '${id}' is not registered`);
    }

    // Dispose existing view if it exists
    this.disposeView(id);

    const view = new constructor(context);
    this.activeViews.set(id, view);
    
    return view;
  }

  getActiveView(id: string): BaseView | undefined {
    return this.activeViews.get(id);
  }

  isViewActive(id: string): boolean {
    return this.activeViews.has(id);
  }

  disposeView(id: string): void {
    const view = this.activeViews.get(id);
    if (view) {
      try {
        view.dispose();
      } catch (error) {
        console.error(`Error disposing view '${id}':`, error);
      }
      this.activeViews.delete(id);
    }
  }

  disposeAllViews(): void {
    const viewIds = Array.from(this.activeViews.keys());
    viewIds.forEach(id => this.disposeView(id));
  }

  getRegisteredViewIds(): string[] {
    return Array.from(this.views.keys());
  }

  getActiveViewIds(): string[] {
    return Array.from(this.activeViews.keys());
  }

  getViewCount(): { registered: number; active: number } {
    return {
      registered: this.views.size,
      active: this.activeViews.size,
    };
  }

  // Helper method to register and create a view in one step
  registerAndCreateView(
    id: string,
    constructor: ViewConstructor,
    context: vscode.ExtensionContext
  ): BaseView {
    this.registerView(id, constructor);
    return this.createView(id, context);
  }

  // Helper method to register multiple views at once
  registerViews(views: Record<string, ViewConstructor>): void {
    Object.entries(views).forEach(([id, constructor]) => {
      this.registerView(id, constructor);
    });
  }
}

// Singleton instance getter
export const viewRegistry = ViewRegistry.getInstance();