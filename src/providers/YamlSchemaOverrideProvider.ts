import * as vscode from 'vscode';
import * as path from 'path';

export class YamlSchemaOverrideProvider {
  private disposables: vscode.Disposable[] = [];
  private condaSchemas = [
    'https://raw.githubusercontent.com/conda-forge/conda-smithy/master/conda_smithy/data/conda-forge.json',
    'https://json.schemastore.org/conda.json',
    'https://raw.githubusercontent.com/conda-forge/conda-smithy/main/conda_smithy/data/conda-forge.json'
  ];

  constructor(context: vscode.ExtensionContext) {
    void context;
    this.setupSchemaOverrides();
    this.monitorYamlFiles();
    this.startContinuousMonitoring();
  }

  private setupSchemaOverrides(): void {
    this.removeCondaSchemas();
  }
  
  private removeCondaSchemas(): void {
    // Override YAML extension settings
    const yamlConfig = vscode.workspace.getConfiguration('yaml');
    
    // Get current schemas
    const currentSchemas = yamlConfig.get<any>('schemas') || {};
    let modified = false;
    
    // Remove all Conda schemas
    for (const condaSchema of this.condaSchemas) {
      if (currentSchemas[condaSchema]) {
        delete currentSchemas[condaSchema];
        modified = true;
      }
    }
    
    // Also remove any schema patterns that include meta.yaml
    for (const schemaUrl in currentSchemas) {
      const patterns = currentSchemas[schemaUrl];
      if (Array.isArray(patterns)) {
        const filtered = patterns.filter((p: string) => 
          !p.includes('meta.yaml') && !p.includes('meta.yml') &&
          !p.includes('**/meta.yaml') && !p.includes('**/meta.yml')
        );
        if (filtered.length !== patterns.length) {
          if (filtered.length > 0) {
            currentSchemas[schemaUrl] = filtered;
          } else {
            delete currentSchemas[schemaUrl];
          }
          modified = true;
        }
      } else if (typeof patterns === 'string') {
        if (patterns.includes('meta.yaml') || patterns.includes('meta.yml')) {
          delete currentSchemas[schemaUrl];
          modified = true;
        }
      }
    }
    
    if (modified) {
      yamlConfig.update('schemas', currentSchemas, vscode.ConfigurationTarget.Global);
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
  
  private startContinuousMonitoring(): void {
    // Monitor configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('yaml.schemas')) {
          // Configuration changed, remove Conda schemas again
          this.removeCondaSchemas();
        }
      })
    );
    
    // Periodically check and remove Conda schemas (every 2 seconds)
    const interval = setInterval(() => {
      this.removeCondaSchemas();
    }, 2000);
    
    // Store interval for cleanup
    this.disposables.push({
      dispose: () => clearInterval(interval)
    });
    
    // Also check when text documents are opened
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.isMetaYamlFile(document)) {
          this.removeCondaSchemas();
        }
      })
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}