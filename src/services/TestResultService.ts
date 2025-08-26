import * as vscode from 'vscode';
import { ComputorApiService } from './ComputorApiService';
import { TestResultTreeDataProvider } from '../ui/tree/TestResultTreeDataProvider';

/**
 * Service for managing test results polling and display
 */
export class TestResultService {
  private static instance: TestResultService;
  private apiService?: ComputorApiService;
  private testResultsProvider?: TestResultTreeDataProvider;
  private pollingIntervals: Map<string, NodeJS.Timer> = new Map();
  private readonly POLL_INTERVAL = 2000; // 2 seconds
  private readonly MAX_POLL_DURATION = 300000; // 5 minutes

  private constructor() {
    // API service will be set via setApiService
  }

  static getInstance(): TestResultService {
    if (!TestResultService.instance) {
      TestResultService.instance = new TestResultService();
    }
    return TestResultService.instance;
  }

  /**
   * Set the API service to use
   */
  setApiService(apiService: ComputorApiService): void {
    this.apiService = apiService;
  }

  /**
   * Set the test results tree provider
   */
  setTestResultsProvider(provider: TestResultTreeDataProvider): void {
    this.testResultsProvider = provider;
  }

  /**
   * Submit a test and start polling for results
   */
  async submitTestAndAwaitResults(
    courseContentId: string,
    versionIdentifier: string,
    assignmentTitle: string,
    submit: boolean = false
  ): Promise<void> {
    if (!this.apiService) {
      vscode.window.showErrorMessage('Test service not properly initialized');
      return;
    }

    try {
      // Submit the test
      const testResult = await this.apiService.submitTest({
        course_content_id: courseContentId,
        version_identifier: versionIdentifier,
        submit
      });

      if (!testResult || !testResult.id) {
        vscode.window.showErrorMessage('Failed to submit test - no result ID returned');
        return;
      }

      const resultId = testResult.id;
      console.log(`[TestResultService] Test submitted with result ID: ${resultId}`);

      // Show progress notification
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Running tests for ${assignmentTitle}...`,
        cancellable: true
      }, async (progress, token) => {
        return new Promise<void>((resolve, reject) => {
          const startTime = Date.now();
          let pollCount = 0;

          // Clear any existing polling for this result
          this.stopPolling(resultId);

          // Start polling for results
          const interval = setInterval(async () => {
            pollCount++;

            // Check if cancelled
            if (token.isCancellationRequested) {
              this.stopPolling(resultId);
              resolve();
              return;
            }

            // Check timeout
            if (Date.now() - startTime > this.MAX_POLL_DURATION) {
              this.stopPolling(resultId);
              vscode.window.showWarningMessage(`Test for ${assignmentTitle} timed out after 5 minutes`);
              resolve();
              return;
            }

            // Update progress
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            progress.report({ 
              message: `Waiting for results... (${elapsed}s)` 
            });

            // Check status
            const status = await this.apiService!.getResultStatus(resultId);
            console.log(`[TestResultService] Poll ${pollCount}: Status = ${status}`);

            if (!status) {
              // API error, continue polling
              return;
            }

            // Check if test is complete
            if (status === 'COMPLETED' || status === 'FAILED' || status === 'CRASHED') {
              this.stopPolling(resultId);

              // Get full result
              const fullResult = await this.apiService!.getResult(resultId);
              
              if (fullResult) {
                console.log('[TestResultService] Test complete, full result:', fullResult);
                
                // Display results
                await this.displayTestResults(fullResult, assignmentTitle);
                
                // Show completion message
                if (status === 'COMPLETED') {
                  vscode.window.showInformationMessage(
                    `✅ Tests completed for ${assignmentTitle}`
                  );
                } else {
                  vscode.window.showErrorMessage(
                    `❌ Tests failed for ${assignmentTitle}`
                  );
                }
              }

              resolve();
            }
          }, this.POLL_INTERVAL);

          this.pollingIntervals.set(resultId, interval);
        });
      });
    } catch (error: any) {
      console.error('[TestResultService] Error in submitTestAndAwaitResults:', error);
      vscode.window.showErrorMessage(`Test submission failed: ${error.message}`);
    }
  }

  /**
   * Stop polling for a specific result
   */
  private stopPolling(resultId: string): void {
    const interval = this.pollingIntervals.get(resultId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(resultId);
      console.log(`[TestResultService] Stopped polling for ${resultId}`);
    }
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    for (const [, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    console.log('[TestResultService] Stopped all polling');
  }

  /**
   * Display test results in the tree view
   */
  private async displayTestResults(result: any, assignmentTitle: string): Promise<void> {
    try {
      // Parse the result_json if it exists
      const resultJson = result.result_json || result;
      
      // Convert to test result format expected by the tree provider
      const testResults = this.parseTestResults(resultJson, assignmentTitle);
      
      if (this.testResultsProvider) {
        // Update the test results tree
        await this.testResultsProvider.updateTestResults(testResults);
        
        // Show the test results view
        await vscode.commands.executeCommand('computor.testResultsView.focus');
      } else {
        // Fallback: show results in output channel
        const outputChannel = vscode.window.createOutputChannel('Computor Test Results');
        outputChannel.clear();
        outputChannel.appendLine(`Test Results for ${assignmentTitle}`);
        outputChannel.appendLine('='.repeat(50));
        outputChannel.appendLine(JSON.stringify(resultJson, null, 2));
        outputChannel.show();
      }
    } catch (error) {
      console.error('[TestResultService] Error displaying test results:', error);
      
      // Fallback: show raw result
      const outputChannel = vscode.window.createOutputChannel('Computor Test Results');
      outputChannel.clear();
      outputChannel.appendLine(`Test Results for ${assignmentTitle}`);
      outputChannel.appendLine('='.repeat(50));
      outputChannel.appendLine(JSON.stringify(result, null, 2));
      outputChannel.show();
    }
  }

  /**
   * Parse test results from backend format to tree provider format
   */
  private parseTestResults(resultJson: any, assignmentTitle: string): any[] {
    const testResults: any[] = [];

    try {
      // Check if resultJson has a specific structure
      if (resultJson.tests && Array.isArray(resultJson.tests)) {
        // Parse individual test results
        for (const test of resultJson.tests) {
          testResults.push({
            name: test.name || test.test_name || 'Unnamed Test',
            status: this.mapTestStatus(test.status || test.result),
            duration: test.duration || test.time || 0,
            error: test.error || test.message || null,
            file: test.file || assignmentTitle,
            suite: test.suite || assignmentTitle,
            output: test.output || test.stdout || null
          });
        }
      } else if (resultJson.test_results) {
        // Alternative format
        for (const [testName, testData] of Object.entries(resultJson.test_results)) {
          testResults.push({
            name: testName,
            status: this.mapTestStatus((testData as any).passed ? 'passed' : 'failed'),
            duration: (testData as any).duration || 0,
            error: (testData as any).error || null,
            file: assignmentTitle,
            suite: assignmentTitle,
            output: (testData as any).output || null
          });
        }
      } else {
        // Fallback: create a single test result from the overall result
        testResults.push({
          name: 'Overall Test',
          status: resultJson.success || resultJson.passed ? 'passed' : 'failed',
          duration: resultJson.duration || 0,
          error: resultJson.error || resultJson.message || null,
          file: assignmentTitle,
          suite: assignmentTitle,
          output: JSON.stringify(resultJson, null, 2)
        });
      }
    } catch (error) {
      console.error('[TestResultService] Error parsing test results:', error);
      
      // Create a single result showing the raw data
      testResults.push({
        name: 'Test Results',
        status: 'unknown',
        duration: 0,
        error: null,
        file: assignmentTitle,
        suite: assignmentTitle,
        output: JSON.stringify(resultJson, null, 2)
      });
    }

    return testResults;
  }

  /**
   * Map backend test status to frontend status
   */
  private mapTestStatus(status: any): 'passed' | 'failed' | 'skipped' | 'unknown' {
    if (!status) {
      return 'unknown';
    }

    const statusStr = String(status).toLowerCase();
    
    if (statusStr.includes('pass') || statusStr.includes('success') || statusStr === 'true') {
      return 'passed';
    } else if (statusStr.includes('fail') || statusStr.includes('error') || statusStr === 'false') {
      return 'failed';
    } else if (statusStr.includes('skip')) {
      return 'skipped';
    } else {
      return 'unknown';
    }
  }
}