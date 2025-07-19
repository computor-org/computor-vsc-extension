import * as vscode from 'vscode';
import { JsonTreeDataProvider } from './JsonTreeDataProvider';
import { JsonTreeItem } from './JsonTreeItem';
import { TestResult, TestStatusIcons, TreeProviderConfig } from '../../types/TreeTypes';

/**
 * Specialized tree data provider for test results
 */
export class TestResultTreeDataProvider extends JsonTreeDataProvider {
  private testResults: TestResult[];
  private groupBy: 'suite' | 'status' | 'file' = 'suite';
  private showOnlyFailures: boolean = false;

  constructor(
    context: vscode.ExtensionContext,
    testResults: TestResult[],
    config: TreeProviderConfig = {}
  ) {
    // Convert test results to JSON for base provider
    super(context, testResults as any, 'Test Results', config);
    this.testResults = testResults;
    
    // Register additional test-specific commands
    this.registerTestCommands();
  }

  /**
   * Override getTreeItem to customize for test results
   */
  getTreeItem(element: JsonTreeItem): vscode.TreeItem {
    const item = super.getTreeItem(element);
    
    // Try to get test result data
    const value = element.getValue();
    if (this.isTestResult(value)) {
      const testResult = value as unknown as TestResult;
      
      // Set icon based on status
      item.iconPath = TestStatusIcons[testResult.status];
      
      // Add duration to description if available
      if (testResult.duration !== undefined) {
        item.description = `${item.description || ''} (${testResult.duration}ms)`.trim();
      }
      
      // Set context value
      item.contextValue = `testResult.${testResult.status}`;
      
      // Add error tooltip for failed tests
      if (testResult.status === 'failed' && testResult.error) {
        item.tooltip = new vscode.MarkdownString(
          `**Failed Test**\n\n` +
          `**Name:** ${testResult.name}\n\n` +
          `**Error:** ${testResult.error}\n\n` +
          `**File:** ${testResult.file || 'Unknown'}`
        );
      }
      
      // Add command to jump to test
      if (testResult.file) {
        item.command = {
          title: 'Go to Test',
          command: 'computor.goToTest',
          arguments: [testResult]
        };
      }
    }
    
    return item;
  }

  /**
   * Update test results
   */
  async updateTestResults(testResults: TestResult[]): Promise<void> {
    this.testResults = testResults;
    await this.processTestResults();
  }

  /**
   * Process test results based on grouping
   */
  private async processTestResults(): Promise<void> {
    let processedData: any;
    
    switch (this.groupBy) {
      case 'suite':
        processedData = this.groupBySuite();
        break;
      case 'status':
        processedData = this.groupByStatus();
        break;
      case 'file':
        processedData = this.groupByFile();
        break;
      default:
        processedData = this.testResults;
    }
    
    // Apply filters
    if (this.showOnlyFailures) {
      processedData = this.filterFailures(processedData);
    }
    
    // Update the JSON data
    await this.updateData(processedData, 'Test Results');
  }

  /**
   * Group tests by suite
   */
  private groupBySuite(): Record<string, TestResult[]> {
    const grouped: Record<string, TestResult[]> = {};
    
    for (const test of this.testResults) {
      const suite = test.suite || 'No Suite';
      if (!grouped[suite]) {
        grouped[suite] = [];
      }
      grouped[suite]!.push(test);
    }
    
    return grouped;
  }

  /**
   * Group tests by status
   */
  private groupByStatus(): Record<string, TestResult[]> {
    const grouped: Record<string, TestResult[]> = {
      passed: [],
      failed: [],
      skipped: [],
      pending: []
    };
    
    for (const test of this.testResults) {
      grouped[test.status]?.push(test);
    }
    
    // Remove empty groups
    for (const status of Object.keys(grouped)) {
      if ((grouped as any)[status].length === 0) {
        delete (grouped as any)[status];
      }
    }
    
    return grouped;
  }

  /**
   * Group tests by file
   */
  private groupByFile(): Record<string, TestResult[]> {
    const grouped: Record<string, TestResult[]> = {};
    
    for (const test of this.testResults) {
      const file = test.file || 'Unknown File';
      if (!grouped[file]) {
        grouped[file] = [];
      }
      grouped[file]!.push(test);
    }
    
    return grouped;
  }

  /**
   * Filter to show only failures
   */
  private filterFailures(data: any): any {
    if (Array.isArray(data)) {
      return data.filter((test: TestResult) => test.status === 'failed');
    }
    
    if (typeof data === 'object' && data !== null) {
      const filtered: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          const failedTests = value.filter((test: TestResult) => test.status === 'failed');
          if (failedTests.length > 0) {
            filtered[key] = failedTests;
          }
        }
      }
      
      return filtered;
    }
    
    return data;
  }

  /**
   * Check if a value is a test result
   */
  private isTestResult(value: any): boolean {
    return value !== null &&
           typeof value === 'object' &&
           'status' in value &&
           'name' in value &&
           ['passed', 'failed', 'skipped', 'pending'].includes(value.status);
  }

  /**
   * Register test-specific commands
   */
  private registerTestCommands(): void {
    // Go to test command
    this.registerCommand('computor.goToTest', async (testResult: TestResult) => {
      if (testResult.file) {
        const uri = vscode.Uri.file(testResult.file);
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          this.showErrorMessage(`Cannot open file: ${testResult.file}`);
        }
      }
    });
    
    // Run single test
    this.registerCommand('computor.runSingleTest', async (testResult: TestResult) => {
      // This would integrate with the test runner
      this.showInformationMessage(`Running test: ${testResult.name}`);
    });
    
    // Group by command
    this.registerCommand('computor.groupTestsBy', async () => {
      const options = [
        { label: 'Suite', value: 'suite' as const },
        { label: 'Status', value: 'status' as const },
        { label: 'File', value: 'file' as const }
      ];
      
      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Group tests by...'
      });
      
      if (selected) {
        this.groupBy = selected.value;
        await this.processTestResults();
      }
    });
    
    // Toggle show only failures
    this.registerCommand('computor.toggleShowOnlyFailures', async () => {
      this.showOnlyFailures = !this.showOnlyFailures;
      await this.processTestResults();
      
      const message = this.showOnlyFailures 
        ? 'Showing only failed tests' 
        : 'Showing all tests';
      this.showInformationMessage(message);
    });
    
    // Show test summary
    this.registerCommand('computor.showTestSummary', async () => {
      const summary = this.getTestSummary();
      
      const message = new vscode.MarkdownString();
      message.appendMarkdown('## Test Summary\n\n');
      message.appendMarkdown(`**Total Tests:** ${summary.total}\n\n`);
      message.appendMarkdown(`✅ **Passed:** ${summary.passed} (${summary.passRate}%)\n\n`);
      message.appendMarkdown(`❌ **Failed:** ${summary.failed}\n\n`);
      message.appendMarkdown(`⏭️ **Skipped:** ${summary.skipped}\n\n`);
      message.appendMarkdown(`⏳ **Pending:** ${summary.pending}\n\n`);
      
      if (summary.totalDuration > 0) {
        message.appendMarkdown(`⏱️ **Total Duration:** ${summary.totalDuration}ms\n\n`);
        message.appendMarkdown(`⚡ **Average Duration:** ${summary.avgDuration}ms`);
      }
      
      await vscode.window.showInformationMessage(message.value, { modal: true });
    });
    
    // Export test results
    this.registerCommand('computor.exportTestResults', async () => {
      const formats = [
        { label: 'JSON', value: 'json' },
        { label: 'JUnit XML', value: 'junit' },
        { label: 'CSV', value: 'csv' }
      ];
      
      const selected = await vscode.window.showQuickPick(formats, {
        placeHolder: 'Select export format'
      });
      
      if (selected) {
        const content = this.exportTestResults(selected.value);
        
        const doc = await vscode.workspace.openTextDocument({
          content,
          language: selected.value === 'json' ? 'json' : selected.value === 'junit' ? 'xml' : 'csv'
        });
        
        await vscode.window.showTextDocument(doc);
      }
    });
  }

  /**
   * Get test summary statistics
   */
  private getTestSummary(): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    passRate: number;
    totalDuration: number;
    avgDuration: number;
  } {
    const summary = {
      total: this.testResults.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      pending: 0,
      passRate: 0,
      totalDuration: 0,
      avgDuration: 0
    };
    
    let durationCount = 0;
    
    for (const test of this.testResults) {
      summary[test.status]++;
      
      if (test.duration !== undefined) {
        summary.totalDuration += test.duration;
        durationCount++;
      }
    }
    
    if (summary.total > 0) {
      summary.passRate = Math.round((summary.passed / summary.total) * 100);
    }
    
    if (durationCount > 0) {
      summary.avgDuration = Math.round(summary.totalDuration / durationCount);
    }
    
    return summary;
  }

  /**
   * Export test results in various formats
   */
  private exportTestResults(format: string): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.testResults, null, 2);
        
      case 'junit':
        return this.exportAsJUnit();
        
      case 'csv':
        return this.exportAsCSV();
        
      default:
        return '';
    }
  }

  /**
   * Export as JUnit XML format
   */
  private exportAsJUnit(): string {
    const summary = this.getTestSummary();
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}" time="${summary.totalDuration / 1000}">\n`;
    
    // Group by suite for JUnit format
    const bySuite = this.groupBySuite();
    
    for (const [suiteName, tests] of Object.entries(bySuite)) {
      const suiteTests = tests.length;
      const suiteFailures = tests.filter(t => t.status === 'failed').length;
      const suiteSkipped = tests.filter(t => t.status === 'skipped').length;
      const suiteTime = tests.reduce((sum, t) => sum + (t.duration || 0), 0) / 1000;
      
      xml += `  <testsuite name="${this.escapeXml(suiteName)}" tests="${suiteTests}" failures="${suiteFailures}" skipped="${suiteSkipped}" time="${suiteTime}">\n`;
      
      for (const test of tests) {
        const time = (test.duration || 0) / 1000;
        xml += `    <testcase name="${this.escapeXml(test.name)}" time="${time}"`;
        
        if (test.file) {
          xml += ` classname="${this.escapeXml(test.file)}"`;
        }
        
        if (test.status === 'passed') {
          xml += '/>\n';
        } else {
          xml += '>\n';
          
          if (test.status === 'failed' && test.error) {
            xml += `      <failure message="${this.escapeXml(test.error)}"/>\n`;
          } else if (test.status === 'skipped') {
            xml += '      <skipped/>\n';
          }
          
          xml += '    </testcase>\n';
        }
      }
      
      xml += '  </testsuite>\n';
    }
    
    xml += '</testsuites>';
    return xml;
  }

  /**
   * Export as CSV format
   */
  private exportAsCSV(): string {
    const headers = ['Suite', 'Name', 'Status', 'Duration (ms)', 'File', 'Error'];
    const rows = [headers];
    
    for (const test of this.testResults) {
      rows.push([
        test.suite || '',
        test.name,
        test.status,
        test.duration?.toString() || '',
        test.file || '',
        test.error || ''
      ]);
    }
    
    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get current grouping mode
   */
  getGroupBy(): 'suite' | 'status' | 'file' {
    return this.groupBy;
  }

  /**
   * Get show only failures setting
   */
  getShowOnlyFailures(): boolean {
    return this.showOnlyFailures;
  }
}