import * as vscode from 'vscode';

interface BatchRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface BatchConfig {
  maxBatchSize?: number;
  batchDelay?: number;
  maxWaitTime?: number;
}

export class RequestBatchingService {
  private batches: Map<string, BatchRequest<any>[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private batchStartTimes: Map<string, number> = new Map();
  
  private readonly defaultConfig: Required<BatchConfig> = {
    maxBatchSize: 10,
    batchDelay: 50, // 50ms delay to collect requests
    maxWaitTime: 500 // Maximum 500ms wait time
  };
  
  /**
   * Batch multiple requests of the same type
   */
  async batch<T>(
    batchKey: string,
    requestId: string,
    execute: () => Promise<T>,
    config?: BatchConfig
  ): Promise<T> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    
    return new Promise<T>((resolve, reject) => {
      const request: BatchRequest<T> = {
        id: requestId,
        execute,
        resolve,
        reject
      };
      
      // Add request to batch
      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, []);
        this.batchStartTimes.set(batchKey, Date.now());
      }
      
      const batch = this.batches.get(batchKey)!;
      batch.push(request);
      
      // Check if batch should be executed immediately
      if (batch.length >= mergedConfig.maxBatchSize) {
        this.executeBatch(batchKey);
      } else {
        // Schedule batch execution
        this.scheduleBatch(batchKey, mergedConfig);
      }
    });
  }
  
  /**
   * Schedule batch execution with delay
   */
  private scheduleBatch(batchKey: string, config: Required<BatchConfig>): void {
    // Clear existing timer
    if (this.batchTimers.has(batchKey)) {
      clearTimeout(this.batchTimers.get(batchKey)!);
    }
    
    // Calculate remaining wait time
    const startTime = this.batchStartTimes.get(batchKey) || Date.now();
    const elapsedTime = Date.now() - startTime;
    const remainingMaxWait = Math.max(0, config.maxWaitTime - elapsedTime);
    const delay = Math.min(config.batchDelay, remainingMaxWait);
    
    // Set new timer
    const timer = setTimeout(() => {
      this.executeBatch(batchKey);
    }, delay);
    
    this.batchTimers.set(batchKey, timer);
  }
  
  /**
   * Execute all requests in a batch
   */
  private async executeBatch(batchKey: string): Promise<void> {
    // Clear timer
    if (this.batchTimers.has(batchKey)) {
      clearTimeout(this.batchTimers.get(batchKey)!);
      this.batchTimers.delete(batchKey);
    }
    
    // Get and clear batch
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) {
      return;
    }
    
    this.batches.delete(batchKey);
    this.batchStartTimes.delete(batchKey);
    
    // Log batch execution
    console.log(`Executing batch '${batchKey}' with ${batch.length} requests`);
    
    // Execute all requests in parallel
    const results = await Promise.allSettled(
      batch.map(request => request.execute())
    );
    
    // Resolve/reject individual promises
    results.forEach((result, index) => {
      const request = batch[index];
      if (result.status === 'fulfilled') {
        request.resolve(result.value);
      } else {
        request.reject(result.reason);
      }
    });
  }
  
  /**
   * Create a batched version of a function
   */
  createBatchedFunction<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    getBatchKey: (...args: TArgs) => string,
    config?: BatchConfig
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args: TArgs): Promise<TResult> => {
      const batchKey = getBatchKey(...args);
      const requestId = `${batchKey}-${Date.now()}-${Math.random()}`;
      
      return this.batch(
        batchKey,
        requestId,
        () => fn(...args),
        config
      );
    };
  }
  
  /**
   * Combine multiple API calls into a single batched request
   */
  async batchApiCalls<T>(
    calls: Array<{ 
      key: string; 
      fn: () => Promise<T>;
    }>
  ): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    
    // Group calls by similar operations
    const grouped = new Map<string, typeof calls>();
    
    for (const call of calls) {
      const groupKey = this.getGroupKey(call.key);
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, []);
      }
      grouped.get(groupKey)!.push(call);
    }
    
    // Execute each group in parallel
    await Promise.all(
      Array.from(grouped.entries()).map(async ([groupKey, groupCalls]) => {
        // Execute calls in the group with batching
        const groupResults = await Promise.all(
          groupCalls.map(call => 
            this.batch(
              groupKey,
              call.key,
              call.fn,
              { maxBatchSize: 20, batchDelay: 100 }
            ).then(result => ({ key: call.key, result }))
            .catch(error => ({ key: call.key, error }))
          )
        );
        
        // Store results
        for (const item of groupResults) {
          if ('result' in item) {
            results.set(item.key, item.result);
          }
        }
      })
    );
    
    return results;
  }
  
  /**
   * Get group key for similar operations
   */
  private getGroupKey(key: string): string {
    // Extract operation type from key
    // e.g., "getCourse-123" -> "getCourse"
    const match = key.match(/^([a-zA-Z]+)/);
    return match ? match[1] : 'default';
  }
  
  /**
   * Clear all pending batches
   */
  clearAll(): void {
    // Clear all timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    
    // Reject all pending requests
    for (const batch of this.batches.values()) {
      for (const request of batch) {
        request.reject(new Error('Batch cancelled'));
      }
    }
    
    // Clear maps
    this.batches.clear();
    this.batchTimers.clear();
    this.batchStartTimes.clear();
  }
}

// Export singleton instance
export const requestBatchingService = new RequestBatchingService();