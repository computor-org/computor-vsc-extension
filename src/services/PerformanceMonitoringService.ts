import * as vscode from 'vscode';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  category: string;
  metadata?: Record<string, any>;
}

interface PerformanceStats {
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
}

export class PerformanceMonitoringService {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 10000; // Keep last 10k metrics
  private outputChannel: vscode.OutputChannel;
  private isEnabled: boolean = true;
  
  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Computor Performance');
  }
  
  /**
   * Start timing an operation
   */
  startTimer(name: string, category: string = 'general'): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, category);
    };
  }
  
  /**
   * Measure async operation performance
   */
  async measureAsync<T>(
    name: string,
    operation: () => Promise<T>,
    category: string = 'async',
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, category, metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, category, {
        ...metadata,
        error: true,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Measure sync operation performance
   */
  measure<T>(
    name: string,
    operation: () => T,
    category: string = 'sync',
    metadata?: Record<string, any>
  ): T {
    const startTime = performance.now();
    
    try {
      const result = operation();
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, category, metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, category, {
        ...metadata,
        error: true,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Record a performance metric
   */
  recordMetric(
    name: string,
    duration: number,
    category: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.isEnabled) {
      return;
    }
    
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      category,
      metadata
    };
    
    this.metrics.push(metric);
    
    // Trim old metrics if necessary
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    // Log slow operations
    if (duration > 1000) {
      this.logSlowOperation(metric);
    }
  }
  
  /**
   * Log slow operations to output channel
   */
  private logSlowOperation(metric: PerformanceMetric): void {
    const message = `⚠️ Slow operation detected: ${metric.name} took ${metric.duration.toFixed(2)}ms`;
    this.outputChannel.appendLine(message);
    
    if (metric.metadata) {
      this.outputChannel.appendLine(`  Metadata: ${JSON.stringify(metric.metadata)}`);
    }
  }
  
  /**
   * Get statistics for a specific operation
   */
  getStats(name?: string, category?: string): Map<string, PerformanceStats> {
    let filteredMetrics = this.metrics;
    
    if (name) {
      filteredMetrics = filteredMetrics.filter(m => m.name === name);
    }
    
    if (category) {
      filteredMetrics = filteredMetrics.filter(m => m.category === category);
    }
    
    // Group by operation name
    const grouped = new Map<string, PerformanceMetric[]>();
    
    for (const metric of filteredMetrics) {
      const key = metric.name;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    }
    
    // Calculate statistics
    const stats = new Map<string, PerformanceStats>();
    
    for (const [key, metrics] of grouped.entries()) {
      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const count = durations.length;
      
      if (count === 0) {
        continue;
      }
      
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      const avgDuration = totalDuration / count;
      const minDuration = durations[0] || 0;
      const maxDuration = durations[count - 1] || 0;
      
      const p50Index = Math.floor(count * 0.5);
      const p95Index = Math.floor(count * 0.95);
      const p99Index = Math.floor(count * 0.99);
      
      stats.set(key, {
        count,
        totalDuration,
        avgDuration,
        minDuration,
        maxDuration,
        p50: durations[p50Index] || 0,
        p95: durations[p95Index] || 0,
        p99: durations[p99Index] || 0
      });
    }
    
    return stats;
  }
  
  /**
   * Generate performance report
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines: string[] = ['=== Performance Report ===\n'];
    
    // Sort by total time spent
    const sortedStats = Array.from(stats.entries())
      .sort((a, b) => b[1].totalDuration - a[1].totalDuration);
    
    for (const [name, stat] of sortedStats) {
      lines.push(`\n📊 ${name}`);
      lines.push(`  Count: ${stat.count}`);
      lines.push(`  Total: ${stat.totalDuration.toFixed(2)}ms`);
      lines.push(`  Average: ${stat.avgDuration.toFixed(2)}ms`);
      lines.push(`  Min/Max: ${stat.minDuration.toFixed(2)}ms / ${stat.maxDuration.toFixed(2)}ms`);
      lines.push(`  P50/P95/P99: ${stat.p50.toFixed(2)}ms / ${stat.p95.toFixed(2)}ms / ${stat.p99.toFixed(2)}ms`);
    }
    
    // Memory usage
    const memUsage = process.memoryUsage();
    lines.push('\n=== Memory Usage ===');
    lines.push(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    lines.push(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
    
    return lines.join('\n');
  }
  
  /**
   * Show performance report in output channel
   */
  showReport(): void {
    const report = this.generateReport();
    this.outputChannel.clear();
    this.outputChannel.appendLine(report);
    this.outputChannel.show();
  }
  
  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }
  
  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }
  
  /**
   * Export metrics to JSON
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      stats: Object.fromEntries(this.getStats()),
      timestamp: Date.now()
    }, null, 2);
  }
  
  /**
   * Monitor tree data provider performance
   */
  monitorTreeDataProvider<T>(
    provider: vscode.TreeDataProvider<T>
  ): vscode.TreeDataProvider<T> {
    return {
      ...provider,
      getTreeItem: (element: T) => {
        return this.measure(
          'TreeDataProvider.getTreeItem',
          () => provider.getTreeItem(element),
          'tree'
        );
      },
      getChildren: provider.getChildren ? async (element?: T) => {
        return this.measureAsync(
          'TreeDataProvider.getChildren',
          async () => {
            const result = provider.getChildren!(element);
            return result instanceof Promise ? await result : result;
          },
          'tree',
          { hasElement: !!element }
        );
      } : undefined,
      getParent: provider.getParent ? (element: T) => {
        return this.measure(
          'TreeDataProvider.getParent',
          () => provider.getParent!(element),
          'tree'
        );
      } : undefined
    };
  }
  
  /**
   * Create a performance-monitored API wrapper
   */
  wrapApi<T extends object>(api: T, apiName: string): T {
    const wrapped: any = {};
    
    for (const key of Object.keys(api)) {
      const value = (api as any)[key];
      
      if (typeof value === 'function') {
        wrapped[key] = async (...args: any[]) => {
          return this.measureAsync(
            `${apiName}.${key}`,
            () => value.apply(api, args),
            'api',
            { argCount: args.length }
          );
        };
      } else {
        wrapped[key] = value;
      }
    }
    
    return wrapped as T;
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitoringService();