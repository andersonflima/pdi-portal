import { describe, expect, it } from 'vitest';
import { CanvasHistoryService } from './canvas-history.service';

const options = { isApplyingRemoteBoard: false, isRestoringHistory: false };

describe('CanvasHistoryService', () => {
  it('records the initial snapshot without creating history', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);

    expect(history.undo('a')).toBeNull();
    expect(history.redo('a')).toBeNull();
  });

  it('supports undo and redo across snapshots', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.observeSnapshot('b', options);

    expect(history.undo('b')).toBe('a');
    expect(history.redo('a')).toBe('b');
  });

  it('ignores identical snapshots', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.observeSnapshot('a', options);

    expect(history.undo('a')).toBeNull();
  });

  it('does not push history while applying remote or restoring', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.observeSnapshot('b', { isApplyingRemoteBoard: true, isRestoringHistory: false });

    expect(history.undo('b')).toBeNull();
  });

  it('clears the future stack when a new change happens after undo', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.observeSnapshot('b', options);
    history.undo('b');
    history.observeSnapshot('c', options);

    expect(history.redo('c')).toBeNull();
    expect(history.undo('c')).toBe('a');
  });

  it('commits a batch as a single history entry', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.beginBatch('a');
    history.observeSnapshot('b', options);
    history.observeSnapshot('c', options);
    history.endBatch('c', options);

    expect(history.undo('c')).toBe('a');
  });

  it('does not commit a batch when nothing changed', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.beginBatch('a');
    history.endBatch('a', options);

    expect(history.undo('a')).toBeNull();
  });

  it('finalizes an open batch regardless of depth', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.beginBatch('a');
    history.beginBatch('a');
    history.finalizeBatch('z', options);

    expect(history.undo('z')).toBe('a');
  });

  it('resets all internal state', () => {
    const history = new CanvasHistoryService();
    history.observeSnapshot('a', options);
    history.observeSnapshot('b', options);
    history.reset();

    expect(history.undo('b')).toBeNull();
  });
});
