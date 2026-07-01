import { Injectable } from '@angular/core';

type HistoryCommitOptions = {
  isApplyingRemoteBoard: boolean;
  isRestoringHistory: boolean;
};

const historyMaxEntries = 200;

@Injectable()
export class CanvasHistoryService {
  private snapshot: string | null = null;
  private past: string[] = [];
  private future: string[] = [];
  private batchDepth = 0;
  private batchBaseSnapshot: string | null = null;

  reset() {
    this.snapshot = null;
    this.past = [];
    this.future = [];
    this.batchDepth = 0;
    this.batchBaseSnapshot = null;
  }

  observeSnapshot(nextSnapshot: string, options: HistoryCommitOptions) {
    if (this.snapshot === null) {
      this.snapshot = nextSnapshot;
      this.past = [];
      this.future = [];
      return;
    }

    if (nextSnapshot === this.snapshot) return;
    if (this.batchDepth > 0) return;

    if (options.isApplyingRemoteBoard || options.isRestoringHistory) {
      this.snapshot = nextSnapshot;
      return;
    }

    this.past.push(this.snapshot);

    if (this.past.length > historyMaxEntries) {
      this.past = this.past.slice(this.past.length - historyMaxEntries);
    }

    this.future = [];
    this.snapshot = nextSnapshot;
  }

  beginBatch(baseSnapshot: string) {
    if (this.batchDepth === 0) {
      this.batchBaseSnapshot = baseSnapshot;
    }

    this.batchDepth += 1;
  }

  endBatch(nextSnapshot: string, options: HistoryCommitOptions) {
    if (this.batchDepth === 0) return;

    this.batchDepth -= 1;
    if (this.batchDepth > 0) return;

    this.commitBatch(nextSnapshot, options);
  }

  finalizeBatch(nextSnapshot: string, options: HistoryCommitOptions) {
    if (this.batchDepth === 0) return;

    this.batchDepth = 0;
    this.commitBatch(nextSnapshot, options);
  }

  undo(currentSnapshot: string): string | null {
    if (this.past.length === 0) return null;

    const previousSnapshot = this.past.pop();
    if (!previousSnapshot) return null;

    this.future.push(currentSnapshot);

    if (this.future.length > historyMaxEntries) {
      this.future = this.future.slice(this.future.length - historyMaxEntries);
    }

    this.snapshot = previousSnapshot;
    return previousSnapshot;
  }

  redo(currentSnapshot: string): string | null {
    if (this.future.length === 0) return null;

    const nextSnapshot = this.future.pop();
    if (!nextSnapshot) return null;

    this.past.push(currentSnapshot);

    if (this.past.length > historyMaxEntries) {
      this.past = this.past.slice(this.past.length - historyMaxEntries);
    }

    this.snapshot = nextSnapshot;
    return nextSnapshot;
  }

  setSnapshot(snapshot: string) {
    this.snapshot = snapshot;
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  private commitBatch(nextSnapshot: string, options: HistoryCommitOptions) {
    const baseSnapshot = this.batchBaseSnapshot;
    this.batchBaseSnapshot = null;

    if (this.snapshot === null) {
      this.snapshot = nextSnapshot;
      this.past = [];
      this.future = [];
      return;
    }

    if (!baseSnapshot || nextSnapshot === baseSnapshot) {
      this.snapshot = nextSnapshot;
      return;
    }

    if (options.isApplyingRemoteBoard || options.isRestoringHistory) {
      this.snapshot = nextSnapshot;
      return;
    }

    this.past.push(baseSnapshot);

    if (this.past.length > historyMaxEntries) {
      this.past = this.past.slice(this.past.length - historyMaxEntries);
    }

    this.future = [];
    this.snapshot = nextSnapshot;
  }
}
