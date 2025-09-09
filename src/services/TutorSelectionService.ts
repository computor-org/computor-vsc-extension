import * as vscode from 'vscode';
import { ComputorApiService } from './ComputorApiService';

export class TutorSelectionService {
  private static instance: TutorSelectionService | null = null;

  // private api: ComputorApiService;
  // private context: vscode.ExtensionContext;

  private courseId: string | null = null;
  private groupId: string | null = null;
  private memberId: string | null = null;
  private courseLabel: string | null = null;
  private groupLabel: string | null = null;
  private memberLabel: string | null = null;

  private emitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeSelection = this.emitter.event;

  private constructor(_context: vscode.ExtensionContext, _api: ComputorApiService) {
    // reserved for future use
  }

  static initialize(context: vscode.ExtensionContext, api: ComputorApiService): TutorSelectionService {
    if (!this.instance) this.instance = new TutorSelectionService(context, api);
    return this.instance;
  }

  static getInstance(): TutorSelectionService {
    if (!this.instance) throw new Error('TutorSelectionService not initialized');
    return this.instance;
  }

  getCurrentCourseId(): string | null { return this.courseId; }
  getCurrentGroupId(): string | null { return this.groupId; }
  getCurrentMemberId(): string | null { return this.memberId; }
  getCurrentCourseLabel(): string | null { return this.courseLabel; }
  getCurrentGroupLabel(): string | null { return this.groupLabel; }
  getCurrentMemberLabel(): string | null { return this.memberLabel; }

  async selectCourse(courseId: string | null, label?: string | null): Promise<void> {
    this.courseId = courseId;
    this.courseLabel = label ?? this.courseLabel ?? null;
    // Reset downstream selections
    this.groupId = null;
    this.memberId = null;
    this.groupLabel = null;
    this.memberLabel = null;
    this.emitter.fire();
  }

  async selectGroup(groupId: string | null, label?: string | null): Promise<void> {
    this.groupId = groupId;
    this.groupLabel = label ?? this.groupLabel ?? null;
    // Reset member selection
    this.memberId = null;
    this.memberLabel = null;
    this.emitter.fire();
  }

  async selectMember(memberId: string | null, label?: string | null): Promise<void> {
    this.memberId = memberId;
    this.memberLabel = label ?? this.memberLabel ?? null;
    this.emitter.fire();
  }
}
