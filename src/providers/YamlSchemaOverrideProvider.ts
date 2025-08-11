import * as vscode from 'vscode';
import * as path from 'path';

export class YamlSchemaOverrideProvider {
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.setupSchemaOverrides();
    this.monitorYamlFiles();
  }

  private setupSchemaOverrides(): void {
    // Override YAML extension settings when our extension activates
    const yamlConfig = vscode.workspace.getConfiguration('yaml');
    const currentSchemas = yamlConfig.get<any>('schemas') || {};
    
    // Remove Conda schema associations for meta.yaml
    const schemasToRemove = [
      'https://raw.githubusercontent.com/conda-forge/conda-smithy/master/conda_smithy/data/conda-forge.json',
      'https://json.schemastore.org/conda.json',
      'https://squidfunk.github.io/mkdocs-material/schema.json'
    ];
    
    let modified = false;
    for (const schemaUrl of schemasToRemove) {
      if (currentSchemas[schemaUrl]) {
        // Check if it includes meta.yaml
        const patterns = currentSchemas[schemaUrl];
        if (Array.isArray(patterns)) {
          const filtered = patterns.filter((p: string) => 
            !p.includes('meta.yaml') && !p.includes('meta.yml')
          );
          if (filtered.length > 0) {
            currentSchemas[schemaUrl] = filtered;
          } else {
            delete currentSchemas[schemaUrl];
          }
          modified = true;
        }
      }
    }
    
    // Add our schema for meta.yaml files
    const ourSchemaPath = vscode.Uri.file(
      path.join(this.context.extensionPath, 'schemas', 'meta-yaml-schema.json')
    ).toString();
    
    currentSchemas[ourSchemaPath] = ['**/meta.yaml', '**/meta.yml'];
    modified = true;
    
    if (modified) {
      yamlConfig.update('schemas', currentSchemas, vscode.ConfigurationTarget.Workspace);
    }
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
      // Force disable YAML extension's schema for this file
      const yamlConfig = vscode.workspace.getConfiguration('yaml', document.uri);
      
      // Temporarily disable schema validation for this file
      yamlConfig.update('validate', false, vscode.ConfigurationTarget.WorkspaceFolder);
      
      // Re-enable after a short delay with our schema
      setTimeout(() => {
        yamlConfig.update('validate', true, vscode.ConfigurationTarget.WorkspaceFolder);
      }, 100);
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