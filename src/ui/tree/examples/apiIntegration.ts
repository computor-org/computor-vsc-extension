import * as vscode from 'vscode';
import { ApiTreeDataProvider } from '../index';
import { HttpClient } from '../../../http/HttpClient';
import { ApiTreeData } from '../../../types/TreeTypes';

/**
 * Example showing how to integrate API tree with a real backend
 */
export async function setupApiTreeWithBackend(
  context: vscode.ExtensionContext,
  httpClient: HttpClient
) {
  
  // Example 1: User's Projects Tree
  const projectsTreeProvider = new ApiTreeDataProvider(
    context,
    httpClient,
    '/api/v1/projects',
    {
      refreshInterval: 60000, // Refresh every minute
      showIcons: true,
      cacheTimeout: 30000
    }
  );

  void projectsTreeProvider.registerTreeView('computor.projectsView', {
    canSelectMany: true,
    showCollapseAll: true
  });

  // Example 2: File Browser Tree
  const filesTreeProvider = new ApiTreeDataProvider(
    context,
    httpClient,
    '/api/v1/files/root',
    {
      showIcons: true,
      batchSize: 100 // Load 100 files at a time
    }
  );

  filesTreeProvider.registerTreeView('computor.filesView');

  // Set up authentication headers when user logs in
  context.subscriptions.push(
    vscode.authentication.onDidChangeSessions(async e => {
      if (e.provider.id === 'computor') {
        const session = await vscode.authentication.getSession('computor', ['api'], { 
          createIfNone: false 
        });
        
        if (session) {
          // Update headers for authenticated requests
          projectsTreeProvider.setHeaders({
            'Authorization': `Bearer ${session.accessToken}`
          });
          filesTreeProvider.setHeaders({
            'Authorization': `Bearer ${session.accessToken}`
          });
          
          // Refresh trees with authenticated data
          projectsTreeProvider.refreshAll();
          filesTreeProvider.refreshAll();
        }
      }
    })
  );

  // Commands for project tree
  vscode.commands.registerCommand('computor.openProject', async (item: any) => {
    const projectData = item.data as ApiTreeData;
    vscode.window.showInformationMessage(`Opening project: ${projectData.name}`);
    // Navigate to project workspace or open project files
  });

  vscode.commands.registerCommand('computor.createProject', async () => {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter project name',
      placeHolder: 'My New Project'
    });
    
    if (name) {
      try {
        await httpClient.post('/api/v1/projects', { name });
        projectsTreeProvider.refreshAll();
        vscode.window.showInformationMessage(`Project "${name}" created!`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create project: ${error}`);
      }
    }
  });

  // File operations
  vscode.commands.registerCommand('computor.downloadFile', async (item: any) => {
    const fileData = item.data as ApiTreeData;
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(fileData.name),
      saveLabel: 'Download'
    });
    
    if (uri) {
      try {
        const response = await httpClient.get(`/api/v1/files/${fileData.id}/content`);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(String(response.data)));
        vscode.window.showInformationMessage(`Downloaded: ${fileData.name}`);
      } catch (error) {
        vscode.window.showErrorMessage(`Download failed: ${error}`);
      }
    }
  });

  // Status bar item showing connection status
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    200
  );
  
  // Monitor loading states
  setInterval(() => {
    const projectsLoading = projectsTreeProvider.getLoadingState();
    const filesLoading = filesTreeProvider.getLoadingState();
    
    if (projectsLoading === 'loading' || filesLoading === 'loading') {
      statusBar.text = '$(sync~spin) Loading...';
    } else if (projectsLoading === 'error' || filesLoading === 'error') {
      statusBar.text = '$(error) Connection Error';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else {
      statusBar.text = '$(check) Connected';
      statusBar.backgroundColor = undefined;
    }
  }, 1000);
  
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Example: Handle real-time updates via WebSocket
  // const ws = new WebSocket('ws://localhost:8000/ws');
  // ws.on('message', (data) => {
  //   const update = JSON.parse(data);
  //   if (update.type === 'project-update') {
  //     projectsTreeProvider.refreshAll();
  //   }
  // });
}

/**
 * Example API response structures that would work with the tree
 */
// Example API response structures
void {
  // GET /api/v1/projects
  projects: [
    {
      id: 'proj-123',
      name: 'Machine Learning Course',
      type: 'project',
      metadata: {
        description: 'Introduction to ML',
        studentCount: 45,
        hasChildren: true,
        childEndpointPattern: '/api/v1/projects/{id}/modules'
      }
    },
    {
      id: 'proj-456',
      name: 'Web Development',
      type: 'project',
      metadata: {
        description: 'Full-stack web dev',
        studentCount: 32,
        hasChildren: true,
        childEndpointPattern: '/api/v1/projects/{id}/modules'
      }
    }
  ],

  // GET /api/v1/projects/proj-123/modules
  modules: [
    {
      id: 'mod-1',
      name: 'Introduction',
      type: 'module',
      metadata: {
        duration: '2 hours',
        completed: true
      }
    },
    {
      id: 'mod-2',
      name: 'Neural Networks',
      type: 'module',
      metadata: {
        duration: '4 hours',
        completed: false,
        hasChildren: true,
        childEndpoint: '/api/v1/modules/mod-2/lessons'
      }
    }
  ],

  // Paginated response
  filesPaginated: {
    data: [
      {
        id: 'file-1',
        name: 'README.md',
        type: 'file',
        metadata: { size: 1024, mimeType: 'text/markdown' }
      },
      {
        id: 'file-2',
        name: 'src',
        type: 'folder',
        hasMore: true,
        metadata: { 
          hasChildren: true,
          childEndpoint: '/api/v1/files/file-2/children'
        }
      }
    ],
    hasMore: true,
    nextPage: 'cursor-xyz-123'
  }
};