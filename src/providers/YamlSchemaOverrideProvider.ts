import * as vscode from 'vscode';
import * as path from 'path';

export class YamlSchemaOverrideProvider {
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    void context;
    this.setupSchemaOverrides();
    this.monitorYamlFiles();
  }

  private setupSchemaOverrides(): void {
    // Override YAML extension settings when our extension activates
    const yamlConfig = vscode.workspace.getConfiguration('yaml');
    
    // Disable schema store to prevent automatic schema associations
    yamlConfig.update('schemaStore.enable', false, vscode.ConfigurationTarget.Workspace);
    
    // Clear ALL schemas to ensure nothing shows in status bar
    yamlConfig.update('schemas', {}, vscode.ConfigurationTarget.Workspace);
    
    // Also disable validation temporarily to ensure clean slate
    yamlConfig.update('validate', false, vscode.ConfigurationTarget.Workspace);
    
    // Re-enable validation after a short delay (without schemas)
    setTimeout(() => {
      yamlConfig.update('validate', true, vscode.ConfigurationTarget.Workspace);
    }, 500);
    
    // Note: We don't add any schema associations to keep status bar clean
    // IntelliSense is provided through our custom completion provider
  }

  private monitorYamlFiles(): void {
    // Monitor when meta.yaml files are opened
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isMetaYamlFile(editor.document)) {
          this.ensureCorrectSchema(editor.document);
        }
      })
    );
    
    // Check current editor on activation
    if (vscode.window.activeTextEditor) {
      const doc = vscode.window.activeTextEditor.document;
      if (this.isMetaYamlFile(doc)) {
        this.ensureCorrectSchema(doc);
      }
    }
  }

  private isMetaYamlFile(document: vscode.TextDocument): boolean {
    const fileName = path.basename(document.fileName);
    return fileName === 'meta.yaml' || fileName === 'meta.yml';
  }

  private ensureCorrectSchema(document: vscode.TextDocument): void {
    // Check if this is a Computor meta.yaml (has slug field)
    const content = document.getText();
    
    if (content.includes('slug:') && !this.isCondaMetaYaml(content)) {
      // Ensure no schemas are associated with this file
      const yamlConfig = vscode.workspace.getConfiguration('yaml', document.uri);
      
      // Clear any file-specific schema associations
      const currentSchemas = yamlConfig.get<any>('schemas') || {};
      const cleanedSchemas: any = {};
      
      // Remove any entries that might match this file
      for (const schemaUrl in currentSchemas) {
        const patterns = currentSchemas[schemaUrl];
        if (Array.isArray(patterns)) {
          const filtered = patterns.filter((p: string) => 
            !document.fileName.includes(p.replace('**/', ''))
          );
          if (filtered.length > 0) {
            cleanedSchemas[schemaUrl] = filtered;
          }
        }
      }
      
      // Update schemas if changed
      if (JSON.stringify(currentSchemas) !== JSON.stringify(cleanedSchemas)) {
        yamlConfig.update('schemas', cleanedSchemas, vscode.ConfigurationTarget.WorkspaceFolder);
      }
    }
  }

  private isCondaMetaYaml(content: string): boolean {
    // Check for Conda-specific patterns
    return (content.includes('package:') && content.includes('source:')) ||
           (content.includes('package:') && content.includes('build:')) ||
           content.includes('conda_build_config');
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}