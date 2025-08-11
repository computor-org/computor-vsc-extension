import * as vscode from 'vscode';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class ExampleCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    void this;
  }

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    void token;
    
    if (!this.isMetaYamlFile(document)) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];
    
    try {
      const content = document.getText();
      const meta = yaml.load(content) as any;
      
      if (!meta || !meta.slug) {
        return [];
      }

      const range = new vscode.Range(0, 0, 0, 0);
      
      codeLenses.push(new vscode.CodeLens(range, {
        title: "📤 Upload as New Example",
        command: "computor.uploadNewExample",
        arguments: [document.uri.fsPath]
      }));

      codeLenses.push(new vscode.CodeLens(range, {
        title: "🔄 Update Existing Example",
        command: "computor.updateExistingExample", 
        arguments: [document.uri.fsPath]
      }));

    } catch (error) {
      console.error('Error parsing meta.yaml:', error);
    }

    return codeLenses;
  }

  private isMetaYamlFile(document: vscode.TextDocument): boolean {
    const fileName = path.basename(document.fileName);
    const filePath = document.fileName.toLowerCase();
    
    // Only activate for meta.yaml files that are likely to be Computor examples
    // Exclude conda environments and other common meta.yaml uses
    if (fileName === 'meta.yaml' || fileName === 'meta.yml') {
      // Exclude conda meta.yaml files
      if (filePath.includes('conda') || filePath.includes('recipe')) {
        return false;
      }
      
      // Include if path contains example-related keywords
      if (filePath.includes('example') || 
          filePath.includes('assignment') || 
          filePath.includes('exercise') ||
          filePath.includes('computor') ||
          filePath.includes('test-example')) {
        return true;
      }
      
      // Check if the meta.yaml has our expected structure
      try {
        const content = document.getText();
        // Look for our specific fields
        if (content.includes('slug:') || 
            content.includes('studentSubmissionFiles:') ||
            content.includes('testDependencies:') ||
            content.includes('executionBackend:')) {
          return true;
        }
      } catch {
        // Ignore errors
      }
    }
    
    return false;
  }
}