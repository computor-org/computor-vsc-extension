import * as vscode from 'vscode';
import { JsonTreeDataProvider, TestResultTreeDataProvider } from '../index';
import { TestResult } from '../../../types/TreeTypes';

/**
 * Simple example showing how to quickly add tree views to your extension
 */
export function setupSimpleTreeViews(context: vscode.ExtensionContext) {
  
  // 1. Simple JSON Tree - Great for debugging or showing configuration
  const debugData = {
    extensionName: 'Computor VSC Extension',
    version: '0.0.1',
    settings: {
      apiUrl: 'http://localhost:8000',
      timeout: 5000,
      retryCount: 3
    },
    features: {
      authentication: true,
      gitIntegration: true,
      treeViews: true
    },
    stats: {
      activeUsers: 42,
      totalRequests: 1337,
      uptime: '24h 15m'
    }
  };

  const jsonTree = new JsonTreeDataProvider(
    context,
    debugData,
    'Extension Info'
  );

  // Register in Explorer view
  jsonTree.registerTreeView('computor.jsonTreeView');

  // 2. Test Results Tree - Perfect for showing test output
  const mockTestResults: TestResult[] = [
    {
      id: '1',
      name: 'Extension should activate',
      status: 'passed',
      duration: 12,
      suite: 'Extension Tests'
    },
    {
      id: '2', 
      name: 'Commands should register',
      status: 'passed',
      duration: 5,
      suite: 'Extension Tests'
    },
    {
      id: '3',
      name: 'Tree view should display data',
      status: 'failed',
      duration: 156,
      error: 'TreeView not found in workspace',
      suite: 'UI Tests'
    }
  ];

  const testTree = new TestResultTreeDataProvider(
    context,
    mockTestResults
  );

  testTree.registerTreeView('computor.testResultsView');

  // 3. Add a command to update the data
  vscode.commands.registerCommand('computor.updateTreeData', () => {
    // Update JSON tree with new data
    const updatedData = {
      ...debugData,
      lastUpdated: new Date().toISOString(),
      randomValue: Math.floor(Math.random() * 100)
    };
    
    jsonTree.updateData(updatedData);
    
    // Show notification
    vscode.window.showInformationMessage('Tree data updated!');
  });

  // 4. Add to status bar for easy access
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(tree) Tree Views';
  statusBarItem.command = 'computor.updateTreeData';
  statusBarItem.tooltip = 'Click to update tree data';
  statusBarItem.show();
  
  context.subscriptions.push(statusBarItem);
}