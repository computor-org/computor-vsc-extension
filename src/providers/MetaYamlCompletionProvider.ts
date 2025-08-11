import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class MetaYamlCompletionProvider implements vscode.CompletionItemProvider {
  private schema: any;

  constructor(context: vscode.ExtensionContext) {
    // Load the schema for completion suggestions
    const schemaPath = path.join(context.extensionPath, 'schemas', 'meta-yaml-schema.json');
    try {
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      this.schema = JSON.parse(schemaContent);
    } catch (error) {
      console.error('Failed to load meta.yaml schema:', error);
      this.schema = null;
    }
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    void token;
    void context;
    
    // Only provide completions for meta.yaml files
    if (!this.isMetaYamlFile(document)) {
      return [];
    }

    // Check if this looks like a Computor meta.yaml
    const content = document.getText();
    if (this.isCondaMetaYaml(content)) {
      return [];
    }

    const line = document.lineAt(position).text;
    const linePrefix = line.substr(0, position.character);
    
    // If we're at the beginning of a line or after whitespace, suggest top-level properties
    if (/^\s*$/.test(linePrefix)) {
      return this.getTopLevelCompletions();
    }

    // If we're inside properties:, suggest sub-properties
    if (this.isInPropertiesSection(document, position)) {
      return this.getPropertiesCompletions();
    }

    return [];
  }

  private isMetaYamlFile(document: vscode.TextDocument): boolean {
    const fileName = path.basename(document.fileName);
    return fileName === 'meta.yaml' || fileName === 'meta.yml';
  }

  private isCondaMetaYaml(content: string): boolean {
    return (content.includes('package:') && content.includes('source:')) ||
           (content.includes('package:') && content.includes('build:'));
  }

  private isInPropertiesSection(document: vscode.TextDocument, position: vscode.Position): boolean {
    // Simple check - look for 'properties:' above current position
    for (let i = position.line - 1; i >= 0; i--) {
      const line = document.lineAt(i).text;
      if (line.includes('properties:')) {
        return true;
      }
      if (/^\S/.test(line) && !line.includes('properties:')) {
        // We've hit another top-level property
        return false;
      }
    }
    return false;
  }

  private getTopLevelCompletions(): vscode.CompletionItem[] {
    if (!this.schema || !this.schema.properties) {
      return [];
    }

    const completions: vscode.CompletionItem[] = [];
    
    for (const [key, value] of Object.entries(this.schema.properties)) {
      const prop = value as any;
      const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
      
      if (prop.description) {
        item.documentation = new vscode.MarkdownString(prop.description);
      }
      
      // Add snippet for complex properties
      if (key === 'properties') {
        item.insertText = new vscode.SnippetString('properties:\n  studentSubmissionFiles: []\n  additionalFiles: []\n  testFiles: []\n  studentTemplates: []\n  testDependencies: []');
      } else if (key === 'authors' || key === 'maintainers') {
        item.insertText = new vscode.SnippetString(`${key}:\n  - name: \${1:Name}\n    email: \${2:email@example.com}`);
      } else if (key === 'links' || key === 'supportingMaterial') {
        item.insertText = new vscode.SnippetString(`${key}:\n  - description: \${1:Description}\n    url: \${2:https://example.com}`);
      } else if (key === 'keywords') {
        item.insertText = new vscode.SnippetString(`${key}:\n  - \${1:keyword}`);
      } else if (prop.default !== undefined) {
        item.insertText = `${key}: ${prop.default}`;
      } else {
        item.insertText = `${key}: `;
      }
      
      // Mark required fields
      if (key === 'slug' || key === 'title') {
        item.detail = '(required)';
      }
      
      completions.push(item);
    }
    
    return completions;
  }

  private getPropertiesCompletions(): vscode.CompletionItem[] {
    const subProperties = [
      { name: 'studentSubmissionFiles', desc: 'Files that students must submit' },
      { name: 'additionalFiles', desc: 'Additional files provided to students' },
      { name: 'testFiles', desc: 'Test files for automated grading' },
      { name: 'studentTemplates', desc: 'Template files for student projects' },
      { name: 'testDependencies', desc: 'List of example dependencies' },
      { name: 'executionBackend', desc: 'Execution backend configuration' }
    ];

    return subProperties.map(prop => {
      const item = new vscode.CompletionItem(prop.name, vscode.CompletionItemKind.Property);
      item.documentation = new vscode.MarkdownString(prop.desc);
      
      if (prop.name === 'executionBackend') {
        item.insertText = new vscode.SnippetString('executionBackend:\n    slug: ${1:python}\n    version: ${2:3.10}');
      } else if (prop.name === 'testDependencies') {
        item.insertText = new vscode.SnippetString('testDependencies:\n    - ${1:example-slug}');
      } else {
        item.insertText = `${prop.name}: []`;
      }
      
      return item;
    });
  }
}