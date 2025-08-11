import * as vscode from 'vscode';
import * as path from 'path';

export class MetaYamlStatusBarProvider {
  private uploadButton: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    // Create status bar item with high priority to appear on the left
    this.uploadButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    this.uploadButton.text = "$(cloud-upload) Upload Example";
    this.uploadButton.tooltip = "Upload Example";
    this.uploadButton.command = "computor.uploadNewExample";
    
    context.subscriptions.push(this.uploadButton);
    
    // Monitor active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.updateStatusBar(editor);
      })
    );
    
    // Check current editor
    this.updateStatusBar(vscode.window.activeTextEditor);
  }
  
  private updateStatusBar(editor: vscode.TextEditor | undefined): void {
    if (editor && this.isMetaYamlFile(editor.document)) {
      // Pass the file path as argument
      this.uploadButton.command = {
        title: "Upload Example",
        command: "computor.uploadNewExample",
        arguments: [editor.document.uri.fsPath]
      };
      
      this.uploadButton.show();
    } else {
      this.uploadButton.hide();
    }
  }
  
  private isMetaYamlFile(document: vscode.TextDocument): boolean {
    const fileName = path.basename(document.fileName);
    
    if (fileName === 'meta.yaml' || fileName === 'meta.yml') {
      try {
        const content = document.getText();
        
        // Check for Conda-specific fields to exclude those files
        if (content.includes('package:') && content.includes('name:') && 
            (content.includes('source:') || content.includes('build:'))) {
          return false;
        }
        
        // Check for Computor-specific fields
        if (content.includes('slug:')) {
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
  }
  
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}