import * as vscode from 'vscode';
import { ComputorApiService } from './ComputorApiService';
//import { TestResultsPanelProvider, TestResultsTreeDataProvider } from '../ui/panels/TestResultsPanel';

/**
 * Service for managing test results polling and display
 */
export class TestResultService {
  private static instance: TestResultService;
  private apiService?: ComputorApiService;
  //private testResultsPanelProvider?: TestResultsPanelProvider;

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
   * Set the test results panel provider
   */
  // setTestResultsPanelProvider(provider: TestResultsPanelProvider): void {
  //   this.testResultsPanelProvider = provider;
  // }

  /**
   * Set the test results tree provider (for the tree view in panel)
   */
  // setTestResultsTreeProvider(provider: TestResultsTreeDataProvider): void {
  //   // Link tree provider to panel only (no local reference needed)
  //   if (this.testResultsPanelProvider) {
  //     this.testResultsPanelProvider.setTreeProvider(provider);
  //   }
  // }

  /**
   * Submit a test and display results
   */
  async submitTestAndAwaitResults(
    courseContentId: string,
    versionIdentifier: string,
    assignmentTitle: string,
    submit: boolean = false,
    options?: { progress?: vscode.Progress<{ message?: string; increment?: number }>; token?: vscode.CancellationToken; showProgress?: boolean }
  ): Promise<void> {
    if (!this.apiService) {
      vscode.window.showErrorMessage('Test service not properly initialized');
      return;
    }

    try {
      const runWithProgress = async (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        token?: vscode.CancellationToken
      ) => {
        progress.report({ message: 'Submitting test request...' });

        const testResult = await this.apiService!.submitTest({
          course_content_id: courseContentId,
          version_identifier: versionIdentifier,
          submit,
        });

        console.log("[Debug] " + JSON.stringify(testResult,null,2));

        if (!testResult) {
          vscode.window.showErrorMessage('Failed to submit test - no response received');
          return;
        }

        // Check if we have the full result already
        if (testResult.result_json) {
          console.log(`[TestResultService] Test completed immediately with status: ${testResult.status}`);
          
          // Display the results
          await this.displayTestResults(testResult, assignmentTitle);
          
          // Show completion message based on status
          if (testResult.status === 0) {
            // Status 0 = completed successfully
            const score = testResult.result || 0;
            const percentage = (score * 100).toFixed(1);
            vscode.window.showInformationMessage(
              `✅ Tests completed for ${assignmentTitle}: ${percentage}% passed`
            );
          } else {
            // Status 1 = failed
            vscode.window.showErrorMessage(
              `❌ Test execution failed for ${assignmentTitle}`
            );
          }
          return;
        }

        // If we only got an ID, we need to poll (keeping old polling logic as fallback)
        if (testResult.id) {
          const resultId = testResult.id;
          console.log(`[TestResultService] Test submitted with result ID: ${resultId}, starting polling...`);

          // Use provided progress to poll; if no token provided, create a dummy
          await (async () => {
            return new Promise<void>((resolve) => {
              const startTime = Date.now();
              let pollCount = 0;

              // Clear any existing polling for this result
              this.stopPolling(resultId);

              // Start polling for results
              const interval = setInterval(async () => {
                pollCount++;

                // Check if cancelled
                if (token && token.isCancellationRequested) {
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
                progress.report({ message: `Running tests... (${elapsed}s)` });

                // Check status
                const status = await this.apiService!.getResultStatus(resultId) as unknown as number | string;
                console.log(`[TestResultService] Poll ${pollCount}: Status = ${status}`);

                if (status === undefined) {
                  // API error, continue polling
                  return;
                }

                // Check if test is complete
                if (status === 0 || status === 1 || status === 6 || status === "finished" || status === "failed" || status === "cancelled") {
                  this.stopPolling(resultId);

                  const fullResult = await this.apiService!.getResult(resultId);
                  
                  if (fullResult) {
                    console.log('[TestResultService] Test complete, full result:', fullResult);

                    // Display results
                    await this.displayTestResults(fullResult, assignmentTitle);
                    
                    // Show completion message
                    if (status === 0) {
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
          })();
        }
      };

      // If caller provided a progress handle, reuse it; otherwise open our own
      if (options?.progress) {
        await runWithProgress(options.progress, options.token);
      } else {
        const show = options?.showProgress !== false;
        if (show) {
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Testing ${assignmentTitle}...`,
            cancellable: true,
          }, async (progress, token) => {
            await runWithProgress(progress, token);
          });
        } else {
          // No progress at all
          const dummy: vscode.Progress<{ message?: string; increment?: number }> = { report: () => void 0 };
          await runWithProgress(dummy);
        }
      }
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
   * Display test results in the panel view
   */
  private async displayTestResults(result: any, assignmentTitle: string): Promise<void> {
    try {
      // Use legacy-style wiring: open results in tree, panel updates on selection
      const resultJson = result.result_json || result;
      await vscode.commands.executeCommand('computor.results.open', resultJson);
      await vscode.commands.executeCommand('computor.testResultsPanel.focus');
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
  // Parsing is not needed with legacy-style panel/tree; selection drives panel content


  // Mapping no longer used

}
