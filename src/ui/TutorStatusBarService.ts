import * as vscode from 'vscode';

export class TutorStatusBarService implements vscode.Disposable {
  private static instance: TutorStatusBarService | null = null;
  private statusItem: vscode.StatusBarItem;

  private constructor() {
    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    this.statusItem.command = 'computor.tutor.resetFilters';
    this.statusItem.tooltip = 'Tutor: Click to reset filters';
    this.statusItem.show();
  }

  static initialize(): TutorStatusBarService {
    if (!this.instance) this.instance = new TutorStatusBarService();
    return this.instance;
  }

  static getInstance(): TutorStatusBarService {
    if (!this.instance) throw new Error('TutorStatusBarService not initialized');
    return this.instance;
  }

  updateSelection(courseLabel?: string | null, groupLabel?: string | null, memberLabel?: string | null): void {
    const course = courseLabel || 'No course';
    const group = groupLabel || 'All groups';
    const member = memberLabel || 'All members';
    this.statusItem.text = `$(person) Tutor: ${course} | ${group} | ${member}`;
  }

  dispose(): void {
    this.statusItem.dispose();
  }
}

