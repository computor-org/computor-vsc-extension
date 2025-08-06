import * as vscode from 'vscode';
import { ApiTreeDataProvider, JsonTreeDataProvider, TestResultTreeDataProvider } from '../index';
import { HttpClient } from '../../../http/HttpClient';
import { TestResult } from '../../../types/TreeTypes';

/**
 * Example of how to use the tree data providers in an extension
 */
export function activateTreeProviders(context: vscode.ExtensionContext) {
  
  // Example 1: API Tree Data Provider
  // Assuming you have an authenticated HTTP client
  const httpClient = {} as HttpClient; // Replace with actual HTTP client instance
  
  const apiTreeProvider = new ApiTreeDataProvider(
    context,
    httpClient,
    '/api/v1/resources',
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      showIcons: true,
      maxDepth: 5
    }
  );
  
  // Register the API tree view
  void apiTreeProvider.registerTreeView('computor.apiTreeView', {
    canSelectMany: true,
    showCollapseAll: true
  });
  
  // Example 2: JSON Tree Data Provider
  const sampleJsonData = {
    name: 'Project',
    version: '1.0.0',
    dependencies: {
      'vscode': '^1.74.0',
      'typescript': '^4.9.4'
    },
    scripts: {
      test: 'mocha',
      build: 'tsc'
    },
    config: {
      port: 3000,
      debug: true,
      features: ['auth', 'api', 'ui']
    }
  };
  
  const jsonTreeProvider = new JsonTreeDataProvider(
    context,
    sampleJsonData,
    'package.json',
    {
      showIcons: true,
      expandAll: false
    }
  );
  
  // Register the JSON tree view
  void jsonTreeProvider.registerTreeView('computor.jsonTreeView');
  
  // Example 3: Test Results Tree Data Provider
  const sampleTestResults: TestResult[] = [
    {
      id: '1',
      name: 'should authenticate user',
      status: 'passed',
      duration: 45,
      suite: 'Authentication',
      file: 'src/auth/auth.test.ts'
    },
    {
      id: '2',
      name: 'should reject invalid credentials',
      status: 'passed',
      duration: 23,
      suite: 'Authentication',
      file: 'src/auth/auth.test.ts'
    },
    {
      id: '3',
      name: 'should load user profile',
      status: 'failed',
      duration: 120,
      error: 'Timeout: Expected response within 100ms',
      suite: 'User Profile',
      file: 'src/user/profile.test.ts'
    },
    {
      id: '4',
      name: 'should update user settings',
      status: 'skipped',
      suite: 'User Profile',
      file: 'src/user/profile.test.ts'
    }
  ];
  
  const testTreeProvider = new TestResultTreeDataProvider(
    context,
    sampleTestResults,
    {
      showIcons: true
    }
  );
  
  // Register the test results tree view
  void testTreeProvider.registerTreeView('computor.testResultsView', {
    canSelectMany: false
  });
  
  // Example: Update data dynamically
  setTimeout(async () => {
    // Update JSON data
    await jsonTreeProvider.updateData({
      updated: true,
      timestamp: new Date().toISOString(),
      data: sampleJsonData
    });
    
    // Update test results
    await testTreeProvider.updateTestResults([
      ...sampleTestResults,
      {
        id: '5',
        name: 'should cache API responses',
        status: 'passed',
        duration: 15,
        suite: 'API Client',
        file: 'src/api/client.test.ts'
      }
    ]);
  }, 5000);
  
  // Example: Search in JSON tree
  vscode.commands.registerCommand('example.searchJsonTree', async () => {
    const searchText = await vscode.window.showInputBox({
      prompt: 'Enter search text',
      placeHolder: 'Search...'
    });
    
    if (searchText) {
      await jsonTreeProvider.search(searchText);
    }
  });
  
  // Example: Show only failed tests
  vscode.commands.registerCommand('example.showFailedTests', async () => {
    await vscode.commands.executeCommand('computor.toggleShowOnlyFailures');
  });
  
  // Example: Refresh API tree
  vscode.commands.registerCommand('example.refreshApiTree', async () => {
    apiTreeProvider.refreshAll();
  });
  
  // Example: Find specific item in API tree
  vscode.commands.registerCommand('example.findApiItem', async () => {
    const item = await apiTreeProvider.findItemById('resource-123');
    if (item) {
      await apiTreeProvider.reveal(item, { select: true, focus: true });
    }
  });
  
  // Example: Export test results
  vscode.commands.registerCommand('example.exportTests', async () => {
    await vscode.commands.executeCommand('computor.exportTestResults');
  });
}