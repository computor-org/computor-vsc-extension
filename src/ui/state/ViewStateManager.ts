import { ViewState, StateListener } from '../types';

export class ViewStateManager<T extends ViewState = ViewState> {
  private state: T;
  private listeners: StateListener<T>[] = [];
  private isDisposed = false;

  constructor(initialState: T) {
    this.state = { ...initialState };
  }

  getState(): T {
    return { ...this.state };
  }

  setState(updates: Partial<T> | ((prevState: T) => Partial<T>)): void {
    if (this.isDisposed) {
      console.warn('Attempted to update state on disposed ViewStateManager');
      return;
    }

    const newState = typeof updates === 'function' 
      ? { ...this.state, ...updates(this.state) }
      : { ...this.state, ...updates };

    const hasChanged = !this.shallowEqual(this.state, newState);
    
    if (hasChanged) {
      this.state = newState;
      this.notifyListeners();
    }
  }

  subscribe(listener: StateListener<T>): () => void {
    if (this.isDisposed) {
      console.warn('Attempted to subscribe to disposed ViewStateManager');
      return () => {};
    }

    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  reset(newState?: T): void {
    if (this.isDisposed) return;

    this.state = newState ? { ...newState } : {} as T;
    this.notifyListeners();
  }

  dispose(): void {
    this.isDisposed = true;
    this.listeners = [];
  }

  private notifyListeners(): void {
    if (this.isDisposed) return;

    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('Error in state listener:', error);
      }
    });
  }

  private shallowEqual(obj1: T, obj2: T): boolean {
    const keys1 = Object.keys(obj1) as (keyof T)[];
    const keys2 = Object.keys(obj2) as (keyof T)[];

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (obj1[key] !== obj2[key]) {
        return false;
      }
    }

    return true;
  }

  // Utility methods for common state patterns
  setLoading(loading: boolean): void {
    if ('isLoading' in this.state) {
      this.setState({ isLoading: loading } as unknown as Partial<T>);
    }
  }

  setError(error: string | null): void {
    if ('error' in this.state) {
      this.setState({ error } as unknown as Partial<T>);
    }
  }

  setData(data: any): void {
    if ('data' in this.state) {
      this.setState({ data } as unknown as Partial<T>);
    }
  }

  updateField<K extends keyof T>(field: K, value: T[K]): void {
    this.setState({ [field]: value } as unknown as Partial<T>);
  }

  // Batch updates to prevent multiple re-renders
  batchUpdate(updates: (() => void)[]): void {
    const originalState = this.getState();
    
    // Apply all updates without notifying
    updates.forEach(update => {
      try {
        update();
      } catch (error) {
        console.error('Error in batch update:', error);
      }
    });

    // Only notify if state actually changed
    if (!this.shallowEqual(originalState, this.state)) {
      this.notifyListeners();
    }
  }
}

// Factory function for creating state managers with common patterns
export function createViewState<T extends ViewState>(
  initialState: Omit<T, 'isLoading' | 'error'>
): ViewStateManager<T & { isLoading: boolean; error: string | null }> {
  const defaultState = {
    isLoading: false,
    error: null,
    ...initialState,
  } as T & { isLoading: boolean; error: string | null };

  return new ViewStateManager(defaultState);
}