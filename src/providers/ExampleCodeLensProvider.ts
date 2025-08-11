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

      // Try to position at the very beginning
      const range = new vscode.Range(0, 0, 0, 0);
      
      codeLenses.push(new vscode.CodeLens(range, {
        title: "📤 Upload Example",
        command: "computor.uploadNewExample",
        arguments: [document.uri.fsPath]
      }));

    } catch (error) {
      console.error('Error parsing meta.yaml:', error);
    }

    return codeLenses;
  }

  private isMetaYamlFile(document: vscode.TextDocument): boolean {
    const fileName = path.basename(document.fileName);
    
    if (fileName === 'meta.yaml' || fileName === 'meta.yml') {
      try {
        const content = document.getText();
        
        // Check for Conda-specific fields to exclude those files
        if (content.includes('package:') && content.includes('name:') && 
            (content.includes('source:') || content.includes('build:'))) {
          // This looks like a Conda meta.yaml
          return false;
        }
        
        // Check for Computor-specific fields
        // The 'slug' field is required for our examples
        if (content.includes('slug:')) {
          return true;
        }
        
        // Also check for other Computor-specific fields
        if (content.includes('studentSubmissionFiles:') ||
            content.includes('testDependencies:') ||
            content.includes('executionBackend:') ||
            content.includes('studentTemplates:')) {
          return true;
        }
      } catch {
        // If we can't read the content, default to false
        return false;
      }
    }
    
    return false;
  }
}