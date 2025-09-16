/**
 * Shared state manager for drag and drop operations
 * This is a workaround for VS Code's DataTransfer API limitations
 * when transferring data between different tree providers.
 */
export class DragDropManager {
  private static instance: DragDropManager;
  private draggedData: any = null;
  private draggedTimestamp: number = 0;
  private readonly TIMEOUT_MS = 60000; // 1 minute timeout

  private constructor() {}

  public static getInstance(): DragDropManager {
    if (!DragDropManager.instance) {
      DragDropManager.instance = new DragDropManager();
    }
    return DragDropManager.instance;
  }

  /**
   * Store data for a drag operation
   */
  public setDraggedData(data: any): void {
    this.draggedData = data;
    this.draggedTimestamp = Date.now();
    console.log('DragDropManager: Stored drag data:', data);
  }

  /**
   * Retrieve data from a drag operation
   * Returns null if data is expired or not set
   */
  public getDraggedData(): any {
    // Check if data exists and is not expired
    if (!this.draggedData) {
      console.log('DragDropManager: No drag data available');
      return null;
    }

    const age = Date.now() - this.draggedTimestamp;
    if (age > this.TIMEOUT_MS) {
      console.log('DragDropManager: Drag data expired');
      this.clearDraggedData();
      return null;
    }

    console.log('DragDropManager: Retrieved drag data:', this.draggedData);
    return this.draggedData;
  }

  /**
   * Clear the stored drag data
   */
  public clearDraggedData(): void {
    this.draggedData = null;
    this.draggedTimestamp = 0;
    console.log('DragDropManager: Cleared drag data');
  }

  /**
   * Check if there is valid drag data available
   */
  public hasDraggedData(): boolean {
    if (!this.draggedData) {
      return false;
    }
    const age = Date.now() - this.draggedTimestamp;
    return age <= this.TIMEOUT_MS;
  }
}